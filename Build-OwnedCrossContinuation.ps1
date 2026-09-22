[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\owned-cross-continuation'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$gate = Join-Path $output 'gate.obj'
$gateEh = Join-Path $output 'gate_ehcont.obj'
$step = Join-Path $output 'step.obj'
$stepEh = Join-Path $output 'step_ehcont.obj'
$dll = Join-Path $output 'TF3OwnedCrossGate.dll'
$harness = Join-Path $output 'TF3OwnedCrossContinuation.exe'
$legacyHarness = Join-Path $output 'TF3OwnedCrossLegacyContinuation.exe'
$metadataTool = Join-Path $PSScriptRoot 'tools\build-owned-cross-ehcont-object.mjs'
$compile = @(
  ('ml64.exe /nologo /W3 /WX /c /Fo"{0}" "{1}"' -f $gate,(Join-Path $native 'owned_cross_gate.asm')),
  ('node "{0}" "{1}" "{2}" OwnedCrossGate' -f $metadataTool,$gate,$gateEh),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /LD /Fo"{0}" "{1}" "{2}" /link /OUT:"{3}" /IMPLIB:"{4}" /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f (Join-Path $output 'dll.obj'),(Join-Path $native 'owned_cross_continuation_dll.cpp'),$gateEh,$dll,(Join-Path $output 'gate.lib')),
  ('ml64.exe /nologo /W3 /WX /c /Fo"{0}" "{1}"' -f $step,(Join-Path $native 'owned_cross_step.asm')),
  ('node "{0}" "{1}" "{2}" OwnedCrossResume' -f $metadataTool,$step,$stepEh),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /Fo"{0}" "{1}" "{2}" /link /OUT:"{3}" /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f (Join-Path $output 'host.obj'),(Join-Path $native 'owned_cross_continuation_host.cpp'),$stepEh,$harness),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /DOWNED_CROSS_LEGACY_HOST /Fo"{0}" "{1}" "{2}" /link /OUT:"{3}" /DYNAMICBASE /NXCOMPAT /GUARD:CF /CETCOMPAT' -f (Join-Path $output 'legacy-host.obj'),(Join-Path $native 'owned_cross_continuation_host.cpp'),$step,$legacyHarness)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned cross-image build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $harness
  if ($LASTEXITCODE -ne 0) { throw "Owned cross-image fixture failed: $LASTEXITCODE" }
  & $legacyHarness
  if ($LASTEXITCODE -ne 0) { throw "Owned cross-image legacy fixture failed: $LASTEXITCODE" }
}
Write-Host "Built owned EXE/DLL continuation fixtures (TF3 activation unavailable): $harness; $legacyHarness"
