; Owned cross-image fixture only. Cold frame lives in a separate DLL.
OPTION DOTNAME
PUBLIC OwnedCrossGate, OwnedCrossGateEnd, OwnedCrossReturnTrap
PUBLIC OwnedCrossCases, OwnedCrossCaseCount
EXTERN OwnedCrossHelper:PROC
EXTERN OwnedCrossXcr0:QWORD, OwnedCrossScratchMxcsr:DWORD
.const
OwnedCrossCases LABEL QWORD
    DQ OFFSET CrossInstruction0, 0
    DQ OFFSET CrossInstruction1, 8
    DQ OFFSET CrossInstruction2, 4096
    DQ OFFSET CrossInstruction3, 4096
    DQ OFFSET CrossInstruction4, 8192
    DQ OFFSET CrossInstruction5, 8192
    DQ OFFSET CrossInstruction6, 12288
    DQ OFFSET CrossInstruction7, 12288
    DQ OFFSET CrossInstruction8, 16384
    DQ OFFSET CrossInstruction9, 16384
    DQ OFFSET CrossInstruction10, 16384
    DQ OFFSET CrossInstruction11, 16384
    DQ OFFSET CrossInstruction12, 16384
    DQ OFFSET CrossInstruction13, 16384
    DQ OFFSET CrossInstruction14, 16384
    DQ OFFSET CrossInstruction15, 16384
    DQ OFFSET CrossInstruction16, 16384
    DQ OFFSET CrossInstruction17, 16384
    DQ OFFSET CrossInstruction18, 16384
    DQ OFFSET CrossInstruction19, 16384
    DQ OFFSET CrossInstruction20, 16384
    DQ OFFSET CrossInstruction21, 16384
    DQ OFFSET CrossInstruction22, 16384
    DQ OFFSET CrossInstruction23, 16384
    DQ OFFSET CrossInstruction24, 16384
    DQ OFFSET CrossInstruction25, 16384
    DQ OFFSET CrossInstruction26, 16384
    DQ OFFSET CrossInstruction27, 16384
    DQ OFFSET CrossInstruction28, 16384
    DQ OFFSET CrossInstruction29, 16384
    DQ OFFSET CrossInstruction30, 16384
    DQ OFFSET CrossInstruction31, 16384
    DQ OFFSET CrossInstruction32, 16384
    DQ OFFSET CrossInstruction33, 16384
    DQ OFFSET CrossInstruction34, 16384
    DQ OFFSET CrossInstruction35, 16384
    DQ OFFSET CrossInstruction36, 16384
    DQ OFFSET CrossInstruction37, 16384
    DQ OFFSET CrossInstruction38, 16384
    DQ OFFSET CrossInstruction39, 16384
    DQ OFFSET CrossInstruction40, 16384
    DQ OFFSET CrossInstruction41, 16384
    DQ OFFSET CrossInstruction42, 16384
    DQ OFFSET CrossInstruction43, 16384
    DQ OFFSET CrossInstruction44, 16384
    DQ OFFSET CrossInstruction45, 16384
    DQ OFFSET CrossInstruction46, 16384
    DQ OFFSET CrossInstruction47, 16384
    DQ OFFSET CrossInstruction48, 16384
    DQ OFFSET CrossInstruction49, 16384
    DQ OFFSET CrossInstruction50, 16384
    DQ OFFSET CrossInstruction51, 16384
    DQ OFFSET CrossInstruction52, 16384
    DQ OFFSET CrossInstruction53, 16384
    DQ OFFSET CrossInstruction54, 8
    DQ OFFSET CrossInstruction55, 0
OwnedCrossCaseCount DQ 56
.code
OwnedCrossGate LABEL BYTE
CrossInstruction0 LABEL BYTE
    pushfq
GateDepth8 LABEL BYTE
CrossInstruction1 LABEL BYTE
    sub rsp, 0FF8h
GateDepth1000 LABEL BYTE
CrossInstruction2 LABEL BYTE
    test byte ptr [rsp], 0
CrossInstruction3 LABEL BYTE
    sub rsp, 1000h
GateDepth2000 LABEL BYTE
CrossInstruction4 LABEL BYTE
    test byte ptr [rsp], 0
CrossInstruction5 LABEL BYTE
    sub rsp, 1000h
GateDepth3000 LABEL BYTE
CrossInstruction6 LABEL BYTE
    test byte ptr [rsp], 0
CrossInstruction7 LABEL BYTE
    sub rsp, 1000h
GateDepth4000 LABEL BYTE
CrossInstruction8 LABEL BYTE
    test byte ptr [rsp], 0
CrossInstruction9 LABEL BYTE
    cld
CrossInstruction10 LABEL BYTE
    mov qword ptr [rsp+32], rax
CrossInstruction11 LABEL BYTE
    mov qword ptr [rsp+40], rcx
CrossInstruction12 LABEL BYTE
    mov qword ptr [rsp+48], rdx
CrossInstruction13 LABEL BYTE
    mov qword ptr [rsp+56], rbx
