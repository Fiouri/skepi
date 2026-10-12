<#
.SYNOPSIS
  Captures the store screenshots (e2e/store-screenshots.yaml) on an emulator into
  fastlane/metadata/android/en-US/images/phoneScreenshots and checks each PNG's size.
  Use the skepi-host AVD (1080x2400, 420 dpi) with a Developer Preview release build installed and the
  packs provisioned (scripts/provision.ps1 -Serial <emulator>). System UI demo mode gives a clean status
  bar (fixed clock, full battery, no notifications) and is switched off afterwards.
  -Flow/-Names retake single screenshots elsewhere, e.g. Ask with the AI summary on the S23 (the emulator
  runs no model): e2e/store-screenshot-ask.yaml.
.EXAMPLE
  ./e2e/run-screenshots.ps1 -Serial emulator-5556
  ./e2e/run-screenshots.ps1 -Serial RFCW510JNZB -Height 2340 -Flow e2e/store-screenshot-ask.yaml -Names 4_ask_sources
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Serial,
  [ValidatePattern('^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$')]
  [string]$AppId = 'org.skepi.app',
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat'),
  [int]$Width = 1080,
  [int]$Height = 2400,
  [string]$Flow = 'e2e/store-screenshots.yaml',
  [string[]]$Names = @('1_home', '2_search', '3_article', '4_ask_sources', '5_map', '6_tools')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Shared device lock (scripts/device-lock.ps1): waits while another project or session uses the
# device and never stops their processes; released in the finally block at the end of this script.
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\device-lock.ps1')
$deviceLocks = @(Enter-DeviceLock -Serial $Serial -Purpose 'e2e/run-screenshots.ps1')
try {

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'fastlane\metadata\android\en-US\images\phoneScreenshots'
# -Names a,b arrives as one string through powershell -File: split it.
$names = @($Names | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$env:MAESTRO_CLI_NO_ANALYTICS = '1'
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'

$size = ((& adb -s $Serial shell wm size) -join ' ')
if ($size -notmatch "Physical size: ${Width}x${Height}") { throw "device $Serial is not ${Width}x${Height} ($size); pass -Width/-Height or use the skepi-host AVD" }

function Send-Demo([string[]]$Extras) {
  & adb -s $Serial shell am broadcast -a com.android.systemui.demo @Extras | Out-Null
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
foreach ($n in $names) { Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $outDir "$n.png") }

& adb -s $Serial shell settings put global sysui_demo_allowed 1
Send-Demo @('-e', 'command', 'enter')
Send-Demo @('-e', 'command', 'clock', '-e', 'hhmm', '1200')
Send-Demo @('-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false')
Send-Demo @('-e', 'command', 'network', '-e', 'wifi', 'hide', '-e', 'mobile', 'hide', '-e', 'airplane', 'hide')
Send-Demo @('-e', 'command', 'notifications', '-e', 'visible', 'false')
& adb -s $Serial shell cmd locale set-app-locales $AppId --locales en-US | Out-Null

# Maestro writes takeScreenshot files under its test output directory.
$testOut = Join-Path $PSScriptRoot ('out\screenshots-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Push-Location $root
try {
  & $Maestro --device $Serial test -e "APP_ID=$AppId" --format junit --output (Join-Path $PSScriptRoot 'out\report-screenshots.xml') --test-output-dir $testOut $Flow | Out-Host
  $exit = $LASTEXITCODE
} finally {
  Pop-Location
  Send-Demo @('-e', 'command', 'exit')
  & adb -s $Serial shell settings put global sysui_demo_allowed 0
  & adb -s $Serial shell cmd locale set-app-locales $AppId | Out-Null
}
if ($exit -ne 0) { throw "Maestro failed (exit $exit)" }

Add-Type -AssemblyName System.Drawing
foreach ($n in $names) {
  $shot = Get-ChildItem -Recurse -File -Path $testOut -Filter "$n.png" | Select-Object -First 1
  if (-not $shot) { throw "Maestro wrote no $n.png under $testOut" }
  $file = Join-Path $outDir "$n.png"
  Copy-Item -Force $shot.FullName $file
  $img = [System.Drawing.Image]::FromFile($file)
  try {
    if ($img.Width -ne $Width -or $img.Height -ne $Height) { throw "$n.png is $($img.Width)x$($img.Height), expected ${Width}x${Height}" }
  } finally { $img.Dispose() }
  Write-Host ("{0}.png  {1}x{2}  {3:N0} KB" -f $n, $Width, $Height, ((Get-Item $file).Length / 1KB))
}
} finally {
  $deviceLocks | ForEach-Object { Exit-DeviceLock $_ }
}
