//go:build !darwin

package claude

func keychainCredentials() ([]byte, error) {
	return nil, errNoCredentials
}

func storeKeychainCredentials([]byte) error {
	return errNoCredentials
}
