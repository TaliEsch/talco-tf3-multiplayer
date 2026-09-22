// An intentionally FAIL-CLOSED ABI assessment, NOT an implementation of hold.
// A normal PROC FRAME describes a call-pushed return address. Redirecting RIP
// alone from an interior instruction supplies no such address. This executable
// verifies that distinction using Windows' real virtual unwinder on owned data,
// without running the unsafe redirection or raising an exception across it.
//
// Exact-build context, independently re-read with the hash-pinned disassembler:
// SHA256 a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5
// 1593B0 PUSH RBP; PUSH R14; SUB RSP,48h => body RSP = entry RSP - 58h.
// 15957C CALL 2BB4C90; 159581 INC R15D; 159584 CMP R15D,R12D;
// 159587 JL 1594C0; fallthrough 15958D. After emulating INC, resume at 159584.
// Body RSP is 16-byte aligned. [body RSP] is NOT a return slot; the real return
// is at +58h. Saved XMM6 is at +20h; R15 +30h, R13 +38h, R12 +40h,
// R14 +48h, RBP +50h, RBX +60h, RSI +68h, RDI +70h.
// These are diagnostic facts, not addresses used to access or activate TF3.
//
// Microsoft documents that chained unwind cannot add a fixed stack allocation
// to its primary frame, and PUSH_MACHFRAME presupposes the machine frame:
// https://learn.microsoft.com/en-us/cpp/build/exception-handling-x64
// Therefore neither is presumed to repair arbitrary entry here. A machine-frame
// bootstrap, every intermediate instruction's unwind, native exception search /
// propagation and CET behavior would need independent qualification. No claim
// that a safe design is impossible is made by rejecting this conventional one.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <array>
#include <cstdint>
#include <iostream>

extern "C" int OwnedConventionalFrameProbe();
extern "C" unsigned char OwnedConventionalFrameBody;

namespace {
constexpr std::size_t kAllocation = 0x28;
constexpr std::size_t kInterruptedFrameSize = 0x58;
constexpr DWORD64 kLocalCanary = 0x1122334455667788ull;
constexpr DWORD64 kCallerCanary = 0x8877665544332211ull;

struct UnwindResult {
    bool found = false;
    DWORD64 rip = 0;
    DWORD64 rsp = 0;
};

UnwindResult UnwindOwnedStack(DWORD64 initial_rsp) {
    CONTEXT context{};
    context.ContextFlags = CONTEXT_CONTROL;
    context.Rip = reinterpret_cast<DWORD64>(&OwnedConventionalFrameBody);
    context.Rsp = initial_rsp - kAllocation;
    DWORD64 image_base = 0;
    auto* entry = RtlLookupFunctionEntry(context.Rip, &image_base, nullptr);
    if (entry == nullptr) return {};
    void* handler_data = nullptr;
    DWORD64 establisher_frame = 0;
    RtlVirtualUnwind(UNW_FLAG_NHANDLER, image_base, context.Rip, entry,
                    &context, &handler_data, &establisher_frame, nullptr);
    return {true, context.Rip, context.Rsp};
}
}

