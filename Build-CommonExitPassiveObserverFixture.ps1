[CmdletBinding()] param()
$ErrorActionPreference='Stop'
$vswhere='C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$install=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$install){throw 'x64 MSVC build tools missing.'}
$out=Join-Path $PSScriptRoot 'dist\common-exit-passive-observer'
New-Item -Force -ItemType Directory $out|Out-Null
$n=Join-Path $PSScriptRoot 'native'
foreach($name in @('common_exit_passive_observer.h','common_exit_passive_observer.cpp','common_exit_passive_observer_fixture.cpp')){
  if(!(Test-Path -LiteralPath (Join-Path $n $name))){throw "Missing passive observer fixture source: $name"}
}
$cmd=('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /c /Fo"{0}\observer.obj" "{1}\common_exit_passive_observer.cpp" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /c /Fo"{0}\fixture.obj" "{1}\common_exit_passive_observer_fixture.cpp" && link.exe /nologo /OUT:"{0}\TF3CommonExitPassiveObserverFixture.exe" "{0}\observer.obj" "{0}\fixture.obj" /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f $out,$n)
& cmd.exe /d /s /c ('call "{0}\VC\Auxiliary\Build\vcvars64.bat" && {1}' -f $install,$cmd)
if($LASTEXITCODE){throw 'Common-exit passive observer fixture build failed.'}
