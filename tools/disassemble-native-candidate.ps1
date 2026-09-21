[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ImagePath,
    [Parameter(Mandatory)] [string] $ExpectedSha256,
    [Parameter(Mandatory)] [UInt64] $StartRva,
    [Parameter(Mandatory)] [UInt64] $EndRva
)

# Static qualification helper only. EndRva is exclusive. This tool neither
# attaches to a process nor changes an image; it only asks dumpbin to display a
# small, hash-pinned portion of one caller-supplied PE64 file.
$ErrorActionPreference = 'Stop'
$MaxRangeBytes = [UInt64]65536
# PowerShell parses 0xffffffff as a signed Int32 (-1).  Keep this decimal so
# parameter validation rejects out-of-range RVAs instead of failing while the
# script itself is being initialized.
$MaxUint32 = [UInt64]4294967295
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'

function Read-ExactBytes([System.IO.FileStream]$Stream, [UInt64]$Offset, [int]$Count) {
    if ($Offset -gt [UInt64]$Stream.Length -or [UInt64]$Count -gt ([UInt64]$Stream.Length - $Offset)) {
        throw 'PE header or section data is outside the file.'
    }
    $buffer = [byte[]]::new($Count)
    $Stream.Position = [Int64]$Offset
    $read = 0
    while ($read -lt $Count) {
        $chunk = $Stream.Read($buffer, $read, $Count - $read)
        if ($chunk -le 0) { throw 'Could not read complete PE data.' }
        $read += $chunk
    }
    return $buffer
}
function U16([byte[]]$Bytes, [int]$Offset) { return [UInt64][BitConverter]::ToUInt16($Bytes, $Offset) }
function U32([byte[]]$Bytes, [int]$Offset) { return [UInt64][BitConverter]::ToUInt32($Bytes, $Offset) }
function U64([byte[]]$Bytes, [int]$Offset) { return [UInt64][BitConverter]::ToUInt64($Bytes, $Offset) }
function Get-StreamSha256([System.IO.FileStream]$Stream) {
    $Stream.Position = 0
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = $sha256.ComputeHash($Stream)
        return ([BitConverter]::ToString($digest)).Replace('-', '')
    } finally {
        $sha256.Dispose()
        $Stream.Position = 0
    }
}

$driveRooted = $ImagePath -match '^[A-Za-z]:[\\/]'
$uncRooted = $ImagePath -match '^\\\\[^\\/?]+\\[^\\/?]+(?:\\|$)'
if (-not ($driveRooted -or $uncRooted)) { throw 'ImagePath must be an absolute drive or UNC path.' }
if ($ExpectedSha256 -notmatch '^[0-9A-Fa-f]{64}$') { throw 'ExpectedSha256 must be exactly 64 hexadecimal characters.' }
if ($StartRva -gt $MaxUint32 -or $EndRva -gt $MaxUint32 -or $StartRva -ge $EndRva -or ($EndRva - $StartRva) -gt $MaxRangeBytes) {
    throw 'RVA range must be nonempty unsigned-32-bit and at most 64 KiB.'
}

$item = Get-Item -LiteralPath $ImagePath -Force
if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
    throw 'ImagePath must name a regular, non-reparse file.'
}
$resolvedPath = $item.FullName
# Retain this no-write/no-delete-sharing handle until dumpbin exits.  The digest
# and PE parsing therefore describe the same file that dumpbin is allowed to
# reopen, rather than a path which could be replaced between separate opens.
$stream = [System.IO.File]::Open($resolvedPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    $actualSha256 = Get-StreamSha256 $stream
    if (-not [string]::Equals($actualSha256, $ExpectedSha256, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Image SHA256 does not match ExpectedSha256.'
    }

    $dos = Read-ExactBytes $stream 0 64
    if ((U16 $dos 0) -ne 0x5a4d) { throw 'Not a DOS/PE image.' }
    $peOffset = U32 $dos 0x3c
    $coff = Read-ExactBytes $stream $peOffset 24
    if ((U32 $coff 0) -ne 0x00004550 -or (U16 $coff 4) -ne 0x8664) { throw 'Not an x64 PE image.' }
    $sectionCount = U16 $coff 6
    $optionalSize = U16 $coff 20
    if ($sectionCount -eq 0 -or $sectionCount -gt 96 -or $optionalSize -lt 112) { throw 'Invalid PE section or optional-header size.' }
    $optionalOffset = $peOffset + 24
    $optional = Read-ExactBytes $stream $optionalOffset ([int]$optionalSize)
    if ((U16 $optional 0) -ne 0x20b) { throw 'Not a PE32+ image.' }
    $imageBase = U64 $optional 24
    $sizeOfImage = U32 $optional 56
    if ($sizeOfImage -eq 0 -or $EndRva -gt $sizeOfImage) { throw 'RVA range is outside SizeOfImage.' }
    # EndRva is exclusive, so use its last included address for the overflow
    # check passed to dumpbin's inclusive /range argument.
    $lastRva = $EndRva - 1
    if ($imageBase -gt ([UInt64]::MaxValue - $lastRva)) { throw 'Image base plus RVA overflows.' }

    $sectionOffset = $optionalOffset + $optionalSize
    $sectionBytes = Read-ExactBytes $stream $sectionOffset ([int]($sectionCount * 40))
    $matched = $null
    for ($index = 0; $index -lt $sectionCount; $index++) {
        $offset = $index * 40
        $virtualAddress = U32 $sectionBytes ($offset + 12)
        $rawSize = U32 $sectionBytes ($offset + 16)
        $rawOffset = U32 $sectionBytes ($offset + 20)
        $characteristics = U32 $sectionBytes ($offset + 36)
        if ($rawSize -gt 0 -and ($rawOffset -gt [UInt64]$stream.Length -or $rawSize -gt ([UInt64]$stream.Length - $rawOffset))) {
            throw 'A section raw-data range is outside the file.'
        }
        if (($characteristics -band 0x20000000) -eq 0 -or $rawSize -eq 0) { continue }
        if ($virtualAddress -gt $MaxUint32 -or $rawSize -gt ($MaxUint32 - $virtualAddress)) { throw 'A section RVA range overflows.' }
        $sectionEnd = $virtualAddress + $rawSize
        if ($StartRva -ge $virtualAddress -and $EndRva -le $sectionEnd) {
            if ($null -ne $matched) { throw 'RVA range maps to multiple executable sections.' }
            $matched = $true
        }
    }
    if ($null -eq $matched) { throw 'RVA range is not wholly within one executable, file-backed section.' }
    if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio vswhere.exe was not found.' }
    $installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ([string]::IsNullOrWhiteSpace($installation)) { throw 'No Visual Studio installation with x64 C++ tools was found.' }
    $msvcRoot = Join-Path $installation 'VC\Tools\MSVC'
    $dumpbin = Get-ChildItem -LiteralPath $msvcRoot -Directory | Sort-Object Name -Descending | ForEach-Object {
        $candidate = Join-Path $_.FullName 'bin\Hostx64\x64\dumpbin.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $candidate }
    } | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($dumpbin)) { throw 'x64 dumpbin.exe was not found in the selected Visual Studio installation.' }

    $startVa = $imageBase + $StartRva
    $endVaInclusive = $imageBase + $lastRva
    $arguments = @('/nologo', '/disasm:nobytes', ('/range:0x{0:X},0x{1:X}' -f $startVa, $endVaInclusive), $resolvedPath)
    & $dumpbin @arguments
    if ($LASTEXITCODE -ne 0) { throw "dumpbin failed with exit code $LASTEXITCODE." }
} finally {
    $stream.Dispose()
}
