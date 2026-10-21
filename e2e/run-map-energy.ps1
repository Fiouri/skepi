<#
.SYNOPSIS
  Battery cost of the live map position (GNSS fixes + compass in follow mode) measured unplugged,
  over wireless adb.
.DESCRIPTION
  1. Connect wirelessly first (e2e\adb-wireless.ps1 -Connect host:port -KeepWifiInAirplane) and pass
     that serial; the script waits until the phone reports no power source (unplug the cable).
  2. Fixes the conditions for every window: screen on (timeout longer than a window), manual
     brightness -Brightness, location services on, airplane mode with Wi-Fi kept for adb.
  3. For each run (default order idle, follow, follow, idle: drift in battery level and temperature
     cancels between the pairs) e2e/map-energy.yaml puts the map tab in front:
       idle-*    location permission denied: no GNSS, no compass
       follow-*  location granted, "My location" pressed twice (follow mode)
       *-blackout  blackout mode on (fixes every 15 s, compass at most 1/s)
     then e2e/energy-sampler.sh samples dumpsys battery on the phone for -Minutes (Wi-Fi stays idle).
  4. Restores the settings and the permission, writes e2e/out/map-energy/<run>.txt (samples) and
     e2e/out/map-energy/map-energy.json: mean discharge current (mA = mAh/h) and the charge-counter
     rate per run, and follow minus idle per mode. The position itself is never read or written.
.EXAMPLE
  powershell -File e2e\run-map-energy.ps1 -Serial 192.168.1.15:5555
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Serial,
  [ValidatePattern('^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$')]
  [string]$AppId = 'org.skepi.app',
  [ValidateRange(1, 120)][int]$Minutes = 15,
  [ValidateRange(1, 60)][int]$IntervalSeconds = 5,
  [ValidateRange(1, 255)][int]$Brightness = 100,
  [ValidateRange(0, 240)][int]$WaitUnplugMinutes = 30,
  [ValidateSet('idle-normal', 'follow-normal', 'idle-blackout', 'follow-blackout')]
  [string[]]$Runs = @('idle-normal', 'follow-normal', 'follow-blackout', 'idle-blackout'),
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Shared device lock (scripts/device-lock.ps1): waits while another project or session uses the
# device and never stops their processes; released in the finally block at the end of this script.
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\device-lock-lib.ps1')
$deviceLocks = @(Enter-DeviceLock -Serial $Serial -Purpose 'e2e/run-map-energy.ps1')
try {

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'out\map-energy'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$env:MAESTRO_CLI_NO_ANALYTICS = '1'
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'
$env:MSYS_NO_PATHCONV = '1'
function Adb { & adb.exe -s $Serial @args }
function AdbText { ((Adb @args) -join "`n").Trim() }
$permissions = @('android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION')

function Get-Battery {
  $b = AdbText shell dumpsys battery
  $num = { param($pattern) if ($b -match $pattern) { [double]$Matches[1] } else { $null } }
  [pscustomobject]@{
    powered = $b -match 'AC powered: true|USB powered: true|Wireless powered: true'
    level = & $num '(?m)^\s*level: (\d+)'
    chargeCounterUah = & $num '(?m)^\s*Charge counter: (\d+)'
    temperatureC = (& $num '(?m)^\s*temperature: (\d+)') / 10
  }
}

if ((AdbText shell settings get global airplane_mode_radios) -split ',' -contains 'wifi') {
  throw 'airplane mode would switch Wi-Fi (and wireless adb) off: run e2e\adb-wireless.ps1 -KeepWifiInAirplane first'
}
$deadline = (Get-Date).AddMinutes($WaitUnplugMinutes)
while ((Get-Battery).powered) {
  if ((Get-Date) -gt $deadline) { throw "the phone still reports a power source after $WaitUnplugMinutes min: unplug the cable" }
  Write-Host 'waiting for the cable to be unplugged (wireless adb keeps the session)...'
  Start-Sleep -Seconds 15
}

$saved = [ordered]@{
  screenOffTimeout = AdbText shell settings get system screen_off_timeout
  brightnessMode = AdbText shell settings get system screen_brightness_mode
  brightness = AdbText shell settings get system screen_brightness
  locationOn = (AdbText shell cmd location is-location-enabled) -eq 'true'
  granted = @{}
}
$pkg = AdbText shell dumpsys package $AppId
foreach ($p in $permissions) { $saved.granted[$p] = $pkg -match [regex]::Escape("${p}: granted=true") }

$results = @()
$sampler = '/data/local/tmp/skepi-energy-sampler.sh'
try {
  Adb push (Join-Path $PSScriptRoot 'energy-sampler.sh') $sampler | Out-Null
  Adb shell settings put system screen_off_timeout ([string](($Minutes + 10) * 60000)) | Out-Null
  Adb shell settings put system screen_brightness_mode 0 | Out-Null
  Adb shell settings put system screen_brightness $Brightness | Out-Null
  Adb shell cmd location set-location-enabled true | Out-Null
  Adb shell cmd connectivity airplane-mode enable | Out-Null
  Start-Sleep -Seconds 5
  if ((AdbText get-state) -ne 'device') { throw 'wireless adb lost after airplane mode' }

  foreach ($run in $Runs) {
    $mode, $variant = $run -split '-'
    $blackout = if ($variant -eq 'blackout') { 'on' } else { 'off' }
    # The flow's launchApp sets the location permission (allow for follow, deny for idle).
    Adb shell input keyevent KEYCODE_WAKEUP | Out-Null
    Push-Location $root
    try {
      & $Maestro --device $Serial test e2e/map-energy.yaml -e "APP_ID=$AppId" -e "MODE=$mode" -e "BLACKOUT=$blackout" --format junit --output (Join-Path $out "report-$run.xml") | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "map energy setup failed for $run ($LASTEXITCODE)" }
    } finally {
      Pop-Location
    }
    Start-Sleep -Seconds 20
    $before = Get-Battery
    if ($before.powered) { throw 'the phone reports a power source: keep the cable unplugged' }
    $count = [int][math]::Ceiling($Minutes * 60 / $IntervalSeconds) + 1
    $remote = "/data/local/tmp/skepi-map-energy-$run.txt"
    Write-Host "$run`: sampling $Minutes min ($count samples, every $IntervalSeconds s)"
    Adb shell "nohup sh $sampler $count $IntervalSeconds $remote > /dev/null 2>&1 &" | Out-Null
    Start-Sleep -Seconds ($Minutes * 60)
    $done = $false
    for ($i = 0; $i -lt 30 -and -not $done; $i += 1) {
      try { $done = (AdbText shell tail -n 1 $remote) -eq 'done' } catch { & adb.exe connect $Serial | Out-Null }
      if (-not $done) { Start-Sleep -Seconds 10 }
    }
    if (-not $done) { throw "the sampler of $run did not finish" }
    $local = Join-Path $out "$run.txt"
    Adb pull $remote $local | Out-Null
    Adb shell rm -f $remote | Out-Null
    $after = Get-Battery
    # What the screen showed at the end (state words only; coordinates are never read or kept).
    $top = AdbText shell dumpsys activity activities
    $foreground = $top -match "(topResumedActivity|mResumedActivity)[^\n]*$([regex]::Escape($AppId))/"
    $ui = ''
    try {
      Adb shell uiautomator dump /data/local/tmp/skepi-ui.xml | Out-Null
      $ui = AdbText shell cat /data/local/tmp/skepi-ui.xml
    } catch { $ui = '' }
    Adb shell rm -f /data/local/tmp/skepi-ui.xml | Out-Null
    $state = @('Following you', 'You are here', 'Last known position', 'Waiting for GPS', 'Location permission') | Where-Object { $ui -match [regex]::Escape($_) }

    $rows = Get-Content $local | Where-Object { $_ -match '^\d+ -?\d+ \d+$' } | ForEach-Object {
      $f = $_ -split ' '
      [pscustomobject]@{ t = [double]$f[0]; currentMa = [double]$f[1]; chargeUah = [double]$f[2] }
    }
    if (@($rows).Count -lt 2) { throw "too few samples for $run" }
    $hours = ($rows[-1].t - $rows[0].t) / 3600
    $results += [pscustomobject]@{
      run = $run
      mode = $mode
      blackout = $blackout -eq 'on'
      minutes = [math]::Round($hours * 60, 1)
      samples = @($rows).Count
      meanDischargeMa = [math]::Round(-($rows | Measure-Object -Property currentMa -Average).Average, 1)
      chargeCounterMahPerHour = [math]::Round(($rows[0].chargeUah - $rows[-1].chargeUah) / 1000 / $hours, 1)
      levelBefore = $before.level
      levelAfter = $after.level
      temperatureBeforeC = $before.temperatureC
      temperatureAfterC = $after.temperatureC
      appInForeground = $foreground
      screenAtEnd = @($state)
    }
    Write-Host ($results[-1] | Format-List | Out-String)
    if (-not $foreground) { throw "$run`: the app left the foreground during the window; the run is not valid" }
  }
} finally {
  Adb shell cmd connectivity airplane-mode disable | Out-Null
  Adb shell settings put system screen_off_timeout $saved.screenOffTimeout | Out-Null
  Adb shell settings put system screen_brightness $saved.brightness | Out-Null
  Adb shell settings put system screen_brightness_mode $saved.brightnessMode | Out-Null
  if (-not $saved.locationOn) { Adb shell cmd location set-location-enabled false | Out-Null }
  foreach ($p in $permissions) { Adb shell pm ($(if ($saved.granted[$p]) { 'grant' } else { 'revoke' })) $AppId $p | Out-Null }
  Adb shell rm -f $sampler | Out-Null
}

