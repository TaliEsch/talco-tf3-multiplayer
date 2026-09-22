// Owned cross-image diagnostic DLL only. Not linked to the TF3 runtime.
// Exact static fixture sites are provided by its owned EXE, not discovered in TF3.
#include "owned_cross_continuation.h"
#include <intrin.h>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstring>
#include <iostream>

extern "C" {
extern unsigned char OwnedCrossGate, OwnedCrossGateEnd, OwnedCrossReturnTrap;
struct UnwindCase { DWORD64 pc; DWORD64 depth; };
extern const UnwindCase OwnedCrossCases[];
extern const DWORD64 OwnedCrossCaseCount;
void OwnedCrossClobber();
DWORD64 OwnedCrossXcr0 = 0;
DWORD OwnedCrossScratchMxcsr = 0x5f80;
}
namespace {
constexpr DWORD kOwnedFault = 0xe0425433;
OwnedCrossConfig config{};
std::atomic<DWORD> owner{0}, entries{0}, returns{0}, bypasses{0};
std::atomic<bool> in_flight{false}, parked{false}, stopped{false}, native_fault{false};
std::atomic<bool> force_fault{false};
std::atomic<DWORD64> original_rsp{0};
bool started = false, pinned = false, entry_ehcont = false, resume_ehcont = false;
DWORD cfg_flags = 0, cet_flags = 0, ip_flags = 0;
std::size_t unwind_passed = 0, unwind_examined = 0;
static_assert(std::atomic<DWORD>::is_always_lock_free);
static_assert(std::atomic<DWORD64>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);

bool HasEhContinuation(HMODULE module, const void* target) {
    const auto base = reinterpret_cast<std::uintptr_t>(module);
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    const auto dir = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_LOAD_CONFIG];
    if (dir.Size < offsetof(IMAGE_LOAD_CONFIG_DIRECTORY64, GuardEHContinuationCount) + sizeof(ULONGLONG))
        return false;
    const auto* lc = reinterpret_cast<const IMAGE_LOAD_CONFIG_DIRECTORY64*>(base + dir.VirtualAddress);
    if (!(lc->GuardFlags & IMAGE_GUARD_EH_CONTINUATION_TABLE_PRESENT) ||
        lc->GuardEHContinuationCount == 0 || lc->GuardEHContinuationCount > 4096) return false;
    const auto* table = reinterpret_cast<const unsigned char*>(lc->GuardEHContinuationTable);
    const auto stride = sizeof(DWORD) + (lc->GuardFlags >> 28);
    const auto rva = reinterpret_cast<std::uintptr_t>(target) - base;
    for (ULONGLONG i = 0; i < lc->GuardEHContinuationCount; ++i) {
        DWORD value = 0;
        std::memcpy(&value, table + i * stride, sizeof(value));
        if (value == rva) return true;
    }
    return false;
}
bool IsOwnedImageCode(HMODULE module, const void* address) {
    MEMORY_BASIC_INFORMATION memory{};
    return VirtualQuery(address, &memory, sizeof(memory)) == sizeof(memory) &&
        memory.Type == MEM_IMAGE && memory.State == MEM_COMMIT &&
        memory.AllocationBase == module && memory.Protect == PAGE_EXECUTE_READ;
}
LONG CALLBACK Redirect(EXCEPTION_POINTERS* pointers) noexcept {
    if (!pointers || !pointers->ExceptionRecord || !pointers->ContextRecord ||
        pointers->ExceptionRecord->ExceptionCode != EXCEPTION_BREAKPOINT ||
        pointers->ExceptionRecord->ExceptionFlags != 0) return EXCEPTION_CONTINUE_SEARCH;
    auto* context = pointers->ContextRecord;
    const auto address = pointers->ExceptionRecord->ExceptionAddress;
    if (context->Rip != reinterpret_cast<DWORD64>(address)) return EXCEPTION_CONTINUE_SEARCH;
    if (address == config.trap) {
        if (stopped.load(std::memory_order_acquire)) {
            // Retained inert VEH safely bypasses the fixture's permanent INT3.
            context->Rip = reinterpret_cast<DWORD64>(config.continuation);
            bypasses.fetch_add(1, std::memory_order_relaxed);
            return EXCEPTION_CONTINUE_EXECUTION;
        }
        if (owner.load(std::memory_order_relaxed) != GetCurrentThreadId() ||
            in_flight.load(std::memory_order_relaxed) || native_fault.load(std::memory_order_relaxed))
            return EXCEPTION_CONTINUE_SEARCH;
        original_rsp.store(context->Rsp, std::memory_order_relaxed);
        in_flight.store(true, std::memory_order_release);
        entries.fetch_add(1, std::memory_order_relaxed);
        context->Rip = reinterpret_cast<DWORD64>(&OwnedCrossGate);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    if (address == &OwnedCrossReturnTrap &&
        owner.load(std::memory_order_relaxed) == GetCurrentThreadId() &&
        in_flight.load(std::memory_order_acquire) &&
        context->Rsp == original_rsp.load(std::memory_order_relaxed)) {
        // No relative displacement, fabricated return, wait, allocation or IPC.
        context->Rip = reinterpret_cast<DWORD64>(config.continuation);
        returns.fetch_add(1, std::memory_order_relaxed);
        in_flight.store(false, std::memory_order_release);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    return EXCEPTION_CONTINUE_SEARCH;
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
    for (DWORD64 i = 0; i < OwnedCrossCaseCount; ++i) {
        // MASM exports every actual instruction boundary with its stack depth.
        // Never treat CALL displacement bytes as possible instruction PCs.
        {
            const auto pc = OwnedCrossCases[i].pc;
            CONTEXT context{};
            context.ContextFlags = CONTEXT_ALL;
            context.Rip = pc;
            context.Rsp = reinterpret_cast<DWORD64>(body) - OwnedCrossCases[i].depth;
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
                (pc - reinterpret_cast<DWORD64>(&OwnedCrossGate)) << ", depth " <<
                OwnedCrossCases[i].depth << "\n";
        }
    }
    return examined != 0 && passed == examined;
}
}

extern "C" void OwnedCrossHelper() {
    if (force_fault.load()) {
        RaiseException(kOwnedFault, 0, 0, nullptr);
        return;
    }
    parked.store(true, std::memory_order_release);
    SetEvent(config.entered);
    const auto wait = WaitForSingleObject(config.release, 5000);
    parked.store(false, std::memory_order_release);
    if (wait != WAIT_OBJECT_0) {
        RaiseException(kOwnedFault + 1, 0, 0, nullptr);
        return;
    }
    OwnedCrossClobber();
}

extern "C" __declspec(dllexport) BOOL OwnedCrossStart(const OwnedCrossConfig* input) {
    if (started || !input || input->size != sizeof(OwnedCrossConfig) ||
        input->executable != GetModuleHandleW(nullptr) || !input->entered || !input->release ||
        !IsOwnedImageCode(input->executable, input->trap) ||
        !IsOwnedImageCode(input->executable, input->continuation) ||
        reinterpret_cast<std::uintptr_t>(input->continuation) != reinterpret_cast<std::uintptr_t>(input->trap) + 1 ||
        *static_cast<const unsigned char*>(input->trap) != 0xcc) return FALSE;
    int cpu[4]{};
    __cpuid(cpu, 1);
    if (!(cpu[2] & (1 << 26)) || !(cpu[2] & (1 << 27)) || !(cpu[2] & (1 << 28))) return FALSE;
    const auto xcr0 = _xgetbv(0);
    __cpuidex(cpu, 0xd, 0);
    if (input->xcr0 != xcr0 || (xcr0 & 7) != 7 || cpu[1] < 576 || cpu[1] > 0x3dc0) return FALSE;
    PROCESS_MITIGATION_CONTROL_FLOW_GUARD_POLICY cfg{};
    PROCESS_MITIGATION_USER_SHADOW_STACK_POLICY cet{};
    if (!GetProcessMitigationPolicy(GetCurrentProcess(), ProcessControlFlowGuardPolicy, &cfg, sizeof(cfg)) ||
        !GetProcessMitigationPolicy(GetCurrentProcess(), ProcessUserShadowStackPolicy, &cet, sizeof(cet)))
        return FALSE;
    cfg_flags = cfg.EnableControlFlowGuard;
    cet_flags = cet.EnableUserShadowStack;
    ip_flags = cet.SetContextIpValidation;
    HMODULE self = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            reinterpret_cast<LPCWSTR>(&OwnedCrossGate), &self)) return FALSE;
    entry_ehcont = HasEhContinuation(self, &OwnedCrossGate);
    resume_ehcont = HasEhContinuation(input->executable, input->continuation);
    if (!entry_ehcont || !resume_ehcont || !UnwindCases(unwind_passed, unwind_examined)) return FALSE;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
            reinterpret_cast<LPCWSTR>(&OwnedCrossGate), &self)) return FALSE;
    pinned = true;
    config = *input;
    OwnedCrossXcr0 = input->xcr0;
    if (!AddVectoredExceptionHandler(1, Redirect)) return FALSE;
    started = true;
    return TRUE;
}
extern "C" __declspec(dllexport) BOOL OwnedCrossArm() {
    if (!started || stopped.load() || native_fault.load() || in_flight.load()) return FALSE;
    DWORD expected = 0;
    return owner.compare_exchange_strong(expected, GetCurrentThreadId()) ? TRUE : FALSE;
}
extern "C" __declspec(dllexport) void OwnedCrossSetFault(BOOL value) { force_fault.store(value != FALSE); }
extern "C" __declspec(dllexport) BOOL OwnedCrossFinish(BOOL faulted) {
    if (owner.load() != GetCurrentThreadId()) return FALSE;
    if (faulted) {
        native_fault.store(true);
        in_flight.store(false); // Explicit acknowledgement AFTER caller has unwound.
    } else if (in_flight.load()) return FALSE;
    owner.store(0);
    return TRUE;
}
extern "C" __declspec(dllexport) BOOL OwnedCrossStop() {
    // Fixture protocol calls Stop only while parked (must reject) or after join.
    // This is not a general concurrent lifecycle implementation.
    if (!started || owner.load() != 0 || in_flight.load()) return FALSE;
    stopped.store(true, std::memory_order_release);
    return TRUE;
}
extern "C" __declspec(dllexport) BOOL OwnedCrossRead(OwnedCrossReport* output) {
    if (!output || output->size != sizeof(OwnedCrossReport)) return FALSE;
    *output = {sizeof(OwnedCrossReport), entries.load(), returns.load(), bypasses.load(), owner.load(),
        in_flight.load() ? 1u : 0u, parked.load() ? 1u : 0u, stopped.load() ? 1u : 0u,
        pinned ? 1u : 0u, native_fault.load() ? 1u : 0u,
        static_cast<DWORD>(unwind_passed), static_cast<DWORD>(unwind_examined),
        entry_ehcont ? 1u : 0u, resume_ehcont ? 1u : 0u, cfg_flags, cet_flags, ip_flags};
    return TRUE;
}
