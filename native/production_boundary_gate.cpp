#include "production_boundary_gate.h"
#include "inprocess_post_observer.h"
#include <windows.h>
#include <atomic>
#include <cstddef>
#include <cstring>
#include <intrin.h>
#include <limits>

extern "C" {
extern unsigned char OwnedCrossGate;
extern unsigned char OwnedCrossReturnTrap;
extern unsigned char ProductionBoundaryFaultPark;
extern void OwnedCrossHelper();
DWORD64 OwnedCrossXcr0 = 0;
alignas(64) unsigned char ProductionBoundaryXstate[16384]{};
unsigned char* OwnedCrossOwnerXstate = ProductionBoundaryXstate;
DWORD OwnedCrossScratchMxcsr = 0x1f80;
}

namespace tf3boundary {
namespace {
constexpr std::uint64_t kOwnedSecret = 0x54f33b0d84e1aa91ULL;
inprocess_gate::GateControl control(kOwnedSecret);
std::atomic<std::uintptr_t> site{0}, resume{0};
std::atomic<bool> active{false}, owns{false}, in_veh{false}, helper_outside{false};
std::atomic<bool> route_in_flight{false};
std::atomic<DWORD> owner{0};
std::atomic<DWORD64> original_rsp{0};
std::atomic<std::uint64_t> hits{0};
std::atomic<std::uint64_t> minimum_stack_headroom{(std::numeric_limits<std::uint64_t>::max)()};
std::atomic<bool> cross_thread{false};
std::atomic<std::uint32_t> cfg_flags{0}, cet_flags{0};
std::atomic<bool> cfg_known{false}, cet_known{false};
std::uint32_t xstate_bytes = 0;
SRWLOCK lifecycle_lock = SRWLOCK_INIT;
PVOID handler = nullptr;
DWORD original_protection = 0;
bool attempted = false, restoration_pending = false;

enum class EhState { absent, missing, present };
EhState EhContinuationState(HMODULE module, const void* target) noexcept {
    if (!module || !target) return EhState::missing;
    const auto base = reinterpret_cast<std::uintptr_t>(module);
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew < 0) return EhState::missing;
    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) return EhState::missing;
    const auto directory = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_LOAD_CONFIG];
    if (directory.Size < offsetof(IMAGE_LOAD_CONFIG_DIRECTORY64, GuardEHContinuationCount) +
            sizeof(ULONGLONG)) return EhState::absent;
    const auto* config = reinterpret_cast<const IMAGE_LOAD_CONFIG_DIRECTORY64*>(
        base + directory.VirtualAddress);
    if ((config->GuardFlags & IMAGE_GUARD_EH_CONTINUATION_TABLE_PRESENT) == 0)
        return EhState::absent;
    if (config->GuardEHContinuationCount == 0 || config->GuardEHContinuationCount > 4096 ||
        config->GuardEHContinuationTable == 0) return EhState::missing;
    const auto* table = reinterpret_cast<const unsigned char*>(config->GuardEHContinuationTable);
    const auto stride = sizeof(DWORD) + (config->GuardFlags >> 28);
    const auto rva = reinterpret_cast<std::uintptr_t>(target) - base;
    for (ULONGLONG i = 0; i < config->GuardEHContinuationCount; ++i) {
        DWORD value = 0;
        std::memcpy(&value, table + i * stride, sizeof(value));
        if (value == rva) return EhState::present;
    }
    return EhState::missing;
}

