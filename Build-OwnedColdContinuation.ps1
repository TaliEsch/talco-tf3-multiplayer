[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\owned-cold-continuation'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$asmObject = Join-Path $output 'cold_fragment.obj'
$ehObject = Join-Path $output 'cold_ehcont.obj'
$harness = Join-Path $output 'TF3OwnedColdContinuation.exe'
$compile = @(
  ('ml64.exe /nologo /W3 /WX /c /Fo"{0}" "{1}"' -f $asmObject,(Join-Path $native 'owned_cold_continuation.asm')),
  ('node "{0}" "{1}" "{2}"' -f (Join-Path $PSScriptRoot 'tools\build-owned-ehcont-object.mjs'),$asmObject,$ehObject),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Gy /guard:cf /guard:ehcont /Fo"{0}" "{1}" "{2}" /link /OUT:"{3}" /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f (Join-Path $output 'cold_fixture.obj'),(Join-Path $native 'owned_cold_continuation.cpp'),$ehObject,$harness)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned cold continuation build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $harness
  if ($LASTEXITCODE -ne 0) { throw "Owned cold continuation fixture failed: $LASTEXITCODE" }
}
Write-Host "Built owned cold-fragment fixture (TF3 activation unavailable): $harness"
