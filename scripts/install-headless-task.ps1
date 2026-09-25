<#
.SYNOPSIS
  Starts Orchestrator headless at boot, before anyone logs in.

.DESCRIPTION
  Registers the scheduled task "Orchestrator Headless". It runs
  orchestrator.exe --headless as your user when Windows boots, whether or not
  you log in. Your agent CLI logins, PATH and Git credentials are all
  available to it. Opening the normal Orchestrator window later makes the
  headless copy hand over and exit.

  Run from an elevated PowerShell, because a boot trigger needs admin:
    powershell -ExecutionPolicy Bypass -File scripts\install-headless-task.ps1
    powershell -ExecutionPolicy Bypass -File scripts\install-headless-task.ps1 -ExePath D:\apps\orchestrator.exe
    powershell -ExecutionPolicy Bypass -File scripts\install-headless-task.ps1 -Uninstall

  Asks for your Windows password once; Task Scheduler stores it. With a
  Microsoft account, that is the account password, not your PIN.
#>
param(
    [string]$ExePath,
    [int]$DelaySeconds = 30,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Orchestrator Headless'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw 'Run this from an elevated PowerShell (right-click PowerShell > Run as administrator). A boot trigger needs admin.'
}

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$TaskName'."
    return
}

if (-not $ExePath) {
    $ExePath = Join-Path $PSScriptRoot '..\build\bin\orchestrator.exe'
}
if (-not (Test-Path $ExePath)) {
    throw "orchestrator.exe not found at $ExePath. Build it with 'wails build' or pass -ExePath."
}
$ExePath = (Resolve-Path $ExePath).Path

$user = "$env:USERDOMAIN\$env:USERNAME"
$cred = Get-Credential -UserName $user -Message "Windows password for $user. Stored by Task Scheduler so Orchestrator can start before you log in."
if (-not $cred) { throw 'No password entered.' }

$action = New-ScheduledTaskAction -Execute $ExePath -Argument '--headless' -WorkingDirectory (Split-Path $ExePath)

# The delay gives the network and Tailscale a head start; the app also keeps
# retrying Funnel on its own until Tailscale is connected.
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT${DelaySeconds}S"

# ExecutionTimeLimit 0 removes Task Scheduler's default 3-day kill.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Description 'Runs Orchestrator without a window at boot so agents are reachable from the phone.' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User $user `
    -Password $cred.GetNetworkCredential().Password `
    -RunLevel Limited `
    -Force | Out-Null

Write-Host "Registered '$TaskName' -> $ExePath --headless (at boot, +${DelaySeconds}s, as $user)."

# Tailscale only stays connected with nobody logged in when "Run unattended"
# is on (stored as the ForceDaemon pref). Without it the phone cannot reach the PC.
try {
    $prefs = & tailscale debug prefs 2>$null | ConvertFrom-Json
    if ($prefs -and -not $prefs.ForceDaemon) {
        Write-Warning 'Tailscale "Run unattended" is off. Turn it on: tray icon > Preferences > Run unattended.'
    }
} catch {
    Write-Warning 'Could not read Tailscale prefs. Make sure "Run unattended" is on (tray icon > Preferences).'
}

Write-Host ''
Write-Host 'Test it without rebooting:  Start-ScheduledTask -TaskName "Orchestrator Headless"'
Write-Host 'Stop it:                    open the Orchestrator window (it takes over), or use Shut down PC on the phone'
Write-Host "Log file:                   $env:APPDATA\composer\orchestrator_debug.log"
