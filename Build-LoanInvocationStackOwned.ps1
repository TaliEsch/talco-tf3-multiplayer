[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\loan-invocation-stack-owned'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$asmSource = Join-Path $PSScriptRoot 'native\loan_invocation_stack_owned.asm'
$asmObject = Join-Path $output 'loan_invocation_stack_owned_asm.obj'
$source = Join-Path $PSScriptRoot 'native\loan_invocation_stack_owned.cpp'
$resolver = Join-Path $PSScriptRoot 'native\loan_invocation_stack.cpp'
$exe = Join-Path $output 'LoanInvocationStackOwned.exe'
$command = 'ml64.exe /nologo /c /Fo"{0}" "{1}" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{2}\\" /Fe"{3}" "{4}" "{5}" "{0}"' -f $asmObject,$asmSource,$output,$exe,$source,$resolver
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned invocation build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned invocation fixture failed: $LASTEXITCODE" }
