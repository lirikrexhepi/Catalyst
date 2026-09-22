//go:build darwin

package claude

import (
	"errors"
	"os/exec"
	"os/user"
	"strings"
)

const keychainService = "Claude Code-credentials"

func keychainCredentials() ([]byte, error) {
	return exec.Command("security", "find-generic-password", "-s", keychainService, "-w").Output()
}

// storeKeychainCredentials updates the existing item in place, reusing the
// account it was created under so the CLI keeps finding the entry it wrote
// rather than a duplicate filed under a different name.
func storeKeychainCredentials(encoded []byte) error {
	account, err := keychainAccount()
	if err != nil {
		return err
	}
	return exec.Command("security", "add-generic-password", "-U",
		"-s", keychainService, "-a", account, "-w", string(encoded)).Run()
}

func keychainAccount() (string, error) {
	if out, err := exec.Command("security", "find-generic-password", "-s", keychainService).Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			trimmed := strings.TrimSpace(line)
			if !strings.HasPrefix(trimmed, `"acct"`) {
				continue
			}
			if start := strings.Index(trimmed, `="`); start >= 0 {
				return strings.TrimSuffix(trimmed[start+2:], `"`), nil
			}
		}
	}

	current, err := user.Current()
	if err != nil {
		return "", errors.New("cannot determine the keychain account holding Claude Code credentials")
	}
	return current.Username, nil
}
