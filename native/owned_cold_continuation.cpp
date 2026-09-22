// Owned-process research fixture. NOT linked into the native runtime.
// No game paths, addresses, patching, staging, command execution or activation.
// Models the audited post-INC Step frame (RSP entry-0x58, return at +0x58).
// A cold-fragment unwind record describes that existing frame directly.
// RuntimeQualification/activation remain false irrespective of fixture results.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <intrin.h>
#include <array>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <thread>

extern "C" {
void OwnedColdStep();
void OwnedColdClobber();
extern unsigned char OwnedColdTrap, OwnedColdResume, OwnedColdGate, OwnedColdGateEnd;
struct UnwindCase { DWORD64 pc; DWORD64 depth; };
extern const UnwindCase OwnedColdCases[];
extern const DWORD64 OwnedColdCaseCount;
alignas(64) unsigned char OwnedColdEntryXstate[16384]{};
alignas(64) unsigned char OwnedColdBeforeXstate[16384]{};
alignas(64) unsigned char OwnedColdAfterXstate[16384]{};
alignas(64) unsigned char OwnedColdPatterns[384]{};
alignas(16) DWORD64 OwnedColdBeforeGpr[17]{};
alignas(16) DWORD64 OwnedColdAfterGpr[17]{};
DWORD64 OwnedColdXcr0 = 0;
DWORD OwnedColdScratchMxcsr = 0x5f80;
DWORD64 OwnedColdSeedR15 = 0;
DWORD64 OwnedColdSeedFlags = 0x202;
}

namespace {
constexpr DWORD kOwnedFault = 0xe0425433;
std::atomic<DWORD> owner{0}, handler_hits{0}, native_exception{0};
std::atomic<bool> handler_active{false}, wait_outside_handler{false}, raise_fault{false};
static_assert(std::atomic<DWORD>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);
HANDLE entered_event = nullptr;
HANDLE release_event = nullptr;

LONG CALLBACK Redirect(EXCEPTION_POINTERS* pointers) noexcept {
    if (!pointers || !pointers->ExceptionRecord || !pointers->ContextRecord ||
        pointers->ExceptionRecord->ExceptionCode != EXCEPTION_BREAKPOINT ||
        pointers->ExceptionRecord->ExceptionFlags != 0 ||
        pointers->ExceptionRecord->ExceptionAddress != &OwnedColdTrap ||
        pointers->ContextRecord->Rip != reinterpret_cast<DWORD64>(&OwnedColdTrap) ||
        GetCurrentThreadId() != owner.load(std::memory_order_relaxed)) return EXCEPTION_CONTINUE_SEARCH;
    handler_active.store(true, std::memory_order_relaxed);
    handler_hits.fetch_add(1, std::memory_order_relaxed);
    // No wait, allocation, lock, stack fabrication, game read or IPC in VEH.
    // The fixture traps AFTER native INC. This is the state production's
    // instruction emulator would pass to a gate targeting RVA 0x159584.
    pointers->ContextRecord->Rip = reinterpret_cast<DWORD64>(&OwnedColdGate);
    handler_active.store(false, std::memory_order_relaxed);
    return EXCEPTION_CONTINUE_EXECUTION;
}

bool RunOwned() {
    owner.store(GetCurrentThreadId());
    __try {
        OwnedColdStep();
        return true;
    } __except(EXCEPTION_EXECUTE_HANDLER) {
        native_exception.store(GetExceptionCode());
        // Fixture cleanup after exceptional exit; the generic ABI does not
        // promise restoration of all volatile XSTATE during exception unwind.
        _xrstor64(OwnedColdEntryXstate, OwnedColdXcr0);
        return false;
    }
}

bool GateHasEhContinuationMetadata() {
    const auto base = reinterpret_cast<std::uintptr_t>(GetModuleHandleW(nullptr));
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    const auto directory = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_LOAD_CONFIG];
    if (directory.Size < offsetof(IMAGE_LOAD_CONFIG_DIRECTORY64, GuardEHContinuationCount) + sizeof(ULONGLONG)) return false;
    const auto* config = reinterpret_cast<const IMAGE_LOAD_CONFIG_DIRECTORY64*>(base + directory.VirtualAddress);
    if (!(config->GuardFlags & IMAGE_GUARD_EH_CONTINUATION_TABLE_PRESENT) ||
        config->GuardEHContinuationCount == 0 || config->GuardEHContinuationCount > 4096) return false;
    const auto* table = reinterpret_cast<const unsigned char*>(config->GuardEHContinuationTable);
    const auto stride = sizeof(DWORD) + (config->GuardFlags >> 28);
    const auto gate_rva = reinterpret_cast<std::uintptr_t>(&OwnedColdGate) - base;
    for (ULONGLONG i = 0; i < config->GuardEHContinuationCount; ++i) {
        DWORD rva = 0;
        std::memcpy(&rva, table + i * stride, sizeof(rva));
        if (rva == gate_rva) return true;
    }
    std::cerr << "EHCONT table omits gate RVA " << std::hex << gate_rva << std::dec << "\n";
    return false;
}

