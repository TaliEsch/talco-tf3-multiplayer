[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw "Visual Studio locator missing: $locator" }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$luaRoot = Join-Path $PSScriptRoot 'dist\loan-lua-registration-owned'
$luaInclude = Join-Path $luaRoot 'upstream-verified\lua-5.2.4\src'
$luaDll = Join-Path $luaRoot 'OwnedLua52.dll'
$luaLib = Join-Path $luaRoot 'OwnedLua52.lib'
foreach ($path in @($luaDll, $luaLib)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Existing owned Lua runtime file missing: $path" }
}
if (-not (Test-Path -LiteralPath $luaInclude -PathType Container)) { throw "Existing Lua headers missing: $luaInclude" }
$output = Join-Path $PSScriptRoot 'dist\loan-state-readback-owned'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$obj = Join-Path $output 'obj'
New-Item -ItemType Directory -Force -Path $obj | Out-Null
$source = Join-Path $PSScriptRoot 'native\loan_state_readback_owned.cpp'
$exe = Join-Path $output 'LoanStateReadbackOwned.exe'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHs /MD /guard:cf /O2 /I"{0}" /I"{1}" /Fo"{2}" /Fe"{3}" "{4}" "{5}" /link /guard:cf' -f $luaRoot,$luaInclude,$obj,$exe,$source,$luaLib
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned readback build failed: $LASTEXITCODE" }
$env:PATH = "$luaRoot;$env:PATH"
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned readback fixture failed: $LASTEXITCODE" }
