<#
.SYNOPSIS
  Battery costs measured unplugged ("≈ x% battery" labels), over wireless adb.
.DESCRIPTION
  1. Connect wirelessly first (e2e\adb-wireless.ps1 -Connect ... -KeepWifiInAirplane), then unplug the
     cable; the script refuses to run while the phone reports a power source.
  2. Clears earlier energy samples (they may come from simulated or plugged-in runs), switches
     airplane mode on (Wi-Fi stays on for adb), runs e2e/energy.yaml (AI summaries, GNSS fixes,
     SOS torch minutes), and pulls bench/energy-latest.json to e2e/out/energy-latest.json.
  The battery level before and after the run is recorded beside it.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Serial,
  [ValidatePattern('^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$')]
  [string]$AppId = 'org.skepi.app',
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$env:MAESTRO_CLI_NO_ANALYTICS = '1'
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'
function Adb { & adb.exe -s $Serial @args }

$battery = (Adb shell dumpsys battery) -join "`n"
if ($battery -match 'AC powered: true|USB powered: true|Wireless powered: true') {
  throw "the phone reports a power source: unplug the cable (wireless adb keeps the session)`n$battery"
}
if ($battery -match 'status: 2') { throw 'the battery is charging: unplug the cable' }
$battery | Set-Content -Encoding UTF8 (Join-Path $out 'energy-battery-before.txt')


Adb shell cmd connectivity airplane-mode enable | Out-Null
Start-Sleep -Seconds 5
$code = 1
Push-Location $root
try {
  & $Maestro --device $Serial test e2e/energy.yaml -e "APP_ID=$AppId" --format junit --output (Join-Path $out 'report-energy.xml') --test-output-dir $out | Out-Host
  $code = $LASTEXITCODE
} finally {
  Adb shell cmd connectivity airplane-mode disable | Out-Null
  Pop-Location
}
((Adb shell dumpsys battery) -join "`n") | Set-Content -Encoding UTF8 (Join-Path $out 'energy-battery-after.txt')
$env:MSYS_NO_PATHCONV = '1'
Adb pull "/sdcard/Android/data/$AppId/files/bench/energy-latest.json" (Join-Path $out 'energy-latest.json') | Out-Host
if ($code -ne 0) { throw "energy flow failed ($code)" }
Write-Host "ENERGY SAMPLES: $(Join-Path $out 'energy-latest.json')"
