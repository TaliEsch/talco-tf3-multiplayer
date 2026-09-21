[CmdletBinding()]
param(
    [switch]$RunSmokeTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'

if (-not (Test-Path -LiteralPath $vswhere)) {
    throw "Visual Studio Build Tools locator was not found at $vswhere"
}

$installationPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installationPath)) {
    throw 'No Visual Studio installation with the x64 C++ build tools was found.'
}

$vcvars = Join-Path $installationPath 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path -LiteralPath $vcvars)) {
    throw "x64 MSVC environment script not found: $vcvars"
}

$nativeDirectory = Join-Path $repoRoot 'native'
$outputDirectory = Join-Path $repoRoot 'dist\native'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$dllPath = Join-Path $outputDirectory 'TF3NativeProbe.dll'
$hostPath = Join-Path $outputDirectory 'TF3NativeProbeHost.exe'
$compileDll = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /DTF3_NATIVE_PROBE_EXPORTS /LD /Fo"{0}" /Fd"{1}" /I "{2}" "{3}" /link /OUT:"{4}" /IMPLIB:"{5}" /PDB:"{6}" bcrypt.lib' -f (Join-Path $outputDirectory 'probe_dll.obj'), (Join-Path $outputDirectory 'probe_dll.pdb'), $nativeDirectory, (Join-Path $nativeDirectory 'probe_dll.cpp'), $dllPath, (Join-Path $outputDirectory 'TF3NativeProbe.lib'), (Join-Path $outputDirectory 'TF3NativeProbe.pdb')
$compileHost = 'cl.exe /nologo /std:c++17 /W4 /WX /EHsc /Fo"{0}" /Fd"{1}" /I "{2}" "{3}" /link /OUT:"{4}" /PDB:"{5}"' -f (Join-Path $outputDirectory 'probe_host.obj'), (Join-Path $outputDirectory 'probe_host.pdb'), $nativeDirectory, (Join-Path $nativeDirectory 'probe_host.cpp'), $hostPath, (Join-Path $outputDirectory 'TF3NativeProbeHost.pdb')

& cmd.exe /d /s /c ('call "{0}" && {1} && {2}' -f $vcvars, $compileDll, $compileHost)
if ($LASTEXITCODE -ne 0) {
    throw "Native probe build failed with exit code $LASTEXITCODE."
}

if ($RunSmokeTest) {
    # The host only alters and restores its own in-memory DOS signature to
    # verify the probe's fail-closed loaded-image path; it never opens TF3.
    $probeOutput = & $hostPath $dllPath '--exercise-memory-mismatch'
    if ($LASTEXITCODE -ne 0) {
        throw "Native probe smoke test failed with exit code $LASTEXITCODE."
    }
    $probeOutput | Write-Output
    $hashLine = @($probeOutput | Where-Object { $_ -match '^executable_sha256=[a-f0-9]{64}$' })
    $expectedDigest = (Get-FileHash -LiteralPath $hostPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hashLine.Count -ne 1 -or $hashLine[0] -ne "executable_sha256=$expectedDigest") {
        throw 'Native probe fingerprint disagrees with independent file hashing.'
    }
}

Write-Host "Built $dllPath"
Write-Host "Built $hostPath"
