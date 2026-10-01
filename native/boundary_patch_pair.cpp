#include "boundary_patch_pair.h"
#include <intrin.h>

namespace tf3boundarypair {
Pair::Pair(unsigned char* step,unsigned char* common) noexcept
    : step_{step,0x41},common_{common,0x4c} {}
#ifdef TF3_BOUNDARY_PAIR_OWNED_TEST
Pair::Pair(unsigned char* step,unsigned char* common,OwnedOperations ops) noexcept
    : Pair(step,common) {
    if (ops.protect) protect_=ops.protect;
    if (ops.flush) flush_=ops.flush;
}
#endif
bool Pair::Clean(const Byte& byte) noexcept {
    return !byte.owns && !byte.protection_pending && !byte.flush_pending && !byte.foreign;
}
bool Pair::Validate(const Byte& byte) const noexcept {
    if (!byte.address) return false;
    MEMORY_BASIC_INFORMATION info{};
    return VirtualQuery(byte.address,&info,sizeof(info))==sizeof(info) &&
        info.State==MEM_COMMIT && info.Protect==PAGE_EXECUTE_READ &&
        *byte.address==byte.original;
}
Status Pair::InstallByte(Byte& byte) noexcept {
    DWORD old=0;
    if (!protect_(byte.address,1,PAGE_EXECUTE_READWRITE,&old)) return Status::protection_failed;
    byte.original_protection=old;
    byte.protection_pending=true;
    if (old!=PAGE_EXECUTE_READ) {
        DWORD ignored=0;
        if (protect_(byte.address,1,old,&ignored)) byte.protection_pending=false;
        return Status::invalid_site;
    }
    const auto prior=static_cast<unsigned char>(_InterlockedCompareExchange8(
        reinterpret_cast<volatile char*>(byte.address),static_cast<char>(0xcc),static_cast<char>(byte.original)));
    Status result=Status::installed;
    if (prior==byte.original) {
        byte.owns=true;
        byte.flush_pending=true;
        if (flush_(GetCurrentProcess(),byte.address,1)) byte.flush_pending=false;
        else result=Status::flush_failed;
    } else {
        // No ownership was acquired. Preserve the competing writer's byte.
        result=Status::foreign_byte;
    }
    DWORD ignored=0;
    if (protect_(byte.address,1,old,&ignored)) byte.protection_pending=false;
    else if (result==Status::installed) result=Status::protection_failed;
    return result;
}
bool Pair::RestoreByte(Byte& byte) noexcept {
    if (Clean(byte)) return true;
    if (!byte.address) return false;
    if (byte.owns && !byte.foreign) {
        DWORD old=0;
        if (!protect_(byte.address,1,PAGE_EXECUTE_READWRITE,&old)) return false;
        byte.protection_pending=true;
        const auto prior=static_cast<unsigned char>(_InterlockedCompareExchange8(
            reinterpret_cast<volatile char*>(byte.address),static_cast<char>(byte.original),static_cast<char>(0xcc)));
        if (prior==0xcc) {
            byte.owns=false;
            byte.flush_pending=true;
        } else {
            // Ownership was invalidated externally. Latch uncertainty; a later
            // CC at this address cannot be treated as our original patch.
            byte.owns=false;
            byte.foreign=true;
        }
    }
    if (byte.flush_pending && flush_(GetCurrentProcess(),byte.address,1)) byte.flush_pending=false;
    if (byte.protection_pending) {
        DWORD ignored=0;
        if (protect_(byte.address,1,byte.original_protection,&ignored)) byte.protection_pending=false;
    }
    return Clean(byte);
}
InstallResult Pair::Install() noexcept {
    if (attempted_) return {Status::already_attempted,false,Read().clean};
    attempted_=true;
    if (step_.address==common_.address || !Validate(step_) || !Validate(common_))
        return {Status::invalid_site,false,true};
    auto cause=InstallByte(step_);
    if (cause==Status::installed) cause=InstallByte(common_);
    if (cause!=Status::installed) {
        const bool restored=Restore();
        return {cause,false,restored};
    }
    installed_=true;
    return {Status::installed,true,false};
}
bool Pair::Restore() noexcept {
    installed_=false;
    // Reverse order also handles two sites on the same page. Every successful
    // site installation has restored RX before the next site is attempted.
    const bool common=RestoreByte(common_);
    const bool step=RestoreByte(step_);
    return common && step;
}
Snapshot Pair::Read() const noexcept {
    const auto snapshot=[](const Byte& b) noexcept {
        return SiteSnapshot{b.owns,b.protection_pending,b.flush_pending,b.foreign};
    };
    return {snapshot(step_),snapshot(common_),attempted_,installed_,Clean(step_)&&Clean(common_)};
}
}
