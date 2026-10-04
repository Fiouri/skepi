<#
.SYNOPSIS
  Provisions a connected Android device with the Phase 0 spike content (ZIM, GGUF, PMTiles, optional ICU data).

.DESCRIPTION
  Downloads every artifact once into a local cache, verifies SHA-256 against scripts/content.lock.json,
  builds the Achaia PMTiles extract with the pinned pmtiles CLI, and `adb push`es everything into the
  app-specific external files dir (/sdcard/Android/data/<package>/files/{zim,models,maps,icu}).
  Nothing is downloaded by the app itself. Compatible with Windows PowerShell 5.1 and PowerShell 7.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\provision.ps1
  powershell -ExecutionPolicy Bypass -File scripts\provision.ps1 -ZimVariant all_mini -WithIcu
  powershell -ExecutionPolicy Bypass -File scripts\provision.ps1 -AppId org.skepi.app.dev   # debug build
#>
[CmdletBinding()]
param(
  [ValidateSet('top_mini', 'all_mini')]
  [string]$ZimVariant = 'top_mini',
  [switch]$WithIcu,
  # Also push the Q4_0 quantisation so the bench can compare prefill speed against Q4_K_M.
  [switch]$WithCompareModel,
  [switch]$SkipModel,
  [switch]$SkipMap,
  [switch]$DownloadOnly,
  [string]$Serial = '',
  # Release by default; the debug build installs side-by-side as org.skepi.app.dev.
  [ValidatePattern('^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$')]
  [string]$AppId = '',
  [string]$CacheDir = (Join-Path $env:TEMP 'skepi\cache')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$lockPath = Join-Path $PSScriptRoot 'content.lock.json'
$lock = Get-Content -Raw -Encoding UTF8 $lockPath | ConvertFrom-Json
$package = if ($AppId) { $AppId } else { $lock.package }
$remoteRoot = "/sdcard/Android/data/$package/files"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

# .NET directly: Get-FileHash is unavailable when PSModulePath is inherited from another shell.
function Get-Sha256([string]$Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead((Resolve-Path $Path).Path)
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

# bsdtar ships with Windows 10+; Expand-Archive has the same module-path problem as Get-FileHash.
function Expand-Zip([string]$Zip, [string]$Dir) {
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  & tar.exe -xf $Zip -C $Dir
  if ($LASTEXITCODE -ne 0) { throw "failed to extract $Zip" }
}

function Assert-Sha256([string]$Path, [string]$Expected) {
  $actual = Get-Sha256 $Path
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "SHA-256 mismatch for $Path`n  expected $Expected`n  actual   $actual"
  }
  Write-Host "  sha256 OK  $(Split-Path -Leaf $Path)"
}

# Downloads to <file>.partial with resume, verifies, then renames (atomic install, as in the architecture).
function Get-Verified([string]$Url, [string]$FileName, [string]$Sha256) {
  $target = Join-Path $CacheDir $FileName
  if (Test-Path $target) {
    Assert-Sha256 $target $Sha256
    return $target
  }
  $partial = "$target.partial"
  Write-Host "  downloading $Url"
  & curl.exe --fail --location --retry 5 --retry-delay 3 --continue-at - --output $partial $Url
  if ($LASTEXITCODE -ne 0) { throw "download failed ($LASTEXITCODE): $Url" }
  try {
    Assert-Sha256 $partial $Sha256
  } catch {
    Remove-Item -Force $partial
    throw
  }
  Move-Item -Force $partial $target
  return $target
}

function Get-PmtilesCli {
  $cli = $lock.pmtilesCli
  $zip = Get-Verified $cli.url ("go-pmtiles_{0}_Windows_x86_64.zip" -f $cli.version) $cli.sha256
  $dir = Join-Path $CacheDir ("pmtiles-{0}" -f $cli.version)
  $exe = Join-Path $dir 'pmtiles.exe'
  if (-not (Test-Path $exe)) {
    Expand-Zip $zip $dir
  }
  return $exe
}

function Get-MapExtract {
  $map = $lock.map
  $target = Join-Path $CacheDir $map.file
  if (Test-Path $target) {
    Assert-Sha256 $target $map.sha256
    return $target
  }
  $exe = Get-PmtilesCli
  $partial = "$target.partial"
  if (Test-Path $partial) { Remove-Item -Force $partial }
  Write-Host "  extracting $($map.bbox) z0-$($map.maxzoom) from $($map.source)"
  & $exe extract $map.source $partial "--bbox=$($map.bbox)" "--maxzoom=$($map.maxzoom)"
  if ($LASTEXITCODE -ne 0) {
    throw "pmtiles extract failed. Protomaps daily builds expire; update map.source/sha256 in content.lock.json."
  }
  Assert-Sha256 $partial $map.sha256
  Move-Item -Force $partial $target
  return $target
}

function Get-IcuData {
  $icu = $lock.icu
  $zip = Get-Verified $icu.url 'icu4c-73_2-data-bin-l.zip' $icu.zipSha256
  $target = Join-Path $CacheDir $icu.file
  if (-not (Test-Path $target)) {
    $dir = Join-Path $CacheDir 'icu-extract'
    Expand-Zip $zip $dir
    Move-Item -Force (Join-Path $dir $icu.file) $target
  }
  Assert-Sha256 $target $icu.sha256
  return $target
}

function Invoke-Adb {
  $adbArgs = @()
  if ($Serial) { $adbArgs += @('-s', $Serial) }
  $adbArgs += $args
  & adb @adbArgs
  if ($LASTEXITCODE -ne 0) { throw "adb $($args -join ' ') failed ($LASTEXITCODE)" }
}

function Get-AdbOutput {
  $adbArgs = @()
  if ($Serial) { $adbArgs += @('-s', $Serial) }
  $adbArgs += $args
  return (& adb @adbArgs | Out-String).Trim()
}

function Push-IfChanged([string]$Local, [string]$Kind) {
  $name = Split-Path -Leaf $Local
  $remote = "$remoteRoot/$Kind/$name"
  $localSize = (Get-Item $Local).Length
  $remoteSize = Get-AdbOutput shell "stat -c %s '$remote' 2>/dev/null"
  if ($remoteSize -eq "$localSize") {
    Write-Host "  up to date  $Kind/$name"
    return
  }
  # The folder must be created (and owned) by the app; shell-created folders are unreadable for it.
  $owner = Get-AdbOutput shell "stat -c %u '$remoteRoot/$Kind' 2>/dev/null"
  if (-not $owner -or $owner -eq '2000') {
    throw "$remoteRoot/$Kind is missing or owned by shell. Uninstall/reinstall the app (or delete the folder) and rerun."
  }
  Write-Host "  pushing     $Kind/$name ($([math]::Round($localSize / 1MB, 1)) MB)"
  Invoke-Adb push $Local $remote
}

Write-Host '== Downloading / verifying content'
$zim = $lock.zim.$ZimVariant
$items = @(@{ Path = (Get-Verified $zim.url $zim.file $zim.sha256); Kind = 'zim' })
if (-not $SkipModel) {
  $items += @{ Path = (Get-Verified $lock.model.url $lock.model.file $lock.model.sha256); Kind = 'models' }
}
if ($WithCompareModel) {
  $items += @{ Path = (Get-Verified $lock.modelCompare.url $lock.modelCompare.file $lock.modelCompare.sha256); Kind = 'models' }
}
if (-not $SkipMap) {
  $items += @{ Path = (Get-MapExtract); Kind = 'maps' }
}
if ($WithIcu) {
  $items += @{ Path = (Get-IcuData); Kind = 'icu' }
}

if ($DownloadOnly) {
  Write-Host 'Download-only: done.'
  exit 0
}

Write-Host '== Pushing to device'
$installed = Get-AdbOutput shell pm path $package
if (-not $installed) {
  throw "$package is not installed. Install the APK first (adb install <apk>) so the app owns its files dir."
}
# Let the app create its own external files dir (correct ownership) before pushing into it.
Invoke-Adb shell monkey -p $package -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep -Seconds 3

foreach ($item in $items) {
  Push-IfChanged $item.Path $item.Kind
}
if (-not $WithIcu) {
  # Keep the device state explicit: without -WithIcu no ICU data is present.
  Invoke-Adb shell "rm -f '$remoteRoot/icu/'*"
}
# Only one ZIM variant at a time so benchmarks are unambiguous.
foreach ($other in $lock.zim.PSObject.Properties) {
  if ($other.Name -ne $ZimVariant) {
    Invoke-Adb shell "rm -f '$remoteRoot/zim/$($other.Value.file)'"
  }
}
if (-not $WithCompareModel) {
  Invoke-Adb shell "rm -f '$remoteRoot/models/$($lock.modelCompare.file)'"
}
Invoke-Adb shell am force-stop $package
Write-Host "Provisioned $package ($ZimVariant, icu=$([bool]$WithIcu)). Remote: $remoteRoot"
