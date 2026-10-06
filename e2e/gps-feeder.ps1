<#
.SYNOPSIS
  Feeds the gps test provider (run-e2e.ps1 -SimulateGnss) with a fixed position every 2 s until killed.
  Each adb call runs with a 3 s timeout and is killed if it hangs (Maestro restarts its device driver
  during a flow; a hanging call must not stop the feed).
#>
param(
  [Parameter(Mandatory = $true)][string]$Adb,
  [string]$Serial = '',
  [string]$Location = '38.24664,21.73457'
)

$adbCall = @()
if ($Serial) { $adbCall += @('-s', $Serial) }
$adbCall += @('shell', 'cmd', 'location', 'providers', 'set-test-provider-location', 'gps', '--location', $Location, '--accuracy', '8')
while ($true) {
  $p = Start-Process -FilePath $Adb -ArgumentList $adbCall -PassThru -WindowStyle Hidden
  if (-not $p.WaitForExit(3000)) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}
