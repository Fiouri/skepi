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

  In a script (dot-source the library, then try/finally):
    . (Join-Path $root 'scripts\device-lock-lib.ps1')
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

. (Join-Path $PSScriptRoot 'device-lock-lib.ps1')

if ($Action) {
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
