//go:build !windows

package main

import (
	"fmt"
	"sort"
	"strings"

	"composer/internal/provider"
)

func openTerminal(command provider.AccountCommand) error {
	parts := make([]string, 0, len(command.Overrides)+len(command.Args)+1)
	keys := make([]string, 0, len(command.Overrides))
	for key := range command.Overrides {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		parts = append(parts, key+"="+command.Overrides[key])
	}
	parts = append(parts, command.Binary)
	parts = append(parts, command.Args...)
	return fmt.Errorf("open a terminal and run: %s", strings.Join(parts, " "))
}
