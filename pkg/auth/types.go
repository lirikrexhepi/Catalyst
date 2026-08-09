package auth

type ProviderID string

const (
	ProviderChatGPT  ProviderID = "chatgpt"
	ProviderClaude   ProviderID = "claude"
	ProviderGemini   ProviderID = "gemini"
	ProviderCursor   ProviderID = "cursor"
	ProviderOpenCode ProviderID = "opencode"
	ProviderKimi     ProviderID = "kimi"
	ProviderOllama   ProviderID = "ollama"
)

type ProviderStatus string

const (
	StatusUnlinked ProviderID = "unlinked"
	StatusLinked   ProviderID = "linked"
	StatusDetected ProviderID = "detected"
)

type DetectedAgent struct {
	ID          string     `json:"id"`
	ProviderID  ProviderID `json:"providerId"`
	Name        string     `json:"name"`
	SourcePath  string     `json:"sourcePath"`
	IsAvailable bool       `json:"isAvailable"`
	Description string     `json:"description"`
}

type Credential struct {
	ProviderID   ProviderID `json:"providerId"`
	AccessToken  string     `json:"accessToken,omitempty"`
	RefreshToken string     `json:"refreshToken,omitempty"`
	SessionKey   string     `json:"sessionKey,omitempty"`
	TokenType    string     `json:"tokenType"`
	ExpiresAt    string     `json:"expiresAt"`
	IsLinked     bool       `json:"isLinked"`
}
