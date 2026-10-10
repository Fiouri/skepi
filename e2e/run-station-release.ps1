<#
.SYNOPSIS
  Release catalog propagation over Station mode (Phase 3a): the Windows release build, whose embedded
  catalog is the newer release-key catalog (sequence N, default 3), serves wikipedia_en_medicine_mini
  over the LAN to the S23 release build (org.skepi.app, release catalog N-1).
  1. Checks: catalog/embedded/release verifies with the release keys and has sequence N; the desktop
     exe was built after it (so it embeds it); the phone's Library shows "Signed catalog N-1".
  2. Desktop (real release build through tauri-driver, apps/desktop/e2e/station-host.mjs, no test
     mirror) serves the pack; the phone removes its copy, connects, adopts the desktop's catalog
     ("Newer signed catalog received and verified (sequence N)") and receives the pack, every chunk
     verified against it.
  3. After a restart the phone's Library shows "Signed catalog N" (adopted and stored).
  4. The desktop's request log may only contain GET /manifest and GET /pack/wikipedia_en_medicine_mini.
  The Windows Firewall must allow target\release\skepi-desktop.exe on this (private) network.
#>
[CmdletBinding()]
param(
  [string]$Serial = '',
  [string]$HostIp = '',
  [string]$App = '',
  [int]$Sequence = 3,
  [string]$Maestro = (Join-Path $env:USERPROFILE '.maestro\maestro\bin\maestro.bat')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $App) { $App = Join-Path $root 'target\release\skepi-desktop.exe' }
$out = Join-Path $PSScriptRoot 'out\station-release'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$env:MAESTRO_CLI_NO_ANALYTICS = '1'
$env:MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED = 'true'
$env:MSYS_NO_PATHCONV = '1'
$adbArgs = @(); if ($Serial) { $adbArgs += @('-s', $Serial) }
$appId = 'org.skepi.app'

# 1. The embedded release catalog is the signed one, with the expected sequence, and the exe embeds it.
$catalogDir = Join-Path $root 'catalog\embedded\release'
& node (Join-Path $root 'node_modules\tsx\dist\cli.mjs') (Join-Path $root 'tools\catalog-builder\src\cli.ts') verify --release --dir $catalogDir --pinned (Join-Path $root 'catalog\keys\release.json')
if ($LASTEXITCODE -ne 0) { throw 'catalog/embedded/release does not verify with the release keys' }
$embedded = (Get-Content -Raw (Join-Path $catalogDir 'catalog.json') | ConvertFrom-Json).sequence
if ($embedded -ne $Sequence) { throw "catalog/embedded/release has sequence $embedded, expected $Sequence" }
if (-not (Test-Path $App)) { throw "no desktop release build at $App (npx tauri build)" }
if ((Get-Item $App).LastWriteTime -lt (Get-Item (Join-Path $catalogDir 'catalog.json.sig')).LastWriteTime) {
  throw "$App is older than the signed catalog: rebuild it (npx tauri build) so it embeds sequence $Sequence"
}
if (-not $HostIp) {
  $HostIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } | Where-Object { $_.InterfaceAlias -notlike 'vEthernet*' -and $_.InterfaceAlias -notlike '*VPN*' -and $_.InterfaceAlias -notlike 'Nord*' } | Select-Object -First 1).IPAddress
}
if (-not $HostIp) { throw 'no LAN address found (connect this computer and the phone to the same router)' }
$state = (& adb @adbArgs get-state 2>$null)
if ($state -ne 'device') { throw "phone not connected over adb ($Serial): connect it (USB or e2e/adb-wireless.ps1) and retry" }

function Invoke-Generated([string]$Template, [hashtable]$Values, [string]$Report) {
  # Values go into a generated copy of the flow (cmd.exe mangles quotes in maestro.bat -e); single-quoted
  # YAML scalars hold JSON and regexes as they are.
  $flow = Get-Content -Raw (Join-Path $PSScriptRoot $Template)
  foreach ($k in $Values.Keys) {
    $v = [string]$Values[$k]
    $flow = $flow.Replace("`${$k != '-'}", $(if ($v -ne '-') { 'true' } else { 'false' }))
    $flow = $flow.Replace("`${$k}", $(if ($k -in @('APP_ID', 'PACK', 'DESELECT', 'OTHER')) { $v } else { "'" + $v.Replace("'", "''") + "'" }))
  }
  $gen = Join-Path $PSScriptRoot ($Template -replace '\.yaml$', '.gen.yaml')
  [IO.File]::WriteAllText($gen, $flow)
  try {
    $maestroArgs = @('test', ('e2e/' + (Split-Path -Leaf $gen)), '--format', 'junit', '--output', (Join-Path $out $Report), '--test-output-dir', $out)
    if ($Serial) { $maestroArgs = @('--device', $Serial) + $maestroArgs }
    & $Maestro @maestroArgs | Out-Host
    return $LASTEXITCODE
  } finally {
    Remove-Item -Force $gen -ErrorAction SilentlyContinue
  }
}

