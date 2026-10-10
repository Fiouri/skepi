<#
.SYNOPSIS
  A held-out adversarial set on the phone (the Android pipeline), in airplane mode:
  1. tools/rag-eval writes the run file (items + archive); adb pushes it and the set's invented-article
     archive (tools/rag-eval/fixtures/eval-heldout-*.zim) to <content>/heldout/.
  2. Maestro (e2e/heldout.yaml) taps Bench -> "Run held-out set": the same retrieve() + summarise() as
     the Ask screen, with this phone's profile and model, over the installed packs + that archive.
  3. adb pulls heldout/device.json; tools/rag-eval judges it with the same rules as the eval and desktop
     runs. Report: tools/rag-eval/out/heldout-device-<set>/heldout-device.md.
  The pushed archive stays outside the library (heldout/ is not a pack folder) and is removed afterwards.
#>
[CmdletBinding()]
param(
  [string]$Serial = '',
  [ValidatePattern('^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$')]
  [string]$AppId = 'org.skepi.app',
  [ValidateSet('adversarial-heldout', 'adversarial-heldout-2')]
  [string]$Set = 'adversarial-heldout-2',
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$env:MAESTRO_CLI_NO_ANALYTICS = '1'
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'
$env:MSYS_NO_PATHCONV = '1'
$adbArgs = @()
if ($Serial) { $adbArgs += @('-s', $Serial) }
$archive = @{ 'adversarial-heldout' = 'eval-heldout.zim'; 'adversarial-heldout-2' = 'eval-heldout-2.zim' }[$Set]
$remote = "/sdcard/Android/data/$AppId/files/heldout"
$run = Join-Path $out "heldout-run-$Set.json"
$device = Join-Path $out "heldout-device-$Set.json"

Push-Location $root
try {
  & pnpm --filter @skepi/rag-eval exec tsx src/heldoutDevice.ts --set $Set --write-run $run
  if ($LASTEXITCODE -ne 0) { throw 'could not write the held-out run file' }
  & adb @adbArgs shell "mkdir -p '$remote' && rm -f '$remote/device.json'"
  & adb @adbArgs push $run "$remote/run.json" | Out-Host
  & adb @adbArgs push (Join-Path $root "tools\rag-eval\fixtures\$archive") "$remote/$archive" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'adb push failed' }

  $maestroArgs = @('test', 'e2e/heldout.yaml', '-e', "APP_ID=$AppId", '--format', 'junit', '--output', (Join-Path $out "report-heldout-$Set.xml"), '--test-output-dir', $out)
  if ($Serial) { $maestroArgs = @('--device', $Serial) + $maestroArgs }
  & $Maestro @maestroArgs | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Maestro held-out flow failed ($LASTEXITCODE)" }

  & adb @adbArgs pull "$remote/device.json" $device | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'adb pull failed' }
  & pnpm --filter @skepi/rag-eval exec tsx src/heldoutDevice.ts --set $Set --device $device
  $code = $LASTEXITCODE
} finally {
  & adb @adbArgs shell "rm -rf '$remote'" | Out-Null
  Pop-Location
}
exit $code
