[CmdletBinding()]
param([string]$OutputName = 'TF3MP-Launcher.exe')

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$source = Join-Path $projectRoot 'launcher\Program.cs'
if ($OutputName -notmatch '^TF3MP-Launcher(?:-[A-Za-z0-9.]+)?\.exe$') { throw 'OutputName must be a TF3MP-Launcher EXE filename.' }
$output = Join-Path $projectRoot $OutputName
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$windowsBase = 'C:\Windows\Microsoft.NET\assembly\GAC_MSIL\WindowsBase\v4.0_4.0.0.0__31bf3856ad364e35\WindowsBase.dll'
$presentationCore = 'C:\Windows\Microsoft.NET\assembly\GAC_64\PresentationCore\v4.0_4.0.0.0__31bf3856ad364e35\PresentationCore.dll'
$presentationFramework = 'C:\Windows\Microsoft.NET\assembly\GAC_MSIL\PresentationFramework\v4.0_4.0.0.0__31bf3856ad364e35\PresentationFramework.dll'
$systemXaml = 'C:\Windows\Microsoft.NET\assembly\GAC_MSIL\System.Xaml\v4.0_4.0.0.0__b77a5c561934e089\System.Xaml.dll'
$webExtensions = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll'

if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
    throw "The Windows .NET Framework C# compiler was not found: $compiler"
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Launcher source was not found: $source"
}

& (Join-Path $projectRoot 'launcher\Build-Icon.ps1')
$icon = Join-Path $projectRoot 'launcher\assets\launcher.ico'
& $compiler /nologo /checked+ /debug- /optimize+ /platform:anycpu /target:winexe "/win32icon:$icon" "/resource:$icon,TF3MP.LauncherIcon" "/reference:$webExtensions" "/reference:$windowsBase" "/reference:$presentationCore" "/reference:$presentationFramework" "/reference:$systemXaml" "/out:$output" $source
if ($LASTEXITCODE -ne 0) {
    throw "C# compiler failed with exit code $LASTEXITCODE."
}

$hash = Get-FileHash -LiteralPath $output -Algorithm SHA256
Write-Host "Built $output" -ForegroundColor Green
Write-Host "SHA-256: $($hash.Hash.ToLowerInvariant())"
