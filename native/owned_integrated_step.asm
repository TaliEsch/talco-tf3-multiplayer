; Owned integration fixture with the audited TF3 Step frame shape.
OPTION DOTNAME
PUBLIC OwnedIntegratedStep, OwnedIntegratedTrap, OwnedIntegratedResume
PUBLIC OwnedIntegratedFaultPark
EXTERN OwnedIntegratedSeedR15:QWORD
EXTERN OwnedIntegratedFaultArrived:DWORD
EXTERN OwnedIntegratedBeforeXstate:BYTE
EXTERN OwnedIntegratedAfterXstate:BYTE
EXTERN OwnedIntegratedScratchRax:QWORD
EXTERN OwnedIntegratedScratchRdx:QWORD
EXTERN OwnedCrossXcr0:QWORD
.code
OwnedIntegratedStep PROC FRAME
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
    mov r15, qword ptr [OwnedIntegratedSeedR15]
    mov qword ptr [OwnedIntegratedScratchRax], rax
    mov qword ptr [OwnedIntegratedScratchRdx], rdx
    mov eax, dword ptr [OwnedCrossXcr0]
    mov edx, dword ptr [OwnedCrossXcr0+4]
    xsave64 [OwnedIntegratedBeforeXstate]
    mov rax, qword ptr [OwnedIntegratedScratchRax]
    mov rdx, qword ptr [OwnedIntegratedScratchRdx]
OwnedIntegratedTrap LABEL BYTE
    int 3                         ; patched first byte of 41 FF C7 (INC r15d)
    db 0ffh, 0c7h                 ; remaining bytes are skipped by the VEH
OwnedIntegratedResume LABEL BYTE
    mov qword ptr [OwnedIntegratedScratchRax], rax
    mov qword ptr [OwnedIntegratedScratchRdx], rdx
    mov eax, dword ptr [OwnedCrossXcr0]
    mov edx, dword ptr [OwnedCrossXcr0+4]
    xsave64 [OwnedIntegratedAfterXstate]
    mov rax, qword ptr [OwnedIntegratedScratchRax]
    mov rdx, qword ptr [OwnedIntegratedScratchRdx]
    mov rax, r15
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
OwnedIntegratedStep ENDP

; A foreign thread must never overwrite the owner's single XSTATE buffer or
; cross the held boundary. It is redirected to this nonreturning leaf.
OwnedIntegratedFaultPark PROC
    mov dword ptr [OwnedIntegratedFaultArrived], 1
FaultParkLoop:
    pause
    jmp FaultParkLoop
OwnedIntegratedFaultPark ENDP
OwnedIntegratedFaultParkEnd LABEL BYTE

.xdata SEGMENT READONLY
ALIGN 4
IntegratedFaultUnwind LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD 020h
    DB 0, 0F4h
    DW 030h/8
    DB 0, 0D4h
    DW 038h/8
    DB 0, 0C4h
    DW 040h/8
    DB 0, 0E4h
    DW 048h/8
    DB 0, 054h
    DW 050h/8
    DB 0, 034h
    DW 060h/8
    DB 0, 064h
    DW 068h/8
    DB 0, 074h
    DW 070h/8
    DB 0, 001h
    DW 058h/8
    DW 0
.xdata ENDS

.pdata SEGMENT READONLY
    DD imagerel OwnedIntegratedFaultPark
    DD imagerel OwnedIntegratedFaultParkEnd
    DD imagerel IntegratedFaultUnwind
.pdata ENDS
END
