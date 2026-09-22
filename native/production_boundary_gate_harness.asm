OPTION DOTNAME
PUBLIC ProductionHarnessStep, ProductionHarnessTrap, ProductionHarnessResume
EXTERN ProductionHarnessSeed:QWORD
.code
ProductionHarnessStep PROC FRAME
 mov [rsp+8],rbx
 .savereg rbx,8
 mov [rsp+10h],rsi
 .savereg rsi,10h
 mov [rsp+18h],rdi
 .savereg rdi,18h
 push rbp
 .pushreg rbp
 push r14
 .pushreg r14
 sub rsp,48h
 .allocstack 48h
 movdqa [rsp+20h],xmm6
 .savexmm128 xmm6,20h
 mov [rsp+30h],r15
 .savereg r15,30h
 mov [rsp+38h],r13
 .savereg r13,38h
 mov [rsp+40h],r12
 .savereg r12,40h
 .endprolog
 mov r15,qword ptr [ProductionHarnessSeed]
ProductionHarnessTrap LABEL BYTE
 int 3
 db 0ffh,0c7h
ProductionHarnessResume LABEL BYTE
 mov rax,r15
 movdqa xmm6,[rsp+20h]
 mov r15,[rsp+30h]
 mov r13,[rsp+38h]
 mov r12,[rsp+40h]
 mov rbx,[rsp+60h]
 mov rsi,[rsp+68h]
 mov rdi,[rsp+70h]
 add rsp,48h
 pop r14
 pop rbp
 ret
ProductionHarnessStep ENDP
END
