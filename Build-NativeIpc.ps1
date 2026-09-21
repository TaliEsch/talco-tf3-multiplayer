[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$vswhere='C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if(-not(Test-Path -LiteralPath $vswhere)){throw 'Visual Studio Build Tools locator was not found.'}
$install=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars=Join-Path $install 'VC\Auxiliary\Build\vcvars64.bat'
if([string]::IsNullOrWhiteSpace($install) -or -not(Test-Path -LiteralPath $vcvars)){throw 'x64 MSVC build environment was not found.'}
$out=Join-Path $PSScriptRoot 'dist\native'; New-Item -ItemType Directory -Force -Path $out|Out-Null
$native=Join-Path $PSScriptRoot 'native'
$compile='cl.exe /nologo /std:c++17 /W4 /WX /EHsc /c /Fo"{0}" /I "{1}" "{2}" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /c /Fo"{3}" /I "{1}" "{4}" && link.exe /nologo /OUT:"{5}" "{0}" "{3}" advapi32.lib' -f (Join-Path $out 'runtime_ipc.obj'),$native,(Join-Path $native 'runtime_ipc.cpp'),(Join-Path $out 'runtime_ipc_host.obj'),(Join-Path $native 'runtime_ipc_host.cpp'),(Join-Path $out 'TF3RuntimeIpcHost.exe')
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$compile)
if($LASTEXITCODE -ne 0){throw "Native IPC build failed with exit code $LASTEXITCODE."}
Write-Host "Built $(Join-Path $out 'TF3RuntimeIpcHost.exe')"
