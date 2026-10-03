OPTION CASEMAP:NONE
PUBLIC LoanPatchOwnedSite
PUBLIC LoanPatchOwnedCallsite
PUBLIC LoanPatchOwnedTestCall
PUBLIC LoanPatchOwnedBreak
PUBLIC LoanPatchOwnedWrapper
EXTERN LoanPatchOwnedOriginal:PROC
EXTERN LoanPatchOwnedWrapperBody:PROC
.code
; The label denotes exactly the five-byte direct E8 rel32 instruction.
LoanPatchOwnedSite PROC FRAME
    sub rsp,28h
    .allocstack 28h
    .endprolog
LoanPatchOwnedCallsite LABEL BYTE
    call LoanPatchOwnedOriginal
    add rsp,28h
    ret
LoanPatchOwnedSite ENDP

; A normal caller verifies AL and all nonvolatile GPRs it seeds.
LoanPatchOwnedTestCall PROC FRAME
    push rbx
    .pushreg rbx
    push rbp
    .pushreg rbp
    push rsi
    .pushreg rsi
    push rdi
    .pushreg rdi
    push r12
    .pushreg r12
    push r13
    .pushreg r13
    push r14
    .pushreg r14
    push r15
    .pushreg r15
    sub rsp,28h
    .allocstack 28h
    .endprolog
    mov rbx,11111111h
    mov rbp,08888888h
    mov rsi,22222222h
    mov rdi,33333333h
    mov r12,44444444h
    mov r13,55555555h
    mov r14,66666666h
    mov r15,77777777h
    call LoanPatchOwnedSite
    cmp al,1
    jne bad
    cmp rbx,11111111h
    jne bad
    cmp rbp,08888888h
    jne bad
    cmp rsi,22222222h
    jne bad
    cmp rdi,33333333h
    jne bad
    cmp r12,44444444h
    jne bad
    cmp r13,55555555h
    jne bad
    cmp r14,66666666h
    jne bad
    cmp r15,77777777h
    jne bad
    mov eax,1
    jmp done
bad:
    xor eax,eax
done:
    add rsp,28h
    pop r15
    pop r14
    pop r13
    pop r12
    pop rdi
    pop rsi
    pop rbp
    pop rbx
    ret
LoanPatchOwnedTestCall ENDP
LoanPatchOwnedBreak PROC
    int 3
    ret
LoanPatchOwnedBreak ENDP
; Keep the replacement target separated from the original by more than one
; displacement byte so an interrupted prefix is neither complete CALL.
    db 1024 dup (90h)
LoanPatchOwnedWrapper PROC FRAME
    sub rsp,28h
    .allocstack 28h
    .endprolog
    call LoanPatchOwnedWrapperBody
    add rsp,28h
    ret
LoanPatchOwnedWrapper ENDP
END
