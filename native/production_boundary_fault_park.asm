; Nonreturning production-boundary failure target. It is entered with the
; audited TF3 Step body RSP, so its runtime function uses that interrupted
; frame's save offsets rather than a leaf-function unwind description.
OPTION DOTNAME
PUBLIC ProductionBoundaryFaultPark, ProductionBoundaryFaultParkEnd
.code
ProductionBoundaryFaultPark LABEL BYTE
FaultLoop:
    pause
    jmp FaultLoop
ProductionBoundaryFaultParkEnd LABEL BYTE

.xdata SEGMENT READONLY
ALIGN 4
FaultUnwind LABEL BYTE
    DB 1, 0, 21, 0
    DB 0, 069h
    DD 020h
    DB 0, 0F4h
    DW 030h/8
    DB 0, 0D4h
    DW 038h/8
    DB 0, 0C4h
    DW 040h/8
    DB 0, 0E4h
    DW 048h/8
    DB 0, 054h
    DW 050h/8
    DB 0, 034h
    DW 060h/8
    DB 0, 064h
    DW 068h/8
    DB 0, 074h
    DW 070h/8
    DB 0, 001h
    DW 058h/8
    DW 0
.xdata ENDS

.pdata SEGMENT READONLY
    DD imagerel ProductionBoundaryFaultPark
    DD imagerel ProductionBoundaryFaultParkEnd
    DD imagerel FaultUnwind
.pdata ENDS
END
