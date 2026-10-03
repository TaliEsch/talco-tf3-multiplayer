[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\loan-first-world-session-owned'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$source = Join-Path $PSScriptRoot 'native\loan_first_world_session_owned.cpp'
$exe = Join-Path $output 'LoanFirstWorldSessionOwned.exe'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}\\" /Fe"{1}" "{2}"' -f $output,$exe,$source
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned first-world session build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned first-world session fixture failed: $LASTEXITCODE" }
