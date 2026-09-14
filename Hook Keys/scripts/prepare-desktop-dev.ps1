$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$debugExecutable = [IO.Path]::GetFullPath(
  (Join-Path $projectRoot 'src-tauri\target\debug\hook-keys-desktop.exe')
)

# Encerra somente uma execução de desenvolvimento deste mesmo projeto. Uma
# instalação comercial do Hook Keys em outra pasta nunca entra nesta lista.
$oldProcesses = Get-CimInstance Win32_Process | Where-Object {
  $executablePath = if ($_.ExecutablePath) {
    [IO.Path]::GetFullPath($_.ExecutablePath)
  } else {
    ''
  }
  $commandLine = [string]$_.CommandLine
  $belongsToProject = $commandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
  $isProjectTool = $belongsToProject -and (
    $commandLine -match 'vite[\\/]bin[\\/]vite\.js' -or
    $commandLine -match '@tauri-apps[\\/]cli[\\/]tauri\.js.+\bdev\b'
  )
  $isDebugApp = $executablePath.Equals($debugExecutable, [StringComparison]::OrdinalIgnoreCase)
  $isProjectTool -or $isDebugApp
}

foreach ($process in $oldProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  $listener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $listener) { exit 0 }
  Start-Sleep -Milliseconds 50
}

$listener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
  $ownerName = if ($owner.Name) { $owner.Name } else { "PID $($listener.OwningProcess)" }
  throw "A porta 5173 está sendo usada por $ownerName. Feche esse programa e tente novamente."
}
