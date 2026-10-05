<#
.SYNOPSIS
  Runs the Maestro flows on the connected device in airplane mode and checks that the sealed
  WebView made zero network requests (blocked-request log must be empty).
  1. e2e/ask-en.yaml    English UI: search, article, Layer 1 + automatic AI summary with citation, no source, map.
  2. e2e/ask-t1.yaml    English UI, T1-simulation: Layer 1, then "Summarise with AI".
  3. e2e/medical.yaml   English UI: emergency number + Layer 1 first, unverified AI summary on tap.
  4. e2e/onboarding.yaml "Get prepared" offline with the installed packs; readiness indicator.
  5. e2e/cards.yaml     Emergency button, numbers, a draft card; an emergency question shows number + card first.
  6. e2e/tools.yaml     SOS torch and screen, compass, GNSS fix, SMS hand-off (location permission granted here).
  7. e2e/blackout.yaml  Blackout mode with a simulated discharging battery at 25% (dumpsys battery), reset afterwards.
  8. e2e/locale-el.yaml Greek UI (app locale el-GR): Greek strings, a Greek Layer 1 answer, Greek tools and card.
  The per-app locale (Android 13+) is reset to "follow the system" afterwards.
  -Only runs a subset (file names without .yaml).
  -AppId selects the installed build: org.skepi.app (release, default) or org.skepi.app.dev (debug).
#>
[CmdletBinding()]
param(
  [string]$Serial = '',
  [ValidatePattern('^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$')]
  [string]$AppId = 'org.skepi.app',
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat'),
  [string[]]$Only = @()
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

$package = $AppId

function Set-AppLocale([string]$Locales) {
  $localeArgs = @('shell', 'cmd', 'locale', 'set-app-locales', $package)
  if ($Locales) { $localeArgs += @('--locales', $Locales) }
  & adb @adbArgs @localeArgs
  if ($LASTEXITCODE -ne 0) { throw "could not set app locale '$Locales'" }
}

# Sum of rx+tx bytes of one UID over every non-loopback interface since boot (dumpsys netstats).
function Get-UidBytes([string]$Uid) {
  & adb @adbArgs shell dumpsys netstats --poll | Out-Null
  $lines = & adb @adbArgs shell dumpsys netstats detail
  $total = [int64]0
  $inUid = $false
  $section = $false
  foreach ($line in $lines) {
    if ($line -match '^\s*UID stats:') { $section = $true; continue }
    if ($section -and $line -match '^\s*UID tag stats:') { break }
    if (-not $section) { continue }
    if ($line -match '^\s*ident=.* uid=(-?\d+) ') { $inUid = ($Matches[1] -eq $Uid); continue }
    if ($inUid -and $line -match 'rb=(\d+) .*tb=(\d+)') { $total += [int64]$Matches[1] + [int64]$Matches[2] }
  }
  return $total
}

function Invoke-Flow([string]$Flow, [string]$Report) {
  # APP_ID is ASCII, so -e is safe here (Greek values stay in the flows' env blocks).
  $maestroArgs = @('test', $Flow, '-e', "APP_ID=$package", '--format', 'junit', '--output', (Join-Path $out $Report), '--test-output-dir', $out)
  if ($Serial) { $maestroArgs = @('--device', $Serial) + $maestroArgs }
  # Out-Host keeps Maestro's output out of the function's return value (the exit code only).
  & $Maestro @maestroArgs | Out-Host
  return $LASTEXITCODE
}

& adb @adbArgs logcat -c
$uid = ((& adb @adbArgs shell dumpsys package $package) | Select-String -Pattern 'appId=(\d+)' | Select-Object -First 1).Matches[0].Groups[1].Value
$bytesBefore = Get-UidBytes $uid
$flows = @(
  @{ Flow = 'e2e/onboarding.yaml'; Report = 'report-onboarding.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/ask-en.yaml'; Report = 'report-en.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/ask-t1.yaml'; Report = 'report-t1.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/medical.yaml'; Report = 'report-medical.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/cards.yaml'; Report = 'report-cards.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/tools.yaml'; Report = 'report-tools.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/blackout.yaml'; Report = 'report-blackout.xml'; Locale = 'en-US'; Battery = $true },
  @{ Flow = 'e2e/locale-el.yaml'; Report = 'report-el.xml'; Locale = 'el-GR' }
)
if ($Only.Count -gt 0) { $flows = @($flows | Where-Object { $Only -contains [IO.Path]::GetFileNameWithoutExtension($_.Flow) }) }

# Location "while in use" for the GNSS step of tools.yaml.
& adb @adbArgs shell pm grant $package android.permission.ACCESS_FINE_LOCATION
& adb @adbArgs shell pm grant $package android.permission.ACCESS_COARSE_LOCATION

# Blackout flow: a discharging battery at 25% (the phone is on USB power during E2E).
function Set-SimulatedBattery([bool]$On) {
  if ($On) {
    & adb @adbArgs shell dumpsys battery unplug
    & adb @adbArgs shell dumpsys battery set status 3
    & adb @adbArgs shell dumpsys battery set level 25
  } else {
    & adb @adbArgs shell dumpsys battery reset
  }
}
$results = @()
Push-Location $root
try {
  foreach ($f in $flows) {
    Set-AppLocale $f.Locale
    $battery = $f.ContainsKey('Battery')
    if ($battery) { Set-SimulatedBattery $true }
    try {
      $results += [pscustomobject]@{ Flow = $f.Flow; Exit = (Invoke-Flow $f.Flow $f.Report) }
    } finally {
      if ($battery) { Set-SimulatedBattery $false }
    }
  }
} finally {
  Set-SimulatedBattery $false
  Set-AppLocale ''
  Pop-Location
}

$egress = (Get-UidBytes $uid) - $bytesBefore
$downloads = @(& adb @adbArgs logcat -d -s 'SkepiContentStore:*' | Select-String -SimpleMatch 'download requested:')
$log = & adb @adbArgs logcat -d -s 'ExpoZim:*'
$log | Set-Content -Encoding UTF8 (Join-Path $out 'expozim-logcat.txt')
$blocked = @($log | Select-String -SimpleMatch 'blocked request')
$blocked | ForEach-Object { $_.Line } | Set-Content -Encoding UTF8 (Join-Path $out 'blocked-requests.txt')

foreach ($r in $results) { Write-Host "Maestro exit code ($($r.Flow)): $($r.Exit)" }
Write-Host "Blocked WebView requests during E2E: $($blocked.Count)"
Write-Host "ContentStore download requests during E2E: $($downloads.Count)"
Write-Host "Bytes of UID $uid over real interfaces during E2E: $egress"
$failed = @($results | Where-Object { $_.Exit -ne 0 })
if ($failed.Count -gt 0) { exit $failed[0].Exit }
if ($downloads.Count -gt 0 -or $egress -ne 0) {
  Write-Error 'The app reached the network during the offline flows (zero-egress check).'
  exit 4
}
if ($blocked.Count -gt 0) {
  Write-Error 'WebView attempted non-zim requests during E2E (see e2e/out/blocked-requests.txt).'
  exit 3
}
Write-Host 'E2E PASS'
