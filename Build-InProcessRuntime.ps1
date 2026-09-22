[CmdletBinding()]
param([switch]$RunSmokeTest)

$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\native-loader'
New-Item -ItemType Directory -Force -Path $output | Out-Null

$probe = Join-Path $output 'TF3NativeProbe.dll'
$runtime = Join-Path $output 'TF3InProcessRuntime.dll'
$runtimeHost = Join-Path $output 'TF3InProcessRuntimeHost.exe'
$metadataTool = Join-Path $PSScriptRoot 'tools\build-owned-cross-ehcont-object.mjs'
$compile = @(
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /DTF3_NATIVE_PROBE_EXPORTS /LD /I "{0}" /Fo"{1}" "{2}" /link /OUT:"{3}" /IMPLIB:"{4}" bcrypt.lib psapi.lib' -f $native,(Join-Path $output 'probe_dll.obj'),(Join-Path $native 'probe_dll.cpp'),$probe,(Join-Path $output 'TF3NativeProbe.lib')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Gy /guard:cf /guard:ehcont /DTF3_INPROCESS_RUNTIME_EXPORTS /c /I "{0}" /Fo"{1}" "{2}"' -f $native,(Join-Path $output 'inprocess_runtime.obj'),(Join-Path $native 'inprocess_runtime.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Gy /guard:cf /guard:ehcont /c /I "{0}" /Fo"{1}" "{2}"' -f $native,(Join-Path $output 'inprocess_post_observer.obj'),(Join-Path $native 'inprocess_post_observer.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Gy /guard:cf /guard:ehcont /c /I "{0}" /Fo"{1}" "{2}"' -f $native,(Join-Path $output 'inprocess_vehicle_observer.obj'),(Join-Path $native 'inprocess_vehicle_observer.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Gy /guard:cf /guard:ehcont /c /I "{0}" /Fo"{1}" "{2}"' -f $native,(Join-Path $output 'inprocess_runtime_ipc.obj'),(Join-Path $native 'runtime_ipc.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Gy /guard:cf /guard:ehcont /DTF3_BOUNDARY_PRODUCTION_RUNTIME /c /I "{0}" /Fo"{1}" "{2}"' -f $native,(Join-Path $output 'production_boundary_gate.obj'),(Join-Path $native 'production_boundary_gate.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Gy /guard:cf /guard:ehcont /c /I "{0}" /Fo"{1}" "{2}"' -f $native,(Join-Path $output 'inprocess_gate_control.obj'),(Join-Path $native 'inprocess_gate_control.cpp')),
  ('ml64.exe /nologo /W3 /WX /c /Fo"{0}" "{1}"' -f (Join-Path $output 'boundary_gate_raw.obj'),(Join-Path $native 'owned_cross_gate.asm')),
  ('node "{0}" "{1}" "{2}" OwnedCrossGate' -f $metadataTool,(Join-Path $output 'boundary_gate_raw.obj'),(Join-Path $output 'boundary_gate.obj')),
  ('ml64.exe /nologo /W3 /WX /c /Fo"{0}" "{1}"' -f (Join-Path $output 'boundary_fault_raw.obj'),(Join-Path $native 'production_boundary_fault_park.asm')),
  ('node "{0}" "{1}" "{2}" ProductionBoundaryFaultPark' -f $metadataTool,(Join-Path $output 'boundary_fault_raw.obj'),(Join-Path $output 'boundary_fault.obj')),
  ('link.exe /nologo /DLL /OUT:"{0}" /IMPLIB:"{1}" "{2}" "{3}" "{4}" "{5}" "{6}" "{7}" "{8}" "{9}" advapi32.lib bcrypt.lib psapi.lib synchronization.lib /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f $runtime,(Join-Path $output 'TF3InProcessRuntime.lib'),(Join-Path $output 'inprocess_runtime.obj'),(Join-Path $output 'inprocess_post_observer.obj'),(Join-Path $output 'inprocess_vehicle_observer.obj'),(Join-Path $output 'inprocess_runtime_ipc.obj'),(Join-Path $output 'production_boundary_gate.obj'),(Join-Path $output 'inprocess_gate_control.obj'),(Join-Path $output 'boundary_gate.obj'),(Join-Path $output 'boundary_fault.obj')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /I "{0}" /Fo"{1}" "{2}" /link /OUT:"{3}"' -f $native,(Join-Path $output 'inprocess_runtime_host.obj'),(Join-Path $native 'inprocess_runtime_host.cpp'),$runtimeHost)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "In-process runtime build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $runtimeHost $runtime
  if ($LASTEXITCODE -ne 0) { throw "In-process runtime smoke test failed: $LASTEXITCODE" }
}
Write-Host "Built $runtime"
