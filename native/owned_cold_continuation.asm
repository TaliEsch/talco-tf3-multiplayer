; Owned diagnostic only. No game addresses, patching or production entry point.
; The gate is a cold fragment of an already-active frame, not a called function.
; Each RSP transition has its own complete unwind record. No synthetic return.
OPTION DOTNAME
PUBLIC OwnedColdStep, OwnedColdTrap, OwnedColdResume, OwnedColdGate
PUBLIC OwnedColdCases, OwnedColdCaseCount, OwnedColdGateEnd
EXTERN OwnedColdHelper:PROC
EXTERN OwnedColdXcr0:QWORD
EXTERN OwnedColdBeforeGpr:BYTE, OwnedColdAfterGpr:BYTE
EXTERN OwnedColdBeforeXstate:BYTE, OwnedColdAfterXstate:BYTE
EXTERN OwnedColdEntryXstate:BYTE, OwnedColdPatterns:BYTE
EXTERN OwnedColdScratchMxcsr:DWORD
EXTERN OwnedColdSeedR15:QWORD, OwnedColdSeedFlags:QWORD
.const
; Each actual gate instruction is listed with the RSP depth BEFORE it executes.
; Keep this table and ColdInstruction labels synchronized when changing code.
; Displacement bytes are deliberately not treated as possible hardware PCs.
OwnedColdCases LABEL QWORD
    DQ OFFSET ColdInstruction0, 0
    DQ OFFSET ColdInstruction1, 8
    DQ OFFSET ColdInstruction2, 4096
    DQ OFFSET ColdInstruction3, 4096
    DQ OFFSET ColdInstruction4, 8192
    DQ OFFSET ColdInstruction5, 8192
    DQ OFFSET ColdInstruction6, 12288
    DQ OFFSET ColdInstruction7, 12288
    DQ OFFSET ColdInstruction8, 16384
    DQ OFFSET ColdInstruction9, 16384
    DQ OFFSET ColdInstruction10, 16384
    DQ OFFSET ColdInstruction11, 16384
    DQ OFFSET ColdInstruction12, 16384
    DQ OFFSET ColdInstruction13, 16384
    DQ OFFSET ColdInstruction14, 16384
    DQ OFFSET ColdInstruction15, 16384
    DQ OFFSET ColdInstruction16, 16384
    DQ OFFSET ColdInstruction17, 16384
    DQ OFFSET ColdInstruction18, 16384
    DQ OFFSET ColdInstruction19, 16384
    DQ OFFSET ColdInstruction20, 16384
    DQ OFFSET ColdInstruction21, 16384
    DQ OFFSET ColdInstruction22, 16384
    DQ OFFSET ColdInstruction23, 16384
    DQ OFFSET ColdInstruction24, 16384
    DQ OFFSET ColdInstruction25, 16384
    DQ OFFSET ColdInstruction26, 16384
    DQ OFFSET ColdInstruction27, 16384
    DQ OFFSET ColdInstruction28, 16384
    DQ OFFSET ColdInstruction29, 16384
    DQ OFFSET ColdInstruction30, 16384
    DQ OFFSET ColdInstruction31, 16384
    DQ OFFSET ColdInstruction32, 16384
    DQ OFFSET ColdInstruction33, 16384
    DQ OFFSET ColdInstruction34, 16384
    DQ OFFSET ColdInstruction35, 16384
    DQ OFFSET ColdInstruction36, 16384
    DQ OFFSET ColdInstruction37, 16384
    DQ OFFSET ColdInstruction38, 16384
    DQ OFFSET ColdInstruction39, 16384
    DQ OFFSET ColdInstruction40, 16384
    DQ OFFSET ColdInstruction41, 16384
    DQ OFFSET ColdInstruction42, 16384
    DQ OFFSET ColdInstruction43, 16384
    DQ OFFSET ColdInstruction44, 16384
    DQ OFFSET ColdInstruction45, 16384
    DQ OFFSET ColdInstruction46, 16384
    DQ OFFSET ColdInstruction47, 16384
    DQ OFFSET ColdInstruction48, 16384
    DQ OFFSET ColdInstruction49, 16384
    DQ OFFSET ColdInstruction50, 16384
    DQ OFFSET ColdInstruction51, 16384
    DQ OFFSET ColdInstruction52, 16384
    DQ OFFSET ColdInstruction53, 16384
    DQ OFFSET ColdInstruction54, 8
    DQ OFFSET ColdInstruction55, 0
    DQ OFFSET ColdInstruction56, 0
    DQ OFFSET ColdInstruction57, 0
