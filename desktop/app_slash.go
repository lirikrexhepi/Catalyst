package main

import "composer/internal/slashcmd"

func (a *App) ListSlashCommands(driver, cwd string) []slashcmd.Command {
	return slashcmd.List(driver, a.resolveCwd(cwd))
}
