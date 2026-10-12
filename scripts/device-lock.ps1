<#
.SYNOPSIS
  Per-device lock shared by every project on this machine (the S23 and the emulators are shared).

.DESCRIPTION
  One lock file per device in %LOCALAPPDATA%\device-locks\<device>.lock (JSON: owner project, PID, the
  PID's start time, purpose, adb serial, start time). <device> is the phone's ro.serialno when adb can read
  it, so USB (RFCW510JNZB) and wireless (192.168.x.y:port) connections of the same phone share one lock;
  emulators use their adb serial (emulator-5554: every emulator of an image reports the same
  ro.serialno). The file is created atomically. A lock is stale, and taken
  over, once its PID has exited (or the PID now belongs to a younger process).

  Acquiring also refuses a device that another process is driving without the lock: a running Maestro or
  adb command whose command line names the device and that is not part of this process tree. Nothing is
  ever stopped: a busy device is waited for (default 30 min, DEVICE_LOCK_WAIT_SECONDS) and then the
  caller fails with the holder's details.

  In a script (dot-source, then try/finally):
    . (Join-Path $root 'scripts\device-lock.ps1')
    $lock = Enter-DeviceLock -Serial $Serial -Purpose 'run-e2e.ps1'
    try { ... } finally { Exit-DeviceLock $lock }
  Nested scripts in the same process tree that lock the same device again get a no-op handle.

  From other projects or shells (the PID is the process whose exit frees the lock; from Git Bash pass
  the Windows PID of the long-running shell, `cat /proc/$$/winpid`):
    powershell -File scripts\device-lock.ps1 acquire -Serial RFCW510JNZB -Owner selis -OwnerPid 1234 -Purpose maestro
    powershell -File scripts\device-lock.ps1 release -Serial RFCW510JNZB -OwnerPid 1234
    powershell -File scripts\device-lock.ps1 status [-Serial RFCW510JNZB]
#>
[CmdletBinding()]
param(
  [ValidateSet('', 'acquire', 'release', 'status')]
  [string]$Action = '',
  [string]$Serial = '',
  [string]$Owner = 'skepi',
  [int]$OwnerPid = 0,
  [string]$Purpose = '',
  [int]$WaitSeconds = -1
)

$script:DeviceLockDir = Join-Path $env:LOCALAPPDATA 'device-locks'

function Get-DeviceLockKey([string]$AdbSerial) {
  $name = $AdbSerial
  # Emulators share one ro.serialno per system image; their adb serial (console port) is unique instead.
  if ($AdbSerial -notmatch '^emulator-\d+$') {
    $prop = (& adb -s $AdbSerial shell getprop ro.serialno 2>$null) -join ''
    if ($LASTEXITCODE -eq 0 -and $prop.Trim() -match '^[A-Za-z0-9._-]{4,64}$') { $name = $prop.Trim() }
  }
  return ($name -replace '[^A-Za-z0-9._-]', '_')
}

function Resolve-DeviceSerial([string]$AdbSerial) {
  if ($AdbSerial) { return $AdbSerial }
  $devices = @(& adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '^(\S+)\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
  if ($devices.Count -eq 1) { return $devices[0] }
  throw "device lock: $($devices.Count) devices connected ($($devices -join ', ')); pass -Serial"
}

function Get-ProcessStartTicks([int]$ProcessId) {
  $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { return $null }
  try { return $p.StartTime.ToUniversalTime().Ticks } catch { return 0 }
}

function Test-DeviceLockAlive($Info) {
  if (-not $Info -or -not $Info.pid) { return $false }
  $ticks = Get-ProcessStartTicks ([int]$Info.pid)
  if ($null -eq $ticks) { return $false }
  # A recycled PID belongs to a process that started after the lock was taken.
  if ($Info.pidStartTicks -and $ticks -ne 0 -and $ticks -gt [int64]$Info.pidStartTicks) { return $false }
  return $true
}

function Read-DeviceLock([string]$Key) {
  $file = Join-Path $script:DeviceLockDir "$Key.lock"
  if (-not (Test-Path $file)) { return $null }
  try { return Get-Content -Raw $file | ConvertFrom-Json } catch { return [pscustomobject]@{ pid = 0; owner = '?'; unreadable = $true } }
}

# This process, its parents and its children (a script's own Maestro, adb and shells).
function Get-OwnProcessTree([int]$Root) {
  $all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId)
  $byParent = @{}
  foreach ($p in $all) {
    $k = [int]$p.ParentProcessId
    if (-not $byParent.ContainsKey($k)) { $byParent[$k] = @() }
    $byParent[$k] += [int]$p.ProcessId
  }
  $byId = @{}
  foreach ($p in $all) { $byId[[int]$p.ProcessId] = [int]$p.ParentProcessId }
  $tree = @{}
  $cur = $Root
  while ($cur -and -not $tree.ContainsKey($cur)) { $tree[$cur] = $true; $cur = $byId[$cur] }
  $queue = [System.Collections.Generic.Queue[int]]::new()
  $queue.Enqueue($Root)
  while ($queue.Count -gt 0) {
    $c = $queue.Dequeue()
    foreach ($child in @($byParent[$c])) { if ($child -and -not $tree.ContainsKey($child)) { $tree[$child] = $true; $queue.Enqueue($child) } }
  }
  return $tree
}

# Processes outside this process tree that drive the device: adb commands, Maestro (its JVM or launcher)
# and shell/PowerShell scripts run with the device on their command line. Inline `bash -c` / `-Command`
# snippets that merely mention the serial (an editor, a grep) do not count.
function Test-DeviceUserProcess($Process) {
  $name = [string]$Process.Name
  $cmd = [string]$Process.CommandLine
  if ($name -match '(?i)^adb\.exe$') { return $true }
  if ($name -match '(?i)^javaw?\.exe$') { return $cmd -match '(?i)maestro' }
  if ($cmd -match '(?i)[\\/]maestro(\.bat|\.cmd)?["'']?\s') { return $true }
  if ($name -match '(?i)^(bash|sh)\.exe$') { return $cmd -notmatch '\s-c\s' -and $cmd -match '\.sh\b' }
  if ($name -match '(?i)^(powershell|pwsh)\.exe$') { return $cmd -match '(?i)\s-File\s' -and $cmd -notmatch '(?i)device-lock\.ps1' }
  return $false
}

function Get-ForeignDeviceUsers([string[]]$Names, [int]$Root) {
  $own = Get-OwnProcessTree $Root
  $hits = @()
  foreach ($p in @(Get-CimInstance Win32_Process -Property ProcessId, Name, CommandLine)) {
    $cmd = [string]$p.CommandLine
    if (-not $cmd -or $own.ContainsKey([int]$p.ProcessId)) { continue }
    if (-not (Test-DeviceUserProcess $p)) { continue }
    foreach ($n in $Names) {
      if ($n -and $cmd.Contains($n)) {
        $hits += [pscustomobject]@{ pid = [int]$p.ProcessId; name = $p.Name; command = $cmd.Substring(0, [Math]::Min(140, $cmd.Length)) }
        break
      }
    }
  }
  return $hits
}

function Enter-DeviceLock {
  [CmdletBinding()]
  param(
    [string]$Serial = '',
    [string]$Owner = 'skepi',
    [int]$OwnerPid = $PID,
    [string]$Purpose = '',
    [int]$WaitSeconds = $(if ($env:DEVICE_LOCK_WAIT_SECONDS) { [int]$env:DEVICE_LOCK_WAIT_SECONDS } else { 1800 })
  )
  $adbSerial = Resolve-DeviceSerial $Serial
  $key = Get-DeviceLockKey $adbSerial
  $held = @(($env:DEVICE_LOCKS_HELD -split ';') | Where-Object { $_ })
  if ($held -contains $key) {
    $info = Read-DeviceLock $key
    if ($info -and (Test-DeviceLockAlive $info) -and (Get-OwnProcessTree $OwnerPid).ContainsKey([int]$info.pid)) {
      Write-Host "device lock: $key already held by this process tree (PID $($info.pid))"
      return [pscustomobject]@{ Key = $key; Pid = 0; Nested = $true }
    }
  }
  New-Item -ItemType Directory -Force -Path $script:DeviceLockDir | Out-Null
  $file = Join-Path $script:DeviceLockDir "$key.lock"
  $deadline = (Get-Date).AddSeconds([Math]::Max(0, $WaitSeconds))
  $lastNote = [datetime]::MinValue
  while ($true) {
    $busy = $null
    $info = Read-DeviceLock $key
    if ($info -and -not (Test-DeviceLockAlive $info)) {
      Write-Host "device lock: $key was held by $($info.owner) (PID $($info.pid), exited): stale, taking over"
      Remove-Item -Force $file -ErrorAction SilentlyContinue
      $info = $null
    }
    if ($info) {
      $busy = "held by $($info.owner) (PID $($info.pid), since $($info.started), $($info.purpose))"
    } else {
      $foreign = @(Get-ForeignDeviceUsers @($adbSerial, $key) $OwnerPid)
      if ($foreign.Count -gt 0) {
        $busy = "in use without a lock by PID $(($foreign | ForEach-Object { "$($_.pid) [$($_.command)]" }) -join '; ')"
      } else {
        $record = [ordered]@{
          owner = $Owner; pid = $OwnerPid; pidStartTicks = (Get-ProcessStartTicks $OwnerPid); purpose = $Purpose
          serial = $adbSerial; host = $env:COMPUTERNAME; started = (Get-Date).ToString('s')
        } | ConvertTo-Json -Compress
        try {
          $fs = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
          try { $bytes = [Text.Encoding]::UTF8.GetBytes($record); $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Dispose() }
          $env:DEVICE_LOCKS_HELD = (@($held) + $key | Select-Object -Unique) -join ';'
          Write-Host "device lock: $key acquired by $Owner (PID $OwnerPid, $Purpose)"
          return [pscustomobject]@{ Key = $key; Pid = $OwnerPid; Nested = $false }
        } catch [System.IO.IOException] {
          $busy = 'taken by another process a moment ago'
        }
      }
    }
    if ((Get-Date) -ge $deadline) {
      throw ("device lock: $key ($adbSerial) is busy: $busy. Wait until it is free or ask the device owner; " +
        'never stop another session''s app, Maestro or adb process.')
    }
    if (((Get-Date) - $lastNote).TotalSeconds -ge 60) {
      Write-Host "device lock: $key is busy: $busy; waiting (until $($deadline.ToString('HH:mm:ss')))"
      $lastNote = Get-Date
    }
    Start-Sleep -Seconds 10
  }
}

function Exit-DeviceLock($Lock) {
  if (-not $Lock -or $Lock.Nested) { return }
  $info = Read-DeviceLock $Lock.Key
  if ($info -and [int]$info.pid -eq [int]$Lock.Pid) {
    Remove-Item -Force (Join-Path $script:DeviceLockDir "$($Lock.Key).lock") -ErrorAction SilentlyContinue
    Write-Host "device lock: $($Lock.Key) released"
  }
  $env:DEVICE_LOCKS_HELD = (@(($env:DEVICE_LOCKS_HELD -split ';') | Where-Object { $_ -and $_ -ne $Lock.Key })) -join ';'
}

function Show-DeviceLocks([string]$Serial = '') {
  $files = if ($Serial) { @(Join-Path $script:DeviceLockDir "$(Get-DeviceLockKey $Serial).lock") } else { @(Get-ChildItem -Path $script:DeviceLockDir -Filter '*.lock' -ErrorAction SilentlyContinue | ForEach-Object FullName) }
  foreach ($f in $files) {
    if (-not (Test-Path $f)) { Write-Output "$([IO.Path]::GetFileNameWithoutExtension($f)): free"; continue }
    $info = Get-Content -Raw $f | ConvertFrom-Json
    $state = if (Test-DeviceLockAlive $info) { 'held' } else { 'stale' }
    Write-Output "$([IO.Path]::GetFileNameWithoutExtension($f)): $state by $($info.owner) (PID $($info.pid), since $($info.started), $($info.purpose), adb $($info.serial))"
  }
}

if ($MyInvocation.InvocationName -ne '.' -and $Action) {
  Set-StrictMode -Version Latest
  $ErrorActionPreference = 'Stop'
  switch ($Action) {
    'acquire' {
      if ($OwnerPid -le 0) { throw 'acquire needs -OwnerPid: the long-running process whose exit frees the lock' }
      $w = if ($WaitSeconds -ge 0) { $WaitSeconds } elseif ($env:DEVICE_LOCK_WAIT_SECONDS) { [int]$env:DEVICE_LOCK_WAIT_SECONDS } else { 1800 }
      $null = Enter-DeviceLock -Serial $Serial -Owner $Owner -OwnerPid $OwnerPid -Purpose $Purpose -WaitSeconds $w
    }
    'release' {
      if ($OwnerPid -le 0) { throw 'release needs -OwnerPid (the PID given to acquire)' }
      Exit-DeviceLock ([pscustomobject]@{ Key = (Get-DeviceLockKey (Resolve-DeviceSerial $Serial)); Pid = $OwnerPid; Nested = $false })
    }
    'status' { Show-DeviceLocks $Serial }
  }
}