int main(int argc, char**) {
    if (argc != 1) {
        std::cerr << "{\"qualified\":false,\"activationPermitted\":false,"
                     "\"error\":\"diagnostic accepts no arguments or activation mode\"}\n";
        return 2;
    }

    // The only assembly actually called obeys the ordinary Windows call ABI.
    const bool normal_call_executed = OwnedConventionalFrameProbe() == 1;
    alignas(16) std::array<std::uint64_t, 128> stack{};
    stack.fill(kLocalCanary);
    auto* interrupted_slot = stack.data() + 64; // interior body RSP mod 16 == 0
    auto* called_slot = stack.data() + 65;      // CALL entry RSP mod 16 == 8
    *called_slot = kCallerCanary;
    interrupted_slot[kInterruptedFrameSize / sizeof(std::uint64_t)] = kCallerCanary;
    const auto interrupted_rsp = reinterpret_cast<DWORD64>(interrupted_slot);
    const auto called_rsp = reinterpret_cast<DWORD64>(called_slot);
    const auto normal = UnwindOwnedStack(called_rsp);
    const auto redirected = UnwindOwnedStack(interrupted_rsp);
    const bool normal_unwind_correct = normal.found && normal.rip == kCallerCanary &&
        normal.rsp == called_rsp + sizeof(std::uint64_t);
    const bool redirected_reads_local = redirected.found && redirected.rip == kLocalCanary &&
        redirected.rsp == interrupted_rsp + sizeof(std::uint64_t);
    const bool redirected_loses_original_frame = redirected.found &&
        redirected.rip != interrupted_slot[kInterruptedFrameSize / sizeof(std::uint64_t)] &&
        redirected.rsp != interrupted_rsp + kInterruptedFrameSize + sizeof(std::uint64_t);
    const bool normal_helper_alignment = ((called_rsp - kAllocation) & 15u) == 0;
    const bool redirected_helper_alignment = ((interrupted_rsp - kAllocation) & 15u) == 0;
    const bool stack_canaries_intact = stack[64] == kLocalCanary &&
        stack[65] == kCallerCanary && stack[75] == kCallerCanary &&
        stack[63] == kLocalCanary && stack[76] == kLocalCanary;

    PROCESS_MITIGATION_CONTROL_FLOW_GUARD_POLICY cfg{};
    const bool cfg_known = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessControlFlowGuardPolicy, &cfg, sizeof(cfg)) != FALSE;
    const DWORD cfg_error = cfg_known ? ERROR_SUCCESS : GetLastError();
    PROCESS_MITIGATION_USER_SHADOW_STACK_POLICY cet{};
    const bool cet_known = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessUserShadowStackPolicy, &cet, sizeof(cet)) != FALSE;
    const DWORD cet_error = cet_known ? ERROR_SUCCESS : GetLastError();

    const bool assessment_passed = normal_call_executed && normal_unwind_correct &&
        redirected_reads_local && redirected_loses_original_frame && normal_helper_alignment &&
        !redirected_helper_alignment && stack_canaries_intact;
    std::cout << std::boolalpha
        << "{\"schema\":1,\"scope\":\"owned-negative-abi-assessment\","
           "\"qualified\":false,\"activationPermitted\":false,\"holdImplemented\":false,"
           "\"fullXstatePreserved\":false,\"nativeExceptionPropagationQualified\":false,"
           "\"stackWalkQualified\":false,\"unsafeRedirectionExecuted\":false,"
           "\"assessmentPassed\":" << assessment_passed
        << ",\"normalCallExecuted\":" << normal_call_executed
        << ",\"normalCallUnwindCorrect\":" << normal_unwind_correct
        << ",\"redirectedUnwindReadsLocalCanary\":" << redirected_reads_local
        << ",\"redirectedUnwindLosesOriginalFrame\":" << redirected_loses_original_frame
        << ",\"normalHelperCallAligned\":" << normal_helper_alignment
        << ",\"redirectedHelperCallAligned\":" << redirected_helper_alignment
        << ",\"stackCanariesIntact\":" << stack_canaries_intact
        << ",\"postSiteRva\":1414529,\"continuationRva\":1414532,"
           "\"interruptedRspAlignment\":16,\"interruptedReturnOffset\":88,"
           "\"cfgQuerySucceeded\":" << cfg_known
        << ",\"cfgQueryError\":" << cfg_error
        << ",\"cfgFlags\":" << cfg.Flags
        << ",\"cfgEnabled\":" << (cfg.EnableControlFlowGuard != 0)
        << ",\"cetQuerySucceeded\":" << cet_known
        << ",\"cetQueryError\":" << cet_error
        << ",\"cetFlags\":" << cet.Flags
        << ",\"cetEnabled\":" << (cet.EnableUserShadowStack != 0)
        << ",\"cetStrict\":" << (cet.EnableUserShadowStackStrictMode != 0)
        << ",\"residual\":\"No hold, register-state restoration, full XSTATE, native exception "
           "propagation, CFG/CET continuation, teardown or real-game gate qualified.\"}\n";
    // Success means the negative control demonstrated rejection, not a qualified gate.
    return assessment_passed ? 0 : 1;
}
