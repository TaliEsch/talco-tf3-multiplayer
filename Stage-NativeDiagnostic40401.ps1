[CmdletBinding()]
param([string]$GameDirectory = 'E:\Steam\steamapps\common\Transport Fever 3')

$ErrorActionPreference = 'Stop'
$expectedExe = '6abdedd8fbbd3117fe909d8747bd2690a76b9098a251aabb1ae9ba6b4f9659ca'
$game = (Resolve-Path -LiteralPath $GameDirectory).Path
$exe = Join-Path $game 'TransportFever3.exe'
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedExe) {
  throw 'Refusing to stage against an unqualified TransportFever3.exe.'
}
if (Get-Process TransportFever3 -ErrorAction SilentlyContinue) { throw 'Close TF3 before diagnostic staging.' }
$sourceDirectory = Join-Path $PSScriptRoot 'dist\native-loader'
$names = @('winhttp.dll', 'TF3InProcessRuntime.dll')
$manifestPath = Join-Path $game 'TalCo-TF3MP-native-diagnostic.json'
foreach ($name in $names + @('TF3NativeProbe.dll', 'TalCo-TF3MP-native-loader.json',
    'TalCo-TF3MP-native-diagnostic.json', 'TalCo-TF3MP-native-session.bin')) {
  if (Test-Path -LiteralPath (Join-Path $game $name)) { throw "Refusing to overwrite existing game file: $name" }
}
foreach ($name in $names) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceDirectory $name) -PathType Leaf)) {
    throw "Build output missing: $name"
  }
}
$ownedFiles = @()
$manifestCreated = $false
try {
  $records = foreach ($name in $names) {
    $source = Join-Path $sourceDirectory $name
    $destination = Join-Path $game $name
    $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    [System.IO.File]::Copy($source, $destination, $false)
    $ownedFiles += [pscustomobject]@{Path=$destination;Sha256=$hash}
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) {
      throw "Staged hash mismatch: $name"
    }
    [ordered]@{name=$name;sha256=$hash}
  }
  $manifestJson = [ordered]@{schemaVersion=1;mode='no-hook-diagnostic-40401';
    qualifiedExeSha256=$expectedExe;files=$records} | ConvertTo-Json -Depth 4
  $stream = [System.IO.File]::Open($manifestPath, [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $manifestCreated = $true
  try {
    $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
    try { $writer.Write($manifestJson); $writer.Flush() }
    finally { $writer.Dispose() }
  } finally { $stream.Dispose() }
} catch {
  foreach ($owned in $ownedFiles) {
    if ((Test-Path -LiteralPath $owned.Path -PathType Leaf) -and
        (Get-FileHash -LiteralPath $owned.Path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $owned.Sha256) {
      Remove-Item -LiteralPath $owned.Path -Force -ErrorAction SilentlyContinue
    }
  }
  if ($manifestCreated) { Remove-Item -LiteralPath $manifestPath -Force -ErrorAction SilentlyContinue }
  throw
}
Write-Host "Staged two hash-recorded diagnostic DLLs for build 40401 in $game."