CrossInstruction14 LABEL BYTE
    mov qword ptr [rsp+64], rbp
CrossInstruction15 LABEL BYTE
    mov qword ptr [rsp+72], rsi
CrossInstruction16 LABEL BYTE
    mov qword ptr [rsp+80], rdi
CrossInstruction17 LABEL BYTE
    mov qword ptr [rsp+88], r8
CrossInstruction18 LABEL BYTE
    mov qword ptr [rsp+96], r9
CrossInstruction19 LABEL BYTE
    mov qword ptr [rsp+104], r10
CrossInstruction20 LABEL BYTE
    mov qword ptr [rsp+112], r11
CrossInstruction21 LABEL BYTE
    mov qword ptr [rsp+120], r12
CrossInstruction22 LABEL BYTE
    mov qword ptr [rsp+128], r13
CrossInstruction23 LABEL BYTE
    mov qword ptr [rsp+136], r14
CrossInstruction24 LABEL BYTE
    mov qword ptr [rsp+144], r15
CrossInstruction25 LABEL BYTE
    lea rdi, [rsp+100h]
CrossInstruction26 LABEL BYTE
    xor eax, eax
CrossInstruction27 LABEL BYTE
    mov ecx, 3E00h/8
CrossInstruction28 LABEL BYTE
    rep stosq
CrossInstruction29 LABEL BYTE
    lea rbx, [rsp+13Fh]
CrossInstruction30 LABEL BYTE
    and rbx, -64
CrossInstruction31 LABEL BYTE
    mov eax, dword ptr [OwnedCrossXcr0]
CrossInstruction32 LABEL BYTE
    mov edx, dword ptr [OwnedCrossXcr0+4]
CrossInstruction33 LABEL BYTE
    xsave64 [rbx]
CrossInstruction34 LABEL BYTE
    call OwnedCrossHelper
CrossInstruction35 LABEL BYTE
    mov eax, dword ptr [OwnedCrossXcr0]
CrossInstruction36 LABEL BYTE
    mov edx, dword ptr [OwnedCrossXcr0+4]
CrossInstruction37 LABEL BYTE
    xrstor64 [rbx]
CrossInstruction38 LABEL BYTE
    mov rax, qword ptr [rsp+32]
CrossInstruction39 LABEL BYTE
    mov rcx, qword ptr [rsp+40]
CrossInstruction40 LABEL BYTE
    mov rdx, qword ptr [rsp+48]
CrossInstruction41 LABEL BYTE
    mov rbx, qword ptr [rsp+56]
CrossInstruction42 LABEL BYTE
    mov rbp, qword ptr [rsp+64]
CrossInstruction43 LABEL BYTE
    mov rsi, qword ptr [rsp+72]
CrossInstruction44 LABEL BYTE
    mov rdi, qword ptr [rsp+80]
CrossInstruction45 LABEL BYTE
    mov r8, qword ptr [rsp+88]
CrossInstruction46 LABEL BYTE
    mov r9, qword ptr [rsp+96]
CrossInstruction47 LABEL BYTE
    mov r10, qword ptr [rsp+104]
CrossInstruction48 LABEL BYTE
    mov r11, qword ptr [rsp+112]
CrossInstruction49 LABEL BYTE
    mov r12, qword ptr [rsp+120]
CrossInstruction50 LABEL BYTE
    mov r13, qword ptr [rsp+128]
CrossInstruction51 LABEL BYTE
    mov r14, qword ptr [rsp+136]
CrossInstruction52 LABEL BYTE
    mov r15, qword ptr [rsp+144]
CrossInstruction53 LABEL BYTE
    add rsp, 3FF8h
GateRestore8 LABEL BYTE
CrossInstruction54 LABEL BYTE
    popfq
GateRestore0 LABEL BYTE
OwnedCrossReturnTrap LABEL BYTE
CrossInstruction55 LABEL BYTE
    int 3
OwnedCrossGateEnd LABEL BYTE
    int 3


PUBLIC OwnedCrossClobber
OwnedCrossClobber PROC FRAME
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
    mov eax, dword ptr [OwnedCrossXcr0]
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
    ldmxcsr dword ptr [OwnedCrossScratchMxcsr]
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
OwnedCrossClobber ENDP
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
    DD imagerel OwnedCrossGate, imagerel GateDepth8, imagerel Unwind0
    DD imagerel GateDepth8, imagerel GateDepth1000, imagerel Unwind8
    DD imagerel GateDepth1000, imagerel GateDepth2000, imagerel Unwind1000
    DD imagerel GateDepth2000, imagerel GateDepth3000, imagerel Unwind2000
    DD imagerel GateDepth3000, imagerel GateDepth4000, imagerel Unwind3000
    DD imagerel GateDepth4000, imagerel GateRestore8, imagerel Unwind4000
    DD imagerel GateRestore8, imagerel GateRestore0, imagerel Unwind8
    DD imagerel GateRestore0, imagerel OwnedCrossGateEnd, imagerel Unwind0
.pdata ENDS
END
