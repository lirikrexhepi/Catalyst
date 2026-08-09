package auth

import (
	"os"
	"path/filepath"
)

type Scanner struct{}

func NewScanner() *Scanner {
	return &Scanner{}
}

func (scanner *Scanner) ScanSystem() ([]DetectedAgent, error) {
	homeDirectory, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	var detectedAgents []DetectedAgent

	claudeFilePath := filepath.Join(homeDirectory, ".claude.json")
	claudeConfigPath := filepath.Join(homeDirectory, ".config", "claude", "credentials.json")
	if fileExists(claudeFilePath) || fileExists(claudeConfigPath) {
		detectedAgents = append(detectedAgents, DetectedAgent{
			ID:          "detected-claude-cli",
			ProviderID:  ProviderClaude,
			Name:        "Claude Code CLI",
			SourcePath:  claudeFilePath,
			IsAvailable: true,
			Description: "Found existing Anthropic session credentials from local Claude CLI.",
		})
	}

	cursorPath := filepath.Join(homeDirectory, ".cursor")
	if fileExists(cursorPath) {
		detectedAgents = append(detectedAgents, DetectedAgent{
			ID:          "detected-cursor",
			ProviderID:  ProviderCursor,
			Name:        "Cursor Agent",
			SourcePath:  cursorPath,
			IsAvailable: true,
			Description: "Found existing Cursor editor workspace auth profile.",
		})
	}

	antigravityPath := filepath.Join(homeDirectory, ".gemini", "antigravity")
	if fileExists(antigravityPath) {
		detectedAgents = append(detectedAgents, DetectedAgent{
			ID:          "detected-antigravity",
			ProviderID:  ProviderGemini,
			Name:        "Antigravity / Gemini",
			SourcePath:  antigravityPath,
			IsAvailable: true,
			Description: "Found existing Google Antigravity local agent profile.",
		})
	}

	openCodePath := filepath.Join(homeDirectory, ".config", "opencode")
	if fileExists(openCodePath) {
		detectedAgents = append(detectedAgents, DetectedAgent{
			ID:          "detected-opencode",
			ProviderID:  ProviderOpenCode,
			Name:        "OpenCode CLI",
			SourcePath:  openCodePath,
			IsAvailable: true,
			Description: "Found existing OpenCode CLI configuration.",
		})
	}

	return detectedAgents, nil
}

func fileExists(targetPath string) bool {
	fileInformation, err := os.Stat(targetPath)
	if os.IsNotExist(err) {
		return false
	}
	return err == nil && fileInformation != nil
}
