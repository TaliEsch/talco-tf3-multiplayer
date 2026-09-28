[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw 'MSVC locator missing.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
$source = Join-Path $PSScriptRoot 'native\external_company_abort_fixture.cpp'
$binder = Join-Path $PSScriptRoot 'native\external_company_assignment.cpp'
$gate = Join-Path $PSScriptRoot 'native\company_load_gate.cpp'
$binderText = Get-Content -LiteralPath $binder -Raw
$catchShape = '(?s)\}\s*catch\s*\(\.\.\.\)\s*\{\s*if\s*\(writeAttempted\)\s*\{(?:(?!\}\s*else\s+if).)*?StopUnknownWrite\s*\(process\.h\)(?:(?!\}\s*else\s+if).)*?\}\s*else\s+if\s*\(session\.attached\)'
if ($binderText -notmatch $catchShape) {
    throw 'Production binder catch no longer calls StopUnknownWrite before the prewrite attached branch.'
}
$output = Join-Path $PSScriptRoot 'dist\external-company-abort-fixture'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$fixtureObject = Join-Path $output 'external_company_abort_fixture.obj'
$gateObject = Join-Path $output 'company_load_gate.obj'
$exe = Join-Path $output 'ExternalCompanyAbortFixture.exe'
$command = ('cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /Fo"{0}" "{1}"' -f $fixtureObject,$source) +
  (' && cl.exe /nologo /std:c++17 /W4 /WX /EHsc /O2 /c /Fo"{0}" "{1}"' -f $gateObject,$gate) +
  (' && link.exe /nologo /SUBSYSTEM:CONSOLE /ENTRY:mainCRTStartup /OUT:"{0}" "{1}" "{2}" bcrypt.lib psapi.lib advapi32.lib' -f $exe,$fixtureObject,$gateObject)
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned abort fixture build failed: $LASTEXITCODE" }
$lines = & $exe 2>&1
$result = $LASTEXITCODE
$lines | ForEach-Object { Write-Output $_ }
if ($result -ne 0) { throw "Owned abort fixture failed: $result" }
foreach ($marker in @('owned_abort_detached_pass:', 'owned_abort_exited_pass:')) {
    if (@($lines | Where-Object { $_ -like "$marker*" }).Count -ne 1) {
        throw "Owned abort fixture omitted unique $marker result"
    }
}
$pidLines = @($lines | Where-Object { $_ -match '^owned_abort_child_pid=([0-9]+)$' })
if ($pidLines.Count -ne 2) { throw 'Owned abort fixture omitted two child PIDs' }
foreach ($pidLine in $pidLines) {
    $childPid = [int]($pidLine -replace '^owned_abort_child_pid=', '')
    if (Get-Process -Id $childPid -ErrorAction SilentlyContinue) {
        throw "Owned abort fixture child $childPid survived"
    }
}
