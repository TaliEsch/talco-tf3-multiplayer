[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$package = Join-Path $PSScriptRoot 'dist\TF3MP-Laptop-Test-0.2.0'
$zip = Join-Path $PSScriptRoot 'dist\TF3MP-Laptop-Test-0.2.0.zip'
if ((Test-Path -LiteralPath $package) -or (Test-Path -LiteralPath $zip)) { throw 'Laptop package already exists; not overwriting.' }
$nodeSource = (Get-Command node.exe -ErrorAction Stop).Source
$nodeLicense = Join-Path (Split-Path $nodeSource) 'LICENSE'
if (-not (Test-Path -LiteralPath $nodeLicense)) { throw 'Node redistribution license not found.' }
New-Item -ItemType Directory -Path $package | Out-Null
foreach ($folder in @('src', 'tools', 'runtime')) { New-Item -ItemType Directory -Path (Join-Path $package $folder) | Out-Null }
foreach ($name in @('laptop-test.mjs', 'protocol.mjs', 'canonical.mjs', 'wire-crypto.mjs', 'constants.mjs', 'save-transfer.mjs', 'compatibility.mjs')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('src\' + $name)) -Destination (Join-Path $package ('src\' + $name))
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tools\laptop-cli.mjs') -Destination (Join-Path $package 'tools\laptop-cli.mjs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tools\Run-Laptop-Test.cmd') -Destination (Join-Path $package 'Run-Laptop-Test.cmd')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tools\LAPTOP-README.txt') -Destination (Join-Path $package 'READ-ME-FIRST.txt')
Copy-Item -LiteralPath $nodeSource -Destination (Join-Path $package 'runtime\node.exe')
Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $package 'runtime\NODE-LICENSE.txt')
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'LICENSE')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE') -Destination (Join-Path $package 'LICENSE') }
Push-Location $package
try {
    & '.\runtime\node.exe' --input-type=module -e "await import('./src/laptop-test.mjs'); console.log('Portable imports OK, architecture=' + process.arch)"
    if ($LASTEXITCODE -ne 0) { throw 'Portable module check failed.' }
} finally { Pop-Location }
Compress-Archive -LiteralPath $package -DestinationPath $zip -CompressionLevel Optimal
Get-Item -LiteralPath $zip | Select-Object FullName,Length
Get-FileHash -LiteralPath $zip -Algorithm SHA256
