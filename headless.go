package main

import (
	"context"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"composer/internal/domain"
	"composer/internal/logger"
	"composer/internal/remote"
)

// wantsHeadless reports whether the process was started with --headless.
// Parsed by hand rather than with the flag package: Wails dev builds parse
// os.Args themselves and would reject a flag they do not know.
func wantsHeadless(args []string) bool {
	for _, arg := range args[1:] {
		switch strings.ToLower(strings.TrimSpace(arg)) {
		case "--headless", "-headless", "/headless":
			return true
		}
	}
	return false
}

// headlessRunning reports whether another headless instance already answers
// on this PC, so a second autostart does not fight it for the port and files.
func headlessRunning() bool {
	info, ok := readInstance()
	return ok && info.alive()
}

// runHeadless runs the backend with no window: stored history, agents and the
// phone gateway, for a PC powered on remotely with nobody logged in. It
// returns the process exit code once asked to stop, by the desktop window
// taking over, by the phone's shut-down action, or by a console signal.
func runHeadless(app *App) int {
	app.headless = true

	if app.remoteServer == nil {
		logger.Errorf("Headless", "No phone gateway configured; nothing to serve")
		return 1
	}

	secret, err := newInstanceSecret()
	if err != nil {
		logger.Errorf("Headless", "Could not create instance secret: %v", err)
		return 1
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	app.ctx = ctx

	stop := make(chan string, 1)
	app.requestStop = func(reason string) {
		select {
		case stop <- reason:
		default:
		}
	}
	app.remoteServer.SetLocalControl(&remote.LocalControl{
		Secret: secret,
		Stop:   func() { app.requestStop("desktop window is taking over") },
	})

	app.startCore(ctx)

	info := app.remoteServer.Info()
	if !info.Enabled {
		logger.Errorf("Headless", "Phone gateway did not start on port %d (another copy of the app running?); exiting", info.Port)
		app.shutdownWithin(20 * time.Second)
		return 1
	}

	if err := writeInstance(instanceInfo{PID: os.Getpid(), Port: info.Port, Secret: secret, Started: time.Now()}); err != nil {
		// Not fatal: the phone still works, the desktop window just cannot
		// ask this instance to hand over.
		logger.Warnf("Headless", "Could not write instance file: %v", err)
	}
	logger.Infof("Headless", "Running headless, PID=%d, gateway port %d", os.Getpid(), info.Port)
	go logProviders(ctx, app)

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)

	var reason string
	select {
	case reason = <-stop:
	case sig := <-signals:
		reason = "signal " + sig.String()
	}

	logger.Infof("Headless", "Stopping: %s", reason)
	app.shutdownWithin(20 * time.Second)
	// Removed last: the desktop window treats the file disappearing as the sign
	// that history and the database are closed and safe to open.
	removeInstance(secret)
	logger.Infof("Headless", "Stopped")
	return 0
}

// shutdownWithin runs the normal shutdown with a bound, so one hung agent CLI
// cannot keep a remote power-off waiting forever.
func (a *App) shutdownWithin(d time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	a.shutdown(ctx)
}

// logProviders records which agent CLIs were found. A scheduled task can start
// with a different PATH than an interactive login, and this is the first
// place to look when an agent is missing from the phone after a remote boot.
func logProviders(ctx context.Context, app *App) {
	probeCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	for _, p := range app.registry.Probe(probeCtx, false) {
		if p.Availability == domain.AvailabilityReady {
			logger.Infof("Headless", "Provider %s: available (%s)", p.DisplayName, p.CommandPath)
		} else {
			logger.Warnf("Headless", "Provider %s: %s %s", p.DisplayName, p.Availability, p.Message)
		}
	}
	logger.Debugf("Headless", "PATH=%s", os.Getenv("PATH"))
}
