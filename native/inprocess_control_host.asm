; Link-only owned-fixture marker. It has no TF3 relationship and performs no
; interception. Keeping the fixture's boundary explicitly separate from an
; eventual ABI adapter prevents this harness from implying a game hook exists.
PUBLIC OwnedControlBoundaryMarker
.code
OwnedControlBoundaryMarker PROC
    ret
OwnedControlBoundaryMarker ENDP
END
