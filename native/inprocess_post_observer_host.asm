; Owned-process fixture only. The 12 bytes and branch displacement match the
; audited post site, but this fixture has no relationship to game semantics.
PUBLIC OwnedPostSite
PUBLIC OwnedPostExecute
PUBLIC OwnedIncrementReference
.code
OwnedPostExecute PROC FRAME
    push r15
    .pushreg r15
    push r12
    .pushreg r12
    .endprolog
    mov r15, rcx
    mov r12d, edx
fixture_loop:
    REPT 193
    nop
    ENDM
OwnedPostSite LABEL BYTE
    DB 041h, 0ffh, 0c7h, 045h, 03bh, 0fch, 00fh, 08ch, 033h, 0ffh, 0ffh, 0ffh
    mov eax, r15d
    pop r12
    pop r15
    ret
OwnedPostExecute ENDP

; uint64 input, uint64 valid user flags, uint64 output[2]
OwnedIncrementReference PROC FRAME
    push r15
    .pushreg r15
    .endprolog
    mov r15, rcx
    push rdx
    popfq
    inc r15d
    pushfq
    pop rax
    mov qword ptr [r8], r15
    mov qword ptr [r8+8], rax
    pop r15
    ret
OwnedIncrementReference ENDP
END
