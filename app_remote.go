package main

import (
	"context"

	"composer/internal/logger"
	"composer/internal/remote"
)

func (a *App) GetRemoteInfo() remote.RemoteInfo {
	if a.remoteServer == nil {
		return remote.RemoteInfo{Enabled: false}
	}
	return a.remoteServer.Info()
}

func (a *App) StartRemoteServer(port int) (remote.RemoteInfo, error) {
	if a.remoteServer == nil {
		a.remoteServer = remote.NewServer(port, a.manager, a.coordinator, a.orchestrator, a.spawner, a.projects)
	}
	if err := a.remoteServer.Start(context.Background()); err != nil {
		logger.Errorf("App", "Failed to start remote server: %v", err)
		return a.remoteServer.Info(), err
	}
	return a.remoteServer.Info(), nil
}

func (a *App) StopRemoteServer() error {
	if a.remoteServer != nil {
		a.remoteServer.Stop()
	}
	return nil
}

func (a *App) RegenerateRemoteToken() (remote.RemoteInfo, error) {
	if a.remoteServer == nil {
		return remote.RemoteInfo{Enabled: false}, nil
	}
	return a.remoteServer.RegenerateToken(), nil
}
