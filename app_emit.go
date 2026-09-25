package main

import "github.com/wailsapp/wails/v2/pkg/runtime"

// emit sends an event to the desktop window. Every window-bound event goes
// through here rather than runtime.EventsEmit: a headless run has no window,
// and Wails' runtime calls log.Fatalf when handed a context it did not create,
// which would take the whole backend down on the first streamed token.
func (a *App) emit(name string, data ...interface{}) {
	if a.headless || a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, name, data...)
}
