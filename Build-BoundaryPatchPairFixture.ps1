[CmdletBinding()] param()
$ErrorActionPreference='Stop'
$vswhere='C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$install=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$install){throw 'x64 MSVC build tools missing.'}
$out=Join-Path $PSScriptRoot 'dist\boundary-patch-pair';New-Item -Force -ItemType Directory $out|Out-Null
$n=Join-Path $PSScriptRoot 'native'
$sources=@('boundary_patch_pair.h','boundary_patch_pair.cpp','boundary_patch_pair_fixture.cpp')
foreach($name in $sources){if(!(Test-Path -LiteralPath (Join-Path $n $name))){throw "Missing boundary patch-pair fixture source: $name"}}
$cmd=('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /DTF3_BOUNDARY_PAIR_OWNED_TEST /c /Fo"{0}\pair.obj" "{1}\boundary_patch_pair.cpp" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /DTF3_BOUNDARY_PAIR_OWNED_TEST /c /Fo"{0}\fixture.obj" "{1}\boundary_patch_pair_fixture.cpp" && link.exe /nologo /OUT:"{0}\TF3BoundaryPatchPairFixture.exe" "{0}\pair.obj" "{0}\fixture.obj" /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f $out,$n)
& cmd.exe /d /s /c ('call "{0}\VC\Auxiliary\Build\vcvars64.bat" && {1}' -f $install,$cmd)
if($LASTEXITCODE){throw 'Boundary patch-pair fixture build failed.'}
