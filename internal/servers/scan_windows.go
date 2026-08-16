//go:build windows

package servers

import (
	"context"
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// listeningSockets enumerates TCP listeners via Get-NetTCPConnection, which
// reports the owning PID directly. netstat would need output parsing across
// locales; the cmdlet returns structured data.
func listeningSockets(ctx context.Context) ([]listener, error) {
	const script = `Get-NetTCPConnection -State Listen |
		Select-Object LocalAddress,LocalPort,OwningProcess |
		ConvertTo-Json -Compress -Depth 2`

	raw, err := runPowerShell(ctx, script)
	if err != nil {
		return nil, err
	}

	var rows []struct {
		LocalAddress  string `json:"LocalAddress"`
		LocalPort     int    `json:"LocalPort"`
		OwningProcess int    `json:"OwningProcess"`
	}
	if err := decodeRows(raw, &rows); err != nil {
		return nil, err
	}

	out := make([]listener, 0, len(rows))
	for _, row := range rows {
		if row.OwningProcess <= 0 || row.LocalPort <= 0 {
			continue
		}
		out = append(out, listener{
			pid:     row.OwningProcess,
			port:    row.LocalPort,
			address: row.LocalAddress,
		})
	}
	return out, nil
}

func processTable(ctx context.Context) (map[int]processInfo, error) {
	const script = `Get-CimInstance Win32_Process |
		Select-Object ProcessId,ParentProcessId,Name,CommandLine |
		ConvertTo-Json -Compress -Depth 2`

	raw, err := runPowerShell(ctx, script)
	if err != nil {
		return nil, err
	}

	var rows []struct {
		ProcessId       int    `json:"ProcessId"`
		ParentProcessId int    `json:"ParentProcessId"`
		Name            string `json:"Name"`
		CommandLine     string `json:"CommandLine"`
	}
	if err := decodeRows(raw, &rows); err != nil {
		return nil, err
	}

	table := make(map[int]processInfo, len(rows))
	for _, row := range rows {
		table[row.ProcessId] = processInfo{
			pid:     row.ProcessId,
			parent:  row.ParentProcessId,
			name:    row.Name,
			command: row.CommandLine,
		}
	}
	return table, nil
}

// decodeRows tolerates PowerShell collapsing a single-element array into a bare
// object, which ConvertTo-Json does silently.
func decodeRows(raw []byte, target any) error {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	if strings.HasPrefix(trimmed, "{") {
		trimmed = "[" + trimmed + "]"
	}
	return json.Unmarshal([]byte(trimmed), target)
}

func runPowerShell(ctx context.Context, script string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Output()
}

// stop ends a listener. Windows has no graceful signal, so the process tree is
// taken down together — a dev server that survived with orphaned workers still
// holding the port would defeat the point of the button.
func stop(ctx context.Context, pid int) error {
	cmd := exec.CommandContext(ctx, "taskkill", "/PID", strconv.Itoa(pid), "/T", "/F")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}
