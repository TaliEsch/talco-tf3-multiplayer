; Negative qualification ONLY. This is an ordinary called function, never an
; executable continuation gate. The host also asks RtlVirtualUnwind to inspect
; this function's real MASM metadata against two owned, synthetic stack shapes.
; No VEH, hook, synthetic return, or redirection is installed or executed.
PUBLIC OwnedConventionalFrameProbe
PUBLIC OwnedConventionalFrameBody
.code
OwnedConventionalFrameProbe PROC FRAME
    sub rsp, 28h
    .allocstack 28h
    .endprolog
OwnedConventionalFrameBody LABEL BYTE
    nop
    mov eax, 1
    add rsp, 28h
    ret
OwnedConventionalFrameProbe ENDP
END
