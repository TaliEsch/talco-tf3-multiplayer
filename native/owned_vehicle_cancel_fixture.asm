option casemap:none
.code

PUBLIC OwnedVehicleCancelMovSite
PUBLIC OwnedVehicleCancelExecute

; Owned-only representation of the observed candidate boundary shape:
;   mov rdx, rbx
;   call qword ptr [rax+10h]
; The fixture VEH keeps RDX (the entry) intact and may substitute RCX with a
; validated callback implementation and RAX with that implementation's vtable.
; R8 remains the callback value (whose implementation is at +38h) and R9 is
; the progress pair.  It never changes the following indirect CALL.
OwnedVehicleCancelExecute PROC FRAME
    push rbx
    .pushreg rbx
    sub rsp, 20h
    .allocstack 20h
    .endprolog
    mov rbx, rdx
    ; Deliberately make incoming RDX wrong.  The fixture must demonstrate that
    ; the VEH emulates the replaced MOV rather than inheriting a lucky value.
    xor rdx, rdx
    ; Fifth ABI argument: original submission vtable.  The return address plus
    ; four argument home slots precedes it; after this frame it is at +50h.
    mov rax, qword ptr [rsp+50h]
OwnedVehicleCancelMovSite LABEL BYTE
    mov rdx, rbx
    call qword ptr [rax+10h]
    add rsp, 20h
    pop rbx
    ret
OwnedVehicleCancelExecute ENDP

END
