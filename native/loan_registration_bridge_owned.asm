PUBLIC LoanOwnedStockRegistration
EXTERN LoanOwnedStockRegistrationBridge:PROC
.code
; A genuine owned CALL frame with unwind metadata. Forward RCX/RDX/R8 intact
; and retain the callee's original AL result through the ordinary return.
LoanOwnedStockRegistration PROC FRAME
    sub rsp,28h
    .allocstack 28h
    .endprolog
    call LoanOwnedStockRegistrationBridge
    add rsp,28h
    ret
LoanOwnedStockRegistration ENDP
END
