<#
.SYNOPSIS
  Runs the Maestro flows on the connected device in airplane mode and checks that the sealed
  WebView made zero network requests (blocked-request log must be empty).
  1. e2e/ask-en.yaml    English UI: search, article, Layer 1 + automatic AI summary with citation, no source, map.
  2. e2e/ask-t1.yaml    English UI, T1-simulation: Layer 1, then "Summarise with AI".
  3. e2e/medical.yaml   English UI: emergency number + Layer 1 first, unverified AI summary on tap.
  4. e2e/locale-el.yaml Greek UI (app locale el-GR): Greek strings and a Greek Layer 1 answer.
  The per-app locale (Android 13+) is reset to "follow the system" afterwards.
  -AppId selects the installed build: org.skepi.app (release, default) or org.skepi.app.dev (debug).
#>
[CmdletBinding()]
param(
  [string]$Serial = '',
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

$adbArgs = @()
if ($Serial) { $adbArgs += @('-s', $Serial) }

$package = $AppId

function Set-AppLocale([string]$Locales) {
  $localeArgs = @('shell', 'cmd', 'locale', 'set-app-locales', $package)
  if ($Locales) { $localeArgs += @('--locales', $Locales) }
  & adb @adbArgs @localeArgs
  if ($LASTEXITCODE -ne 0) { throw "could not set app locale '$Locales'" }
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
$flows = @(
  @{ Flow = 'e2e/ask-en.yaml'; Report = 'report-en.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/ask-t1.yaml'; Report = 'report-t1.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/medical.yaml'; Report = 'report-medical.xml'; Locale = 'en-US' },
  @{ Flow = 'e2e/locale-el.yaml'; Report = 'report-el.xml'; Locale = 'el-GR' }
)
$results = @()
Push-Location $root
try {
  foreach ($f in $flows) {
    Set-AppLocale $f.Locale
    $results += [pscustomobject]@{ Flow = $f.Flow; Exit = (Invoke-Flow $f.Flow $f.Report) }
  }
} finally {
  Set-AppLocale ''
  Pop-Location
}

$log = & adb @adbArgs logcat -d -s 'ExpoZim:*'
$log | Set-Content -Encoding UTF8 (Join-Path $out 'expozim-logcat.txt')
$blocked = @($log | Select-String -SimpleMatch 'blocked request')
$blocked | ForEach-Object { $_.Line } | Set-Content -Encoding UTF8 (Join-Path $out 'blocked-requests.txt')

foreach ($r in $results) { Write-Host "Maestro exit code ($($r.Flow)): $($r.Exit)" }
Write-Host "Blocked WebView requests during E2E: $($blocked.Count)"
$failed = @($results | Where-Object { $_.Exit -ne 0 })
if ($failed.Count -gt 0) { exit $failed[0].Exit }
if ($blocked.Count -gt 0) {
  Write-Error 'WebView attempted non-zim requests during E2E (see e2e/out/blocked-requests.txt).'
  exit 3
}
Write-Host 'E2E PASS'