bool UnwindCases(std::size_t& passed, std::size_t& examined) {
    alignas(16) std::array<DWORD64, 2200> stack{};
    auto* body = stack.data() + 2100;
    body[0x58 / 8] = 0x1122334455667788;
    body[0x30 / 8] = 15;
    body[0x38 / 8] = 13;
    body[0x40 / 8] = 12;
    body[0x48 / 8] = 14;
    body[0x50 / 8] = 5;
    body[0x60 / 8] = 3;
    body[0x68 / 8] = 6;
    body[0x70 / 8] = 7;
    body[0x20 / 8] = 0x123;
    body[0x28 / 8] = 0x456;
    for (DWORD64 i = 0; i < OwnedColdCaseCount; ++i) {
        // MASM exports every actual instruction boundary with its stack depth.
        // Never treat CALL displacement bytes as possible instruction PCs.
        {
            const auto pc = OwnedColdCases[i].pc;
            CONTEXT context{};
            context.ContextFlags = CONTEXT_ALL;
            context.Rip = pc;
            context.Rsp = reinterpret_cast<DWORD64>(body) - OwnedColdCases[i].depth;
            DWORD64 base = 0;
            const auto* function = RtlLookupFunctionEntry(pc, &base, nullptr);
            ++examined;
            if (!function) continue;
            void* data = nullptr;
            DWORD64 frame = 0;
            RtlVirtualUnwind(UNW_FLAG_NHANDLER, base, pc, const_cast<PRUNTIME_FUNCTION>(function),
                &context, &data, &frame, nullptr);
            const bool good = context.Rip == body[0x58 / 8] &&
                context.Rsp == reinterpret_cast<DWORD64>(body) + 0x60 &&
                context.R15 == 15 && context.R13 == 13 && context.R12 == 12 &&
                context.R14 == 14 && context.Rbp == 5 && context.Rbx == 3 &&
                context.Rsi == 6 && context.Rdi == 7 &&
                context.Xmm6.Low == 0x123 && context.Xmm6.High == 0x456;
            if (good) ++passed;
            else std::cerr << "unwind mismatch at gate offset " <<
                (pc - reinterpret_cast<DWORD64>(&OwnedColdGate)) << ", depth " <<
                OwnedColdCases[i].depth << "\n";
        }
    }
    return examined != 0 && passed == examined;
}
}

extern "C" void OwnedColdHelper() {
    wait_outside_handler.store(!handler_active.load());
    if (raise_fault.load()) {
        RaiseException(kOwnedFault, 0, 0, nullptr);
        return;
    }
    SetEvent(entered_event);
    if (WaitForSingleObject(release_event, 5000) != WAIT_OBJECT_0) {
        RaiseException(kOwnedFault + 1, 0, 0, nullptr);
        return;
    }
    OwnedColdClobber();
}

