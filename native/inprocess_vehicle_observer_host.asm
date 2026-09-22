option casemap:none
.code

PUBLIC OwnedVehicleFactorySite
PUBLIC OwnedVehicleFactoryPostSite
PUBLIC OwnedVehicleAdmissionSite
PUBLIC OwnedVehicleFactoryExecute
PUBLIC OwnedVehicleAdmissionExecute

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

; RCX entry pointer. Preserve nonvolatile RBX and return the emulated RDX.
OwnedVehicleAdmissionExecute PROC FRAME
    push rbx
    .pushreg rbx
    .endprolog
    mov rbx, rcx
OwnedVehicleAdmissionSite LABEL BYTE
    mov rdx, rbx
    mov rax, rdx
    pop rbx
    ret
OwnedVehicleAdmissionExecute ENDP

END
