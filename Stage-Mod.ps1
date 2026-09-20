[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'mod'
$localRoot = 'E:\Steam\userdata\109855567\3493540\local'
$stageRoot = Join-Path $localRoot 'staging_area'
$destination = Join-Path $stageRoot 'tf3mp_status_1'
if (Get-Process TransportFever3 -ErrorAction SilentlyContinue) { throw 'Close TF3 before updating the staged mod.' }
foreach ($folder in @($source, $stageRoot)) {
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw "Missing directory: $folder" }
}
foreach ($folder in @($source, $destination, $stageRoot)) {
    if (Test-Path -LiteralPath $folder) {
        $item = Get-Item -LiteralPath $folder
        while ($null -ne $item) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked parent path is not allowed.' }
            $item = $item.Parent
        }
        if ($folder -ne $stageRoot) {
            $links = @(Get-ChildItem -LiteralPath $folder -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
            if ($links.Count) { throw 'Linked mod content is not allowed.' }
        }
    }
}
& node (Join-Path $PSScriptRoot 'src\cli.mjs') review --path $source
if ($LASTEXITCODE -ne 0) { throw 'Source validation failed.' }
$suffix = [Guid]::NewGuid().ToString('N')
$pending = Join-Path $stageRoot ('tf3mp_pending_' + $suffix)
$backup = Join-Path $localRoot ('tf3mp_backup_' + $suffix)
Copy-Item -LiteralPath $source -Destination $pending -Recurse
function Assert-CopyMatches([string]$copy) {
    $files = @(Get-ChildItem -LiteralPath $source -Recurse -File)
    if (@(Get-ChildItem -LiteralPath $copy -Recurse -File).Count -ne $files.Count) { throw 'File count mismatch.' }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($source.Length + 1)
        if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $copy $relative)).Hash) { throw "Hash mismatch: $relative" }
    }
}
Assert-CopyMatches $pending
if (Test-Path -LiteralPath $destination) { Move-Item -LiteralPath $destination -Destination $backup }
try { Move-Item -LiteralPath $pending -Destination $destination }
catch {
    if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $destination)) { Move-Item -LiteralPath $backup -Destination $destination }
    throw
}
Assert-CopyMatches $destination
Write-Output "Staged source matches: $destination"
if (Test-Path -LiteralPath $backup) { Write-Output "Previous mod and cooked cache preserved: $backup" }
