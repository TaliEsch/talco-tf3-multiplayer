; Owned cross-image fixture only. Cold frame lives in a separate DLL.
; Gate depth is 0x100: RFLAGS, 32-byte shadow, 15 GPR slots and padding.
; The single owner XSTATE buffer is precommitted outside the original stack.
OPTION DOTNAME
PUBLIC OwnedCrossGate, OwnedCrossGateEnd, OwnedCrossReturnTrap
PUBLIC OwnedCrossCases, OwnedCrossCaseCount
EXTERN OwnedCrossHelper:PROC
EXTERN OwnedCrossXcr0:QWORD, OwnedCrossScratchMxcsr:DWORD
EXTERN OwnedCrossOwnerXstate:QWORD
.const
OwnedCrossCases LABEL QWORD
    DQ OFFSET CrossInstruction0, 0
    DQ OFFSET CrossInstruction1, 8
    DQ OFFSET CrossInstruction2, 256
    DQ OFFSET CrossInstruction3, 256
    DQ OFFSET CrossInstruction4, 256
    DQ OFFSET CrossInstruction5, 256
    DQ OFFSET CrossInstruction6, 256
    DQ OFFSET CrossInstruction7, 256
    DQ OFFSET CrossInstruction8, 256
    DQ OFFSET CrossInstruction9, 256
    DQ OFFSET CrossInstruction10, 256
    DQ OFFSET CrossInstruction11, 256
    DQ OFFSET CrossInstruction12, 256
    DQ OFFSET CrossInstruction13, 256
    DQ OFFSET CrossInstruction14, 256
    DQ OFFSET CrossInstruction15, 256
    DQ OFFSET CrossInstruction16, 256
    DQ OFFSET CrossInstruction17, 256
    DQ OFFSET CrossInstruction18, 256
    DQ OFFSET CrossInstruction19, 256
    DQ OFFSET CrossInstruction20, 256
    DQ OFFSET CrossInstruction21, 256
    DQ OFFSET CrossInstruction22, 256
    DQ OFFSET CrossInstruction23, 256
    DQ OFFSET CrossInstruction24, 256
    DQ OFFSET CrossInstruction25, 256
    DQ OFFSET CrossInstruction26, 256
    DQ OFFSET CrossInstruction27, 256
    DQ OFFSET CrossInstruction28, 256
    DQ OFFSET CrossInstruction29, 256
    DQ OFFSET CrossInstruction30, 256
    DQ OFFSET CrossInstruction31, 256
    DQ OFFSET CrossInstruction32, 256
    DQ OFFSET CrossInstruction33, 256
    DQ OFFSET CrossInstruction34, 256
    DQ OFFSET CrossInstruction35, 256
    DQ OFFSET CrossInstruction36, 256
    DQ OFFSET CrossInstruction37, 256
    DQ OFFSET CrossInstruction38, 256
    DQ OFFSET CrossInstruction39, 256
    DQ OFFSET CrossInstruction40, 256
    DQ OFFSET CrossInstruction41, 256
    DQ OFFSET CrossInstruction42, 8
    DQ OFFSET CrossInstruction43, 0
OwnedCrossCaseCount DQ 44
.code
OwnedCrossGate LABEL BYTE
CrossInstruction0 LABEL BYTE
    pushfq
GateDepth8 LABEL BYTE
CrossInstruction1 LABEL BYTE
    sub rsp, 0F8h
GateDepth100 LABEL BYTE
CrossInstruction2 LABEL BYTE
    cld
CrossInstruction3 LABEL BYTE
    mov qword ptr [rsp+32], rax
CrossInstruction4 LABEL BYTE
    mov qword ptr [rsp+40], rcx
CrossInstruction5 LABEL BYTE
    mov qword ptr [rsp+48], rdx
CrossInstruction6 LABEL BYTE
    mov qword ptr [rsp+56], rbx
CrossInstruction7 LABEL BYTE
    mov qword ptr [rsp+64], rbp
CrossInstruction8 LABEL BYTE
    mov qword ptr [rsp+72], rsi
CrossInstruction9 LABEL BYTE
    mov qword ptr [rsp+80], rdi
CrossInstruction10 LABEL BYTE
    mov qword ptr [rsp+88], r8
