[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\owned-vehicle-cancel'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$fixture = Join-Path $output 'TF3OwnedVehicleCancelFixture.exe'
$compile = @(
  ('ml64.exe /nologo /W3 /WX /c /Fo"{0}" "{1}"' -f (Join-Path $output 'cancel_fixture.obj'),(Join-Path $native 'owned_vehicle_cancel_fixture.asm')),
  # The callback-fault case deliberately unwinds through the handwritten
  # x64 frame, so compile the caller with asynchronous exception awareness.
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHa /O2 /Gy /guard:cf /Fo"{0}" "{1}" "{2}" /link /OUT:"{3}" /DYNAMICBASE /NXCOMPAT /GUARD:CF' -f (Join-Path $output 'cancel_fixture_host.obj'),(Join-Path $native 'owned_vehicle_cancel_fixture.cpp'),(Join-Path $output 'cancel_fixture.obj'),$fixture)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned vehicle cancellation fixture build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $fixture
  if ($LASTEXITCODE -ne 0) { throw "Owned vehicle cancellation fixture failed: $LASTEXITCODE" }
}
Write-Host "Built owned vehicle cancellation fixture: $fixture"
