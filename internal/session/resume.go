package session

import (
	"context"
	"os"

	"catalyst/internal/domain"
)

// ResumeRequest asks for one stored task to be brought back to life.
type ResumeRequest struct {
	ThreadID string              `json:"threadId"`
	Title    string              `json:"title"`
	Driver   domain.DriverKind   `json:"driver"`
	Model    string              `json:"model,omitempty"`
	Options  domain.ModelOptions `json:"options,omitempty"`
	// Cwd is where the task ran. A worktree that has since been merged away or
	// deleted is the common reason a resume cannot proceed.
	Cwd string `json:"cwd"`
	// ProviderSessionID is the CLI's own id for the conversation. Empty means the
	// provider never reported one, so only a fresh session is possible.
	ProviderSessionID string `json:"providerSessionId,omitempty"`
}

// ResumeOutcome reports what happened to one task, including why it could not
// be resumed. Failure is expected often enough that it is data rather than an
// error: worktrees get merged and deleted, and CLIs expire their sessions.
type ResumeOutcome struct {
	ThreadID string `json:"threadId"`
	// Live is true when the agent is running and can be sent messages.
	Live bool `json:"live"`
	// Continued distinguishes a genuine continuation from a fresh session that
	// merely reuses the directory, which the UI must not present as the same
	// conversation.
	Continued bool   `json:"continued"`
	Reason    string `json:"reason,omitempty"`
}

// ResumeResult is the outcome for a whole session.
type ResumeResult struct {
	WorkspaceID string          `json:"workspaceId"`
	Outcomes    []ResumeOutcome `json:"outcomes"`
}

// Resume restarts the agents of a stored session.
//
// Each task is attempted independently: one gone worktree must not stop the
// rest of a session from coming back. A task that cannot be continued is
// reported rather than silently downgraded, because a fresh CLI session with no
// memory of the work looks identical to a resumed one until it answers.
func (s *Spawner) Resume(ctx context.Context, requests []ResumeRequest) ResumeResult {
	result := ResumeResult{Outcomes: make([]ResumeOutcome, 0, len(requests))}

	for _, request := range requests {
		result.Outcomes = append(result.Outcomes, s.resumeOne(ctx, request))
	}
	return result
}

func (s *Spawner) resumeOne(ctx context.Context, request ResumeRequest) ResumeOutcome {
	outcome := ResumeOutcome{ThreadID: request.ThreadID}

	if request.ThreadID == "" || request.Driver == "" {
		outcome.Reason = "incomplete task record"
		return outcome
	}

	// Already running: reopening a session whose agents survived should attach
	// to them rather than start a second CLI on the same thread.
	if s.manager.HasSession(request.ThreadID) {
		outcome.Live, outcome.Continued = true, true
		return outcome
	}

	// The directory is checked before starting because a CLI given a missing cwd
	// either fails obscurely or silently starts somewhere else.
	cwd := request.Cwd
	if cwd != "" {
		if info, err := os.Stat(cwd); err != nil || !info.IsDir() {
			outcome.Reason = "working directory no longer exists: " + cwd
			return outcome
		}
	}

	start := domain.SessionStartInput{
		ThreadID:   request.ThreadID,
		Cwd:        cwd,
		Model:      request.Model,
		Options:    request.Options,
		Permission: domain.PermissionBypass,
		Resume:     request.ProviderSessionID,
	}

	if request.ProviderSessionID != "" {
		if _, err := s.manager.Start(ctx, request.Driver, start); err == nil {
			outcome.Live, outcome.Continued = true, true
			return outcome
		}
		// A stale or rejected session id is the expected failure here, so the
		// fallback is a fresh session in the same place rather than an error.
		start.Resume = ""
	}

	if _, err := s.manager.Start(ctx, request.Driver, start); err != nil {
		outcome.Reason = err.Error()
		return outcome
	}

	outcome.Live = true
	if request.ProviderSessionID == "" {
		outcome.Reason = "no stored session id; started fresh in the same directory"
	} else {
		outcome.Reason = "stored session was rejected; started fresh in the same directory"
	}
	return outcome
}

// HasSession reports whether a thread is currently live.
func (m *Manager) HasSession(threadID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.threads[threadID]
	return ok
}
