[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$gameExe = 'E:\Steam\steamapps\common\Transport Fever 3\TransportFever3.exe'
$stagingRoot = 'E:\Steam\userdata\109855567\3493540\local\staging_area'
$stagedMod = Join-Path $stagingRoot 'tf3mp_status_1'

function Invoke-Node {
    param([Parameter(Mandatory)][string[]]$Arguments)
    & node @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Node command failed with exit code $LASTEXITCODE."
    }
}

function Use-SessionSecret {
    param([Parameter(Mandatory)][scriptblock]$Action)
    $secure = Read-Host 'Session secret (minimum 32 characters)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $env:TF3MP_SESSION_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        if ([Text.Encoding]::UTF8.GetByteCount($env:TF3MP_SESSION_SECRET) -lt 32) {
            throw 'Session secret must contain at least 32 UTF-8 bytes.'
        }
        & $Action
    }
    finally {
        Remove-Item Env:TF3MP_SESSION_SECRET -ErrorAction SilentlyContinue
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Invoke-Review {
    Write-Host "`nRunning source, protocol, package, and compatibility checks..." -ForegroundColor Cyan
    & npm run check
    if ($LASTEXITCODE -ne 0) { throw 'Automated tests failed.' }
    Invoke-Node @('src/cli.mjs', 'review', '--path', 'mod')
    Invoke-Node @('src/cli.mjs', 'hash-game', '--exe', $gameExe)
    Invoke-Node @('src/cli.mjs', 'hash-mod', '--path', 'mod')
}

function Test-StagedModMatchesSource {
    $sourceRoot = Join-Path $projectRoot 'mod'
    $sourceFiles = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse)
    $stagedFiles = @(Get-ChildItem -LiteralPath $stagedMod -File -Recurse | Where-Object {
        $relative = $_.FullName.Substring($stagedMod.Length).TrimStart('\')
        $relative -notmatch '^\.cooked_(pc|console)\\'
    })

    if ($sourceFiles.Count -ne $stagedFiles.Count) { return $false }

    $stagedHashes = @{}
    foreach ($file in $stagedFiles) {
        $relative = $file.FullName.Substring($stagedMod.Length).TrimStart('\')
        $stagedHashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    foreach ($file in $sourceFiles) {
        $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\')
        if (-not $stagedHashes.ContainsKey($relative)) { return $false }
        $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        if ($sourceHash -ne $stagedHashes[$relative]) { return $false }
    }
    return $true
}

function Install-ReviewMod {
    Invoke-Review
    if (-not (Test-Path -LiteralPath $stagingRoot -PathType Container)) {
        throw "TF3 staging area was not found: $stagingRoot"
    }
    if (Test-Path -LiteralPath $stagedMod) {
        if (Test-StagedModMatchesSource) {
            Write-Host "Review mod is already staged and exactly matches the source: $stagedMod" -ForegroundColor Green
            Write-Host 'TF3-generated .cooked_pc/.cooked_console validator output was ignored during comparison.'
            return
        }
        throw "Review mod already exists at $stagedMod but differs from the source. It was not overwritten; compare or remove it manually first."
    }
    Write-Host "This will copy only the source mod into TF3's per-user staging area:" -ForegroundColor Yellow
    Write-Host $stagedMod -ForegroundColor Yellow
    Write-Host 'It will not modify the game installation, install a bridge, or enable the mod.' -ForegroundColor Yellow
    $confirmation = Read-Host 'After reviewing the applicable TF3/Steam mod terms, type STAGE to continue'
    if ($confirmation -cne 'STAGE') {
        Write-Host 'Staging cancelled; no files were copied.'
        return
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'mod') -Destination $stagedMod -Recurse
    Write-Host "Source mod staged at $stagedMod" -ForegroundColor Green
    Write-Host 'Start TF3, open the mod manager, and enable "TalCo Transport Fever 3 MP mod" only for a disposable review save.'
}

function Start-HostHelper {
    $modHash = Read-Host 'Mod manifest SHA-256 (run option 1 to obtain it)'
    $bind = Read-Host 'Bind address [127.0.0.1]'
    if ([string]::IsNullOrWhiteSpace($bind)) { $bind = '127.0.0.1' }
    Use-SessionSecret {
        Write-Host 'Starting transport-only host. This is not connected to TF3 gameplay yet.' -ForegroundColor Yellow
        Invoke-Node @('src/cli.mjs', 'host', '--mod-hash', $modHash, '--bind', $bind)
    }
}

function Start-ClientHelper {
    $hostAddress = Read-Host 'Host address [127.0.0.1]'
    if ([string]::IsNullOrWhiteSpace($hostAddress)) { $hostAddress = '127.0.0.1' }
    $sessionId = Read-Host 'Session ID printed by the host'
    $displayName = Read-Host 'Player display name'
    $modHash = Read-Host 'Mod manifest SHA-256'
    $testMessage = Read-Host 'Optional test message [hello]'
    if ([string]::IsNullOrWhiteSpace($testMessage)) { $testMessage = 'hello' }
    Use-SessionSecret {
        Write-Host 'Starting transport-only client. This is not connected to TF3 gameplay yet.' -ForegroundColor Yellow
        Invoke-Node @('src/cli.mjs', 'join', '--host', $hostAddress, '--session', $sessionId, '--name', $displayName, '--mod-hash', $modHash, '--test-message', $testMessage)
    }
}

Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 24 or newer is required and was not found on PATH.'
}

while ($true) {
    Write-Host "`nTF3 Multiplayer Prototype - Manual Review Launcher" -ForegroundColor Green
    Write-Host '1. Validate review package and TF3 build'
    Write-Host '2. Stage source mod for controlled review (or verify an exact existing copy)'
    Write-Host '3. Start authenticated host helper (transport only)'
    Write-Host '4. Join authenticated host helper (transport only)'
    Write-Host '5. Start TF3 untouched (no injection)'
    Write-Host '6. Generate a session secret'
    Write-Host 'Q. Quit'
    $choice = (Read-Host 'Choose').Trim().ToUpperInvariant()
    switch ($choice) {
        '1' { Invoke-Review }
        '2' { Install-ReviewMod }
        '3' { Start-HostHelper }
        '4' { Start-ClientHelper }
        '5' {
            if (-not (Test-Path -LiteralPath $gameExe -PathType Leaf)) { throw "TF3 executable not found: $gameExe" }
            Write-Host 'Starting the unmodified game. Enable/copy the source mod only through the documented manual-review procedure.' -ForegroundColor Yellow
            Start-Process -FilePath $gameExe
        }
        '6' { Invoke-Node @('src/cli.mjs', 'generate-secret') }
        'Q' { return }
        default { Write-Host 'Unknown selection.' -ForegroundColor Red }
    }
}
