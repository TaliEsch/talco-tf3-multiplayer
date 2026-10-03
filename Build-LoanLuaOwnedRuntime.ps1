[CmdletBinding()]
param(
    [string]$UpstreamSourcePath
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($UpstreamSourcePath)) { $UpstreamSourcePath = Join-Path $PSScriptRoot '.run\loan-lua-owned\lua-5.2.4\src' }
$expectedArchiveHash = 'b9e2e4aad6789b3b63a056d442f7b39f0ecfca3ae0f1fc0ae4e9614401b69f4b'
$sourcePath = (Resolve-Path -LiteralPath $UpstreamSourcePath).Path
$distributionRoot = Split-Path -Parent (Split-Path -Parent $sourcePath)
$archivePath = Join-Path $distributionRoot 'lua-5.2.4.tar.gz'
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Expected the unchanged Lua 5.2.4 source archive beside the source tree: $archivePath"
}
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($archiveHash -ne $expectedArchiveHash) {
    throw "Lua 5.2.4 source archive hash mismatch. Expected $expectedArchiveHash; got $archiveHash."
}

$output = Join-Path $PSScriptRoot 'dist\loan-lua-registration-owned'
$verifiedRoot = Join-Path $output ('upstream-verified-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $verifiedRoot | Out-Null
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if ($null -eq $tar) { throw 'tar.exe is required to extract and verify the hash-checked Lua archive.' }
& $tar.Source -xzf $archivePath -C $verifiedRoot
if ($LASTEXITCODE -ne 0) { throw "Could not extract the hash-checked Lua source archive: $LASTEXITCODE" }

$verifiedSourcePath = Join-Path $verifiedRoot 'lua-5.2.4\src'
if (-not (Test-Path -LiteralPath $verifiedSourcePath -PathType Container)) {
    throw "Expected Lua src directory was not found in the extracted archive: $verifiedSourcePath"
}
$sourceExtensions = @('.c', '.h')
$suppliedFiles = @(Get-ChildItem -LiteralPath $sourcePath -File | Where-Object { $sourceExtensions -contains $_.Extension.ToLowerInvariant() } | Sort-Object Name)
$verifiedFiles = @(Get-ChildItem -LiteralPath $verifiedSourcePath -File | Where-Object { $sourceExtensions -contains $_.Extension.ToLowerInvariant() } | Sort-Object Name)
$suppliedNames = @($suppliedFiles | ForEach-Object Name)
$verifiedNames = @($verifiedFiles | ForEach-Object Name)
$missingFromSupplied = @($verifiedNames | Where-Object { $_ -notin $suppliedNames })
$extraInSupplied = @($suppliedNames | Where-Object { $_ -notin $verifiedNames })
if ($missingFromSupplied.Count -gt 0 -or $extraInSupplied.Count -gt 0) {
    throw "Lua source file set mismatch. Missing from supplied tree: [$($missingFromSupplied -join ', ')]; extra in supplied tree: [$($extraInSupplied -join ', ')]"
}
foreach ($file in $verifiedFiles) {
    $suppliedPath = Join-Path $sourcePath $file.Name
    $verifiedHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    $suppliedHash = (Get-FileHash -LiteralPath $suppliedPath -Algorithm SHA256).Hash
    if ($verifiedHash -ne $suppliedHash) {
        throw "Lua source file differs from the hash-verified archive: $($file.Name)"
    }
}

$requiredFiles = @(
    'lapi.c', 'lauxlib.c', 'lbaselib.c', 'lbitlib.c', 'lcode.c', 'lcorolib.c',
    'lctype.c', 'ldblib.c', 'ldebug.c', 'ldo.c', 'ldump.c', 'lfunc.c', 'lgc.c',
    'linit.c', 'liolib.c', 'llex.c', 'lmathlib.c', 'lmem.c', 'loadlib.c',
    'lobject.c', 'lopcodes.c', 'loslib.c', 'lparser.c', 'lstate.c', 'lstring.c',
    'lstrlib.c', 'ltable.c', 'ltablib.c', 'ltm.c', 'lundump.c', 'lvm.c', 'lzio.c'
)
$sources = foreach ($file in $requiredFiles) {
    $path = Join-Path $sourcePath $file
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required Lua source file is missing: $path"
    }
    '"{0}"' -f $path
}

$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator -PathType Leaf)) { throw "Visual Studio locator missing: $locator" }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ([string]::IsNullOrWhiteSpace($installation)) { throw 'MSVC x64 tools missing.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path -LiteralPath $vcvars -PathType Leaf)) { throw "MSVC x64 environment script missing: $vcvars" }

New-Item -ItemType Directory -Force -Path $output | Out-Null
$dll = Join-Path $output 'OwnedLua52.dll'
$importLibrary = Join-Path $output 'OwnedLua52.lib'
$objectDirectory = Join-Path $output 'obj'
New-Item -ItemType Directory -Force -Path $objectDirectory | Out-Null
$sourceArguments = $sources -join ' '
$command = 'cl.exe /nologo /LD /TP /EHsc /MD /W0 /O2 /DLUA_BUILD_AS_DLL /I"{0}" /Fo"{1}\\" {2} /link /OUT:"{3}" /IMPLIB:"{4}"' -f $sourcePath,$objectDirectory,$sourceArguments,$dll,$importLibrary
& cmd.exe /d /s /c ('call "{0}" && {1}' -f $vcvars,$command)
if ($LASTEXITCODE -ne 0) { throw "Owned Lua 5.2.4 DLL build failed: $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $dll -PathType Leaf) -or -not (Test-Path -LiteralPath $importLibrary -PathType Leaf)) {
    throw 'MSVC reported success but did not produce both the owned Lua DLL and import library.'
}
Write-Output "Owned Lua 5.2.4 DLL: $dll"
Write-Output "Owned Lua 5.2.4 import library: $importLibrary"
