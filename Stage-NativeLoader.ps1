[CmdletBinding()]
param([string]$GameDirectory = 'E:\Steam\steamapps\common\Transport Fever 3')

$ErrorActionPreference = 'Stop'
$expectedExe = 'cbd8092757e539a42f56c51e00eeb7671d967a9072838d7a5f47d2de88348716'
$game = (Resolve-Path -LiteralPath $GameDirectory).Path
$exe = Join-Path $game 'TransportFever3.exe'
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedExe) {
  throw 'Refusing to stage against an unqualified TransportFever3.exe.'
}
if (Get-Process TransportFever3 -ErrorAction SilentlyContinue) { throw 'Close TF3 before staging the native loader.' }
$sourceDirectory = Join-Path $PSScriptRoot 'dist\native-loader'
$names = @('winhttp.dll','TF3InProcessRuntime.dll','TF3NativeProbe.dll')
$manifestPath = Join-Path $game 'TalCo-TF3MP-native-loader.json'
foreach ($name in $names + @('TalCo-TF3MP-native-loader.json','TalCo-TF3MP-native-session.bin')) {
  if (Test-Path -LiteralPath (Join-Path $game $name)) { throw "Refusing to overwrite existing game file: $name" }
}
foreach ($name in $names) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceDirectory $name) -PathType Leaf)) { throw "Build output missing: $name" }
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
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw "Staged hash mismatch: $name" }
    [ordered]@{name=$name;sha256=$hash}
  }
  $manifestJson = [ordered]@{schemaVersion=1;qualifiedExeSha256=$expectedExe;files=$records} | ConvertTo-Json -Depth 4
  $manifestStream = [System.IO.File]::Open($manifestPath, [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $manifestCreated = $true
  try {
    $manifestWriter = [System.IO.StreamWriter]::new($manifestStream, [System.Text.UTF8Encoding]::new($false))
    try { $manifestWriter.Write($manifestJson); $manifestWriter.Flush() }
    finally { $manifestWriter.Dispose() }
  } finally {
    if ($null -ne $manifestStream) { $manifestStream.Dispose() }
  }
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
Write-Host "Staged the reversible TalCo native loader in $game without replacing an existing file."