bool ProductionMitigations(void* continuation) noexcept {
    PROCESS_MITIGATION_CONTROL_FLOW_GUARD_POLICY cfg{};
    PROCESS_MITIGATION_USER_SHADOW_STACK_POLICY cet{};
    const bool cfg_ok = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessControlFlowGuardPolicy, &cfg, sizeof(cfg)) != FALSE;
    const bool cet_ok = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessUserShadowStackPolicy, &cet, sizeof(cet)) != FALSE;
    cfg_known.store(cfg_ok); cet_known.store(cet_ok);
    if (cfg_ok) cfg_flags.store(cfg.Flags);
    if (cet_ok) cet_flags.store(cet.Flags);
    HMODULE self = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
            GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            reinterpret_cast<LPCWSTR>(&OwnedCrossGate), &self)) return false;
    const auto resume_state = EhContinuationState(GetModuleHandleW(nullptr), continuation);
    DWORD64 image_base = 0;
    return cfg_ok && cet_ok &&
        EhContinuationState(self, &OwnedCrossGate) == EhState::present &&
        EhContinuationState(self, &ProductionBoundaryFaultPark) == EhState::present &&
        (resume_state == EhState::absent || resume_state == EhState::present) &&
        RtlLookupFunctionEntry(reinterpret_cast<DWORD64>(&OwnedCrossGate),
                               &image_base, nullptr) != nullptr &&
        RtlLookupFunctionEntry(reinterpret_cast<DWORD64>(&ProductionBoundaryFaultPark),
                               &image_base, nullptr) != nullptr;
}

bool InitializeXstate() noexcept {
    int cpu[4]{};
    __cpuid(cpu, 1);
    constexpr int kXsave = 1 << 26;
    constexpr int kOsxsave = 1 << 27;
    if ((cpu[2] & (kXsave | kOsxsave)) != (kXsave | kOsxsave)) return false;
    const auto xcr0 = _xgetbv(0);
    if ((xcr0 & 3u) != 3u) return false;
    __cpuidex(cpu, 0xD, 0);
    if (cpu[1] < 576 || static_cast<unsigned int>(cpu[1]) > sizeof(ProductionBoundaryXstate))
        return false;
    OwnedCrossXcr0 = xcr0;
    xstate_bytes = static_cast<std::uint32_t>(cpu[1]);
    std::memset(ProductionBoundaryXstate, 0, sizeof(ProductionBoundaryXstate));
    return true;
}

void EmulateInc(CONTEXT* c) noexcept {
    const auto before=static_cast<std::uint32_t>(c->R15), after=before+1u;
    constexpr DWORD mask=0x800u|0x80u|0x40u|0x10u|0x4u;
    DWORD f=c->EFlags&~mask;
    if(before==0x7fffffffu) f|=0x800u; if(after&0x80000000u) f|=0x80u;
    if(after==0) f|=0x40u; if((before&15u)==15u) f|=0x10u;
    auto p=after&255u; p^=p>>4; p^=p>>2; p^=p>>1; if(!(p&1u)) f|=0x4u;
    c->R15=after; c->EFlags=f;
}
[[noreturn]] void Park() noexcept { for (;;) Sleep(INFINITE); }

