option casemap:none
.code

PUBLIC OwnedVehicleFactorySite
PUBLIC OwnedVehicleFactoryPostSite
PUBLIC OwnedVehicleAdmissionSite
PUBLIC OwnedVehicleCallbackTailSite
PUBLIC OwnedVehicleFactoryExecute
PUBLIC OwnedVehicleAdmissionExecute
PUBLIC OwnedVehicleCallbackExecute
PUBLIC OwnedVehicleSendReturnSite
PUBLIC OwnedVehicleMarshalerReturnSite
PUBLIC OwnedVehicleMarshalerExecute
PUBLIC OwnedVehiclePostSendBodySite
PUBLIC OwnedVehiclePostSendBodyExecute

; RCX is ignored, RDX ignored, R8D entity, R9B stopped. The observed MOV must
; leave RBX equal to zero-extended R8D without changing arithmetic flags.
OwnedVehicleFactoryExecute PROC FRAME
    push rbx
    .pushreg rbx
    push rdi
    .pushreg rdi
    .endprolog
    mov rdi, 0
OwnedVehicleFactorySite LABEL BYTE
    mov ebx, r8d
    mov rdi, rcx
OwnedVehicleFactoryPostSite LABEL BYTE
    nop
    mov eax, ebx
    pop rdi
    pop rbx
    ret
OwnedVehicleFactoryExecute ENDP

; RCX entry pointer, RDX implementation, R8 callback value. Preserve RBX and
; make the observed admission context match the production ABI registers.
OwnedVehicleAdmissionExecute PROC FRAME
    push rbx
    .pushreg rbx
    ; Match the exact native body depth: seven pushes + 140h allocation.
    ; One saved register + 170h is the same 178h below entry RSP.
    sub rsp, 170h
    .allocstack 170h
    .endprolog
    mov rbx, rcx
    mov rcx, rdx
OwnedVehicleAdmissionSite LABEL BYTE
    mov rdx, rbx
    call OwnedVehicleAdmissionAdapter
OwnedVehicleSendReturnSite LABEL BYTE
    nop
    add rsp, 170h
    pop rbx
    ret
OwnedVehicleAdmissionExecute ENDP

; Mirrors e17833 CALL e26870 followed by e17838 NOP. The observed NOP is
; reached only when the complete send body, including its native cleanup,
; returns normally.
OwnedVehiclePostSendBodyExecute PROC FRAME
    sub rsp, 28h
    .allocstack 28h
    .endprolog
    call OwnedVehicleAdmissionExecute
OwnedVehiclePostSendBodySite LABEL BYTE
    nop
    add rsp, 28h
    ret
OwnedVehiclePostSendBodyExecute ENDP

OwnedVehicleAdmissionAdapter PROC
    mov rax, rdx
    ret
OwnedVehicleAdmissionAdapter ENDP

; Mirrors the wrapper's nonvolatile pack register and its post-CALL NOP.
; RCX points to {unused, entry, unused}; RDX is returned untouched.
OwnedVehicleMarshalerExecute PROC FRAME
    push rbx
    .pushreg rbx
    sub rsp, 20h
    .allocstack 20h
    .endprolog
    mov rbx, rcx
    call OwnedVehicleAdmissionAdapter
OwnedVehicleMarshalerReturnSite LABEL BYTE
    nop
    add rsp, 20h
    pop rbx
    ret
OwnedVehicleMarshalerExecute ENDP

; The exact callback entry performs ADD RCX,8 then tail-jumps.  The observer
; traps the JMP, preserving all state and sending RIP to this continuation.
OwnedVehicleCallbackExecute PROC FRAME
    .endprolog
    add rcx, 8
OwnedVehicleCallbackTailSite LABEL BYTE
    jmp NEAR PTR OwnedVehicleCallbackContinuation
OwnedVehicleCallbackContinuation:
    mov rax, rcx
    ret
OwnedVehicleCallbackExecute ENDP

END
