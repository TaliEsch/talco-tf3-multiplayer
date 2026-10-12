[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\company_assignment_history_fixture.cpp'
$output = Join-Path $PSScriptRoot 'dist\external-company-assignment'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$object = Join-Path $output 'company_assignment_history_fixture.obj'
$exe = Join-Path $output 'CompanyAssignmentHistoryFixture.exe'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}" /Fe"{1}" "{2}" advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib' -f $object,$exe,$source
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Company history fixture build failed: $LASTEXITCODE" }
$wmiSource = Join-Path $PSScriptRoot 'native\company_assignment_history_wmi_fixture.cpp'
$wmiObject = Join-Path $output 'company_assignment_history_wmi_fixture.obj'
$wmiExe = Join-Path $output 'CompanyAssignmentHistoryWmiFixture.exe'
$wmiCommand = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}" /Fe"{1}" "{2}" advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib' -f $wmiObject,$wmiExe,$wmiSource
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$wmiCommand)
if ($LASTEXITCODE -ne 0) { throw "Company history WMI fixture build failed: $LASTEXITCODE" }
& $wmiExe
if ($LASTEXITCODE -ne 0) { throw "Company history WMI fixture failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Company history fixture failed: $LASTEXITCODE" }
