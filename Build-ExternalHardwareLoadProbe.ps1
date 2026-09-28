[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw 'MSVC locator missing.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\external_hardware_load_probe.cpp'
$output = Join-Path $PSScriptRoot 'dist\external-hardware-load-probe'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$exe = Join-Path $output 'ExternalHardwareLoadProbe.exe'
$object = Join-Path $output 'external_hardware_load_probe.obj'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fo"{0}" /Fe"{1}" "{2}" bcrypt.lib psapi.lib' -f $object,$exe,$source
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "External hardware probe build failed: $LASTEXITCODE" }
Write-Host "Built $exe"
