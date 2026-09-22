package claude

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

const credentialsPath = ".claude/.credentials.json"

const credentialsKey = "claudeAiOauth"

// expirySkew refreshes slightly ahead of the deadline so a token cannot lapse
// between the check and the request it authorises.
const expirySkew = time.Minute

var (
	errNoCredentials      = errors.New("Claude Code is not signed in")
	errCredentialsExpired = errors.New("Claude Code sign-in expired; run claude to sign in again")
)

type oauthCredentials struct {
	AccessToken           string `json:"accessToken"`
	RefreshToken          string `json:"refreshToken"`
	ExpiresAt             int64  `json:"expiresAt"`
	RefreshTokenExpiresAt int64  `json:"refreshTokenExpiresAt"`
	SubscriptionType      string `json:"subscriptionType"`
}

func credentialsFile(home string) string {
	return filepath.Join(home, filepath.FromSlash(credentialsPath))
}

// loadCredentials returns what is stored without judging its age, so a caller
// can decide between refreshing and giving up.
func loadCredentials(home string) (*oauthCredentials, error) {
	raw, err := readCredentialsBlob(home)
	if err != nil {
		return nil, err
	}

	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, errNoCredentials
	}
	section, ok := envelope[credentialsKey]
	if !ok {
		return nil, errNoCredentials
	}

	var credentials oauthCredentials
	if err := json.Unmarshal(section, &credentials); err != nil {
		return nil, errNoCredentials
	}
	if credentials.AccessToken == "" {
		return nil, errNoCredentials
	}
	return &credentials, nil
}

func readCredentialsBlob(home string) ([]byte, error) {
	raw, err := os.ReadFile(credentialsFile(home))
	if err == nil {
		return raw, nil
	}
	raw, err = keychainCredentials()
	if err != nil {
		return nil, errNoCredentials
	}
	return raw, nil
}

func expiringSoon(credentials *oauthCredentials) bool {
	if credentials.ExpiresAt <= 0 {
		return false
	}
	return time.Now().Add(expirySkew).UnixMilli() >= credentials.ExpiresAt
}

func refreshTokenUsable(credentials *oauthCredentials) bool {
	if credentials.RefreshToken == "" {
		return false
	}
	if credentials.RefreshTokenExpiresAt <= 0 {
		return true
	}
	return time.Now().UnixMilli() < credentials.RefreshTokenExpiresAt
}

// storeCredentials writes rotated tokens back, patching only the fields that
// changed.
//
// Every other key is carried through untouched: the file is Claude Code's, not
// Composer's, and it holds unrelated state such as MCP server tokens that must
// survive. The write lands on a temporary file and is renamed into place, so a
// crash mid-write cannot leave the CLI with a truncated credential store.
func storeCredentials(home string, credentials *oauthCredentials) error {
	raw, err := readCredentialsBlob(home)
	if err != nil {
		return err
	}

	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return err
	}

	section := map[string]any{}
	if existing, ok := envelope[credentialsKey]; ok {
		if err := json.Unmarshal(existing, &section); err != nil {
			return err
		}
	}
	section["accessToken"] = credentials.AccessToken
	section["refreshToken"] = credentials.RefreshToken
	section["expiresAt"] = credentials.ExpiresAt
	if credentials.RefreshTokenExpiresAt > 0 {
		section["refreshTokenExpiresAt"] = credentials.RefreshTokenExpiresAt
	}

	patched, err := json.Marshal(section)
	if err != nil {
		return err
	}
	envelope[credentialsKey] = patched

	encoded, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return writeCredentialsBlob(home, encoded)
}

func writeCredentialsBlob(home string, encoded []byte) error {
	path := credentialsFile(home)
	if _, err := os.Stat(path); err != nil {
		return storeKeychainCredentials(encoded)
	}

	temporary, err := os.CreateTemp(filepath.Dir(path), ".credentials-*.tmp")
	if err != nil {
		return err
	}
	name := temporary.Name()
	defer os.Remove(name)

	if _, err := temporary.Write(encoded); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Chmod(name, 0o600); err != nil {
		return err
	}
	return os.Rename(name, path)
}
