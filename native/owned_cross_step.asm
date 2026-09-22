; Owned cross-image fixture only. Step-shaped caller lives in the EXE.
OPTION DOTNAME
PUBLIC OwnedCrossStep, OwnedCrossTrap, OwnedCrossResume
EXTERN OwnedCrossXcr0:QWORD
EXTERN OwnedCrossBeforeGpr:BYTE, OwnedCrossAfterGpr:BYTE
EXTERN OwnedCrossBeforeXstate:BYTE, OwnedCrossAfterXstate:BYTE
EXTERN OwnedCrossEntryXstate:BYTE, OwnedCrossPatterns:BYTE
EXTERN OwnedCrossSeedR15:QWORD, OwnedCrossSeedFlags:QWORD
.code
OwnedCrossStep PROC FRAME
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
    mov eax, dword ptr [OwnedCrossXcr0]
    mov edx, dword ptr [OwnedCrossXcr0+4]
    xsave64 [OwnedCrossEntryXstate]
    vmovdqu ymm0, ymmword ptr [OwnedCrossPatterns]
    vmovdqu ymm1, ymmword ptr [OwnedCrossPatterns+32]
    vmovdqu ymm2, ymmword ptr [OwnedCrossPatterns+64]
    vmovdqu ymm3, ymmword ptr [OwnedCrossPatterns+96]
    vmovdqu ymm4, ymmword ptr [OwnedCrossPatterns+128]
    vmovdqu ymm5, ymmword ptr [OwnedCrossPatterns+160]
    vmovdqu ymm6, ymmword ptr [OwnedCrossPatterns+192]
    mov eax, dword ptr [OwnedCrossXcr0]
    and eax, 0E0h
    cmp eax, 0E0h
    jne SeedWithoutAvx512
    vmovdqu64 zmm0, zmmword ptr [OwnedCrossPatterns]
    vmovdqu64 zmm6, zmmword ptr [OwnedCrossPatterns+192]
    vmovdqu64 zmm16, zmmword ptr [OwnedCrossPatterns+256]
    vmovdqu64 zmm31, zmmword ptr [OwnedCrossPatterns+320]
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
    mov r15, qword ptr [OwnedCrossSeedR15]
    push qword ptr [OwnedCrossSeedFlags]
    popfq
    inc r15d
    mov qword ptr [OwnedCrossBeforeGpr+0], rax
    mov qword ptr [OwnedCrossBeforeGpr+8], rcx
    mov qword ptr [OwnedCrossBeforeGpr+16], rdx
    mov qword ptr [OwnedCrossBeforeGpr+24], rbx
    mov qword ptr [OwnedCrossBeforeGpr+32], rbp
    mov qword ptr [OwnedCrossBeforeGpr+40], rsi
    mov qword ptr [OwnedCrossBeforeGpr+48], rdi
    mov qword ptr [OwnedCrossBeforeGpr+56], r8
    mov qword ptr [OwnedCrossBeforeGpr+64], r9
    mov qword ptr [OwnedCrossBeforeGpr+72], r10
    mov qword ptr [OwnedCrossBeforeGpr+80], r11
    mov qword ptr [OwnedCrossBeforeGpr+88], r12
    mov qword ptr [OwnedCrossBeforeGpr+96], r13
    mov qword ptr [OwnedCrossBeforeGpr+104], r14
    mov qword ptr [OwnedCrossBeforeGpr+112], r15
    mov qword ptr [OwnedCrossBeforeGpr+120], rsp
    pushfq
    pop qword ptr [OwnedCrossBeforeGpr+128]
    mov eax, dword ptr [OwnedCrossXcr0]
    mov edx, dword ptr [OwnedCrossXcr0+4]
    xsave64 [OwnedCrossBeforeXstate]
    mov rax, qword ptr [OwnedCrossBeforeGpr]
    mov rdx, qword ptr [OwnedCrossBeforeGpr+16]
OwnedCrossTrap LABEL BYTE
    int 3
OwnedCrossResume LABEL BYTE
    mov qword ptr [OwnedCrossAfterGpr+0], rax
    mov qword ptr [OwnedCrossAfterGpr+8], rcx
    mov qword ptr [OwnedCrossAfterGpr+16], rdx
    mov qword ptr [OwnedCrossAfterGpr+24], rbx
    mov qword ptr [OwnedCrossAfterGpr+32], rbp
    mov qword ptr [OwnedCrossAfterGpr+40], rsi
    mov qword ptr [OwnedCrossAfterGpr+48], rdi
    mov qword ptr [OwnedCrossAfterGpr+56], r8
    mov qword ptr [OwnedCrossAfterGpr+64], r9
    mov qword ptr [OwnedCrossAfterGpr+72], r10
    mov qword ptr [OwnedCrossAfterGpr+80], r11
    mov qword ptr [OwnedCrossAfterGpr+88], r12
    mov qword ptr [OwnedCrossAfterGpr+96], r13
    mov qword ptr [OwnedCrossAfterGpr+104], r14
    mov qword ptr [OwnedCrossAfterGpr+112], r15
    mov qword ptr [OwnedCrossAfterGpr+120], rsp
    pushfq
    pop qword ptr [OwnedCrossAfterGpr+128]
    cld
    mov eax, dword ptr [OwnedCrossXcr0]
    mov edx, dword ptr [OwnedCrossXcr0+4]
    xsave64 [OwnedCrossAfterXstate]
    mov eax, dword ptr [OwnedCrossXcr0]
    mov edx, dword ptr [OwnedCrossXcr0+4]
    xrstor64 [OwnedCrossEntryXstate]
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
OwnedCrossStep ENDP
END
