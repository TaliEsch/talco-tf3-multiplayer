[CmdletBinding()]
param([switch]$RunSmokeTest)
$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools locator missing.' }
$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'x64 MSVC build tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\native-runtime'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$exe = Join-Path $output 'TF3RuntimeObserver.exe'
$source = Join-Path $PSScriptRoot 'native\runtime_observer.cpp'
$compile = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Zi /Fo"{0}" /Fd"{1}" "{2}" /link /OUT:"{3}" /PDB:"{4}" /IMPLIB:"{5}" /DYNAMICBASE /NXCOMPAT bcrypt.lib' -f (Join-Path $output 'runtime_observer.obj'), (Join-Path $output 'runtime_observer_compile.pdb'), $source, $exe, (Join-Path $output 'runtime_observer.pdb'), (Join-Path $output 'runtime_observer.lib')
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $compile)
if ($LASTEXITCODE -ne 0) { throw "Native runtime build failed: $LASTEXITCODE" }
$controller = Join-Path $output 'TF3RuntimeController.exe'
$controllerSource = Join-Path $PSScriptRoot 'native\runtime_controller.cpp'
$controllerCompile = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Zi /Fo"{0}" /Fd"{1}" "{2}" /link /OUT:"{3}" /PDB:"{4}" /IMPLIB:"{5}" /DYNAMICBASE /NXCOMPAT bcrypt.lib advapi32.lib' -f (Join-Path $output 'runtime_controller.obj'), (Join-Path $output 'runtime_controller_compile.pdb'), $controllerSource, $controller, (Join-Path $output 'runtime_controller.pdb'), (Join-Path $output 'runtime_controller.lib')
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars, $controllerCompile)
if ($LASTEXITCODE -ne 0) { throw "Native controller build failed: $LASTEXITCODE" }
if ($RunSmokeTest) {
    & $exe --self-test
    if ($LASTEXITCODE -ne 0) { throw "Owned-process observation test failed: $LASTEXITCODE" }
    & $exe --self-test-mismatch
    if ($LASTEXITCODE -ne 0) { throw "Mapped-byte mismatch test failed: $LASTEXITCODE" }
    & $exe --self-test-timeout
    if ($LASTEXITCODE -ne 0) { throw "Idle timeout teardown test failed: $LASTEXITCODE" }
    & $exe --self-test-attach
    if ($LASTEXITCODE -ne 0) { throw "Already-running owned-process attach test failed: $LASTEXITCODE" }
    & $exe --self-test-armed-failure
    if ($LASTEXITCODE -ne 0) { throw "Armed failure teardown test failed: $LASTEXITCODE" }
}
Write-Host "Built $exe"
Write-Host "Built $controller"
