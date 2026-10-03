[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw "Visual Studio locator missing: $locator" }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\loan-lifecycle-observation-owned'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$source = Join-Path $PSScriptRoot 'native\loan_lifecycle_observation_owned.cpp'
$exe = Join-Path $output 'LoanLifecycleObservationOwned.exe'
$obj = Join-Path $output 'LoanLifecycleObservationOwned.obj'
$pdb = Join-Path $output 'LoanLifecycleObservationOwned.pdb'
$command = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /MD /guard:cf /O2 /Fo"{0}" /Fe"{1}" /Fd"{2}" "{3}" /link /guard:cf /PDB:"{2}" /INCREMENTAL:NO' -f $obj,$exe,$pdb,$source
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned lifecycle decoder build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned lifecycle decoder fixture failed: $LASTEXITCODE" }
