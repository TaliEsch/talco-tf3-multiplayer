[CmdletBinding()]
param([string]$LuaSourcePath)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($LuaSourcePath)) { $LuaSourcePath = Join-Path $PSScriptRoot '.run\loan-lua-owned\lua-5.2.4\src' }
& (Join-Path $PSScriptRoot 'Build-LoanLuaOwnedRuntime.ps1') -UpstreamSourcePath $LuaSourcePath
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\loan-lua-registration-owned'
$source = Join-Path $PSScriptRoot 'native\loan_lua_consumer_owned.cpp'
$exe = Join-Path $output 'LoanLuaConsumerOwned.exe'
$library = Join-Path $output 'OwnedLua52.lib'
$asmSource = Join-Path $PSScriptRoot 'native\loan_invocation_stack_owned.asm'
$asmObject = Join-Path $output 'loan_invocation_stack_owned_asm.obj'
$resolver = Join-Path $PSScriptRoot 'native\loan_invocation_stack.cpp'
$bridgeSource = Join-Path $PSScriptRoot 'native\loan_registration_bridge_owned.asm'
$bridgeObject = Join-Path $output 'loan_registration_bridge_owned_asm.obj'
$command = 'ml64.exe /nologo /c /Fo"{5}" "{6}" && ml64.exe /nologo /c /Fo"{8}" "{9}" && cl.exe /nologo /std:c++17 /W4 /WX /EHs /MD /O2 /DLUA_BUILD_AS_DLL /I"{0}" /Fo"{1}\\" /Fe"{2}" "{3}" "{4}" "{5}" "{7}" "{8}"' -f $LuaSourcePath,$output,$exe,$source,$library,$asmObject,$asmSource,$resolver,$bridgeObject,$bridgeSource
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned Lua consumer build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned Lua consumer fixture failed: $LASTEXITCODE" }
