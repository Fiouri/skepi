<#
.SYNOPSIS
  Installs the pinned LunarG Vulkan SDK (native/vulkan/vulkan-sdk-windows.lock.json) for the llama.cpp
  Vulkan backend: downloads the installer, checks the pinned SHA-256 (equal to LunarG's published one),
  runs it unattended into a scratch root and keeps only what ggml-vulkan's CMake build uses (headers,
  vulkan-1.lib, glslc, SPIRV-Headers config, licences) in $env:SKEPI_VULKAN_DIR (default
  %LOCALAPPDATA%\skepi\native\vulkan-sdk-<version>). Prints the directory to use as VULKAN_SDK.
  The installer needs administrator rights (GitHub Windows runners have them).
#>
[CmdletBinding()]
param(
  [string]$CacheDir = $(if ($env:SKEPI_CACHE_DIR) { $env:SKEPI_CACHE_DIR } else { Join-Path $env:LOCALAPPDATA 'skepi\cache' })
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$lock = Get-Content -Raw (Join-Path $PSScriptRoot 'vulkan-sdk-windows.lock.json') | ConvertFrom-Json
$target = $(if ($env:SKEPI_VULKAN_DIR) { $env:SKEPI_VULKAN_DIR } else { Join-Path $env:LOCALAPPDATA "skepi\native\vulkan-sdk-$($lock.version)" })
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
$exe = Join-Path $CacheDir ([IO.Path]::GetFileName($lock.url))

function Get-Sha256([string]$Path) {
  $h = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try { return ([System.BitConverter]::ToString($h.ComputeHash($stream)) -replace '-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $h.Dispose() }
}

if (-not (Test-Path $exe)) {
  Write-Host "downloading $($lock.url)"
  Invoke-WebRequest -Uri $lock.url -OutFile "$exe.partial" -UserAgent 'skepi-native-fetch'
  Move-Item -Force "$exe.partial" $exe
}
$sha = Get-Sha256 $exe
if ($sha -ne $lock.sha256) { Remove-Item -Force $exe; throw "SHA-256 mismatch for $exe ($sha, pinned $($lock.sha256))" }

# Unattended Qt Installer Framework install into a scratch root, then copy the kept subset.
$root = Join-Path ([IO.Path]::GetTempPath()) "skepi-vulkansdk-$($lock.version)"
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
$p = Start-Process -FilePath $exe -ArgumentList @('--root', $root, '--accept-licenses', '--default-answer', '--confirm-command', 'install') -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Vulkan SDK installer exited with $($p.ExitCode)" }

if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($rel in $lock.keep) {
  $src = Join-Path $root $rel
  if (-not (Test-Path $src)) {
    if ($rel -like 'LICENSE*') { continue }
    throw "the SDK has no $rel"
  }
  $dst = Join-Path $target $rel
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item -Recurse -Force $src $dst
}
# Unregister and remove the scratch install (the installer also registers it under Programs and Features).
$maintenance = Join-Path $root 'maintenancetool.exe'
if (Test-Path $maintenance) {
  $m = Start-Process -FilePath $maintenance -ArgumentList @('--default-answer', '--confirm-command', 'purge') -PassThru
  if (-not $m.WaitForExit(300000)) { $m.Kill(); Write-Warning 'maintenancetool purge timed out; the scratch install stays registered' }
}
if (Test-Path $root) { Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue }

Write-Host "Vulkan SDK $($lock.version) (pruned) in $target"
$target