LONG DispatchException(EXCEPTION_POINTERS* p) noexcept {
    if(!p||!p->ExceptionRecord||!p->ContextRecord||
        p->ExceptionRecord->ExceptionCode!=EXCEPTION_BREAKPOINT ||
        p->ExceptionRecord->ExceptionFlags!=0) return EXCEPTION_CONTINUE_SEARCH;
    const auto address=reinterpret_cast<std::uintptr_t>(p->ExceptionRecord->ExceptionAddress);
    if(p->ContextRecord->Rip!=address) return EXCEPTION_CONTINUE_SEARCH;
    if(address==reinterpret_cast<std::uintptr_t>(&OwnedCrossReturnTrap)) {
        const auto s=control.Read(); bool ok=false;
        const bool valid_return = owner.load() == GetCurrentThreadId() &&
            route_in_flight.load() && p->ContextRecord->Rsp == original_rsp.load();
        if(valid_return && s.state==inprocess_gate::State::release_returning)
            ok=control.ConfirmReleaseReturned(s.boundary_generation)==inprocess_gate::Result::accepted;
        else if(valid_return && s.state==inprocess_gate::State::detach_returning) {
            ok=control.ConfirmOwnerExitedGate(s.boundary_generation)==inprocess_gate::Result::accepted;
            if (ok) active.store(false);
        }
        if(!ok) return EXCEPTION_CONTINUE_SEARCH;
        route_in_flight.store(false);
        p->ContextRecord->Rip=resume.load(); return EXCEPTION_CONTINUE_EXECUTION;
    }
    if(address!=site.load() || p->ContextRecord->Rip!=site.load()) return EXCEPTION_CONTINUE_SEARCH;
    EmulateInc(p->ContextRecord);
    const auto snapshot=control.Read();
    if (snapshot.state==inprocess_gate::State::detach_returning ||
        snapshot.state==inprocess_gate::State::detached) {
        p->ContextRecord->Rip=resume.load();
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    in_veh.store(true);
    const auto thread=GetCurrentThreadId(); auto expected=owner.load();
    if(!expected) owner.compare_exchange_strong(expected,thread); expected=owner.load();
    if(expected!=thread) {
        cross_thread.store(true);
        if (snapshot.state==inprocess_gate::State::running && !snapshot.halt_requested) {
            p->ContextRecord->Rip=resume.load();
            in_veh.store(false); return EXCEPTION_CONTINUE_EXECUTION;
        }
        (void)control.SignalBoundaryFault();
        p->ContextRecord->Rip=reinterpret_cast<DWORD64>(&ProductionBoundaryFaultPark);
        in_veh.store(false); return EXCEPTION_CONTINUE_EXECUTION;
    }
    const auto stack_limit = static_cast<std::uintptr_t>(
        __readgsqword(FIELD_OFFSET(NT_TIB, StackLimit)));
    const auto interrupted_rsp = static_cast<std::uintptr_t>(p->ContextRecord->Rsp);
    const auto headroom = interrupted_rsp >= stack_limit ? interrupted_rsp - stack_limit : 0;
    auto minimum = minimum_stack_headroom.load();
    if (headroom < minimum) (void)minimum_stack_headroom.compare_exchange_strong(minimum, headroom);
    hits.fetch_add(1);
    if (snapshot.state==inprocess_gate::State::running && !snapshot.halt_requested) {
        p->ContextRecord->Rip=resume.load();
        in_veh.store(false); return EXCEPTION_CONTINUE_EXECUTION;
    }
    // The gate itself uses 0x100 bytes and the ordinary helper has a bounded
    // native call chain. Require a conservative eight KiB only when control
    // would actually redirect; passive qualification remains observation-only.
    if ((interrupted_rsp & 0xfu) != 0 || headroom < 0x2000) {
        (void)control.SignalBoundaryFault();
        p->ContextRecord->Rip=reinterpret_cast<DWORD64>(&ProductionBoundaryFaultPark);
        in_veh.store(false); return EXCEPTION_CONTINUE_EXECUTION;
    }
    bool idle=false;
    if(!route_in_flight.compare_exchange_strong(idle,true)) {
        (void)control.SignalBoundaryFault();
        p->ContextRecord->Rip=reinterpret_cast<DWORD64>(&ProductionBoundaryFaultPark);
        in_veh.store(false); return EXCEPTION_CONTINUE_EXECUTION;
    }
    original_rsp.store(p->ContextRecord->Rsp);
    p->ContextRecord->Rip=reinterpret_cast<DWORD64>(&OwnedCrossGate);
    in_veh.store(false); return EXCEPTION_CONTINUE_EXECUTION;
}
}

