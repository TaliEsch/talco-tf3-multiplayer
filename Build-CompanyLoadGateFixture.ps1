[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\company-load-gate-fixture'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$exe = Join-Path $output 'CompanyLoadGateFixture.exe'
$source = Join-Path $PSScriptRoot 'native\company_load_gate.cpp'
$fixture = Join-Path $PSScriptRoot 'native\company_load_gate_fixture.cpp'
$command = ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /DTF3_COMPANY_GATE_TESTING /Fe"{0}" "{1}" "{2}" advapi32.lib' -f $exe,$source,$fixture)
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Company load gate fixture build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Company load gate fixture failed: $LASTEXITCODE" }
