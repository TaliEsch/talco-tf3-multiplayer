[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
# This builds an owned negative ABI assessment. It DOES NOT build a hold gate.
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\native-continuation-assessment'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$harness = Join-Path $output 'TF3OwnedContinuationAssessment.exe'
$compile = @(
  ('ml64.exe /nologo /W3 /WX /c /Fo"{0}" "{1}"' -f (Join-Path $output 'frame_probe.obj'),(Join-Path $native 'inprocess_continuation_gate_probe.asm')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /guard:cf /Fo"{0}" "{1}" "{2}" /link /OUT:"{3}" /DYNAMICBASE /NXCOMPAT /GUARD:CF /CETCOMPAT' -f (Join-Path $output 'assessment.obj'),(Join-Path $native 'inprocess_continuation_gate_probe.cpp'),(Join-Path $output 'frame_probe.obj'),$harness)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned negative ABI assessment build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  $result = & $harness
  if ($LASTEXITCODE -ne 0) { throw "Owned negative ABI assessment failed: $LASTEXITCODE" }
  $report = $result | ConvertFrom-Json
  if (-not $report.assessmentPassed -or $report.qualified -or $report.activationPermitted -or $report.holdImplemented) {
    throw 'Negative assessment must demonstrate rejection and must not claim a qualified hold gate.'
  }
  $result | Write-Output
}
Write-Host "Built owned negative ABI assessment (continuation gate remains unqualified): $harness"
