[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw 'MSVC locator missing.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$output = Join-Path $PSScriptRoot 'dist\loan-registration-patch-owned'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$cpp = Join-Path $PSScriptRoot 'native\loan_registration_patch_owned.cpp'
$asm = Join-Path $PSScriptRoot 'native\loan_registration_patch_owned.asm'
$cppObject = Join-Path $output 'loan_registration_patch_owned.obj'
$asmObject = Join-Path $output 'loan_registration_patch_owned_asm.obj'
$exe = Join-Path $output 'LoanRegistrationPatchOwned.exe'
$command = 'ml64.exe /nologo /c /Fo"{0}" "{1}" && cl.exe /nologo /std:c++17 /W4 /WX /EHs /O2 /guard:cf /Fo"{2}" /Fe"{3}" "{4}" "{0}" bcrypt.lib psapi.lib /link /guard:cf' -f $asmObject,$asm,$cppObject,$exe,$cpp
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned registration patch build failed: $LASTEXITCODE" }
& $exe
if ($LASTEXITCODE -ne 0) { throw "Owned registration patch qualification failed: $LASTEXITCODE" }
$runtime = Join-Path $PSScriptRoot 'dist\loan-consumer-runtime\TF3InProcessRuntime.dll'
if (-not (Test-Path -LiteralPath $runtime -PathType Leaf)) { throw 'Pinned guarded runtime missing.' }
$runtimeHash = (Get-FileHash -LiteralPath $runtime -Algorithm SHA256).Hash
if ($runtimeHash -ne '986651806CF8EF1ADF3AFF7EDDF25A40A3E3B473B02EC37F32F174D8E940EA0A') {
    throw 'Pinned guarded runtime SHA256 mismatch.'
}
$offObject = Join-Path $output 'loan_registration_patch_owned_cfgoff.obj'
$offExe = Join-Path $output 'LoanRegistrationPatchOwnedCfgOff.exe'
$offCommand = 'cl.exe /nologo /std:c++17 /W4 /WX /EHs /O2 /DLOAN_OWNED_CFG_OFF /Fo"{0}" /Fe"{1}" "{2}" "{3}" bcrypt.lib psapi.lib' -f $offObject,$offExe,$cpp,$asmObject
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$offCommand)
if ($LASTEXITCODE -ne 0) { throw "Owned CFG-off host build failed: $LASTEXITCODE" }
& $offExe
if ($LASTEXITCODE -ne 0) { throw "Owned CFG-off guarded runtime qualification failed: $LASTEXITCODE" }
