[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\external_hardware_load_harness.cpp'
$assembly = Join-Path $PSScriptRoot 'native\external_hardware_load_fixture.asm'
$output = Join-Path $PSScriptRoot 'dist\external-hardware-load-probe'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$object = Join-Path $output 'external_hardware_load_fixture.obj'
$exe = Join-Path $output 'ExternalHardwareLoadHarness.exe'
$command = ('ml64.exe /nologo /c /Fo"{0}" "{1}" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fe"{2}" "{3}" "{0}" bcrypt.lib psapi.lib' -f $object,$assembly,$exe,$source)
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "External hardware harness build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware harness failed: $LASTEXITCODE" }
& $exe --timeout
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware timeout harness failed: $LASTEXITCODE" }
& $exe --preexisting
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware preexisting-register harness failed: $LASTEXITCODE" }
& $exe --retry
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware restoration-retry harness failed: $LASTEXITCODE" }
& $exe --exit-drain
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware exit-during-drain harness failed: $LASTEXITCODE" }
& $exe --late-break
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware late DebugBreak harness failed: $LASTEXITCODE" }
& $exe --pending-context-retry
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware pending-context retry harness failed: $LASTEXITCODE" }
& $exe --active-context-fail
if ($LASTEXITCODE -ne 0) { throw "Owned external hardware active-context failure harness failed: $LASTEXITCODE" }