$dot = [char]0x00B7  # the middle dot of the Library line (this file stays ASCII for Windows PowerShell)
$catalogInfo = { param([int]$n) "Signed catalog $n $dot release keys $dot \d+ packs" }
$results = @()
Push-Location $root
$hostProc = $null
try {
  $before = Invoke-Generated 'catalog-info.yaml' @{ APP_ID = $appId; CATALOG_INFO = (& $catalogInfo ($Sequence - 1)) } 'report-catalog-before.xml'
  $results += [pscustomobject]@{ Step = "phone trusts sequence $($Sequence - 1) before"; Exit = $before }
  if ($before -ne 0) { throw "the phone does not show catalog sequence $($Sequence - 1) before the session" }

  # 2. Desktop content: the medicine pack (hard link to the cache), fresh app data.
  $cache = $(if ($env:SKEPI_CACHE_DIR) { $env:SKEPI_CACHE_DIR } else { Join-Path $env:LOCALAPPDATA 'skepi\cache' })
  $content = Join-Path $env:LOCALAPPDATA 'skepi\e2e-station-release\content'
  $appData = Join-Path $env:LOCALAPPDATA 'skepi\e2e-station-release\appdata'
  foreach ($d in @($content, $appData)) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
  New-Item -ItemType Directory -Force -Path (Join-Path $content 'zim') | Out-Null
  cmd /c mklink /H (Join-Path $content 'zim\wikipedia_en_medicine_mini_2026-04.zim') (Join-Path $cache 'wikipedia_en_medicine_mini_2026-04.zim') | Out-Null

  $hostArgs = @((Join-Path $root 'apps\desktop\e2e\station-host.mjs'), '--app', $App, '--content', $content, '--appdata', $appData, '--host', $HostIp,
    '--packs', 'wikipedia_en_medicine_mini', '--out', $out)
  $hostProc = Start-Process -FilePath node -ArgumentList $hostArgs -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $out 'host.log') -RedirectStandardError (Join-Path $out 'host.err')
  $null = $hostProc.Handle
  $pairing = Join-Path $out 'pairing.json'
  $deadline = (Get-Date).AddMinutes(10)
  while (-not (Test-Path $pairing)) {
    if ($hostProc.HasExited) { throw "station host exited: $(Get-Content -Raw (Join-Path $out 'host.err'))" }
    if ((Get-Date) -gt $deadline) { throw 'no pairing code from the desktop' }
    Start-Sleep -Seconds 2
  }
  $code = (Get-Content -Raw $pairing).Trim()
  Write-Host "desktop $HostIp, pairing code: $code"

  # The phone's copy of the pack goes; the next start's reconcile forgets it.
  & adb @adbArgs shell am force-stop $appId | Out-Null
  & adb @adbArgs shell rm -f /sdcard/Android/data/$appId/files/zim/wikipedia_en_medicine_mini_2026-04.zim | Out-Null
  $receive = Invoke-Generated 'station-receive.yaml' @{
    APP_ID = $appId; PACK = 'wikipedia_en_medicine_mini'; DESELECT = '-'; OTHER = '-'; OTHER_TEXT = ''
    CATALOG_TEXT = "Newer signed catalog received and verified \(sequence $Sequence\)"; CODE = $code
  } 'report-station-release-catalog.xml'
  $results += [pscustomobject]@{ Step = "receive: catalog $Sequence adopted, pack verified"; Exit = $receive }
  $sha = ((& adb @adbArgs shell sha256sum /sdcard/Android/data/$appId/files/zim/wikipedia_en_medicine_mini_2026-04.zim) -split '\s+')[0]
  $expected = ((Get-Content -Raw (Join-Path $catalogDir 'catalog.json') | ConvertFrom-Json).packs | Where-Object { $_.id -eq 'wikipedia_en_medicine_mini' }).sha256
  Write-Host "received file sha256 $sha (catalog $expected)"
  $results += [pscustomobject]@{ Step = 'received file equals the catalog SHA-256'; Exit = $(if ($sha -eq $expected) { 0 } else { 1 }) }
} finally {
  New-Item -ItemType File -Force -Path (Join-Path $out 'phone-done') | Out-Null
  if ($hostProc) {
    if (-not $hostProc.WaitForExit(120000)) { $hostProc.Kill() }
    $results += [pscustomobject]@{ Step = 'desktop host'; Exit = $hostProc.ExitCode }
  }
  Pop-Location
}

Push-Location $root
try {
  # 3. Stored, not only shown: a fresh start trusts sequence N.
  $after = Invoke-Generated 'catalog-info.yaml' @{ APP_ID = $appId; CATALOG_INFO = (& $catalogInfo $Sequence) } 'report-catalog-after.xml'
  $results += [pscustomobject]@{ Step = "phone trusts sequence $Sequence after a restart"; Exit = $after }
} finally {
  Pop-Location
}

# 4. The desktop served only what was selected.
$statusFile = Join-Path $out 'station-status.json'
if (Test-Path $statusFile) {
  $rows = @((Get-Content -Raw $statusFile | ConvertFrom-Json).rows)
  $unexpected = @($rows | Where-Object { -not ($_[2] -eq 'GET' -and ($_[3] -eq '/manifest' -or $_[3] -eq '/pack/wikipedia_en_medicine_mini')) })
  Write-Host "desktop request log: $($rows.Count) requests, unexpected: $($unexpected.Count)"
  $results += [pscustomobject]@{ Step = 'desktop served only the selected pack'; Exit = $(if ($rows.Count -gt 0 -and $unexpected.Count -eq 0) { 0 } else { 1 }) }
}
$results | Format-Table -AutoSize | Out-Host
if (@($results | Where-Object { $_.Exit -ne 0 }).Count -gt 0) { Write-Error 'RELEASE CATALOG PROPAGATION FAIL'; exit 1 }
Write-Host 'RELEASE CATALOG PROPAGATION PASS'