#ifdef TF3_BOUNDARY_PRODUCTION_RUNTIME
static Status StartQualified(bool boundary_40401) noexcept {
    AcquireSRWLockExclusive(&lifecycle_lock);
    if (active.load()) { ReleaseSRWLockExclusive(&lifecycle_lock); return Status::already_started; }
    if (attempted) { ReleaseSRWLockExclusive(&lifecycle_lock); return Status::terminal; }
    attempted = true;
    void* exact_site = nullptr;
    const auto qualified = boundary_40401
        ? tf3postobserver::Qualify40401BoundarySite(&exact_site)
        : tf3postobserver::QualifyExactSite(&exact_site);
    if (qualified != tf3postobserver::Status::started || !exact_site) {
        ReleaseSRWLockExclusive(&lifecycle_lock);
        return qualified == tf3postobserver::Status::incompatible_mitigation
            ? Status::incompatible_mitigation : Status::invalid_site;
    }
    void* continuation = static_cast<unsigned char*>(exact_site) + 3;
    if (!InitializeXstate() || !ProductionMitigations(continuation)) {
        ReleaseSRWLockExclusive(&lifecycle_lock); return Status::incompatible_mitigation;
    }
    HMODULE pinned = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
            reinterpret_cast<LPCWSTR>(&DispatchException), &pinned)) {
        ReleaseSRWLockExclusive(&lifecycle_lock); return Status::pin_failed;
    }
    site.store(reinterpret_cast<std::uintptr_t>(exact_site));
    resume.store(reinterpret_cast<std::uintptr_t>(continuation));
    handler = AddVectoredExceptionHandler(1, &DispatchException);
    if (!handler) { ReleaseSRWLockExclusive(&lifecycle_lock); return Status::handler_failed; }
    DWORD old = 0;
    if (!VirtualProtect(exact_site, 1, PAGE_EXECUTE_READWRITE, &old)) {
        ReleaseSRWLockExclusive(&lifecycle_lock); return Status::patch_failed;
    }
    original_protection = old; restoration_pending = true;
    if (old != PAGE_EXECUTE_READ || *static_cast<unsigned char*>(exact_site) != 0x41) {
        DWORD ignored = 0; (void)VirtualProtect(exact_site, 1, old, &ignored);
        ReleaseSRWLockExclusive(&lifecycle_lock); return Status::foreign_patch;
    }
    active.store(true);
    const auto previous = _InterlockedCompareExchange8(static_cast<volatile char*>(exact_site),
        static_cast<char>(0xcc), static_cast<char>(0x41));
    if (static_cast<unsigned char>(previous) != 0x41) {
        active.store(false); DWORD ignored = 0;
        (void)VirtualProtect(exact_site, 1, old, &ignored);
        ReleaseSRWLockExclusive(&lifecycle_lock); return Status::foreign_patch;
    }
    owns.store(true);
    DWORD ignored = 0;
    const bool flushed = FlushInstructionCache(GetCurrentProcess(), exact_site, 1) != FALSE;
    const bool protected_again = VirtualProtect(exact_site, 1, old, &ignored) != FALSE;
    if (!flushed || !protected_again) {
        DWORD writable = 0;
        const bool can_restore = VirtualProtect(exact_site, 1, PAGE_EXECUTE_READWRITE, &writable) != FALSE;
        const auto restored_byte = can_restore ? _InterlockedCompareExchange8(
            static_cast<volatile char*>(exact_site), static_cast<char>(0x41),
            static_cast<char>(0xcc)) : static_cast<char>(0);
        DWORD ignored_restore = 0;
        const bool cleanup = can_restore && static_cast<unsigned char>(restored_byte) == 0xcc &&
            FlushInstructionCache(GetCurrentProcess(), exact_site, 1) != FALSE &&
            VirtualProtect(exact_site, 1, original_protection, &ignored_restore) != FALSE;
        if (cleanup) {
            owns.store(false); active.store(false); restoration_pending = false;
        } else {
            (void)control.SignalBoundaryFault();
        }
        ReleaseSRWLockExclusive(&lifecycle_lock);
        return cleanup ? Status::patch_failed : Status::restore_failed;
    }
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return Status::started;
}
Status Start() noexcept { return StartQualified(false); }
Status Start40401BoundaryExperiment() noexcept { return StartQualified(true); }
#else
Status Start() noexcept { return Status::disabled_pending_live_qualification; }
Status Start40401BoundaryExperiment() noexcept { return Status::disabled_pending_live_qualification; }
#endif

Status Stop() noexcept {
    const auto snapshot = control.Read();
    if (active.load() && snapshot.state != inprocess_gate::State::detached)
        return Status::terminal;
    return attempted || snapshot.state == inprocess_gate::State::detached
        ? Status::stopped : Status::disabled_pending_live_qualification;
}
Snapshot Read() noexcept { return {control.Read(),active.load(),owns.load(),
    (reinterpret_cast<std::uintptr_t>(ProductionBoundaryXstate)&63u)==0,
    helper_outside.load(), OwnedCrossXcr0 != 0 && xstate_bytes >= 576,
    OwnedCrossXcr0, xstate_bytes, hits.load(),
    minimum_stack_headroom.load()==(std::numeric_limits<std::uint64_t>::max)()
        ? 0 : minimum_stack_headroom.load(), cfg_flags.load(), cet_flags.load(),
    cfg_known.load(), cet_known.load(), cross_thread.load(), owner.load()}; }

