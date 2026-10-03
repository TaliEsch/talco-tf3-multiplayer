[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw 'MSVC locator missing.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\loan-debug-restore-owned'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$cpp = Join-Path $PSScriptRoot 'native\loan_debug_restore_owned.cpp'
$obj = Join-Path $output 'loan_debug_restore_owned.obj'
$exe = Join-Path $output 'LoanDebugRestoreOwned.exe'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHs /O2 /Fo"{0}" /Fe"{1}" "{2}" psapi.lib' -f $obj,$exe,$cpp
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned debug restore build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned debug restore qualification failed: $LASTEXITCODE" }
