option casemap:none
.code
PUBLIC FixtureTrapSite
PUBLIC FixtureLoadReturn
FixtureLoadReturn PROC
    push r14
    mov r14, rcx
FixtureTrapSite LABEL BYTE
    xor r14d, r14d
    mov eax, DWORD PTR [rcx+020ch]
    pop r14
    ret
FixtureLoadReturn ENDP
END
