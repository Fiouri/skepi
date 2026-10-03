<#
.SYNOPSIS
  Runs the Phase 0 Maestro flow on the connected device in airplane mode and checks that the
  sealed WebView made zero network requests (blocked-request log must be empty).
#>
[CmdletBinding()]
param(
  [string]$Serial = '',
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$env:MAESTRO_CLI_NO_ANALYTICS = '1'
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'

$adbArgs = @()
if ($Serial) { $adbArgs += @('-s', $Serial) }

& adb @adbArgs logcat -c
Push-Location $root
try {
  $maestroArgs = @('test', 'e2e/spike.yaml', '--format', 'junit', '--output', (Join-Path $out 'report.xml'))
  if ($Serial) { $maestroArgs = @('--device', $Serial) + $maestroArgs }
  & $Maestro @maestroArgs
  $maestroExit = $LASTEXITCODE
} finally {
  Pop-Location
}

$log = & adb @adbArgs logcat -d -s 'ExpoZim:*'
$log | Set-Content -Encoding UTF8 (Join-Path $out 'expozim-logcat.txt')
$blocked = @($log | Select-String -SimpleMatch 'blocked request')
$blocked | ForEach-Object { $_.Line } | Set-Content -Encoding UTF8 (Join-Path $out 'blocked-requests.txt')

Write-Host "Maestro exit code: $maestroExit"
Write-Host "Blocked WebView requests during E2E: $($blocked.Count)"
if ($maestroExit -ne 0) { exit $maestroExit }
if ($blocked.Count -gt 0) {
  Write-Error 'WebView attempted non-zim requests during E2E (see e2e/out/blocked-requests.txt).'
  exit 3
}
Write-Host 'E2E PASS'
