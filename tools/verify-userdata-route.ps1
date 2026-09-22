[CmdletBinding()]
param([Parameter(Mandatory)][string]$ImagePath)
$ErrorActionPreference='Stop'
$expected='a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5'
# Static instruction checks only. Decode each complete containing function; do
# not attach, execute game code, save proprietary disassembly, or authorize hooks.
$checks=@(
    @(0xe35150,0xe35174,'call 00000001409CF750'),
    @(0xefbcc0,0xefbcdd,'xor edx,edx'),
    @(0xefbcc0,0xefbce5,'call qword ptr [r8]'),
    @(0x1426a50,0x1426b10,'lea rdx,[0000000140EFBCC0h]'),
    @(0x1426a50,0x1426b3e,'lea rdx,[000000014372CD34h]'),
    @(0x1426a50,0x1426c68,'mov r8,qword ptr [0000000143CB9860h]'),
    @(0xe21270,0xe212c1,'call 0000000140DC8D80'),
    @(0xe21270,0xe212cb,'mov rax,qword ptr [rax+8]'),
    @(0xe1e900,0xe1e966,'call 0000000140E21270'),
    @(0xe1e900,0xe1e9c8,'mov qword ptr [rdi+28h],rax'),
    @(0xe177d0,0xe17833,'call 0000000140E26870'),
    @(0xe26870,0xe26a06,'call 00000001409CF510'),
    @(0xe26870,0xe26a13,'mov rcx,qword ptr [rsi+38h]'),
    @(0xe26870,0xe26a2f,'call qword ptr [rax+10h]'),
    @(0xe26870,0xe269c7,'lea rax,[000000014373A730h]'),
    @(0xe260d0,0xe261de,'call 0000000140E0D630'),
    @(0xe0d630,0xe0d67a,'lea rcx,[rax+30h]'),
    @(0xe0d630,0xe0d702,'call 0000000140D8A820'),
    @(0x11c6e0,0x11c76c,'lea rcx,[0000000143677C00h]'),
    @(0x11c6e0,0x11c7f6,'call 0000000141084220'),
    @(0x11c6e0,0x11c895,'lea rax,[0000000143677C38h]'),
    @(0x11c6e0,0x11c988,'call 0000000141084220'),
    @(0x69a350,0x69a6e9,'lea rcx,[00000001436C5C58h]'),
    @(0x69a350,0x69a7a5,'call 0000000141084220'),
    @(0x27c26a0,0x27c30c9,'lea rax,[0000000143783520h]'),
    @(0x27c26a0,0x27c3245,'call 0000000141084220'),
    @(0x1084220,0x1084373,'call 0000000140E351C0'),
    @(0xe351c0,0xe354cb,'mov rcx,qword ptr [r13+38h]'),
    @(0xe351c0,0xe355ad,'vmovsd xmm0,qword ptr [0000000143739B98h]'),
    @(0xe351c0,0xe35602,'call 0000000140DDD970'),
    @(0xddd970,0xdddbec,'lea rdx,[0000000140E1D250h]'),
    @(0xe1d250,0xe1d39d,'call 0000000140E177D0'),
    @(0x1201c0,0x12028d,'call 00000001409D3120'),
    @(0x6ab5f0,0x6ab6c4,'call 00000001409D3120'),
    @(0x27c4330,0x27c440d,'call 00000001409D3120'),
    @(0x120430,0x120490,'mov rdi,qword ptr [rdi+rcx]'),
    @(0x120430,0x1204a9,'call 00000001409CF510'),
    @(0x120430,0x1204df,'call 00000001409E2380'),
    @(0x120430,0x1204f3,'call qword ptr [rax+10h]'),
    @(0x9e2380,0x9e243e,'call 00000001409D7AA0'),
    @(0x9e2380,0x9e2443,'mov byte ptr [r14+30h],al')
)
$entries=@($checks | ForEach-Object {'0x{0:x}' -f $_[0]} | Select-Object -Unique)
$inventory=& node (Join-Path $PSScriptRoot 'inspect-userdata-route.mjs') $ImagePath @entries | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $inventory.hash -ne $expected){throw 'Exact-image inventory failed'}
$decoded=@{}
foreach($finding in $inventory.findings){
    if(-not $finding.runtime -or $finding.runtime.begin -ne $finding.rva){throw 'Missing primary containing function'}
    $start=[Convert]::ToUInt64($finding.runtime.begin.Substring(2),16)
    $end=[Convert]::ToUInt64($finding.runtime.end.Substring(2),16)
    foreach($line in (& (Join-Path $PSScriptRoot 'disassemble-native-candidate.ps1') -ImagePath $ImagePath -ExpectedSha256 $expected -StartRva $start -EndRva $end)){
        if($line -match '^\s+([0-9A-F]{16}):\s+(.+)$'){$decoded[$Matches[1]]=$Matches[2].Trim() -replace '\s+',' '}
    }
}
foreach($check in $checks){
    $va='{0:X16}' -f (0x140000000L+$check[1])
    if($decoded[$va] -cne $check[2]){throw ('Instruction mismatch at RVA 0x{0:x}' -f $check[1])}
}
[pscustomobject]@{imageSha256=$expected;activationPermitted=$false;instructionChecks=$checks.Count;functionCount=$entries.Count;functions=@($inventory.findings | Select-Object rva,runtime)} | ConvertTo-Json -Depth 5
