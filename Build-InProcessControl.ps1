[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
if ([string]::IsNullOrWhiteSpace($installation) -or -not (Test-Path -LiteralPath $vcvars)) { throw 'x64 MSVC build tools missing.' }
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\native-inprocess-control'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$production = Join-Path $output 'inprocess_control_production.obj'
$hostObject = Join-Path $output 'inprocess_control_host.obj'
$asmObject = Join-Path $output 'inprocess_control_marker.obj'
$harness = Join-Path $output 'TF3OwnedInProcessControlHost.exe'
$compile = @(
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /I "{0}" /Fo"{1}" "{2}"' -f $native,$production,(Join-Path $native 'inprocess_control.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /I "{0}" /Fo"{1}" "{2}"' -f $native,$hostObject,(Join-Path $native 'inprocess_control_host.cpp')),
  ('ml64.exe /nologo /c /Fo"{0}" "{1}"' -f $asmObject,(Join-Path $native 'inprocess_control_host.asm')),
  ('link.exe /nologo /OUT:"{0}" "{1}" "{2}" "{3}" synchronization.lib' -f $harness,$production,$hostObject,$asmObject)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned in-process control build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $harness
  if ($LASTEXITCODE -ne 0) { throw "Owned in-process control smoke test failed: $LASTEXITCODE" }
}
Write-Host "Built owned-process control harness: $harness"
