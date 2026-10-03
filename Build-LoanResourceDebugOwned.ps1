[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw 'MSVC locator missing.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\loan_event_resource_debug_owned.cpp'
$output = Join-Path $PSScriptRoot 'dist\loan-resource-debug-owned'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$exe = Join-Path $output 'LoanResourceDebugOwned.exe'
$object = Join-Path $output 'loan_event_resource_debug_owned.obj'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}" /Fe"{1}" "{2}" bcrypt.lib psapi.lib' -f $object,$exe,$source
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned loan debugger fixture build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned loan debugger fixture failed: $LASTEXITCODE" }
$reader = Join-Path $PSScriptRoot 'native\loan_event_resource_readback_owned.cpp'
$readerExe = Join-Path $output 'LoanResourceReadbackOwned.exe'
$readerObject = Join-Path $output 'loan_event_resource_readback_owned.obj'
$readerCommand = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}" /Fe"{1}" "{2}" bcrypt.lib psapi.lib' -f $readerObject,$readerExe,$reader
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$readerCommand)
if ($LASTEXITCODE -ne 0) { throw "Owned loan reader build failed: $LASTEXITCODE" }
& $readerExe
if ($LASTEXITCODE -ne 0) { throw "Owned loan reader failed: $LASTEXITCODE" }
Write-Host "Built and verified $exe"
