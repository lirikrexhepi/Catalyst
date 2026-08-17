package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:            "catalyst",
		WindowStartState: options.Normal,
		Width:            1280,
		Height:           860,
		MinWidth:         900,
		MinHeight:        600,
		// The wallpaper is the interface here, so the OS title bar is dropped and
		// the scene runs edge to edge. The app draws its own drag strip and window
		// controls, since a frameless window has neither.
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Debug: options.Debug{
			OpenInspectorOnStartup: false,
		},
		Windows: &windows.Options{
			// WebView2 repaints the whole surface on every resize step. Debouncing keeps
			// a drag from queueing more full-window repaints than the compositor can
			// retire, which is what makes resizing feel like it drops frames.
			ResizeDebounceMS: 16,

			// Leave the GPU enabled. Wails only exposes the negative switch, so this is
			// here to document that it must stay false: setting it forces the entire
			// glass UI through software rasterization.
			WebviewGpuIsDisabled: false,

			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			Theme:                windows.Dark,
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
