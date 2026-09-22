[CmdletBinding()]
param([string]$GameDirectory = 'E:\Steam\steamapps\common\Transport Fever 3')

$ErrorActionPreference = 'Stop'
$game = (Resolve-Path -LiteralPath $GameDirectory).Path
if (Get-Process TransportFever3 -ErrorAction SilentlyContinue) { throw 'Close TF3 before removing the native loader.' }
$manifestPath = Join-Path $game 'TalCo-TF3MP-native-loader.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'TalCo native-loader manifest is absent; nothing was removed.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.files.Count -ne 3) { throw 'Native-loader manifest is not recognized.' }
$expectedNames = @('winhttp.dll','TF3InProcessRuntime.dll','TF3NativeProbe.dll')
$manifestNames = @($manifest.files | ForEach-Object { $_.name } | Sort-Object -Unique)
if ($manifestNames.Count -ne $expectedNames.Count -or (Compare-Object ($expectedNames | Sort-Object) $manifestNames)) {
  throw 'Native-loader manifest does not name the exact owned file set.'
}
foreach ($record in $manifest.files) {
  if ($record.name -notin $expectedNames -or $record.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Native-loader manifest contains an unsafe entry.' }
  $path = Join-Path $game $record.name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Staged file is missing: $($record.name)" }
  if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256) { throw "Refusing to remove changed file: $($record.name)" }
}
foreach ($name in $expectedNames) { Remove-Item -LiteralPath (Join-Path $game $name) -Force }
$sessionPath = Join-Path $game 'TalCo-TF3MP-native-session.bin'
if (Test-Path -LiteralPath $sessionPath -PathType Leaf) { Remove-Item -LiteralPath $sessionPath -Force }
Remove-Item -LiteralPath $manifestPath -Force
Write-Host 'Removed only the three hash-matched TalCo loader files, any one-time session handoff, and their manifest; repository build outputs remain recoverable.'
