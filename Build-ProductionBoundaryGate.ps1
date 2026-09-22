[CmdletBinding()] param([switch]$RunSmokeTest)
$ErrorActionPreference='Stop'
$vswhere='C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$install=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$install){throw 'x64 MSVC build tools missing.'}
$out=Join-Path $PSScriptRoot 'dist\production-boundary-gate'; New-Item -Force -ItemType Directory $out|Out-Null
$n=Join-Path $PSScriptRoot native
$meta=Join-Path $PSScriptRoot 'tools\build-owned-cross-ehcont-object.mjs'
$cmd=('ml64.exe /nologo /W3 /WX /c /Fo"{0}\gate.obj" "{1}\owned_cross_gate.asm" && node "{2}" "{0}\gate.obj" "{0}\gate_eh.obj" OwnedCrossGate && ml64.exe /nologo /W3 /WX /c /Fo"{0}\fault.obj" "{1}\production_boundary_fault_park.asm" && node "{2}" "{0}\fault.obj" "{0}\fault_eh.obj" ProductionBoundaryFaultPark && ml64.exe /nologo /W3 /WX /c /Fo"{0}\harnessstep.obj" "{1}\production_boundary_gate_harness.asm" && node "{2}" "{0}\harnessstep.obj" "{0}\harnessstep_eh.obj" ProductionHarnessResume && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /DTF3_BOUNDARY_OWNED_TEST /c /Fo"{0}\adapter.obj" "{1}\production_boundary_gate.cpp" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /DTF3_BOUNDARY_OWNED_TEST /c /Fo"{0}\control.obj" "{1}\inprocess_gate_control.cpp" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /DTF3_BOUNDARY_OWNED_TEST /c /Fo"{0}\host.obj" "{1}\production_boundary_gate_harness.cpp" && link.exe /nologo /OUT:"{0}\TF3ProductionBoundaryGate.exe" "{0}\adapter.obj" "{0}\control.obj" "{0}\host.obj" "{0}\gate_eh.obj" "{0}\fault_eh.obj" "{0}\harnessstep_eh.obj" synchronization.lib /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f $out,$n,$meta)
& cmd.exe /d /s /c ('call "{0}\VC\Auxiliary\Build\vcvars64.bat" && {1}' -f $install,$cmd);if($LASTEXITCODE){throw 'Production boundary gate build failed'}
if($RunSmokeTest){& "$out\TF3ProductionBoundaryGate.exe";if($LASTEXITCODE){throw 'Production boundary gate smoke failed'}}
