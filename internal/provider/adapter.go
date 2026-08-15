package provider

import (
	"context"

	"catalyst/internal/domain"
)

// Adapter translates one provider CLI's native protocol into canonical runtime
// events. Implementations own their child processes and must release them when
// StopSession or StopAll is called.
type Adapter interface {
	Driver() domain.DriverKind
	Capabilities() Capabilities

	StartSession(ctx context.Context, in domain.SessionStartInput) (domain.Session, error)
	SendTurn(ctx context.Context, in domain.SendTurnInput) error
	InterruptTurn(ctx context.Context, threadID string) error
	RespondToApproval(ctx context.Context, threadID, requestID string, decision domain.ApprovalDecision) error
	StopSession(ctx context.Context, threadID string) error
	StopAll(ctx context.Context) error
	HasSession(threadID string) bool
}

type Capabilities struct {
	SessionModelSwitch bool `json:"sessionModelSwitch"`
	Resume             bool `json:"resume"`
	Approvals          bool `json:"approvals"`
	Plans              bool `json:"plans"`
}

// Emitter is how adapters publish canonical events. The session manager
// supplies one that stamps sequence numbers and fans out to subscribers.
type Emitter interface {
	Emit(domain.RuntimeEvent)
}

type EmitterFunc func(domain.RuntimeEvent)

func (f EmitterFunc) Emit(e domain.RuntimeEvent) { f(e) }

// Driver produces adapters and reports CLI availability for one provider kind.
type Driver interface {
	Kind() domain.DriverKind
	DisplayName() string
	DefaultSettings() domain.ProviderSettings
	Probe(ctx context.Context, settings domain.ProviderSettings) domain.ProviderSnapshot
	NewAdapter(settings domain.ProviderSettings, emit Emitter) (Adapter, error)
}
