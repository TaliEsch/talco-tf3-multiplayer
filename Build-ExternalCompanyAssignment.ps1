[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw 'MSVC locator missing.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\external_company_assignment.cpp'
$gate = Join-Path $PSScriptRoot 'native\company_load_gate.cpp'
$output = Join-Path $PSScriptRoot 'dist\external-company-assignment'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$exe = Join-Path $output 'ExternalCompanyAssignment.exe'
$object = Join-Path $output 'external_company_assignment.obj'
$gateObject = Join-Path $output 'company_load_gate.obj'
$command = ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /Fo"{0}" "{1}"' -f $object,$source) +
  (' && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /Fo"{0}" "{1}"' -f $gateObject,$gate) +
  (' && link.exe /nologo /OUT:"{0}" "{1}" "{2}" bcrypt.lib psapi.lib advapi32.lib' -f $exe,$object,$gateObject)
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "External company assignment build failed: $LASTEXITCODE" }
Write-Host "Built $exe"
