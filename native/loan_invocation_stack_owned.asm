; Owned current-thread call frames only. No TF3 code or hook.
PUBLIC LoanOwnedInvocation, LoanOwnedInvocationReturn, LoanOwnedInvocationEnd
PUBLIC LoanOwnedUnregistered
EXTERN LoanOwnedCallback:PROC
EXTERN LoanOwnedMissingMetadataCallback:PROC
.code
LoanOwnedInvocation PROC FRAME
    push rbp
    .pushreg rbp
    push r13
    .pushreg r13
    sub rsp,128h
    .allocstack 128h
    .endprolog
    ; Match the observed body relation and keep the wrapper outside the
    ; callback's Windows home area, which a nested C++ call may overwrite.
    lea rbp,[rsp+100h]
    mov r13,rcx
    mov [rbp-80h],rdx
    call LoanOwnedCallback
LoanOwnedInvocationReturn LABEL BYTE
    nop
    add rsp,128h
    pop r13
    pop rbp
    ret
LoanOwnedInvocationEnd LABEL BYTE
LoanOwnedInvocation ENDP
; Deliberately omit unwind metadata. The walker must reject this frame rather
; than scan its stack and eventually find an older qualified invocation.
LoanOwnedUnregistered PROC
    sub rsp,28h
    call LoanOwnedMissingMetadataCallback
    add rsp,28h
    ret
LoanOwnedUnregistered ENDP
END
