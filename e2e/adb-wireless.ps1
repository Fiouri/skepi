<#
.SYNOPSIS
  Wireless debugging for the bench and E2E scripts (the phone runs on battery, no cable).
.DESCRIPTION
  Android 11+ wireless debugging: Developer options -> Wireless debugging. Either pair once with the
  code shown under "Pair device with pairing code" (-Pair host:port -PairingCode 123456), or reuse an
  earlier pairing; then connect to the address shown on the Wireless debugging screen (-Connect
  host:port). Prints the serial (host:port) to pass as -Serial to run-e2e.ps1, run-parity.ps1 and
  run-energy.ps1.

  Airplane mode normally turns Wi-Fi off, which would cut the adb link. -KeepWifiInAirplane removes
  Wi-Fi from airplane_mode_radios (a shell-writable global setting) so Wi-Fi stays on in airplane mode;
  -Restore puts the default back. The app's own traffic is still measured per UID (adb runs as shell).
.EXAMPLE
  powershell -File e2e\adb-wireless.ps1 -Pair 192.168.1.20:37099 -PairingCode 482913 -Connect 192.168.1.20:41235 -KeepWifiInAirplane
#>
[CmdletBinding()]
param(
  [string]$Pair = '',
  [string]$PairingCode = '',
  [string]$Connect = '',
  [switch]$KeepWifiInAirplane,
  [switch]$Restore
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$hostPort = '^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$'
if ($Pair) {
  if ($Pair -notmatch $hostPort -or $PairingCode -notmatch '^\d{6}$') { throw '-Pair host:port and a 6-digit -PairingCode are required' }
  & adb pair $Pair $PairingCode | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "adb pair $Pair failed" }
}
if (-not $Connect) { throw '-Connect host:port (the address on the Wireless debugging screen) is required' }
if ($Connect -notmatch $hostPort) { throw "-Connect must be host:port, got $Connect" }
$res = (& adb connect $Connect) -join ' '
Write-Host $res
if ($res -notmatch 'connected to') { throw "adb connect $Connect failed" }
$state = ((& adb -s $Connect get-state) -join '').Trim()
if ($state -ne 'device') { throw "$Connect is $state" }

if ($KeepWifiInAirplane) {
  $radios = ((& adb -s $Connect shell settings get global airplane_mode_radios) -join '').Trim()
  Set-Content -Encoding ASCII (Join-Path $PSScriptRoot 'out\airplane_mode_radios.txt') $radios
  $kept = ($radios -split ',' | Where-Object { $_ -and $_ -ne 'wifi' }) -join ','
  & adb -s $Connect shell settings put global airplane_mode_radios $kept | Out-Null
  Write-Host "airplane mode keeps Wi-Fi on (radios: $kept; was: $radios)"
}
if ($Restore) {
  $saved = Join-Path $PSScriptRoot 'out\airplane_mode_radios.txt'
  $radios = if (Test-Path $saved) { (Get-Content -Raw $saved).Trim() } else { 'cell,bluetooth,wifi,nfc,wimax' }
  & adb -s $Connect shell settings put global airplane_mode_radios $radios | Out-Null
  Write-Host "airplane_mode_radios restored: $radios"
}
Write-Output $Connect
