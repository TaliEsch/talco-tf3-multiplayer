[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\inprocess-gate-control'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$harness = Join-Path $output 'TF3InProcessGateControl.exe'
$compile = @(
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /c /Fo"{0}" "{1}"' -f (Join-Path $output 'gate-control.obj'),(Join-Path $native 'inprocess_gate_control.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /c /Fo"{0}" "{1}"' -f (Join-Path $output 'gate-control-host.obj'),(Join-Path $native 'inprocess_gate_control_host.cpp')),
  ('link.exe /nologo /OUT:"{0}" "{1}" "{2}" synchronization.lib /DYNAMICBASE /NXCOMPAT /GUARD:CF /CETCOMPAT' -f $harness,(Join-Path $output 'gate-control.obj'),(Join-Path $output 'gate-control-host.obj'))
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "In-process gate-control build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $harness
  if ($LASTEXITCODE -ne 0) { throw "In-process gate-control host failed: $LASTEXITCODE" }
}
Write-Host "Built owned-process gate-control host (TF3 activation unavailable): $harness"
