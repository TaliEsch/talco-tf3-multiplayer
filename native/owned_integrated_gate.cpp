#include "owned_integrated_gate.h"
#include "inprocess_gate_control.h"

#include <windows.h>
#include <intrin.h>
#include <array>
#include <atomic>
#include <cstring>
#include <thread>

extern "C" {
std::uint64_t OwnedIntegratedStep();
extern unsigned char OwnedIntegratedTrap;
extern unsigned char OwnedIntegratedResume;
extern unsigned char OwnedCrossGate;
extern unsigned char OwnedCrossReturnTrap;
extern unsigned char OwnedIntegratedFaultPark;
void OwnedCrossClobber();
DWORD64 OwnedIntegratedSeedR15 = 0;
DWORD64 OwnedCrossXcr0 = 0;
alignas(64) unsigned char OwnedIntegratedXstate[16384]{};
alignas(64) unsigned char OwnedIntegratedBeforeXstate[16384]{};
alignas(64) unsigned char OwnedIntegratedAfterXstate[16384]{};
DWORD64 OwnedCrossOwnerXstate = reinterpret_cast<DWORD64>(OwnedIntegratedXstate);
DWORD OwnedCrossScratchMxcsr = 0x1f80;
volatile LONG OwnedIntegratedFaultArrived = 0;
DWORD64 OwnedIntegratedScratchRax = 0;
DWORD64 OwnedIntegratedScratchRdx = 0;
}