OwnedColdCaseCount DQ 58
.code
OwnedColdStep PROC FRAME
    mov qword ptr [rsp+8], rbx
    .savereg rbx, 8
    mov qword ptr [rsp+10h], rsi
    .savereg rsi, 10h
    mov qword ptr [rsp+18h], rdi
    .savereg rdi, 18h
    push rbp
    .pushreg rbp
    push r14
    .pushreg r14
    sub rsp, 48h
    .allocstack 48h
    movdqa xmmword ptr [rsp+20h], xmm6
    .savexmm128 xmm6, 20h
    mov qword ptr [rsp+30h], r15
    .savereg r15, 30h
    mov qword ptr [rsp+38h], r13
    .savereg r13, 38h
    mov qword ptr [rsp+40h], r12
    .savereg r12, 40h
    .endprolog
    mov eax, dword ptr [OwnedColdXcr0]
    mov edx, dword ptr [OwnedColdXcr0+4]
    xsave64 [OwnedColdEntryXstate]
    vmovdqu ymm0, ymmword ptr [OwnedColdPatterns]
    vmovdqu ymm1, ymmword ptr [OwnedColdPatterns+32]
    vmovdqu ymm2, ymmword ptr [OwnedColdPatterns+64]
    vmovdqu ymm3, ymmword ptr [OwnedColdPatterns+96]
    vmovdqu ymm4, ymmword ptr [OwnedColdPatterns+128]
    vmovdqu ymm5, ymmword ptr [OwnedColdPatterns+160]
    vmovdqu ymm6, ymmword ptr [OwnedColdPatterns+192]
    mov eax, dword ptr [OwnedColdXcr0]
    and eax, 0E0h
    cmp eax, 0E0h
    jne SeedWithoutAvx512
    vmovdqu64 zmm0, zmmword ptr [OwnedColdPatterns]
    vmovdqu64 zmm6, zmmword ptr [OwnedColdPatterns+192]
    vmovdqu64 zmm16, zmmword ptr [OwnedColdPatterns+256]
    vmovdqu64 zmm31, zmmword ptr [OwnedColdPatterns+320]
    mov eax, 0A55Ah
    kmovw k0, eax
    kmovw k1, eax
    kmovw k7, eax
SeedWithoutAvx512:
    fld1
    fldpi
    mov rax, 1123456789abcd0h
    mov rcx, 2123456789abcd0h
    mov rdx, 3123456789abcd0h
    mov rbx, 4123456789abcd0h
    mov rbp, 5123456789abcd0h
    mov rsi, 6123456789abcd0h
    mov rdi, 7123456789abcd0h
    mov r8, 8123456789abcd0h
    mov r9, 9123456789abcd0h
    mov r10, 0a123456789abcd0h
    mov r11, 0b123456789abcd0h
    mov r12, 0c123456789abcd0h
    mov r13, 0d123456789abcd0h
    mov r14, 0e123456789abcd0h
    mov r15, qword ptr [OwnedColdSeedR15]
    push qword ptr [OwnedColdSeedFlags]
    popfq
    inc r15d
    mov qword ptr [OwnedColdBeforeGpr+0], rax
    mov qword ptr [OwnedColdBeforeGpr+8], rcx
    mov qword ptr [OwnedColdBeforeGpr+16], rdx
    mov qword ptr [OwnedColdBeforeGpr+24], rbx
    mov qword ptr [OwnedColdBeforeGpr+32], rbp
    mov qword ptr [OwnedColdBeforeGpr+40], rsi
    mov qword ptr [OwnedColdBeforeGpr+48], rdi
    mov qword ptr [OwnedColdBeforeGpr+56], r8
    mov qword ptr [OwnedColdBeforeGpr+64], r9
    mov qword ptr [OwnedColdBeforeGpr+72], r10
    mov qword ptr [OwnedColdBeforeGpr+80], r11
    mov qword ptr [OwnedColdBeforeGpr+88], r12
    mov qword ptr [OwnedColdBeforeGpr+96], r13
    mov qword ptr [OwnedColdBeforeGpr+104], r14
    mov qword ptr [OwnedColdBeforeGpr+112], r15
    mov qword ptr [OwnedColdBeforeGpr+120], rsp
    pushfq
    pop qword ptr [OwnedColdBeforeGpr+128]
    mov eax, dword ptr [OwnedColdXcr0]
    mov edx, dword ptr [OwnedColdXcr0+4]
    xsave64 [OwnedColdBeforeXstate]
    mov rax, qword ptr [OwnedColdBeforeGpr]
    mov rdx, qword ptr [OwnedColdBeforeGpr+16]
