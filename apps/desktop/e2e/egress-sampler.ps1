<#
.SYNOPSIS
  Egress sampler for apps/desktop/e2e/egress.mjs: every ~500 ms, the network endpoints of the
  skepi-desktop.exe process tree (the app and its WebView2 runtime processes), as JSON lines.
  A child counts only if it started after its parent (a reused parent PID never pulls in another
  application's WebView2). TCP: remote address and state; UDP: bound local endpoints (QUIC/DNS show
  up here; Windows does not expose UDP peers). Stops when -StopFile exists.
#>
param(
  [Parameter(Mandatory)][string]$Out,
  [Parameter(Mandatory)][string]$StopFile,
  [int]$IntervalMs = 500
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$local = @('127.0.0.1', '::1', '0.0.0.0', '::')
$writer = [System.IO.StreamWriter]::new($Out, $true)
try {
  while (-not (Test-Path $StopFile)) {
    $t0 = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, CreationDate, CommandLine)
    $byId = @{}
    foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
    $tree = @{}
    foreach ($r in @($all | Where-Object { $_.Name -eq 'skepi-desktop.exe' })) { $tree[[int]$r.ProcessId] = $true }
    $added = $true
    while ($added) {
      $added = $false
      foreach ($p in $all) {
        $id = [int]$p.ProcessId; $parent = [int]$p.ParentProcessId
        if ($tree.ContainsKey($id) -or -not $tree.ContainsKey($parent)) { continue }
        if ($p.CreationDate -lt $byId[$parent].CreationDate) { continue }
        $tree[$id] = $true; $added = $true
      }
    }
    $rows = @()
    if ($tree.Count -gt 0) {
      foreach ($c in @(Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        if (-not $tree.ContainsKey([int]$c.OwningProcess) -or $local -contains $c.RemoteAddress) { continue }
        $p = $byId[[int]$c.OwningProcess]
        $type = $(if ($p.CommandLine -match '--type=([\w-]+)') { $Matches[1] } elseif ($p.Name -eq 'msedgewebview2.exe') { 'browser' } else { 'app' })
        $rows += [pscustomobject]@{ proto = 'tcp'; pid = [int]$c.OwningProcess; process = $p.Name; type = $type; remote = $c.RemoteAddress; port = [int]$c.RemotePort; state = [string]$c.State }
      }
      foreach ($u in @(Get-NetUDPEndpoint -ErrorAction SilentlyContinue)) {
        if (-not $tree.ContainsKey([int]$u.OwningProcess) -or $local -contains $u.LocalAddress) { continue }
        $p = $byId[[int]$u.OwningProcess]
        $type = $(if ($p.CommandLine -match '--type=([\w-]+)') { $Matches[1] } elseif ($p.Name -eq 'msedgewebview2.exe') { 'browser' } else { 'app' })
        $rows += [pscustomobject]@{ proto = 'udp'; pid = [int]$u.OwningProcess; process = $p.Name; type = $type; remote = ''; port = [int]$u.LocalPort; state = "bound $($u.LocalAddress)" }
      }
    }
    $writer.WriteLine((@{ t = $t0; processes = $tree.Count; rows = $rows } | ConvertTo-Json -Compress -Depth 4))
    $writer.Flush()
    $sleep = $IntervalMs - ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $t0)
    if ($sleep -gt 0) { Start-Sleep -Milliseconds $sleep }
  }
} finally { $writer.Dispose() }
