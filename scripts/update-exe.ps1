param(
    [string]$ExePath = "$env:USERPROFILE\Desktop\Orchestrator.exe",
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Built = Join-Path $Repo 'build\bin\orchestrator.exe'
$TaskName = 'Orchestrator Headless'

function Invoke-Step([string]$Name, [scriptblock]$Body) {
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Body
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)" }
}

function Get-OrchestratorProcesses {
    $targets = @($ExePath, $Built) | ForEach-Object { [IO.Path]::GetFullPath($_) }
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and ($targets -contains [IO.Path]::GetFullPath($_.Path))
    }
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$taskWasRunning = [bool]($task -and $task.State -eq 'Running')
$targets = @($ExePath, $Built) | ForEach-Object { [IO.Path]::GetFullPath($_) }
$backgroundWasRunning = [bool](Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and ($targets -contains [IO.Path]::GetFullPath($_.ExecutablePath)) -and $_.CommandLine -match '--headless'
})
$headlessWasRunning = $taskWasRunning -or $backgroundWasRunning
$desktopWasRunning = [bool](Get-OrchestratorProcesses | Where-Object { $_.MainWindowHandle -ne 0 })

Invoke-Step 'Building phone UI' {
    Push-Location (Join-Path $Repo 'internal\remote\mobile')
    try {
        npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
        npm run build
    } finally { Pop-Location }
}

Invoke-Step 'Building desktop app (wails build)' {
    Push-Location $Repo
    try { wails build } finally { Pop-Location }
}

if (-not (Test-Path $Built)) { throw "Build finished but $Built is missing" }

Invoke-Step 'Stopping running Orchestrator' {
    $instanceFile = Join-Path $env:APPDATA 'composer\headless.json'
    if (Test-Path $instanceFile) {
        try {
            $instance = Get-Content $instanceFile -Raw | ConvertFrom-Json
            Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:$($instance.port)/api/local/shutdown" `
                -Headers @{ 'X-Orchestrator-Instance' = $instance.secret } -Body '{}' -ContentType 'application/json' -TimeoutSec 5 | Out-Null
        } catch { }
    }
    if ($taskWasRunning) { Stop-ScheduledTask -TaskName $TaskName }
    foreach ($p in Get-OrchestratorProcesses) {
        if ($p.MainWindowHandle -ne 0) { [void]$p.CloseMainWindow() }
    }
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-OrchestratorProcesses) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
    Get-OrchestratorProcesses | Stop-Process -Force
    Start-Sleep -Milliseconds 500
}

Invoke-Step "Installing to $ExePath" {
    if (Test-Path $ExePath) { Copy-Item $ExePath "$ExePath.bak" -Force }
    Copy-Item $Built $ExePath -Force
}

if ($task) {
    $taskExe = $task.Actions[0].Execute
    if ([IO.Path]::GetFullPath($taskExe) -ne [IO.Path]::GetFullPath($ExePath)) {
        Write-Warning "The start-at-boot task runs $taskExe, not $ExePath. In Settings > Background, set Start automatically to Off and back to When the PC turns on."
    }
}

if ($headlessWasRunning -and -not $desktopWasRunning) {
    if ($taskWasRunning) {
        Invoke-Step 'Restarting headless task' { Start-ScheduledTask -TaskName $TaskName }
    } else {
        Invoke-Step 'Restarting background mode' { Start-Process $ExePath -ArgumentList '--headless' -WorkingDirectory (Split-Path $ExePath) -WindowStyle Hidden }
    }
}
if (-not $NoLaunch -and ($desktopWasRunning -or -not $headlessWasRunning)) {
    Invoke-Step 'Launching Orchestrator' { Start-Process $ExePath -WorkingDirectory (Split-Path $ExePath) }
}

$info = Get-Item $ExePath
Write-Host ("Done: {0} ({1:N1} MB, {2})" -f $info.FullName, ($info.Length / 1MB), $info.LastWriteTime) -ForegroundColor Green