OwnedColdTrap LABEL BYTE
    int 3
OwnedColdResume LABEL BYTE
    mov qword ptr [OwnedColdAfterGpr+0], rax
    mov qword ptr [OwnedColdAfterGpr+8], rcx
    mov qword ptr [OwnedColdAfterGpr+16], rdx
    mov qword ptr [OwnedColdAfterGpr+24], rbx
    mov qword ptr [OwnedColdAfterGpr+32], rbp
    mov qword ptr [OwnedColdAfterGpr+40], rsi
    mov qword ptr [OwnedColdAfterGpr+48], rdi
    mov qword ptr [OwnedColdAfterGpr+56], r8
    mov qword ptr [OwnedColdAfterGpr+64], r9
    mov qword ptr [OwnedColdAfterGpr+72], r10
    mov qword ptr [OwnedColdAfterGpr+80], r11
    mov qword ptr [OwnedColdAfterGpr+88], r12
    mov qword ptr [OwnedColdAfterGpr+96], r13
    mov qword ptr [OwnedColdAfterGpr+104], r14
    mov qword ptr [OwnedColdAfterGpr+112], r15
    mov qword ptr [OwnedColdAfterGpr+120], rsp
    pushfq
    pop qword ptr [OwnedColdAfterGpr+128]
    cld
    mov eax, dword ptr [OwnedColdXcr0]
    mov edx, dword ptr [OwnedColdXcr0+4]
    xsave64 [OwnedColdAfterXstate]
    mov eax, dword ptr [OwnedColdXcr0]
    mov edx, dword ptr [OwnedColdXcr0+4]
    xrstor64 [OwnedColdEntryXstate]
    movdqa xmm6, xmmword ptr [rsp+20h]
    mov r15, qword ptr [rsp+30h]
    mov r13, qword ptr [rsp+38h]
    mov r12, qword ptr [rsp+40h]
    mov rbx, qword ptr [rsp+60h]
    mov rsi, qword ptr [rsp+68h]
    mov rdi, qword ptr [rsp+70h]
    add rsp, 48h
    pop r14
    pop rbp
    ret
OwnedColdStep ENDP

; Naked cold fragment. All labels below have explicit pdata/xdata.
OwnedColdGate LABEL BYTE
ColdInstruction0 LABEL BYTE
    pushfq
GateDepth8 LABEL BYTE
ColdInstruction1 LABEL BYTE
    sub rsp, 0FF8h
GateDepth1000 LABEL BYTE
ColdInstruction2 LABEL BYTE
    test byte ptr [rsp], 0
ColdInstruction3 LABEL BYTE
    sub rsp, 1000h
GateDepth2000 LABEL BYTE
ColdInstruction4 LABEL BYTE
    test byte ptr [rsp], 0
ColdInstruction5 LABEL BYTE
    sub rsp, 1000h
GateDepth3000 LABEL BYTE
ColdInstruction6 LABEL BYTE
    test byte ptr [rsp], 0
ColdInstruction7 LABEL BYTE
    sub rsp, 1000h
GateDepth4000 LABEL BYTE
ColdInstruction8 LABEL BYTE
    test byte ptr [rsp], 0
ColdInstruction9 LABEL BYTE
    cld
ColdInstruction10 LABEL BYTE
    mov qword ptr [rsp+32], rax
ColdInstruction11 LABEL BYTE
    mov qword ptr [rsp+40], rcx
ColdInstruction12 LABEL BYTE
    mov qword ptr [rsp+48], rdx
ColdInstruction13 LABEL BYTE
    mov qword ptr [rsp+56], rbx
ColdInstruction14 LABEL BYTE
    mov qword ptr [rsp+64], rbp
ColdInstruction15 LABEL BYTE
    mov qword ptr [rsp+72], rsi
ColdInstruction16 LABEL BYTE
    mov qword ptr [rsp+80], rdi
ColdInstruction17 LABEL BYTE
    mov qword ptr [rsp+88], r8
ColdInstruction18 LABEL BYTE
    mov qword ptr [rsp+96], r9
ColdInstruction19 LABEL BYTE
    mov qword ptr [rsp+104], r10
ColdInstruction20 LABEL BYTE
    mov qword ptr [rsp+112], r11
ColdInstruction21 LABEL BYTE
    mov qword ptr [rsp+120], r12
ColdInstruction22 LABEL BYTE
    mov qword ptr [rsp+128], r13
ColdInstruction23 LABEL BYTE
    mov qword ptr [rsp+136], r14
ColdInstruction24 LABEL BYTE
    mov qword ptr [rsp+144], r15
