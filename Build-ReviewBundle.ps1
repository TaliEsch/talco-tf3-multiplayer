[CmdletBinding()]
param(
    [string]$Version = '0.6.1',
    [switch]$SkipLauncherBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
$bundleName = "TF3MP-review-$Version"
$bundleRoot = Join-Path $distRoot $bundleName
$zipPath = Join-Path $distRoot "$bundleName.zip"

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw 'Version must use numeric major.minor.patch form.'
}
if (Test-Path -LiteralPath $bundleRoot) {
    throw "Bundle directory already exists and will not be overwritten: $bundleRoot"
}
if (Test-Path -LiteralPath $zipPath) {
    throw "Bundle archive already exists and will not be overwritten: $zipPath"
}

Set-Location -LiteralPath $projectRoot
& npm run check
if ($LASTEXITCODE -ne 0) { throw 'Automated checks failed.' }
& npm run review
if ($LASTEXITCODE -ne 0) { throw 'Source-mod review failed.' }
if ($SkipLauncherBuild) {
    $existingLauncher = Join-Path $projectRoot 'TF3MP-Launcher.exe'
    if (-not (Test-Path -LiteralPath $existingLauncher -PathType Leaf)) {
        throw 'SkipLauncherBuild requires an existing compiled launcher.'
    }
    Write-Host 'Using the existing compiled launcher because SkipLauncherBuild was requested.' -ForegroundColor Yellow
} else {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'Build-Launcher.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Launcher build failed.' }
}

$topLevelFiles = @(
    'Build-Launcher.ps1',
    'Build-ReviewBundle.ps1',
    'LICENSE',
    'NOTICE',
    'package.json',
    'README.md',
    'REVIEW_CHECKLIST.md',
    'SECURITY.md',
    'TF3MP-Launcher.cmd',
    'TF3MP-Launcher.exe',
    'TF3MP-Launcher.ps1',
    'THIRD_PARTY_NOTICES.md'
)
$directories = @('docs', 'launcher', 'mod', 'src', 'test')
$selected = @($topLevelFiles + $directories | ForEach-Object { Join-Path $projectRoot $_ })
foreach ($path in $selected) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required bundle input is missing: $path" }
}
$reparsePoints = @($selected | ForEach-Object {
    if (Test-Path -LiteralPath $_ -PathType Container) {
        Get-ChildItem -LiteralPath $_ -Recurse -Force
    } else {
        Get-Item -LiteralPath $_ -Force
    }
} | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 })
if ($reparsePoints.Count -gt 0) {
    throw "Bundle input contains a reparse point: $($reparsePoints[0].FullName)"
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
New-Item -ItemType Directory -Path $bundleRoot | Out-Null
foreach ($file in $topLevelFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $bundleRoot $file)
}
foreach ($directory in $directories) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $bundleRoot $directory) -Recurse
}

$launcherHash = (Get-FileHash -LiteralPath (Join-Path $bundleRoot 'TF3MP-Launcher.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
$modHashJson = & node (Join-Path $projectRoot 'src\cli.mjs') hash-mod --path (Join-Path $projectRoot 'mod')
if ($LASTEXITCODE -ne 0) { throw 'Unable to calculate the source-mod manifest hash.' }
$modHash = ($modHashJson | ConvertFrom-Json).hash
$bundleInfo = [ordered]@{
    bundleVersion = $Version
    launcherSha256 = $launcherHash
    modManifestSha256 = $modHash
    auditedGameExeSha256 = 'e9dd1e2bce6e4e9e52dbe3228b65d82657636700807680b36a580453a4757686'
    gameBuildValidation = 'static-api-audit'
    gameVersionPolicy = 'recommended-audit; exact host-client executable match required'
    gameplayVerified = $false
    protocolVersion = 2
    note = 'Launcher compiler output is timestamped; SHA256SUMS.txt is authoritative for this bundle.'
}
$utf8NoBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $bundleRoot 'BUNDLE_INFO.json'), ($bundleInfo | ConvertTo-Json) + "`n", $utf8NoBom)

$hashLines = Get-ChildItem -LiteralPath $bundleRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($bundleRoot.Length + 1).Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash *$relative"
} | Sort-Object
[IO.File]::WriteAllLines((Join-Path $bundleRoot 'SHA256SUMS.txt'), [string[]]$hashLines, $utf8NoBom)

Compress-Archive -Path (Join-Path $bundleRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $archiveFiles = @($zip.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName.Replace('\', '/') } | Sort-Object)
    $unsafe = @($archiveFiles | Where-Object { $_ -match '(^|/)\.\.(/|$)' -or [IO.Path]::IsPathRooted($_) })
    if ($unsafe.Count -gt 0) { throw "Unsafe archive path: $($unsafe[0])" }
    $expectedFiles = @(Get-ChildItem -LiteralPath $bundleRoot -Recurse -File | ForEach-Object {
        $_.FullName.Substring($bundleRoot.Length + 1).Replace('\', '/')
    } | Sort-Object)
    if (($archiveFiles -join "`n") -ne ($expectedFiles -join "`n")) {
        throw 'Archive file list differs from the staged review bundle.'
    }
} finally {
    $zip.Dispose()
}

$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Built review bundle: $zipPath" -ForegroundColor Green
Write-Host "Files: $($archiveFiles.Count)"
Write-Host "ZIP SHA-256: $zipHash"
