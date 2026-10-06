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
  8. e2e/locale-el.yaml Greek UI (frozen locale, only with -IncludeGreek): turns on the developer flag, app
     locale el-GR, Greek strings, a Greek Layer 1 answer (needs the zimLocale pack), English cards.
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
  [string[]]$Only = @(),
  # tools.yaml: feed the gps provider from a shell test provider (indoors, no sky view).
  [switch]$SimulateGnss,
  # The frozen Greek UI flow (English-only until v1: optional, never part of the required suite).
  [switch]$IncludeGreek
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
$script:smsIntents = 0
$flows = @(
  # tools.yaml first: with -SimulateGnss the test provider stopped receiving positions when tools.yaml ran
  # after other flows (cause not found; standalone and first-in-suite runs pass).
  @{ Flow = 'e2e/tools.yaml'; Report = 'report-tools.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/onboarding.yaml'; Report = 'report-onboarding.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/ask-en.yaml'; Report = 'report-en.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/ask-t1.yaml'; Report = 'report-t1.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/medical.yaml'; Report = 'report-medical.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/cards.yaml'; Report = 'report-cards.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/blackout.yaml'; Report = 'report-blackout.xml'; Locale = 'en-US'; Battery = $true }
)
if ($IncludeGreek) { $flows += @{ Flow = 'e2e/locale-el.yaml'; Report = 'report-el.xml'; Locale = 'el-GR' } }
# -Only a,b arrives as one string through powershell -File: split it.
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
if ($Only.Count -gt 0) { $flows = @($flows | Where-Object { $Only -contains [IO.Path]::GetFileNameWithoutExtension($_.Flow) }) }
if ($flows.Count -eq 0) { throw "no flow matches -Only $($Only -join ',')" }

# Location "while in use" for the GNSS step of tools.yaml.
& adb @adbArgs shell pm grant $package android.permission.ACCESS_FINE_LOCATION
& adb @adbArgs shell pm grant $package android.permission.ACCESS_COARSE_LOCATION

# tools.yaml needs location services on (GNSS works in airplane mode); the previous state is restored.
$locationWasOn = ((& adb @adbArgs shell cmd location is-location-enabled) -join '').Trim() -eq 'true'
function Set-Location([bool]$On) {
  & adb @adbArgs shell cmd location set-location-enabled $(if ($On) { 'true' } else { 'false' })
}

# Indoors the phone gets no GNSS fix. -SimulateGnss replaces the gps provider with a shell test provider
# (Patras) for tools.yaml so the fix -> coordinates -> SMS path runs; without it the flow needs sky view.
function Start-TestGps {
  # The shell needs the MOCK_LOCATION app-op for test providers; Stop-TestGps sets it back to deny.
  # Airplane mode first, so the provider is set up in the radio state the flow runs in (the flow's own
  # setAirplaneMode step is then a no-op).
  & adb @adbArgs shell cmd connectivity airplane-mode enable | Out-Null
  Start-Sleep -Seconds 3
  & adb @adbArgs shell appops set com.android.shell MOCK_LOCATION allow | Out-Null
  & adb @adbArgs shell cmd location providers add-test-provider gps --requiresSatellite | Out-Null
  & adb @adbArgs shell cmd location providers set-test-provider-enabled gps true | Out-Null
  # A host-side feeder (e2e/gps-feeder.ps1): one adb call per position, each with a timeout, because
  # Maestro restarts its device driver during a flow (a loop on the device died after ~10 s).
  $feederArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'gps-feeder.ps1'), '-Adb', (Get-Command adb).Source)
  if ($Serial) { $feederArgs += @('-Serial', $Serial) }
  $script:gpsFeeder = Start-Process -FilePath powershell -ArgumentList $feederArgs -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 4
  $last = (& adb @adbArgs shell dumpsys location) | Select-String -SimpleMatch 'last location=Location[gps 38.246640,21.734570' | Select-Object -First 1
  if (-not $last) { Write-Warning 'test GPS provider is not delivering locations' } else { Write-Host 'test GPS provider active (simulated fix, Patras)' }
}
function Stop-TestGps {
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*gps-feeder.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  $script:gpsFeeder = $null
  & adb @adbArgs shell cmd location providers remove-test-provider gps | Out-Null
  & adb @adbArgs shell appops set com.android.shell MOCK_LOCATION deny | Out-Null
}

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
    $location = $f.Flow -eq 'e2e/tools.yaml'
    if ($location) { Set-Location $true; if ($SimulateGnss) { Start-TestGps } }
    $battery = $f.ContainsKey('Battery')
    if ($battery) { Set-SimulatedBattery $true }
    try {
      $results += [pscustomobject]@{ Flow = $f.Flow; Exit = (Invoke-Flow $f.Flow $f.Report) }
      # SMS hand-off (tools.yaml): the app only started a VIEW sms: intent (data redacted in logcat).
      # Counted right away: later flows push it out of the log buffer.
      if ($location) { $script:smsIntents = @(& adb @adbArgs logcat -d | Select-String -Pattern 'START u0 \{act=android.intent.action.VIEW dat=sms:').Count }
    } finally {
      if ($battery) { Set-SimulatedBattery $false }
      if ($location -and $SimulateGnss) { Stop-TestGps }
      if ($location -and -not $locationWasOn) { Set-Location $false }
    }
  }
} finally {
  Set-SimulatedBattery $false
  if (-not $locationWasOn) { Set-Location $false }
  Set-AppLocale ''
  Pop-Location
}

$egress = (Get-UidBytes $uid) - $bytesBefore
$toolsRan = @($results | Where-Object { $_.Flow -eq 'e2e/tools.yaml' }).Count -gt 0
$downloads = @(& adb @adbArgs logcat -d -s 'SkepiContentStore:*' | Select-String -SimpleMatch 'download requested:')
$log = & adb @adbArgs logcat -d -s 'ExpoZim:*'
$log | Set-Content -Encoding UTF8 (Join-Path $out 'expozim-logcat.txt')
$blocked = @($log | Select-String -SimpleMatch 'blocked request')
$blocked | ForEach-Object { $_.Line } | Set-Content -Encoding UTF8 (Join-Path $out 'blocked-requests.txt')

foreach ($r in $results) { Write-Host "Maestro exit code ($($r.Flow)): $($r.Exit)" }
Write-Host "Blocked WebView requests during E2E: $($blocked.Count)"
Write-Host "ContentStore download requests during E2E: $($downloads.Count)"
Write-Host "Bytes of UID $uid over real interfaces during E2E: $egress"
if ($toolsRan) { Write-Host "SMS hand-off intents (VIEW sms:): $script:smsIntents" }
$failed = @($results | Where-Object { $_.Exit -ne 0 })
if ($toolsRan -and $failed.Count -eq 0 -and $script:smsIntents -lt 1) {
  Write-Error 'tools.yaml: no VIEW sms: intent was started (SMS hand-off).'
  exit 5
}
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