ColdInstruction25 LABEL BYTE
    lea rdi, [rsp+100h]
ColdInstruction26 LABEL BYTE
    xor eax, eax
ColdInstruction27 LABEL BYTE
    mov ecx, 3E00h/8
ColdInstruction28 LABEL BYTE
    rep stosq
ColdInstruction29 LABEL BYTE
    lea rbx, [rsp+13Fh]
ColdInstruction30 LABEL BYTE
    and rbx, -64
ColdInstruction31 LABEL BYTE
    mov eax, dword ptr [OwnedColdXcr0]
ColdInstruction32 LABEL BYTE
    mov edx, dword ptr [OwnedColdXcr0+4]
ColdInstruction33 LABEL BYTE
    xsave64 [rbx]
ColdInstruction34 LABEL BYTE
    call OwnedColdHelper
ColdInstruction35 LABEL BYTE
    mov eax, dword ptr [OwnedColdXcr0]
ColdInstruction36 LABEL BYTE
    mov edx, dword ptr [OwnedColdXcr0+4]
ColdInstruction37 LABEL BYTE
    xrstor64 [rbx]
ColdInstruction38 LABEL BYTE
    mov rax, qword ptr [rsp+32]
ColdInstruction39 LABEL BYTE
    mov rcx, qword ptr [rsp+40]
ColdInstruction40 LABEL BYTE
    mov rdx, qword ptr [rsp+48]
ColdInstruction41 LABEL BYTE
    mov rbx, qword ptr [rsp+56]
ColdInstruction42 LABEL BYTE
    mov rbp, qword ptr [rsp+64]
ColdInstruction43 LABEL BYTE
    mov rsi, qword ptr [rsp+72]
ColdInstruction44 LABEL BYTE
    mov rdi, qword ptr [rsp+80]
ColdInstruction45 LABEL BYTE
    mov r8, qword ptr [rsp+88]
ColdInstruction46 LABEL BYTE
    mov r9, qword ptr [rsp+96]
ColdInstruction47 LABEL BYTE
    mov r10, qword ptr [rsp+104]
ColdInstruction48 LABEL BYTE
    mov r11, qword ptr [rsp+112]
ColdInstruction49 LABEL BYTE
    mov r12, qword ptr [rsp+120]
ColdInstruction50 LABEL BYTE
    mov r13, qword ptr [rsp+128]
ColdInstruction51 LABEL BYTE
    mov r14, qword ptr [rsp+136]
ColdInstruction52 LABEL BYTE
    mov r15, qword ptr [rsp+144]
ColdInstruction53 LABEL BYTE
    add rsp, 3FF8h
GateRestore8 LABEL BYTE
ColdInstruction54 LABEL BYTE
    popfq
GateRestore0 LABEL BYTE
    ; Complementary conditional branches preserve flags/registers and cannot be
    ; misdecoded by the virtual unwinder as a tail-call epilogue.
ColdInstruction55 LABEL BYTE
    jz NEAR PTR OwnedColdResume
ColdInstruction56 LABEL BYTE
    jnz NEAR PTR OwnedColdResume
ColdInstruction57 LABEL BYTE
    ud2
OwnedColdGateEnd LABEL BYTE
    int 3

PUBLIC OwnedColdClobber
OwnedColdClobber PROC FRAME
    sub rsp, 28h
    .allocstack 28h
    movdqa xmmword ptr [rsp+10h], xmm6
    .savexmm128 xmm6, 10h
    .endprolog
    vxorps ymm0, ymm0, ymm0
    vxorps ymm1, ymm1, ymm1
    vxorps ymm2, ymm2, ymm2
    vxorps ymm3, ymm3, ymm3
    vxorps ymm4, ymm4, ymm4
    vxorps ymm5, ymm5, ymm5
    mov eax, dword ptr [OwnedColdXcr0]
    and eax, 0E0h
    cmp eax, 0E0h
    jne ClobberWithoutAvx512
    vpxord zmm0, zmm0, zmm0
    vpxord zmm6, zmm6, zmm6
    vpxord zmm16, zmm16, zmm16
    vpxord zmm31, zmm31, zmm31
    kxorw k0, k0, k0
    kxorw k1, k1, k1
    kxorw k7, k7, k7
ClobberWithoutAvx512:
    vzeroupper
    fninit
    ldmxcsr dword ptr [OwnedColdScratchMxcsr]
    mov rax, 9
    mov rcx, 10
    mov rdx, 11
    mov r8, 12
    mov r9, 13
    mov r10, 14
    mov r11, 15
    add eax, 5
    movdqa xmm6, xmmword ptr [rsp+10h]
    add rsp, 28h
    ret
