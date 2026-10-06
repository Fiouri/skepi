<#
.SYNOPSIS
  Device/eval retrieval parity: runs the English golden-set questions (+ Greek with -IncludeGreek: frozen
  locale, optional) through retrieval only (no LLM)
  on the phone and in tools/rag-eval (python-libzim), and fails on any difference.
  1. tools/rag-eval writes the query list; adb pushes it to <content>/parity/queries.json.
  2. Maestro (e2e/parity.yaml) taps Bench -> "Run retrieval parity" in airplane mode.
  3. adb pulls parity/device.json; tools/rag-eval reruns the list and compares step by step
     (search lists, fused hits, extracted text, ranked chunks, sources). Report: tools/rag-eval/out/parity.md.
  The device must hold exactly the zimDefault packs of scripts/content.lock.json (scripts/provision.ps1).
#>
[CmdletBinding()]
param(
  [string]$Serial = '',
  [ValidatePattern('^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$')]
  [string]$AppId = 'org.skepi.app',
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat'),
  # Greek questions and the Greek pack (frozen locale; the device must hold zimLocale too).
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
$remote = "/sdcard/Android/data/$AppId/files/parity"
$queries = Join-Path $out 'parity-queries.json'
$device = Join-Path $out 'parity-device.json'

Push-Location $root
try {
  $greekArgs = if ($IncludeGreek) { @('--greek') } else { @() }
  & pnpm --filter @skepi/rag-eval exec tsx src/parity.ts --write-queries $queries @greekArgs
  if ($LASTEXITCODE -ne 0) { throw 'could not write the parity queries' }
  & adb @adbArgs shell "mkdir -p '$remote' && rm -f '$remote/device.json'"
  & adb @adbArgs push $queries "$remote/queries.json" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'adb push failed' }

  $maestroArgs = @('test', 'e2e/parity.yaml', '-e', "APP_ID=$AppId", '--format', 'junit', '--output', (Join-Path $out 'report-parity.xml'), '--test-output-dir', $out)
  if ($Serial) { $maestroArgs = @('--device', $Serial) + $maestroArgs }
  & $Maestro @maestroArgs | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Maestro parity flow failed ($LASTEXITCODE)" }

  & adb @adbArgs pull "$remote/device.json" $device | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'adb pull failed' }
  & pnpm --filter @skepi/rag-eval exec tsx src/parity.ts --device $device @greekArgs
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($code -ne 0) { exit $code }
Write-Host 'PARITY PASS'
