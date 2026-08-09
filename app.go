package main

import (
	"context"
	"catalyst/pkg/auth"
)

type App struct {
	applicationContext context.Context
	authManager        *auth.Manager
}

func NewApp() *App {
	return &App{
		authManager: auth.NewManager(),
	}
}

func (app *App) startup(applicationContext context.Context) {
	app.applicationContext = applicationContext
}

func (app *App) GetDetectedAgents() ([]auth.DetectedAgent, error) {
	return app.authManager.ScanDetectedAgents()
}

func (app *App) InitiateOAuth(providerID string) (*auth.Credential, error) {
	return app.authManager.StartOAuthFlow(app.applicationContext, auth.ProviderID(providerID))
}

func (app *App) LinkDetectedAgent(agentID string, providerID string) (*auth.Credential, error) {
	return app.authManager.LinkAgent(agentID, auth.ProviderID(providerID))
}

func (app *App) GetLinkedProviders() ([]auth.ProviderID, error) {
	return app.authManager.GetLinkedProviders(), nil
}
