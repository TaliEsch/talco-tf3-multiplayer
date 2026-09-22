[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\native-vehicle-observer'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$dll = Join-Path $output 'TF3OwnedVehicleObserver.dll'
$hostExe = Join-Path $output 'TF3OwnedVehicleObserverHost.exe'
$compile = @(
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /DTF3_VEHICLE_OBSERVER_OWNED_TEST /DTF3_VEHICLE_OBSERVER_TEST_DLL /LD /I "{0}" /Fo"{1}\\" "{2}" "{3}" "{4}" /link /OUT:"{5}" /IMPLIB:"{6}" bcrypt.lib psapi.lib' -f $native,$output,(Join-Path $native 'inprocess_vehicle_observer.cpp'),(Join-Path $native 'inprocess_vehicle_observer_host.cpp'),(Join-Path $native 'inprocess_post_observer.cpp'),$dll,(Join-Path $output 'TF3OwnedVehicleObserver.lib')),
  ('ml64.exe /nologo /c /Fo"{0}" "{1}"' -f (Join-Path $output 'vehicle_fixture.obj'),(Join-Path $native 'inprocess_vehicle_observer_host.asm')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /I "{0}" /Fo"{1}" "{2}" "{3}" /link /OUT:"{4}"' -f $native,(Join-Path $output 'vehicle_host.obj'),(Join-Path $native 'inprocess_vehicle_observer_host.cpp'),(Join-Path $output 'vehicle_fixture.obj'),$hostExe)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned vehicle-observer build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $hostExe $dll
  if ($LASTEXITCODE -ne 0) { throw "Owned vehicle-observer qualification failed: $LASTEXITCODE" }
}
Write-Host "Built owned vehicle observer: $hostExe"
