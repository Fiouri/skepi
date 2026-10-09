<#
.SYNOPSIS
  Runs a command (cargo, pnpm tauri, ...) inside the MSVC x64 build environment.
  Git Bash puts its own `link` (coreutils) ahead of MSVC's link.exe on PATH, which breaks every Rust
  link step; this script loads vcvars64 (found with vswhere) and drops Git's usr/bin from PATH.

  powershell -File scripts/with-msvc.ps1 cargo test --workspace
#>
# No param block: arguments such as `--ignored` or `--` reach the command untouched ($args).
$Command = @($args)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $Command -or $Command.Count -eq 0) { throw 'usage: with-msvc.ps1 <command> [args...]' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw 'vswhere.exe not found: install Visual Studio Build Tools with the C++ workload' }
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'no Visual Studio installation with the C++ x64 tools' }
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'

# Import the environment vcvars64 produces into this process.
$lines = & cmd.exe /d /s /c "`"$vcvars`" >nul && set"
foreach ($line in $lines) {
  $i = $line.IndexOf('=')
  if ($i -gt 0) { [Environment]::SetEnvironmentVariable($line.Substring(0, $i), $line.Substring($i + 1), 'Process') }
}
# No installed Windows SDK (or a broken one): use Microsoft's NuGet packages Microsoft.Windows.SDK.CPP
# and .x64 extracted to SKEPI_WINSDK_DIR or %LOCALAPPDATA%\skepi\tools\winsdk-<version> (no admin needed).
$installedSdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Lib'
if (-not (Test-Path $installedSdk) -or $env:SKEPI_WINSDK_DIR) {
  $sdk = $env:SKEPI_WINSDK_DIR
  if (-not $sdk) {
    $found = Get-ChildItem -Directory -ErrorAction SilentlyContinue (Join-Path $env:LOCALAPPDATA 'skepi\tools') -Filter 'winsdk-*' | Sort-Object Name -Descending | Select-Object -First 1
    if ($found) { $sdk = $found.FullName }
  }
  if (-not $sdk) { throw 'no Windows SDK: install it with Visual Studio Build Tools, or extract the Microsoft.Windows.SDK.CPP(.x64) NuGet packages (docs/phase-3a-report.md)' }
  $inc = Get-ChildItem -Directory (Join-Path $sdk 'c\Include') | Where-Object { Test-Path (Join-Path $_.FullName 'um') } | Sort-Object Name -Descending | Select-Object -First 1
  $ver = $inc.Name
  $env:WindowsSdkDir = (Join-Path $sdk 'c') + '\'
  $env:WindowsSDKVersion = "$ver\"
  $env:WindowsSDKLibVersion = "$ver\"
  $env:UCRTVersion = $ver
  $env:UniversalCRTSdkDir = (Join-Path $sdk 'c') + '\'
  $env:INCLUDE = (@('ucrt', 'um', 'shared', 'winrt', 'cppwinrt') | ForEach-Object { Join-Path $inc.FullName $_ }) -join ';' | ForEach-Object { "$_;$env:INCLUDE" }
  $env:LIB = "$(Join-Path $sdk 'c\ucrt\x64');$(Join-Path $sdk 'c\um\x64');$env:LIB"
  $env:PATH = "$(Join-Path $sdk "c\bin\$ver\x64");$env:PATH"
  # MSBuild generators look for an installed SDK; CMake builds (llama.cpp) use Ninja with this environment.
  $ninja = Get-ChildItem -Directory -ErrorAction SilentlyContinue (Join-Path $env:LOCALAPPDATA 'skepi\tools') -Filter 'ninja-*' | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $ninja) { throw 'Ninja not found in %LOCALAPPDATA%\skepi\tools\ninja-* (needed with the NuGet SDK)' }
  $env:PATH = "$($ninja.FullName);$env:PATH"
}
# CMake builds (llama.cpp) with Ninja whenever it is available: with an installed SDK the VS 2019
# MSBuild generator failed its compiler check in the ggml-vulkan shader-generator sub-build (Phase 3a).
if (-not $env:CMAKE_GENERATOR) {
  $tools = Get-ChildItem -Directory -ErrorAction SilentlyContinue (Join-Path $env:LOCALAPPDATA 'skepi\tools') -Filter 'ninja-*' | Sort-Object Name -Descending | Select-Object -First 1
  if ($tools) { $env:PATH = "$($tools.FullName);$env:PATH" }
  if (Get-Command ninja.exe -ErrorAction SilentlyContinue) { $env:CMAKE_GENERATOR = 'Ninja' }
}

$env:PATH = (($env:PATH -split ';') | Where-Object { $_ -and $_ -notmatch '\\Git\\usr\\bin$' -and $_ -notmatch '^/usr/bin$' -and $_ -notmatch '\\msys64\\usr\\bin$' }) -join ';'

# The vendored OpenSSL of SQLCipher (rusqlite) configures with a native Windows perl; Git's MSYS perl
# produces Unix paths. Portable Strawberry Perl (only perl\bin, not its gcc) from SKEPI_PERL_DIR or
# %LOCALAPPDATA%\skepi\tools\strawberry-perl-* (see docs/phase-3a-report.md, "Build setup").
$perlDir = $env:SKEPI_PERL_DIR
if (-not $perlDir) {
  $found = Get-ChildItem -Directory -ErrorAction SilentlyContinue (Join-Path $env:LOCALAPPDATA 'skepi\tools') -Filter 'strawberry-perl-*' | Sort-Object Name -Descending | Select-Object -First 1
  if ($found) { $perlDir = $found.FullName }
}
if ($perlDir -and (Test-Path (Join-Path $perlDir 'perl\bin\perl.exe'))) { $env:PATH = (Join-Path $perlDir 'perl\bin') + ';' + $env:PATH }

# npx/pnpm put node_modules\.bin first on PATH, where the npm package `rc` shadows the SDK's rc.exe
# (CMake's compiler check then fails): name the resource compiler explicitly.
$rc = Get-Command rc.exe -CommandType Application -ErrorAction SilentlyContinue | Where-Object { $_.Source -like '*Windows Kits*' -or $_.Source -like '*winsdk*' } | Select-Object -First 1
if ($rc) { $env:RC = $rc.Source.Replace([char]92, [char]47); $env:CMAKE_RC_COMPILER = $env:RC }

$exe = $Command[0]
$rest = @($Command | Select-Object -Skip 1)
& $exe @rest
exit $LASTEXITCODE
