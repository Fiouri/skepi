<#
.SYNOPSIS
  Downloads the pinned official libzim Windows build (native/kiwix/libzim-windows.lock.json), checks the
  publisher's MD5 and our pinned SHA-256 of the archive and of every file crates/zim-ffi links or ships,
  and extracts it to $env:SKEPI_LIBZIM_DIR (default %LOCALAPPDATA%\skepi\native\libzim-<version>).
  crates/zim-ffi/build.rs never downloads: it only reads and re-checks this directory.
#>
[CmdletBinding()]
param(
  [string]$CacheDir = $(if ($env:SKEPI_CACHE_DIR) { $env:SKEPI_CACHE_DIR } else { Join-Path $env:LOCALAPPDATA 'skepi\cache' })
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$lock = Get-Content -Raw (Join-Path $PSScriptRoot 'libzim-windows.lock.json') | ConvertFrom-Json
$target = $(if ($env:SKEPI_LIBZIM_DIR) { $env:SKEPI_LIBZIM_DIR } else { Join-Path $env:LOCALAPPDATA "skepi\native\libzim-$($lock.version)" })
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
$zip = Join-Path $CacheDir ([IO.Path]::GetFileName($lock.url))

# .NET directly: Get-FileHash and Expand-Archive are unavailable when PSModulePath comes from another shell.
function Get-Hash([string]$Path, [string]$Algorithm) {
  $h = [System.Security.Cryptography.HashAlgorithm]::Create($Algorithm)
  $stream = [System.IO.File]::OpenRead($Path)
  try { return ([System.BitConverter]::ToString($h.ComputeHash($stream)) -replace '-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $h.Dispose() }
}

if (-not (Test-Path $zip)) {
  Write-Host "downloading $($lock.url)"
  Invoke-WebRequest -Uri $lock.url -OutFile "$zip.partial" -UserAgent 'skepi-native-fetch'
  Move-Item -Force "$zip.partial" $zip
}
$md5 = Get-Hash $zip 'MD5'
$sha = Get-Hash $zip 'SHA256'
if ($md5 -ne $lock.md5) { throw "MD5 mismatch for $zip ($md5, publisher $($lock.md5))" }
if ($sha -ne $lock.sha256) { throw "SHA-256 mismatch for $zip ($sha, pinned $($lock.sha256))" }

if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Force -Path $target | Out-Null
& (Join-Path $env:SystemRoot 'System32\tar.exe') -xf $zip -C $target
if ($LASTEXITCODE -ne 0) { throw "could not extract $zip" }
foreach ($p in $lock.files.PSObject.Properties) {
  $file = Join-Path $target $p.Name
  $h = Get-Hash $file 'SHA256'
  if ($h -ne $p.Value) { Remove-Item -Recurse -Force $target; throw "SHA-256 mismatch for $($p.Name) ($h, pinned $($p.Value))" }
}
Write-Host "libzim $($lock.version) verified -> $target"
Write-Host "set SKEPI_LIBZIM_DIR=$target if you use another location"