CrossInstruction11 LABEL BYTE
    mov qword ptr [rsp+96], r9
CrossInstruction12 LABEL BYTE
    mov qword ptr [rsp+104], r10
CrossInstruction13 LABEL BYTE
    mov qword ptr [rsp+112], r11
CrossInstruction14 LABEL BYTE
    mov qword ptr [rsp+120], r12
CrossInstruction15 LABEL BYTE
    mov qword ptr [rsp+128], r13
CrossInstruction16 LABEL BYTE
    mov qword ptr [rsp+136], r14
CrossInstruction17 LABEL BYTE
    mov qword ptr [rsp+144], r15
CrossInstruction18 LABEL BYTE
    mov rbx, qword ptr [OwnedCrossOwnerXstate]
CrossInstruction19 LABEL BYTE
    mov eax, dword ptr [OwnedCrossXcr0]
CrossInstruction20 LABEL BYTE
    mov edx, dword ptr [OwnedCrossXcr0+4]
CrossInstruction21 LABEL BYTE
    xsave64 [rbx]
CrossInstruction22 LABEL BYTE
    call OwnedCrossHelper
CrossInstruction23 LABEL BYTE
    mov eax, dword ptr [OwnedCrossXcr0]
CrossInstruction24 LABEL BYTE
    mov edx, dword ptr [OwnedCrossXcr0+4]
CrossInstruction25 LABEL BYTE
    xrstor64 [rbx]
CrossInstruction26 LABEL BYTE
    mov rax, qword ptr [rsp+32]
CrossInstruction27 LABEL BYTE
    mov rcx, qword ptr [rsp+40]
CrossInstruction28 LABEL BYTE
    mov rdx, qword ptr [rsp+48]
CrossInstruction29 LABEL BYTE
    mov rbx, qword ptr [rsp+56]
CrossInstruction30 LABEL BYTE
    mov rbp, qword ptr [rsp+64]
CrossInstruction31 LABEL BYTE
    mov rsi, qword ptr [rsp+72]
CrossInstruction32 LABEL BYTE
    mov rdi, qword ptr [rsp+80]
CrossInstruction33 LABEL BYTE
    mov r8, qword ptr [rsp+88]
CrossInstruction34 LABEL BYTE
    mov r9, qword ptr [rsp+96]
CrossInstruction35 LABEL BYTE
    mov r10, qword ptr [rsp+104]
CrossInstruction36 LABEL BYTE
    mov r11, qword ptr [rsp+112]
CrossInstruction37 LABEL BYTE
    mov r12, qword ptr [rsp+120]
CrossInstruction38 LABEL BYTE
    mov r13, qword ptr [rsp+128]
CrossInstruction39 LABEL BYTE
    mov r14, qword ptr [rsp+136]
CrossInstruction40 LABEL BYTE
    mov r15, qword ptr [rsp+144]
CrossInstruction41 LABEL BYTE
    add rsp, 0F8h
GateRestore8 LABEL BYTE
CrossInstruction42 LABEL BYTE
    popfq
GateRestore0 LABEL BYTE
OwnedCrossReturnTrap LABEL BYTE
CrossInstruction43 LABEL BYTE
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

Unwind256 LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD (256+020h)
    DB 0, 0F4h
    DW (256+030h)/8
    DB 0, 0D4h
    DW (256+038h)/8
    DB 0, 0C4h
    DW (256+040h)/8
    DB 0, 0E4h
    DW (256+048h)/8
    DB 0, 054h
    DW (256+050h)/8
    DB 0, 034h
    DW (256+060h)/8
    DB 0, 064h
    DW (256+068h)/8
    DB 0, 074h
    DW (256+070h)/8
    DB 0, 001h
    DW (256+058h)/8
    DW 0

.xdata ENDS
.pdata SEGMENT READONLY
ALIGN 4
    DD imagerel OwnedCrossGate, imagerel GateDepth8, imagerel Unwind0
    DD imagerel GateDepth8, imagerel GateDepth100, imagerel Unwind8
    DD imagerel GateDepth100, imagerel GateRestore8, imagerel Unwind256
    DD imagerel GateRestore8, imagerel GateRestore0, imagerel Unwind8
    DD imagerel GateRestore0, imagerel OwnedCrossGateEnd, imagerel Unwind0
.pdata ENDS
END