$cost = foreach ($v in @('normal', 'blackout')) {
  $idle = $results | Where-Object { $_.run -eq "idle-$v" }
  $follow = $results | Where-Object { $_.run -eq "follow-$v" }
  if ($idle -and $follow) {
    [pscustomobject]@{
      variant = $v
      followMinusIdleMa = [math]::Round($follow.meanDischargeMa - $idle.meanDischargeMa, 1)
      followMinusIdleChargeCounterMahPerHour = [math]::Round($follow.chargeCounterMahPerHour - $idle.chargeCounterMahPerHour, 1)
    }
  }
}
$summary = [ordered]@{
  date = (Get-Date).ToString('s')
  device = AdbText shell getprop ro.product.model
  appVersion = if ((AdbText shell dumpsys package $AppId) -match 'versionName=(\S+)') { $Matches[1] } else { '' }
  minutesPerRun = $Minutes
  intervalSeconds = $IntervalSeconds
  brightness = $Brightness
  runs = $results
  gnssAndCompassCost = @($cost)
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $out 'map-energy.json')
$results | Format-Table run, minutes, meanDischargeMa, chargeCounterMahPerHour, levelBefore, levelAfter, temperatureAfterC, screenAtEnd | Out-Host
$cost | Format-Table | Out-Host
Write-Host "MAP ENERGY: $(Join-Path $out 'map-energy.json')"
} finally {
  $deviceLocks | ForEach-Object { Exit-DeviceLock $_ }
}
