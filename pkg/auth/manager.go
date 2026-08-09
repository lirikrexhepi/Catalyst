package auth

import (
	"context"
	"fmt"
	"sync"
)

type Manager struct {
	scanner      *Scanner
	oauthHandler *OAuthHandler
	credentials  map[ProviderID]*Credential
	mutex        sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		scanner:      NewScanner(),
		oauthHandler: NewOAuthHandler(),
		credentials:  make(map[ProviderID]*Credential),
	}
}

func (manager *Manager) ScanDetectedAgents() ([]DetectedAgent, error) {
	return manager.scanner.ScanSystem()
}

func (manager *Manager) StartOAuthFlow(parentContext context.Context, provider ProviderID) (*Credential, error) {
	credential, err := manager.oauthHandler.StartFlow(parentContext, provider)
	if err != nil {
		return nil, err
	}

	manager.mutex.Lock()
	manager.credentials[provider] = credential
	manager.mutex.Unlock()

	return credential, nil
}

func (manager *Manager) LinkAgent(agentID string, provider ProviderID) (*Credential, error) {
	manager.mutex.Lock()
	defer manager.mutex.Unlock()

	credential := &Credential{
		ProviderID:  provider,
		AccessToken: fmt.Sprintf("local_cli_linked_%s", agentID),
		IsLinked:    true,
	}

	manager.credentials[provider] = credential
	return credential, nil
}

func (manager *Manager) GetLinkedProviders() []ProviderID {
	manager.mutex.RLock()
	defer manager.mutex.RUnlock()

	var linkedProviders []ProviderID
	for providerID, credential := range manager.credentials {
		if credential.IsLinked {
			linkedProviders = append(linkedProviders, providerID)
		}
	}

	return linkedProviders
}
