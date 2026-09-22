[CmdletBinding()]
param([Parameter(Mandatory)][string]$ImagePath)
$ErrorActionPreference='Stop'
$expected='a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5'
$inventory=& node (Join-Path $PSScriptRoot 'inspect-vehicle-abi.mjs') $ImagePath | ConvertFrom-Json
if($LASTEXITCODE -ne 0){ throw 'Exact-build inventory failed' }
$cache=@{}
$results=@()
foreach($finding in $inventory.findings | Where-Object { $_.target -in @('0x9eee60','0x9d3120') }) {
    foreach($candidate in $finding.directCallCandidates) {
        if(-not $candidate.runtime){ throw 'Candidate has no containing runtime function' }
        $key=$candidate.runtime.begin
        if(-not $cache.ContainsKey($key)) {
            $start=[Convert]::ToUInt64($candidate.runtime.begin.Substring(2),16)
            $end=[Convert]::ToUInt64($candidate.runtime.end.Substring(2),16)
            $cache[$key]=@(& (Join-Path $PSScriptRoot 'disassemble-native-candidate.ps1') -ImagePath $ImagePath -ExpectedSha256 $expected -StartRva $start -EndRva $end | Where-Object { $_ -match '^\s+[0-9A-F]{16}:' })
        }
        $instructions=$cache[$key]
        $callVa=0x140000000L+[Convert]::ToUInt64($candidate.call.Substring(2),16)
        $targetVa=0x140000000L+[Convert]::ToUInt64($finding.target.Substring(2),16)
        $pattern='^\s+{0:X16}:\s+call\s+{1:X16}\s*$' -f $callVa,$targetVa
        $indices=@(for($i=0;$i -lt $instructions.Count;$i++){if($instructions[$i] -match $pattern){$i}})
        if($indices.Count -ne 1){throw "CALL candidate did not decode exactly once: $($candidate.call)"}
        $at=$indices[0]
        $destroysOutput=$finding.target -eq '0x9d3120' -and $instructions[$at+1] -match ':\s+lea\s+rcx,' -and $instructions[$at+2] -match ':\s+call\s+0000000143035650\s*$'
        if($finding.target -eq '0x9d3120' -and -not $destroysOutput){throw "Add output cleanup differs: $($candidate.call)"}
        $results += [pscustomobject]@{target=$finding.target;call=$candidate.call;return=$candidate.return;containingBegin=$candidate.runtime.begin;containingEnd=$candidate.runtime.end;decoded=$true;immediateOutputDestructor=$destroysOutput}
    }
}
[pscustomobject]@{imageSha256=$expected;decodedCallCount=$results.Count;containingFunctionCount=$cache.Count;activationPermitted=$false;calls=$results} | ConvertTo-Json -Depth 6
