[CmdletBinding()]
param(
    [switch]$RunSmokeTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw "Visual Studio Build Tools locator was not found at $vswhere" }
$installationPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installationPath)) { throw 'No Visual Studio installation with x64 C++ tools was found.' }
$vcvars = Join-Path $installationPath 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path -LiteralPath $vcvars)) { throw "x64 MSVC environment script not found: $vcvars" }

$native = Join-Path $repoRoot 'native'
$output = Join-Path $repoRoot 'dist\native-loader'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$proxy = Join-Path $output 'winhttp.dll'
$hostPath = Join-Path $output 'TF3WinHttpProxyHost.exe'
$sessionHelper = Join-Path $output 'TF3NativeSessionHandoff.exe'
$proxyCompile = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /LD /Fo"{0}" /Fd"{1}" /I "{2}" "{3}" /link /OUT:"{4}" /DEF:"{5}" /IMPLIB:"{6}" /PDB:"{7}" wintrust.lib' -f (Join-Path $output 'winhttp_proxy.obj'),(Join-Path $output 'winhttp_proxy_compile.pdb'),$native,(Join-Path $native 'winhttp_proxy.cpp'),$proxy,(Join-Path $native 'winhttp_proxy.def'),(Join-Path $output 'winhttp_proxy.lib'),(Join-Path $output 'winhttp_proxy.pdb')
$hostCompile = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /Fo"{0}" /Fd"{1}" "{2}" /link /OUT:"{3}" /PDB:"{4}" psapi.lib' -f (Join-Path $output 'winhttp_proxy_host.obj'),(Join-Path $output 'winhttp_proxy_host_compile.pdb'),(Join-Path $native 'winhttp_proxy_host.cpp'),$hostPath,(Join-Path $output 'winhttp_proxy_host.pdb')
$sessionCompile = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /Fo"{0}" /Fd"{1}" /I "{2}" "{3}" /link /OUT:"{4}" /PDB:"{5}" advapi32.lib' -f (Join-Path $output 'native_session_handoff.obj'),(Join-Path $output 'native_session_handoff_compile.pdb'),$native,(Join-Path $native 'native_session_handoff.cpp'),$sessionHelper,(Join-Path $output 'native_session_handoff.pdb')
& cmd.exe /d /s /c ('call "{0}" && {1} && {2} && {3}' -f $vcvars,$proxyCompile,$hostCompile,$sessionCompile)
if ($LASTEXITCODE -ne 0) { throw "WinHTTP proxy build failed with exit code $LASTEXITCODE." }

$msvcRoot = Join-Path $installationPath 'VC\Tools\MSVC'
$dumpbin = @(Get-ChildItem -LiteralPath $msvcRoot -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'bin\Hostx64\x64\dumpbin.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)[0]
if ([string]::IsNullOrWhiteSpace($dumpbin)) { throw 'x64 dumpbin.exe was not found.' }
$exports = & $dumpbin /exports $proxy
if ($LASTEXITCODE -ne 0) { throw 'dumpbin export inspection failed.' }
$expected = @('WinHttpAddRequestHeaders','WinHttpCloseHandle','WinHttpConnect','WinHttpOpen','WinHttpOpenRequest','WinHttpQueryDataAvailable','WinHttpQueryHeaders','WinHttpReadData','WinHttpReceiveResponse','WinHttpSendRequest','WinHttpSetOption','WinHttpSetStatusCallback','WinHttpSetTimeouts','WinHttpWriteData')
$actual = @($exports | ForEach-Object { if ($_ -match '^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(.+)$') { $Matches[1].Trim() } } | Where-Object { $_ })
if ((Compare-Object -ReferenceObject $expected -DifferenceObject $actual)) { throw "Proxy export parity failed. Expected exactly the 14 audited TF3 WinHTTP names; got: $($actual -join ', ')" }

if ($RunSmokeTest) {
    $result = & $hostPath $proxy
    if ($LASTEXITCODE -ne 0) { throw "Owned-process proxy smoke test failed with exit code $LASTEXITCODE." }
    $result | Write-Output
}
Write-Host "Built $proxy"
Write-Host "Built $hostPath"
Write-Host "Built $sessionHelper"