OwnedColdClobber ENDP
.xdata SEGMENT READONLY
ALIGN 4
Unwind0 LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD (0+020h)
    DB 0, 0F4h
    DW (0+030h)/8
    DB 0, 0D4h
    DW (0+038h)/8
    DB 0, 0C4h
    DW (0+040h)/8
    DB 0, 0E4h
    DW (0+048h)/8
    DB 0, 054h
    DW (0+050h)/8
    DB 0, 034h
    DW (0+060h)/8
    DB 0, 064h
    DW (0+068h)/8
    DB 0, 074h
    DW (0+070h)/8
    DB 0, 001h
    DW (0+058h)/8
    DW 0

Unwind8 LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD (8+020h)
    DB 0, 0F4h
    DW (8+030h)/8
    DB 0, 0D4h
    DW (8+038h)/8
    DB 0, 0C4h
    DW (8+040h)/8
    DB 0, 0E4h
    DW (8+048h)/8
    DB 0, 054h
    DW (8+050h)/8
    DB 0, 034h
    DW (8+060h)/8
    DB 0, 064h
    DW (8+068h)/8
    DB 0, 074h
    DW (8+070h)/8
    DB 0, 001h
    DW (8+058h)/8
    DW 0

Unwind1000 LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD (4096+020h)
    DB 0, 0F4h
    DW (4096+030h)/8
    DB 0, 0D4h
    DW (4096+038h)/8
    DB 0, 0C4h
    DW (4096+040h)/8
    DB 0, 0E4h
    DW (4096+048h)/8
    DB 0, 054h
    DW (4096+050h)/8
    DB 0, 034h
    DW (4096+060h)/8
    DB 0, 064h
    DW (4096+068h)/8
    DB 0, 074h
    DW (4096+070h)/8
    DB 0, 001h
    DW (4096+058h)/8
    DW 0

Unwind2000 LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD (8192+020h)
    DB 0, 0F4h
    DW (8192+030h)/8
    DB 0, 0D4h
    DW (8192+038h)/8
    DB 0, 0C4h
    DW (8192+040h)/8
    DB 0, 0E4h
    DW (8192+048h)/8
    DB 0, 054h
    DW (8192+050h)/8
    DB 0, 034h
    DW (8192+060h)/8
    DB 0, 064h
    DW (8192+068h)/8
    DB 0, 074h
    DW (8192+070h)/8
    DB 0, 001h
    DW (8192+058h)/8
    DW 0

Unwind3000 LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD (12288+020h)
    DB 0, 0F4h
    DW (12288+030h)/8
    DB 0, 0D4h
    DW (12288+038h)/8
    DB 0, 0C4h
    DW (12288+040h)/8
    DB 0, 0E4h
    DW (12288+048h)/8
    DB 0, 054h
    DW (12288+050h)/8
    DB 0, 034h
    DW (12288+060h)/8
    DB 0, 064h
    DW (12288+068h)/8
    DB 0, 074h
    DW (12288+070h)/8
    DB 0, 001h
    DW (12288+058h)/8
    DW 0

Unwind4000 LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD (16384+020h)
    DB 0, 0F4h
    DW (16384+030h)/8
    DB 0, 0D4h
    DW (16384+038h)/8
    DB 0, 0C4h
    DW (16384+040h)/8
    DB 0, 0E4h
    DW (16384+048h)/8
    DB 0, 054h
    DW (16384+050h)/8
    DB 0, 034h
    DW (16384+060h)/8
    DB 0, 064h
    DW (16384+068h)/8
    DB 0, 074h
    DW (16384+070h)/8
    DB 0, 001h
    DW (16384+058h)/8
    DW 0

.xdata ENDS
.pdata SEGMENT READONLY
ALIGN 4
    DD imagerel OwnedColdGate, imagerel GateDepth8, imagerel Unwind0
    DD imagerel GateDepth8, imagerel GateDepth1000, imagerel Unwind8
    DD imagerel GateDepth1000, imagerel GateDepth2000, imagerel Unwind1000
    DD imagerel GateDepth2000, imagerel GateDepth3000, imagerel Unwind2000
    DD imagerel GateDepth3000, imagerel GateDepth4000, imagerel Unwind3000
    DD imagerel GateDepth4000, imagerel GateRestore8, imagerel Unwind4000
    DD imagerel GateRestore8, imagerel GateRestore0, imagerel Unwind8
    DD imagerel GateRestore0, imagerel OwnedColdGateEnd, imagerel Unwind0
.pdata ENDS
END