inprocess_gate::Result RequestHold() noexcept {
    const auto minimum = minimum_stack_headroom.load();
    return active.load() && owns.load() && !cross_thread.load() &&
            minimum != (std::numeric_limits<std::uint64_t>::max)() && minimum >= 0x2000
        ? control.RequestHold() : inprocess_gate::Result::terminal;
}
inprocess_gate::Result RequestRelease(std::uint64_t generation) noexcept {
    return active.load() && owns.load() ? control.RequestRelease(generation) : inprocess_gate::Result::terminal;
}
inprocess_gate::Result RequestHalt() noexcept {
    return active.load() ? control.HaltOrDisconnect() : inprocess_gate::Result::terminal;
}
inprocess_gate::Result PrepareDetach(std::uint64_t generation) noexcept {
    return active.load() && owns.load() ? control.PrepareDetach(kOwnedSecret, generation)
                                        : inprocess_gate::Result::terminal;
}
inprocess_gate::Result RestoreAndConfirmDetach(std::uint64_t generation) noexcept {
    if (!active.load() || !owns.load() ||
        control.Read().state != inprocess_gate::State::detach_prepared)
        return inprocess_gate::Result::protocol_error;
    AcquireSRWLockExclusive(&lifecycle_lock);
    auto* exact_site = reinterpret_cast<unsigned char*>(site.load());
    DWORD old = 0;
    if (!exact_site || !VirtualProtect(exact_site, 1, PAGE_EXECUTE_READWRITE, &old)) {
        ReleaseSRWLockExclusive(&lifecycle_lock); (void)control.SignalBoundaryFault();
        return inprocess_gate::Result::terminal;
    }
    const auto previous = _InterlockedCompareExchange8(reinterpret_cast<volatile char*>(exact_site),
        static_cast<char>(0x41), static_cast<char>(0xcc));
    DWORD ignored = 0;
    const bool flushed = FlushInstructionCache(GetCurrentProcess(), exact_site, 1) != FALSE;
    const bool protected_again = VirtualProtect(exact_site, 1, original_protection, &ignored) != FALSE;
    if (static_cast<unsigned char>(previous) != 0xcc || !flushed || !protected_again) {
        ReleaseSRWLockExclusive(&lifecycle_lock); (void)control.SignalBoundaryFault();
        return inprocess_gate::Result::terminal;
    }
    owns.store(false); restoration_pending = false;
    const auto result = control.ConfirmExternalByteRestored(generation);
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return result;
}

extern "C" void OwnedCrossHelper() {
    helper_outside.store(!in_veh.load(),std::memory_order_release);
    const auto entered=control.EnterOwnerBoundary();
    if (entered!=inprocess_gate::OwnerResult::held) Park();
    const auto generation=control.Read().boundary_generation;
    const auto waited=control.WaitForRelease(generation);
    if (waited==inprocess_gate::OwnerResult::release_consumed) return;
    if (waited==inprocess_gate::OwnerResult::detach_confirmed &&
        control.OwnerExitGate(generation)==inprocess_gate::Result::accepted) return;
    Park();
}

#ifdef TF3_BOUNDARY_OWNED_TEST
Status StartOwnedFixture(void* exact_site, void* continuation) noexcept {
    if (!exact_site || !continuation) return Status::invalid_site;
    if (active.exchange(true)) return Status::already_started;
    if (!InitializeXstate()) {
        active.store(false);
        return Status::invalid_site;
    }
    site.store(reinterpret_cast<std::uintptr_t>(exact_site)); resume.store(reinterpret_cast<std::uintptr_t>(continuation));
    // The fixture already contains INT3 followed by FF C7; this flag models
    // sole ownership and prevents a second observer from claiming the byte.
    owns.store(true); return Status::started;
}
inprocess_gate::Result PrepareOwnedDetach(std::uint64_t s,std::uint64_t g) noexcept { return control.PrepareDetach(s,g); }
inprocess_gate::Result ConfirmByteRestored(std::uint64_t g) noexcept {
    const auto result = control.ConfirmExternalByteRestored(g);
    if (result == inprocess_gate::Result::accepted) owns.store(false);
    return result;
}
LONG DispatchOwnedException(EXCEPTION_POINTERS* p) noexcept { return DispatchException(p); }
#endif
}  // namespace tf3boundary
