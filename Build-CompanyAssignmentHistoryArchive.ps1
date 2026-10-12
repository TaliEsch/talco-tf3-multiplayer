[CmdletBinding()]
param([switch]$RunFixture)
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw 'MSVC locator missing.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\company_assignment_history_archive.cpp'
$output = Join-Path $PSScriptRoot 'dist\external-company-assignment'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$object = Join-Path $output 'company_assignment_history_archive.obj'
$exe = Join-Path $output 'CompanyAssignmentHistoryArchive.exe'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}" /Fe"{1}" "{2}" bcrypt.lib advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib' -f $object,$exe,$source
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Company history archive build failed: $LASTEXITCODE" }
Write-Host "Built $exe"
$fixtureSource = Join-Path $PSScriptRoot 'native\company_assignment_history_archive_fixture.cpp'
$fixtureObject = Join-Path $output 'company_assignment_history_archive_fixture.obj'
$fixtureExe = Join-Path $output 'CompanyAssignmentHistoryArchiveFixture.exe'
$fixtureCommand = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}" /Fe"{1}" "{2}" bcrypt.lib advapi32.lib wbemuuid.lib ole32.lib oleaut32.lib' -f $fixtureObject,$fixtureExe,$fixtureSource
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$fixtureCommand)
if ($LASTEXITCODE -ne 0) { throw "Company history archive fixture build failed: $LASTEXITCODE" }
if ($RunFixture) {
  & $fixtureExe
  if ($LASTEXITCODE -ne 0) { throw "Company history archive fixture failed: $LASTEXITCODE" }
}
