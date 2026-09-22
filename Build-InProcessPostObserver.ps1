[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$native = Join-Path $PSScriptRoot 'native'
$output = Join-Path $PSScriptRoot 'dist\native-post-observer'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$dll = Join-Path $output 'TF3OwnedPostObserver.dll'
$harness = Join-Path $output 'TF3OwnedPostObserverHost.exe'
$compile = @(
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /I "{0}" /Fo"{1}" "{2}"' -f $native,(Join-Path $output 'post_observer_production.obj'),(Join-Path $native 'inprocess_post_observer.cpp')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /DTF3_POST_OBSERVER_OWNED_TEST /DTF3_POST_OBSERVER_TEST_DLL /LD /I "{0}" /Fo"{1}\\" "{2}" "{3}" /link /OUT:"{4}" /IMPLIB:"{5}" bcrypt.lib psapi.lib' -f $native,$output,(Join-Path $native 'inprocess_post_observer.cpp'),(Join-Path $native 'inprocess_post_observer_host.cpp'),$dll,(Join-Path $output 'TF3OwnedPostObserver.lib')),
  ('ml64.exe /nologo /c /Fo"{0}" "{1}"' -f (Join-Path $output 'post_fixture.obj'),(Join-Path $native 'inprocess_post_observer_host.asm')),
  ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /I "{0}" /Fo"{1}" "{2}" "{3}" /link /OUT:"{4}"' -f $native,(Join-Path $output 'post_host.obj'),(Join-Path $native 'inprocess_post_observer_host.cpp'),(Join-Path $output 'post_fixture.obj'),$harness)
) -join ' && '
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Owned post-observer build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
  & $harness $dll
  if ($LASTEXITCODE -ne 0) { throw "Owned post-observer qualification failed: $LASTEXITCODE" }
  & $harness $dll --dynamic-code-block
  if ($LASTEXITCODE -ne 0) { throw "Owned post-observer mitigation test failed: $LASTEXITCODE" }
  & $harness $dll --foreign-patch
  if ($LASTEXITCODE -ne 0) { throw "Owned post-observer restoration test failed: $LASTEXITCODE" }
}
Write-Host "Built owned-process observer qualification: $harness"