namespace {
constexpr std::uint64_t kSecret = 0x7a5bc0de12345678ULL;
inprocess_gate::GateControl gate(kSecret);
std::atomic<bool> in_veh{false};
std::atomic<bool> route_in_flight{false};
std::atomic<DWORD64> original_rsp{0};
std::atomic<bool> helper_outside{false};
std::atomic<bool> terminal_parked{false};
std::atomic<bool> helper_abi_aligned{false};
std::atomic<DWORD> expected_owner{0};
std::atomic<bool> owner_observed{false};
std::atomic<bool> allow_gate_step{false};
std::atomic<std::uint64_t> passive_result{0};
std::atomic<std::uint64_t> first_result{0};
std::atomic<std::uint64_t> second_result{0};
std::atomic<bool> terminal_between_steps{false};
std::atomic<bool> terminal_continue_to_boundary{false};
std::uint32_t enabled_xstate_bytes = 0;

bool InitializeXstate() {
    int cpu[4]{};
    __cpuid(cpu, 1);
    constexpr int kXsave = 1 << 26;
    constexpr int kOsxsave = 1 << 27;
    if ((cpu[2] & (kXsave | kOsxsave)) != (kXsave | kOsxsave)) return false;
    const auto xcr0 = _xgetbv(0);
    if ((xcr0 & 3u) != 3u) return false;
    __cpuidex(cpu, 0xD, 0);
    if (cpu[1] < 576 || static_cast<unsigned int>(cpu[1]) > sizeof(OwnedIntegratedXstate))
        return false;
    OwnedCrossXcr0 = xcr0;
    enabled_xstate_bytes = static_cast<std::uint32_t>(cpu[1]);
    std::memset(OwnedIntegratedXstate, 0, sizeof(OwnedIntegratedXstate));
    std::memset(OwnedIntegratedBeforeXstate, 0, sizeof(OwnedIntegratedBeforeXstate));
    std::memset(OwnedIntegratedAfterXstate, 0, sizeof(OwnedIntegratedAfterXstate));
    return true;
}

bool WaitUntil(bool (*predicate)(), DWORD milliseconds = 5000) {
    const auto deadline = GetTickCount64() + milliseconds;
    while (!predicate()) {
        if (GetTickCount64() >= deadline) return false;
        Sleep(1);
    }
    return true;
}

bool IsHeld() { return gate.Read().state == inprocess_gate::State::held; }
bool IsReleaseConsumed() { return gate.Read().state == inprocess_gate::State::release_consumed; }
bool IsTerminalParked() {
    return gate.Read().state == inprocess_gate::State::terminal_parked && terminal_parked.load();
}
bool IsForeignFaultArrived() {
    return _InterlockedCompareExchange(&OwnedIntegratedFaultArrived, 0, 0) != 0;
}

void EmulateIncrement(CONTEXT* context) {
    const std::uint32_t before = static_cast<std::uint32_t>(context->R15);
    const std::uint32_t after = before + 1u;
    constexpr DWORD mask = 0x800u | 0x80u | 0x40u | 0x10u | 0x4u;
    DWORD flags = context->EFlags & ~mask;
    if (before == 0x7fffffffu) flags |= 0x800u;
    if ((after & 0x80000000u) != 0) flags |= 0x80u;
    if (after == 0) flags |= 0x40u;
    if ((before & 0xfu) == 0xfu) flags |= 0x10u;
    std::uint32_t parity = after & 0xffu;
    parity ^= parity >> 4;
    parity ^= parity >> 2;
    parity ^= parity >> 1;
    if ((parity & 1u) == 0) flags |= 0x4u;
    context->R15 = after;
    context->EFlags = flags;
}

bool TestIncrementFlags() {
    constexpr DWORD changed = 0x800u | 0x80u | 0x40u | 0x10u | 0x4u;
    CONTEXT normal{};
    normal.R15 = 0;
    normal.EFlags = 1;
    EmulateIncrement(&normal);
    if (normal.R15 != 1 || (normal.EFlags & 1) == 0 || (normal.EFlags & changed) != 0) return false;
    CONTEXT zero{};
    zero.R15 = 0xffffffffu;
    EmulateIncrement(&zero);
    if (zero.R15 != 0 || (zero.EFlags & (0x40u | 0x10u | 0x4u)) !=
            (0x40u | 0x10u | 0x4u) || (zero.EFlags & (0x800u | 0x80u)) != 0) return false;
    CONTEXT overflow{};
    overflow.R15 = 0x7fffffffu;
    overflow.EFlags = 1;
    EmulateIncrement(&overflow);
    return overflow.R15 == 0x80000000u &&
        (overflow.EFlags & (0x800u | 0x80u | 0x10u | 0x4u | 1u)) ==
            (0x800u | 0x80u | 0x10u | 0x4u | 1u) &&
        (overflow.EFlags & 0x40u) == 0;
}

bool TestFaultParkUnwind() {
    alignas(16) std::array<DWORD64, 96> stack{};
    auto* body = stack.data() + 32;
    body[0x58 / 8] = 0x1122334455667788ULL;
    body[0x30 / 8] = 15; body[0x38 / 8] = 13; body[0x40 / 8] = 12;
    body[0x48 / 8] = 14; body[0x50 / 8] = 5; body[0x60 / 8] = 3;
    body[0x68 / 8] = 6; body[0x70 / 8] = 7;
    body[0x20 / 8] = 0x123; body[0x28 / 8] = 0x456;
    CONTEXT context{};
    context.ContextFlags = CONTEXT_ALL;
    context.Rip = reinterpret_cast<DWORD64>(&OwnedIntegratedFaultPark);
    context.Rsp = reinterpret_cast<DWORD64>(body);
    DWORD64 image_base = 0;
    const auto* function = RtlLookupFunctionEntry(context.Rip, &image_base, nullptr);
    if (!function) return false;
    void* handler_data = nullptr;
    DWORD64 establisher = 0;
    RtlVirtualUnwind(UNW_FLAG_NHANDLER, image_base, context.Rip,
        const_cast<PRUNTIME_FUNCTION>(function), &context, &handler_data,
        &establisher, nullptr);
    return context.Rip == body[0x58 / 8] &&
        context.Rsp == reinterpret_cast<DWORD64>(body) + 0x60 &&
        context.R15 == 15 && context.R13 == 13 && context.R12 == 12 &&
        context.R14 == 14 && context.Rbp == 5 && context.Rbx == 3 &&
        context.Rsi == 6 && context.Rdi == 7 &&
        context.Xmm6.Low == 0x123 && context.Xmm6.High == 0x456;
}

[[noreturn]] void ParkForever() {
    terminal_parked.store(true);
    for (;;) Sleep(INFINITE);
}

DWORD WINAPI ForeignBoundaryThread(void*) {
    (void)OwnedIntegratedStep();
    return 1;
}

LONG CALLBACK Veh(EXCEPTION_POINTERS* pointers) noexcept {
    if (!pointers || !pointers->ExceptionRecord || !pointers->ContextRecord ||
        pointers->ExceptionRecord->ExceptionCode != EXCEPTION_BREAKPOINT ||
        pointers->ContextRecord->Rip !=
            reinterpret_cast<DWORD64>(pointers->ExceptionRecord->ExceptionAddress)) {
        return EXCEPTION_CONTINUE_SEARCH;
    }
    const auto address = pointers->ExceptionRecord->ExceptionAddress;
    if (address == &OwnedCrossReturnTrap) {
        const auto snapshot = gate.Read();
        const bool valid_return = expected_owner.load() == GetCurrentThreadId() &&
            route_in_flight.load() &&
            pointers->ContextRecord->Rsp == original_rsp.load();
        const bool release = valid_return &&
            snapshot.state == inprocess_gate::State::release_returning &&
            gate.ConfirmReleaseReturned(snapshot.boundary_generation) ==
                inprocess_gate::Result::accepted;
        const bool detach = valid_return &&
            snapshot.state == inprocess_gate::State::detach_returning &&
            gate.ConfirmOwnerExitedGate(snapshot.boundary_generation) ==
                inprocess_gate::Result::accepted;
        if (!release && !detach) {
            return EXCEPTION_CONTINUE_SEARCH;
        }
        route_in_flight.store(false);
        pointers->ContextRecord->Rip = reinterpret_cast<DWORD64>(&OwnedIntegratedResume);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    if (address != &OwnedIntegratedTrap) return EXCEPTION_CONTINUE_SEARCH;
    in_veh.store(true);
    const DWORD current = GetCurrentThreadId();
    DWORD expected = expected_owner.load();
    if (expected == 0) {
        expected_owner.compare_exchange_strong(expected, current);
        expected = expected_owner.load();
    }
    EmulateIncrement(pointers->ContextRecord);
    const auto snapshot = gate.Read();
    if (snapshot.state == inprocess_gate::State::detach_returning ||
        snapshot.state == inprocess_gate::State::detached) {
        // The byte is already externally restored. A trap raised just before
        // restoration may arrive late and must be completed inertly.
        pointers->ContextRecord->Rip = reinterpret_cast<DWORD64>(&OwnedIntegratedResume);
        in_veh.store(false);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    if (expected != current) {
        (void)gate.SignalBoundaryFault();
        pointers->ContextRecord->Rip = reinterpret_cast<DWORD64>(&OwnedIntegratedFaultPark);
        in_veh.store(false);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    bool idle = false;
    if (!route_in_flight.compare_exchange_strong(idle, true)) {
        (void)gate.SignalBoundaryFault();
        pointers->ContextRecord->Rip = reinterpret_cast<DWORD64>(&OwnedIntegratedFaultPark);
        in_veh.store(false);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    original_rsp.store(pointers->ContextRecord->Rsp);
    pointers->ContextRecord->Rip =
        (snapshot.state != inprocess_gate::State::running &&
         snapshot.state != inprocess_gate::State::detached) || snapshot.halt_requested
        ? reinterpret_cast<DWORD64>(&OwnedCrossGate)
        : reinterpret_cast<DWORD64>(&OwnedIntegratedResume);
    if (pointers->ContextRecord->Rip == reinterpret_cast<DWORD64>(&OwnedIntegratedResume))
        route_in_flight.store(false);
    in_veh.store(false);
    return EXCEPTION_CONTINUE_EXECUTION;
}

bool WrongOwnerAndNested() {
    inprocess_gate::GateControl wrong(kSecret);
    wrong.RequestHold();
    if (wrong.EnterOwnerBoundary() != inprocess_gate::OwnerResult::held) return false;
    std::atomic<inprocess_gate::OwnerResult> foreign{inprocess_gate::OwnerResult::observing};
    std::thread other([&] { foreign.store(wrong.EnterOwnerBoundary()); });
    other.join();
    const bool wrong_owner = foreign == inprocess_gate::OwnerResult::faulted &&
        wrong.Read().state == inprocess_gate::State::terminal_parked &&
        wrong.Read().halt_requested;

    inprocess_gate::GateControl nested(kSecret);
    nested.RequestHold();
    if (nested.EnterOwnerBoundary() != inprocess_gate::OwnerResult::held) return false;
    const bool nested_entry = nested.EnterOwnerBoundary() == inprocess_gate::OwnerResult::faulted &&
        nested.Read().state == inprocess_gate::State::terminal_parked;
    return wrong_owner && nested_entry;
}
}

extern "C" void OwnedCrossHelper() {
    helper_outside.store(!in_veh.load());
    helper_abi_aligned.store((reinterpret_cast<std::uintptr_t>(_AddressOfReturnAddress()) & 0xfu) == 8u);
    const auto entry = gate.EnterOwnerBoundary();
    if (entry == inprocess_gate::OwnerResult::held) {
        OwnedCrossClobber();
        const auto generation = gate.Read().boundary_generation;
        const auto wait = gate.WaitForRelease(generation);
        if (wait == inprocess_gate::OwnerResult::detach_confirmed) {
            if (gate.OwnerExitGate(generation) != inprocess_gate::Result::accepted) ParkForever();
            return;
        }
        if (wait == inprocess_gate::OwnerResult::release_consumed) return;
        ParkForever();
    }
    ParkForever();
}

namespace owned_integrated {
bool RunFixture(Report& report) noexcept {
    if (!InitializeXstate()) return false;
    const auto handler = AddVectoredExceptionHandler(1, Veh);
    if (!handler) return false;
    report = {};
    OwnedIntegratedSeedR15 = 0xffffffff0000000fULL;
    std::thread worker([] {
        passive_result.store(OwnedIntegratedStep());
        owner_observed.store(true);
        while (!allow_gate_step.load()) Sleep(1);
        first_result.store(OwnedIntegratedStep());
        second_result.store(OwnedIntegratedStep());
    });
    const auto owner_deadline = GetTickCount64() + 5000;
    while (!owner_observed.load()) {
        if (GetTickCount64() >= owner_deadline) {
            worker.detach();
            return false;
        }
        Sleep(1);
    }
    report.passive = passive_result == 0x10 && expected_owner.load() != 0;
    if (gate.RequestHold() != inprocess_gate::Result::accepted) {
        worker.detach();
        return false;
    }
    allow_gate_step.store(true);
    if (!WaitUntil(IsHeld)) {
        worker.detach();
        return false;
    }
    auto snapshot = gate.Read();
    report.held = snapshot.state == inprocess_gate::State::held;
    report.generation = snapshot.boundary_generation;
    report.helper_outside_veh = helper_outside.load();
    report.controller_progress = true;
    report.wrong_owner = WrongOwnerAndNested();
    report.nested = report.wrong_owner;
    report.flags_emulated = TestIncrementFlags();
    report.fault_park_unwind = TestFaultParkUnwind();
    report.complete_xstate = OwnedCrossXcr0 != 0 && enabled_xstate_bytes >= 576;
    if (gate.RequestRelease(snapshot.boundary_generation + 1) !=
            inprocess_gate::Result::stale_generation ||
        gate.RequestRelease(snapshot.boundary_generation) != inprocess_gate::Result::accepted) {
        worker.detach();
        return false;
    }
    const auto expected_generation = report.generation + 1;
    const auto deadline = GetTickCount64() + 5000;
    for (;;) {
        const auto current = gate.Read();
        if (current.state == inprocess_gate::State::held &&
            current.boundary_generation == expected_generation) break;
        if (GetTickCount64() >= deadline) {
            worker.detach();
            return false;
        }
        Sleep(1);
    }
    snapshot = gate.Read();
    report.release_reheld = true;
    report.consumed = snapshot.permit_consumed_generation;
    report.applied = snapshot.release_applied_generation;
    report.applied_consumed = report.consumed == report.generation &&
        report.applied == report.generation;
    report.detach = gate.PrepareDetach(kSecret, snapshot.boundary_generation) ==
            inprocess_gate::Result::accepted &&
        gate.ConfirmExternalByteRestored(snapshot.boundary_generation) ==
            inprocess_gate::Result::accepted;
    worker.join();
    snapshot = gate.Read();
    report.detach = report.detach && snapshot.state == inprocess_gate::State::detached &&
        !snapshot.owner_in_gate;
    report.step_exactly_once = first_result == 0x10 && second_result == 0x10;
    report.helper_abi_aligned = helper_abi_aligned.load();
    report.xstate_preserved = std::memcmp(OwnedIntegratedBeforeXstate,
        OwnedIntegratedAfterXstate, enabled_xstate_bytes) == 0;
    report.xcr0 = OwnedCrossXcr0;
    report.xstate_bytes = enabled_xstate_bytes;
    RemoveVectoredExceptionHandler(handler);
    return report.passive && report.held && report.helper_outside_veh &&
        report.release_reheld && report.applied_consumed && report.detach &&
        report.wrong_owner && report.nested && report.step_exactly_once &&
        report.flags_emulated && report.helper_abi_aligned &&
        report.complete_xstate && report.xstate_preserved && report.fault_park_unwind;
}

bool RunTerminalFixture(bool after_consumption) noexcept {
    if (!InitializeXstate()) return false;
    const auto handler = AddVectoredExceptionHandler(1, Veh);
    if (!handler || gate.RequestHold() != inprocess_gate::Result::accepted) return false;
    OwnedIntegratedSeedR15 = 0xffffffff0000000fULL;
    terminal_between_steps.store(false);
    terminal_continue_to_boundary.store(false);
    std::thread worker([after_consumption] {
        (void)OwnedIntegratedStep();
        if (after_consumption) {
            terminal_between_steps.store(true);
            while (!terminal_continue_to_boundary.load()) Sleep(1);
            (void)OwnedIntegratedStep();
        }
    });
    worker.detach();
    if (!WaitUntil(IsHeld)) return false;
    const auto generation = gate.Read().boundary_generation;
    if (!after_consumption) {
        if (gate.HaltOrDisconnect() != inprocess_gate::Result::accepted) return false;
    } else {
        if (gate.RequestRelease(generation) != inprocess_gate::Result::accepted ||
            !WaitUntil(IsReleaseConsumed)) return false;
        const auto deadline = GetTickCount64() + 5000;
        while (!terminal_between_steps.load()) {
            if (GetTickCount64() >= deadline) return false;
            Sleep(1);
        }
        if (gate.HaltOrDisconnect() != inprocess_gate::Result::accepted) return false;
        terminal_continue_to_boundary.store(true);
    }
    if (!WaitUntil(IsTerminalParked)) return false;
    const auto snapshot = gate.Read();
    return snapshot.halt_requested &&
        (!after_consumption || snapshot.release_applied_generation == generation);
}

bool RunRunningHaltFixture() noexcept {
    if (!InitializeXstate()) return false;
    const auto handler = AddVectoredExceptionHandler(1, Veh);
    OwnedIntegratedSeedR15 = 0xffffffff0000000fULL;
    if (!handler || gate.HaltOrDisconnect() != inprocess_gate::Result::accepted ||
        gate.Read().state != inprocess_gate::State::terminal_requested) return false;
    std::thread worker([] { (void)OwnedIntegratedStep(); });
    worker.detach();
    return WaitUntil(IsTerminalParked) && gate.Read().boundary_generation == 1 &&
        gate.Read().halt_requested;
}

bool RunForeignBoundaryFixture() noexcept {
    if (!InitializeXstate()) return false;
    const auto handler = AddVectoredExceptionHandler(1, Veh);
    OwnedIntegratedSeedR15 = 0xffffffff0000000fULL;
    _InterlockedExchange(&OwnedIntegratedFaultArrived, 0);
    if (!handler || gate.RequestHold() != inprocess_gate::Result::accepted) return false;
    std::thread owner([] { (void)OwnedIntegratedStep(); });
    owner.detach();
    if (!WaitUntil(IsHeld) || expected_owner.load() == 0) return false;
    HANDLE foreign = CreateThread(nullptr, 0, ForeignBoundaryThread, nullptr, 0, nullptr);
    if (!foreign) return false;
    const bool arrived = WaitUntil(IsForeignFaultArrived);
    const bool owner_parked = arrived && WaitUntil(IsTerminalParked);
    const bool did_not_return = owner_parked &&
        WaitForSingleObject(foreign, 50) == WAIT_TIMEOUT;
    CloseHandle(foreign);
    return arrived && owner_parked && did_not_return && gate.Read().halt_requested;
}
}
