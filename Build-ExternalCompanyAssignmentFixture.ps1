[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\external_company_assignment_fixture.cpp'
$assembly = Join-Path $PSScriptRoot 'native\external_hardware_load_fixture.asm'
$output = Join-Path $PSScriptRoot 'dist\external-company-assignment-fixture'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$object = Join-Path $output 'external_hardware_load_fixture.obj'
$exe = Join-Path $output 'ExternalCompanyAssignmentFixture.exe'
$command = ('ml64.exe /nologo /c /Fo"{0}" "{1}" && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /Fe"{2}" "{3}" "{0}" bcrypt.lib psapi.lib' -f $object,$assembly,$exe,$source)
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned assignment fixture build failed: $LASTEXITCODE" }
foreach ($case in @('normal','write-fail','short-write','unknown-write','readback-mismatch','journal-pre','journal-post')) {
    $lines = & $exe $case 2>&1
    $result = $LASTEXITCODE
    $lines | ForEach-Object { Write-Output $_ }
    if ($result -ne 0) { throw "Owned assignment fixture failed for $case : $result" }
    $pidLine = @($lines | Where-Object { $_ -match '^owned_child_pid=([0-9]+)$' })
    if ($pidLine.Count -ne 1) { throw "Owned assignment fixture omitted unique child PID for $case" }
    $childPid = [int]($pidLine[0] -replace '^owned_child_pid=', '')
    if (Get-Process -Id $childPid -ErrorAction SilentlyContinue) {
        throw "Owned assignment child $childPid survived debugger exit for $case"
    }
}
