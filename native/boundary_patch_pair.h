#pragma once
#include <windows.h>

// Byte lifecycle only. The caller must independently qualify exact image,
// instruction tails, handler lifetime, ownership and engine safe points.
namespace tf3boundarypair {
enum class Status { installed, invalid_site, foreign_byte, protection_failed, flush_failed, already_attempted };
struct SiteSnapshot { bool owns_byte, protection_pending, flush_pending, foreign_observed; };
struct Snapshot { SiteSnapshot step, common; bool attempted, installed, clean; };
// cleanup_confirmed settles only our byte/cache/protection changes. It does
// not assert pristine sites after a competing writer caused admission failure.
struct InstallResult { Status cause; bool started, cleanup_confirmed; };
#ifdef TF3_BOUNDARY_PAIR_OWNED_TEST
struct OwnedOperations {
    BOOL (WINAPI* protect)(LPVOID,SIZE_T,DWORD,PDWORD);
    BOOL (WINAPI* flush)(HANDLE,LPCVOID,SIZE_T);
};
#endif
class Pair final {
public:
    Pair(unsigned char* step,unsigned char* common) noexcept;
#ifdef TF3_BOUNDARY_PAIR_OWNED_TEST
    Pair(unsigned char* step,unsigned char* common,OwnedOperations ops) noexcept;
#endif
    Pair(const Pair&)=delete;
    Pair& operator=(const Pair&)=delete;
    // Calls must be serialized by the containing adapter lifecycle lock.
    InstallResult Install() noexcept;
    bool Restore() noexcept;
    Snapshot Read() const noexcept;
private:
    struct Byte {
        unsigned char* address;
        unsigned char original;
        DWORD original_protection=PAGE_EXECUTE_READ;
        bool owns=false,protection_pending=false,flush_pending=false,foreign=false;
    };
    Byte step_,common_;
    bool attempted_=false,installed_=false;
    BOOL (WINAPI* protect_)(LPVOID,SIZE_T,DWORD,PDWORD)=&VirtualProtect;
    BOOL (WINAPI* flush_)(HANDLE,LPCVOID,SIZE_T)=&FlushInstructionCache;
    bool Validate(const Byte&) const noexcept;
    Status InstallByte(Byte&) noexcept;
    bool RestoreByte(Byte&) noexcept;
    static bool Clean(const Byte&) noexcept;
};
}