int main(int argc, char**) {
    if (argc != 1) {
        std::cerr << "{\"activationPermitted\":false,\"error\":\"owned diagnostic accepts no arguments\"}\n";
        return 2;
    }
    PROCESS_MITIGATION_CONTROL_FLOW_GUARD_POLICY cfg{};
    PROCESS_MITIGATION_USER_SHADOW_STACK_POLICY cet{};
    const bool cfg_known = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessControlFlowGuardPolicy, &cfg, sizeof(cfg)) != FALSE;
    const bool cet_known = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessUserShadowStackPolicy, &cet, sizeof(cet)) != FALSE;
    int cpu[4]{};
    __cpuid(cpu, 1);
    const bool xsave_available = (cpu[2] & (1 << 26)) && (cpu[2] & (1 << 27)) &&
        (cpu[2] & (1 << 28));
    unsigned int xstate_size = 0;
    if (xsave_available) {
        OwnedColdXcr0 = _xgetbv(0);
        __cpuidex(cpu, 0xd, 0);
        xstate_size = static_cast<unsigned int>(cpu[1]);
    }
    const bool ehcont_gate = GateHasEhContinuationMetadata();
    // Unknown mitigation status or a missing exact EHCONT target is refused.
    // No mitigation is disabled or weakened to run this owned fixture.
    const bool environment_supported = xsave_available && (OwnedColdXcr0 & 7) == 7 &&
        xstate_size >= 576 && xstate_size <= 0x3dc0 && cfg_known && cet_known &&
        ehcont_gate;
    std::size_t unwind_passed = 0, unwind_examined = 0;
    const bool unwind_ok = UnwindCases(unwind_passed, unwind_examined);
    bool normal_completed = true, gpr_ok = true, xstate_ok = true;
    bool waiting_observed = true, worker_remained_held = true, exceptional_unwind = false;
    DWORD64 independent_traffic = 0;
    const std::array<DWORD64, 8> seeds{0, 0xf, 0xff, 0x7fffffff,
        0xfffffffe, 0xffffffff, 0x12345678ffffffff, 0x1234567880000000};
    std::size_t executed = 0;
    if (environment_supported && unwind_ok) {
        for (std::size_t i = 0; i < sizeof(OwnedColdPatterns); ++i)
            OwnedColdPatterns[i] = static_cast<unsigned char>((i * 17 + 3) & 0xff);
        entered_event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        release_event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        void* handler = AddVectoredExceptionHandler(1, Redirect);
        if (entered_event && release_event && handler) {
            for (std::size_t run = 0; run < seeds.size(); ++run) {
                OwnedColdSeedR15 = seeds[run];
                OwnedColdSeedFlags = 0x202 | (run & 1) | ((run & 2) ? 0x400 : 0);
                ResetEvent(entered_event);
                ResetEvent(release_event);
                bool completed = false;
                std::thread worker([&] { completed = RunOwned(); });
                const bool entered = WaitForSingleObject(entered_event, 5000) == WAIT_OBJECT_0;
                waiting_observed = waiting_observed && entered;
                const bool held = entered && WaitForSingleObject(worker.native_handle(), 25) == WAIT_TIMEOUT;
                worker_remained_held = worker_remained_held && held;
                if (held) {
                    // Controller progresses while the actual worker remains blocked.
                    for (int i = 0; i < 100; ++i) ++independent_traffic;
                }
                SetEvent(release_event);
                worker.join();
                ++executed;
                normal_completed = normal_completed && completed;
                gpr_ok = gpr_ok && std::memcmp(OwnedColdBeforeGpr, OwnedColdAfterGpr,
                                              sizeof(OwnedColdBeforeGpr)) == 0;
                xstate_ok = xstate_ok && std::memcmp(OwnedColdBeforeXstate,
                                                    OwnedColdAfterXstate, xstate_size) == 0;
                if (!completed || !gpr_ok || !xstate_ok || !held) break;
            }
            raise_fault.store(true);
            native_exception.store(0);
            const bool fault_returned = RunOwned();
            exceptional_unwind = !fault_returned && native_exception.load() == kOwnedFault;
        }
        if (handler) RemoveVectoredExceptionHandler(handler);
        if (entered_event) CloseHandle(entered_event);
        if (release_event) CloseHandle(release_event);
    }
    normal_completed = executed != 0 && normal_completed;
    gpr_ok = executed != 0 && gpr_ok;
    xstate_ok = executed != 0 && xstate_ok;
    waiting_observed = executed != 0 && waiting_observed;
    worker_remained_held = executed != 0 && worker_remained_held;
    const bool passed = environment_supported && unwind_ok && normal_completed && gpr_ok &&
        xstate_ok && waiting_observed && wait_outside_handler.load() &&
        worker_remained_held && executed == seeds.size() && independent_traffic == 800 &&
        exceptional_unwind && handler_hits.load() == 9;
    std::cout << std::boolalpha <<
        "{\"scope\":\"owned-cold-fragment-continuation\",\"activationPermitted\":false,"
        "\"tf3Qualified\":false,\"tf3CetQualified\":false,\"crossImageContinuationQualified\":false,"
        "\"fixturePassed\":" << passed <<
        ",\"environmentSupported\":" << environment_supported <<
        ",\"gateInEhContinuationTable\":" << ehcont_gate <<
        ",\"cfgEnabled\":" << (cfg.EnableControlFlowGuard != 0) <<
        ",\"cfgKnown\":" << cfg_known <<
        ",\"cetEnabled\":" << (cet.EnableUserShadowStack != 0) <<
        ",\"cetIpValidation\":" << (cet.SetContextIpValidation != 0) <<
        ",\"cetKnown\":" << cet_known <<
        ",\"xcr0\":" << OwnedColdXcr0 <<
        ",\"xstateBytes\":" << xstate_size <<
        ",\"seededAvx512\":" << (executed != 0 && (OwnedColdXcr0 & 0xe0) == 0xe0) <<
        ",\"normalCases\":" << executed <<
        ",\"unwindPassed\":" << unwind_passed <<
        ",\"unwindExamined\":" << unwind_examined <<
        ",\"normalCompleted\":" << normal_completed <<
        ",\"allGprAndFlagsPreserved\":" << gpr_ok <<
        ",\"enabledXstatePreserved\":" << xstate_ok <<
        ",\"waitOutsideVeh\":" << wait_outside_handler.load() <<
        ",\"waitingObserved\":" << waiting_observed <<
        ",\"workerRemainedHeld\":" << worker_remained_held <<
        ",\"independentTraffic\":" << independent_traffic <<
        ",\"nativeExceptionReachedCaller\":" << exceptional_unwind <<
        ",\"ownedCetExecutionVerified\":" << (passed && cet.EnableUserShadowStack && cet.SetContextIpValidation) <<
        ",\"handlerHits\":" << handler_hits.load() << "}\n";
    return passed ? 0 : 1;
}
