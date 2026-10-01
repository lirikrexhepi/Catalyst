package main

import (
	"embed"
	"fmt"
	"slices"
)

//go:embed assets/logo/sized/*.png
var appIconFiles embed.FS

const (
	appIconPreference = "app_icon"
	defaultAppIcon    = "blue-base"
)

var appIconIDs = []string{
	"blue-simplistic", "blue-base", "blue-complex",
	"purple-simplistic", "purple-base", "purple-complex",
}

func (a *App) GetAppIcon() string {
	id, err := a.GetUserPreference(appIconPreference)
	if err != nil || !slices.Contains(appIconIDs, id) {
		return defaultAppIcon
	}
	return id
}

func (a *App) SetAppIcon(id string) error {
	if !slices.Contains(appIconIDs, id) {
		return fmt.Errorf("unknown app icon %q", id)
	}
	if err := a.SetUserPreference(appIconPreference, id); err != nil {
		return err
	}
	return applyAppIcon(id)
}

func applyAppIcon(id string) error {
	small, err := appIconFiles.ReadFile("assets/logo/sized/" + id + "-32.png")
	if err != nil {
		return err
	}
	big, err := appIconFiles.ReadFile("assets/logo/sized/" + id + "-256.png")
	if err != nil {
		return err
	}
	return setWindowIcon(small, big)
}
