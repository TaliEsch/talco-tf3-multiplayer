[CmdletBinding()]
param([string]$GameDirectory = 'E:\Steam\steamapps\common\Transport Fever 3')

$ErrorActionPreference = 'Stop'
$game = (Resolve-Path -LiteralPath $GameDirectory).Path
if (Get-Process TransportFever3 -ErrorAction SilentlyContinue) { throw 'Close TF3 before removing diagnostic files.' }
$manifestPath = Join-Path $game 'TalCo-TF3MP-native-diagnostic.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Diagnostic manifest is absent.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$names = @('winhttp.dll', 'TF3InProcessRuntime.dll')
if ($manifest.schemaVersion -ne 1 -or $manifest.mode -notin @('no-hook-diagnostic-40401', 'passive-diagnostic-40401', 'boundary-diagnostic-40401') -or
    $manifest.qualifiedExeSha256 -ne '6abdedd8fbbd3117fe909d8747bd2690a76b9098a251aabb1ae9ba6b4f9659ca' -or
    $manifest.files.Count -ne 2 -or
    (Compare-Object ($names | Sort-Object) @($manifest.files | ForEach-Object { $_.name } | Sort-Object))) {
  throw 'Diagnostic manifest is not recognized.'
}
foreach ($record in $manifest.files) {
  if ($record.name -notin $names -or $record.sha256 -notmatch '^[a-f0-9]{64}$') {
    throw 'Diagnostic manifest contains an unsafe entry.'
  }
  $path = Join-Path $game $record.name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or
      (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256) {
    throw "Refusing to remove changed or missing file: $($record.name)"
  }
}
foreach ($name in $names) { Remove-Item -LiteralPath (Join-Path $game $name) -Force }
$sessionPath = Join-Path $game 'TalCo-TF3MP-native-session.bin'
if (Test-Path -LiteralPath $sessionPath -PathType Leaf) { Remove-Item -LiteralPath $sessionPath -Force }
Remove-Item -LiteralPath $manifestPath -Force
Write-Host 'Removed only the two hash-matched diagnostic DLLs, any one-use session handoff, and their manifest.'
