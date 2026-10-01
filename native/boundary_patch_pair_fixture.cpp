#include "boundary_patch_pair.h"
#include <windows.h>
#include <iostream>

namespace {
unsigned char* fault_address=nullptr;
bool fail_writable_once=false,fail_flush_once=false,fail_flush_all=false,fail_rx_all=false;
BOOL WINAPI Protect(LPVOID address,SIZE_T size,DWORD protection,PDWORD old) {
    if (address==fault_address && ((fail_writable_once && protection==PAGE_EXECUTE_READWRITE) ||
            (fail_rx_all && protection==PAGE_EXECUTE_READ))) {
        fail_writable_once=false; SetLastError(ERROR_ACCESS_DENIED); return FALSE;
    }
    return VirtualProtect(address,size,protection,old);
}
BOOL WINAPI Flush(HANDLE process,LPCVOID address,SIZE_T size) {
    if (address==fault_address && (fail_flush_once || fail_flush_all)) {
        fail_flush_once=false; SetLastError(ERROR_ACCESS_DENIED); return FALSE;
    }
    return FlushInstructionCache(process,address,size);
}
struct Page {
    unsigned char* data;
    Page() : data(static_cast<unsigned char*>(VirtualAlloc(nullptr,4096,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE))) {
        if (!data) ExitProcess(10);
        data[16]=0x41; data[64]=0x4c;
        DWORD old=0; if (!VirtualProtect(data,4096,PAGE_EXECUTE_READ,&old)) ExitProcess(11);
    }
    ~Page() { VirtualFree(data,0,MEM_RELEASE); }
    bool Rx() const { MEMORY_BASIC_INFORMATION info{}; return VirtualQuery(data,&info,sizeof(info))==sizeof(info) && info.Protect==PAGE_EXECUTE_READ; }
    void Foreign(unsigned char value) {
        DWORD old=0,ignored=0;
        if (!VirtualProtect(data,4096,PAGE_EXECUTE_READWRITE,&old)) ExitProcess(12);
        data[64]=value;
        if (!VirtualProtect(data,4096,old,&ignored)) ExitProcess(13);
    }
};
const tf3boundarypair::OwnedOperations ops{Protect,Flush};
void Reset(unsigned char* address) {
    fault_address=address; fail_writable_once=false; fail_flush_once=false;
    fail_flush_all=false; fail_rx_all=false;
}
bool Normal() {
    Page page; Reset(page.data+64);
    tf3boundarypair::Pair pair(page.data+16,page.data+64,ops);
    const auto started=pair.Install(); const auto both=pair.Read();
    const bool installed=started.started && both.installed && both.step.owns_byte && both.common.owns_byte &&
        page.data[16]==0xcc && page.data[64]==0xcc && page.Rx();
    const bool restored=pair.Restore() && pair.Read().clean && page.data[16]==0x41 && page.data[64]==0x4c && page.Rx();
    return installed && restored && pair.Restore() && !pair.Install().started;
}
bool Partial(bool after_cas) {
    Page page; Reset(page.data+64);
    if (after_cas) fail_flush_once=true; else fail_writable_once=true;
    tf3boundarypair::Pair pair(page.data+16,page.data+64,ops);
    const auto result=pair.Install();
    const auto expected=after_cas ? tf3boundarypair::Status::flush_failed : tf3boundarypair::Status::protection_failed;
    return !result.started && result.cause==expected && result.cleanup_confirmed && pair.Read().clean &&
        page.data[16]==0x41 && page.data[64]==0x4c && page.Rx();
}
bool Foreign() {
    Page page; Reset(page.data+64);
    tf3boundarypair::Pair pair(page.data+16,page.data+64,ops);
    if (!pair.Install().started) return false;
    page.Foreign(0x90);
    const bool refused=!pair.Restore() && pair.Read().common.foreign_observed && !pair.Read().common.owns_byte &&
        page.data[64]==0x90 && page.data[16]==0x41 && !pair.Read().clean;
    page.Foreign(0xcc);
    return refused && !pair.Restore() && page.data[64]==0xcc && !pair.Install().started;
}
bool Pending(bool protection) {
    Page page; Reset(page.data+64);
    tf3boundarypair::Pair pair(page.data+16,page.data+64,ops);
    if (!pair.Install().started) return false;
    if (protection) fail_rx_all=true; else fail_flush_all=true;
    const bool refused=!pair.Restore();
    const auto snapshot=pair.Read();
    const bool retained=protection ? snapshot.common.protection_pending : snapshot.common.flush_pending;
    const bool no_byte_retry=page.data[16]==0x41 && page.data[64]==0x4c && !snapshot.common.owns_byte &&
        !snapshot.clean && !pair.Install().started;
    Reset(page.data+64);
    // Explicitly settle only outstanding cache/protection debt; no reinstall.
    const bool settled=pair.Restore() && pair.Read().clean && page.Rx();
    return refused && retained && no_byte_retry && settled;
}
bool Admission() {
    Page page; Reset(page.data+64);
    tf3boundarypair::Pair alias(page.data+16,page.data+16,ops);
    if (alias.Install().started || page.data[16]!=0x41) return false;
    page.Foreign(0xcc);
    tf3boundarypair::Pair foreign(page.data+16,page.data+64,ops);
    return !foreign.Install().started && page.data[16]==0x41 && page.data[64]==0xcc;
}
}
int main() {
    const bool normal=Normal();
    const bool partial=Partial(false) && Partial(true);
    const bool foreign=Foreign();
    const bool flush=Pending(false),protection=Pending(true),admission=Admission();
    const bool passed=normal && partial && foreign && flush && protection && admission;
    std::cout << std::boolalpha << "{\"scope\":\"boundary-patch-pair-owned\",\"activationPermitted\":false,\"tf3Qualified\":false,\"passed\":" << passed
      << ",\"normalInstallRestore\":" << normal << ",\"partialInstallRolledBack\":" << partial
      << ",\"foreignBytePreserved\":" << foreign << ",\"failedFlushRetained\":" << flush
      << ",\"failedProtectionRetained\":" << protection << ",\"aliasAndForeignAdmissionDenied\":" << admission << "}\n";
    return passed ? 0 : 2;
}
