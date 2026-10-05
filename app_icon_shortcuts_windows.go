//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

var (
	modShell32         = syscall.NewLazyDLL("shell32.dll")
	procSHChangeNotify = modShell32.NewProc("SHChangeNotify")
)

const (
	shcneAssocChanged = 0x08000000
	shcnfFlush        = 0x1000
)

func retargetAppShortcuts(icoPath string) error {
	defer func() {
		_ = recover()
	}()

	psScript := `
param([string]$ico)
$ws = New-Object -ComObject WScript.Shell
$targets = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Orchestrator.lnk",
    "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\orchestrator.lnk",
    "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Orchestrator.lnk",
    "$env:USERPROFILE\Desktop\Orchestrator.lnk",
    "$env:PUBLIC\Desktop\Orchestrator.lnk"
)
foreach ($p in $targets) {
    if (Test-Path $p) {
        try {
            $sc = $ws.CreateShortcut($p)
            $sc.IconLocation = "$ico,0"
            $sc.Save()
        } catch {}
    }
}
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null
`
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", psScript, "-ico", icoPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

func notifyShellIconChanged() {
	_, _, _ = procSHChangeNotify.Call(shcneAssocChanged, shcnfFlush, 0, 0)
}
