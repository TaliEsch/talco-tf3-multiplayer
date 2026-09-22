[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\native-inprocess-control-ipc'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$control = Join-Path $output 'inprocess_control.obj'
$hostObject = Join-Path $output 'inprocess_control_ipc_host.obj'
$hostExe = Join-Path $output 'TF3OwnedControlIpcHost.exe'
$compile = @(
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /I "{0}" /Fo"{1}" "{2}"' -f $native,$control,(Join-Path $native 'inprocess_control.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /I "{0}" /Fo"{1}" "{2}"' -f $native,$hostObject,(Join-Path $native 'inprocess_control_ipc_host.cpp')),
  ('link.exe /nologo /OUT:"{0}" "{1}" "{2}" synchronization.lib advapi32.lib bcrypt.lib' -f $hostExe,$control,$hostObject)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned control IPC build failed: $LASTEXITCODE" }
Write-Host "Built owned-process control IPC fixture: $hostExe"
