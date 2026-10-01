[CmdletBinding()] param()
$ErrorActionPreference='Stop'
$vswhere='C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$install=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$install){throw 'x64 MSVC build tools missing.'}
$out=Join-Path $PSScriptRoot 'dist\common-exit-boundary';New-Item -Force -ItemType Directory $out|Out-Null
$source=Join-Path $PSScriptRoot 'native\common_exit_boundary_fixture.cpp'
$assembly=Join-Path $PSScriptRoot 'native\common_exit_boundary_fixture.asm'
$metadata=Join-Path $PSScriptRoot 'tools\build-owned-cross-ehcont-object.mjs'
if(!(Test-Path -LiteralPath $source)-or !(Test-Path -LiteralPath $assembly)){
  throw 'Common exit boundary fixture sources are missing.'
}
$cmd=('ml64.exe /nologo /W3 /WX /c /Fo"{0}\fixture_asm.obj" "{1}" && node "{2}" "{0}\fixture_asm.obj" "{0}\fixture_asm_eh.obj" CommonExitFixtureResume && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /MD /Gy /guard:cf /guard:ehcont /c /Fo"{0}\fixture.obj" "{3}" && link.exe /nologo /OUT:"{0}\TF3CommonExitBoundaryFixture.exe" "{0}\fixture.obj" "{0}\fixture_asm_eh.obj" /DYNAMICBASE /NXCOMPAT /GUARD:CF /GUARD:EHCONT /CETCOMPAT' -f $out,$assembly,$metadata,$source)
& cmd.exe /d /s /c ('call "{0}\VC\Auxiliary\Build\vcvars64.bat" && {1}' -f $install,$cmd)
if($LASTEXITCODE){throw 'Common exit boundary fixture build failed.'}
