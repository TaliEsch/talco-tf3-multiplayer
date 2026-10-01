; Owned-process reproduction of the 40408 common-exit stack contract only.
; This contains no game address, patcher, loader or activation entry point.
OPTION DOTNAME
PUBLIC CommonExitFixtureStep, CommonExitFixtureTrap, CommonExitFixtureResume
PUBLIC CommonExitFixtureSeededStep
EXTERN CommonExitExpectedRbx:QWORD, CommonExitExpectedRbp:QWORD
EXTERN CommonExitExpectedR12:QWORD, CommonExitExpectedR13:QWORD
EXTERN CommonExitExpectedR14:QWORD, CommonExitExpectedRsp:QWORD
EXTERN CommonExitExpectedRip:QWORD, CommonExitIterations:QWORD
EXTERN CommonExitExpectedRsi:QWORD, CommonExitExpectedRdi:QWORD
EXTERN CommonExitExpectedR15:QWORD, CommonExitExpectedXmm6:BYTE
.code
CommonExitFixtureSeededStep PROC FRAME
    push r12
    .pushreg r12
    sub rsp,20h
    .allocstack 20h
    .endprolog
    mov r12,1122334455667788h
    call CommonExitFixtureStep
    add rsp,20h
    pop r12
    ret
CommonExitFixtureSeededStep ENDP
CommonExitFixtureStep PROC FRAME
    ; At this synthetic function entry, preserve the expected caller context.
    mov CommonExitExpectedRbx,rbx
    mov CommonExitExpectedRbp,rbp
    mov CommonExitExpectedR12,r12
    mov CommonExitExpectedR13,r13
    mov CommonExitExpectedR14,r14
    mov CommonExitExpectedRsi,rsi
    mov CommonExitExpectedRdi,rdi
    mov CommonExitExpectedR15,r15
    movdqu xmmword ptr [CommonExitExpectedXmm6],xmm6
    lea rax,[rsp+8]
    mov CommonExitExpectedRsp,rax
    mov rax,[rsp]
    mov CommonExitExpectedRip,rax
    ; Collapsed equivalent of the target's common chained unwind frame.
    sub rsp,58h
    .allocstack 58h
    mov [rsp+60h],rbx
    .savereg rbx,60h
    mov [rsp+50h],rbp
    .savereg rbp,50h
    mov [rsp+48h],r14
    .savereg r14,48h
    mov [rsp+40h],r12
    .savereg r12,40h
    mov [rsp+38h],r13
    .savereg r13,38h
    .endprolog
    mov r12,rcx
    mov qword ptr [CommonExitIterations],0
    test r12d,r12d
    jz CommonExitFixtureReached
    ; The running path alone saves these registers; they are restored before
    ; the common exit. The paused path must not read these uninitialized slots.
    mov [rsp+68h],rsi
    mov [rsp+70h],rdi
    mov [rsp+30h],r15
    movdqa xmmword ptr [rsp+20h],xmm6
    mov rsi,0a1a2a3a4a5a6a7a8h
    mov rdi,0b1b2b3b4b5b6b7b8h
    mov r15,0c1c2c3c4c5c6c7c8h
    pxor xmm6,xmm6
CommonExitFixtureLoop:
    inc qword ptr [CommonExitIterations]
    dec r12d
    jnz CommonExitFixtureLoop
    mov rsi,[rsp+68h]
    mov rdi,[rsp+70h]
    mov r15,[rsp+30h]
    movdqa xmm6,xmmword ptr [rsp+20h]
CommonExitFixtureReached:
CommonExitFixtureTrap LABEL BYTE
    ; Original instruction: 4C 8B 64 24 40 (MOV R12,[RSP+40h]).
    ; This fixture owns INT3 as its first byte from assembly time.
    int 3
    db 08bh,064h,024h,040h
CommonExitFixtureResume LABEL BYTE
    mov rbx,[rsp+60h]
    mov r13,[rsp+38h]
    mov rax,CommonExitIterations
    add rsp,48h
    pop r14
    pop rbp
    ret
CommonExitFixtureStep ENDP
END
