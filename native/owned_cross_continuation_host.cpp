// Owned EXE caller for the separate-DLL continuation fixture. No game access.
#include "owned_cross_continuation.h"
#include <intrin.h>
#include <array>
#include <atomic>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <thread>
extern "C" {
void OwnedCrossStep();
extern unsigned char OwnedCrossTrap, OwnedCrossResume;
alignas(64) unsigned char OwnedCrossEntryXstate[16384]{};
alignas(64) unsigned char OwnedCrossBeforeXstate[16384]{};
alignas(64) unsigned char OwnedCrossAfterXstate[16384]{};
alignas(64) unsigned char OwnedCrossPatterns[384]{};
alignas(16) DWORD64 OwnedCrossBeforeGpr[17]{}, OwnedCrossAfterGpr[17]{};
DWORD64 OwnedCrossXcr0 = 0, OwnedCrossSeedR15 = 0, OwnedCrossSeedFlags = 0x202;
}
namespace {
constexpr DWORD kOwnedFault = 0xe0425433;
OwnedCrossArmFn arm = nullptr;
OwnedCrossFinishFn finish = nullptr;
std::atomic<DWORD> fault_code{0};

bool RunOwned(bool use_gate) {
    if (use_gate && !arm()) return false;
    __try {
        OwnedCrossStep();
        return !use_gate || finish(FALSE) != FALSE;
    } __except(EXCEPTION_EXECUTE_HANDLER) {
        fault_code.store(GetExceptionCode());
        _xrstor64(OwnedCrossEntryXstate, OwnedCrossXcr0);
        if (use_gate) finish(TRUE);
        return false;
    }
}
template<class T> T Export(HMODULE module, const char* name) {
    // Copy the Windows function pointer representation without /W4 C4191 casts.
    const auto address = GetProcAddress(module, name);
    T typed = nullptr;
    static_assert(sizeof(typed) == sizeof(address));
    std::memcpy(&typed, &address, sizeof(typed));
    return typed;
}
}
int main(int argc, char**) {
    if (argc != 1) {
        std::cerr << "{\"activationPermitted\":false,\"error\":\"owned diagnostic accepts no arguments\"}\n";
        return 2;
    }
    int cpu[4]{};
    __cpuid(cpu, 1);
    const bool supported = (cpu[2] & (1 << 26)) && (cpu[2] & (1 << 27)) && (cpu[2] & (1 << 28));
    unsigned int xstate_bytes = 0;
    if (supported) {
        OwnedCrossXcr0 = _xgetbv(0);
        __cpuidex(cpu, 0xd, 0);
        xstate_bytes = static_cast<unsigned int>(cpu[1]);
    }
    if (!supported || (OwnedCrossXcr0 & 7) != 7 || xstate_bytes < 576 || xstate_bytes > 0x3dc0) {
        std::cerr << "{\"activationPermitted\":false,\"error\":\"unsupported owned XSAVE environment\"}\n";
        return 1;
    }
    std::array<wchar_t, 32768> path{};
    const auto length = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
    if (length == 0 || length >= path.size()) return 1;
    const auto dll_path = std::filesystem::path(path.data()).parent_path() / L"TF3OwnedCrossGate.dll";
    HMODULE dll = LoadLibraryExW(dll_path.c_str(), nullptr,
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    if (!dll) {
        std::cerr << "owned fixture DLL load failed " << GetLastError() << "\n";
        return 1;
    }
    const auto start = Export<OwnedCrossStartFn>(dll, "OwnedCrossStart");
    arm = Export<OwnedCrossArmFn>(dll, "OwnedCrossArm");
    finish = Export<OwnedCrossFinishFn>(dll, "OwnedCrossFinish");
    const auto set_fault = Export<OwnedCrossFaultFn>(dll, "OwnedCrossSetFault");
    const auto stop = Export<OwnedCrossStopFn>(dll, "OwnedCrossStop");
    const auto read = Export<OwnedCrossReportFn>(dll, "OwnedCrossRead");
    if (!start || !arm || !finish || !set_fault || !stop || !read) return 1;
    HANDLE entered = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HANDLE release = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    constexpr bool legacy_host =
#ifdef OWNED_CROSS_LEGACY_HOST
        true;
#else
        false;
#endif
    const auto resume_policy = legacy_host ? OwnedCrossResumePolicy::require_legacy_no_table :
        OwnedCrossResumePolicy::require_ehcont;
    const OwnedCrossConfig config{sizeof(OwnedCrossConfig), GetModuleHandleW(nullptr),
        &OwnedCrossTrap, &OwnedCrossResume, entered, release, OwnedCrossXcr0, resume_policy};
    OwnedCrossConfig invalid = config;
    invalid.xcr0 ^= 1;
    const bool bad_xcr0_rejected = start(&invalid) == FALSE;
    invalid = config;
    invalid.continuation = &OwnedCrossTrap;
    const bool bad_resume_rejected = start(&invalid) == FALSE;
    if (!entered || !release || !start(&config)) {
        std::cerr << "owned fixture qualification failed before activation\n";
        return 1;
    }
    OwnedCrossReport initial{sizeof(OwnedCrossReport)};
    const bool owner_xstate_precommitted = read(&initial) && initial.owner_xstate_committed &&
        initial.owner_xstate_bytes == xstate_bytes && initial.owner_xstate_address != 0 &&
        (initial.owner_xstate_address & 63) == 0;
    for (std::size_t i = 0; i < sizeof(OwnedCrossPatterns); ++i)
        OwnedCrossPatterns[i] = static_cast<unsigned char>((i * 17 + 3) & 0xff);
    const std::array<DWORD64, 8> seeds{0, 0xf, 0xff, 0x7fffffff,
        0xfffffffe, 0xffffffff, 0x12345678ffffffff, 0x1234567880000000};
    bool completed = true, registers = true, xstate = true, held = true, busy_stop_rejected = true;
    bool wrong_owner_rejected = true;
    unsigned int normal_cases = 0, controller_progress = 0;
    for (std::size_t i = 0; i < seeds.size(); ++i) {
        OwnedCrossSeedR15 = seeds[i];
        OwnedCrossSeedFlags = 0x202 | (i & 1) | ((i & 2) ? 0x400 : 0);
        ResetEvent(entered);
        ResetEvent(release);
        bool returned = false;
        std::thread worker([&] { returned = RunOwned(true); });
        const bool reached = WaitForSingleObject(entered, 5000) == WAIT_OBJECT_0;
        const bool blocked = reached && WaitForSingleObject(worker.native_handle(), 25) == WAIT_TIMEOUT;
        held = held && blocked;
        if (blocked) {
            OwnedCrossReport during{sizeof(OwnedCrossReport)};
            busy_stop_rejected = busy_stop_rejected && stop() == FALSE &&
                read(&during) && during.in_flight == 1 && during.parked == 1;
            wrong_owner_rejected = wrong_owner_rejected && arm() == FALSE && finish(FALSE) == FALSE;
            controller_progress += 100;
        }
        SetEvent(release);
        worker.join();
        ++normal_cases;
        completed = completed && returned;
        registers = registers && std::memcmp(OwnedCrossBeforeGpr, OwnedCrossAfterGpr,
                                             sizeof(OwnedCrossBeforeGpr)) == 0;
        xstate = xstate && std::memcmp(OwnedCrossBeforeXstate, OwnedCrossAfterXstate, xstate_bytes) == 0;
        if (!returned || !registers || !xstate || !blocked) break;
    }
    set_fault(TRUE);
    const bool exceptional_return = RunOwned(true);
    const bool native_exception = !exceptional_return && fault_code.load() == kOwnedFault;
    const bool stop_after_join = stop() != FALSE;
    OwnedCrossReport report{sizeof(OwnedCrossReport)};
    read(&report);
    const bool fault_latched = report.native_fault == 1 && arm() == FALSE;
    const bool free_succeeded = FreeLibrary(dll) != FALSE;
    HMODULE retained = nullptr;
    const bool remained_loaded = GetModuleHandleExW(
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        reinterpret_cast<LPCWSTR>(read), &retained) && retained == dll;
    bool inert_bypass = false;
    if (stop_after_join && remained_loaded) {
        OwnedCrossSeedFlags = 0x202;
        inert_bypass = RunOwned(false) &&
            std::memcmp(OwnedCrossBeforeGpr, OwnedCrossAfterGpr, sizeof(OwnedCrossBeforeGpr)) == 0 &&
            std::memcmp(OwnedCrossBeforeXstate, OwnedCrossAfterXstate, xstate_bytes) == 0;
        read(&report);
    }
    CloseHandle(entered);
    CloseHandle(release);
    const bool owner_xstate_retained = report.owner_xstate_committed &&
        report.owner_xstate_address == initial.owner_xstate_address &&
        report.owner_xstate_bytes == initial.owner_xstate_bytes;
    const auto exe_address = reinterpret_cast<std::uintptr_t>(config.executable);
    const auto dll_address = reinterpret_cast<std::uintptr_t>(dll);
    const auto image_distance = exe_address > dll_address ? exe_address - dll_address : dll_address - exe_address;
    const bool passed = completed && registers && xstate && held && busy_stop_rejected &&
        bad_xcr0_rejected && bad_resume_rejected && wrong_owner_rejected &&
        normal_cases == 8 && controller_progress == 800 && native_exception && stop_after_join &&
        fault_latched && free_succeeded && remained_loaded && inert_bypass &&
        owner_xstate_precommitted && owner_xstate_retained && report.owner_xstate_external &&
        report.ehcont_parser_cases && report.gate_stack_bytes == 0x100 &&
        report.entries == 9 && report.returns == 8 && report.bypasses == 1 &&
        report.entry_ehcont &&
        (legacy_host ? report.resume_ehcont_state == OwnedCrossEhContinuationState::table_absent :
                       report.resume_ehcont != 0) &&
        report.unwind_passed == report.unwind_examined && report.unwind_examined == 44;
    std::cout << std::boolalpha <<
        "{\"scope\":\"owned-cross-image-continuation\",\"activationPermitted\":false,"
        "\"tf3Qualified\":false,\"productionLifecycleQualified\":false,\"fixturePassed\":" << passed <<
        ",\"normalCases\":" << normal_cases << ",\"entries\":" << report.entries <<
        ",\"returns\":" << report.returns << ",\"inertBypasses\":" << report.bypasses <<
        ",\"gprAndFlagsPreserved\":" << registers << ",\"enabledXstatePreserved\":" << xstate <<
        ",\"xstateBytes\":" << xstate_bytes << ",\"xcr0\":" << OwnedCrossXcr0 <<
        ",\"gateStackBytes\":" << report.gate_stack_bytes <<
        ",\"ownerXstateBytes\":" << report.owner_xstate_bytes <<
        ",\"ownerXstatePrecommitted\":" << owner_xstate_precommitted <<
        ",\"ownerXstateExternal\":" << (report.owner_xstate_external != 0) <<
        ",\"ownerXstateRetained\":" << owner_xstate_retained <<
        ",\"ehcontParserCasesPassed\":" << (report.ehcont_parser_cases != 0) <<
        ",\"workerHeld\":" << held << ",\"controllerProgress\":" << controller_progress <<
        ",\"nativeExceptionReachedExeCaller\":" << native_exception <<
        ",\"busyStopRejected\":" << busy_stop_rejected << ",\"stopAfterJoin\":" << stop_after_join <<
        ",\"badXcr0Rejected\":" << bad_xcr0_rejected << ",\"badResumeRejected\":" << bad_resume_rejected <<
        ",\"wrongOwnerRejected\":" << wrong_owner_rejected <<
        ",\"faultLatched\":" << fault_latched << ",\"freeLibrarySucceeded\":" << free_succeeded <<
        ",\"pinnedModuleRemainedLoaded\":" << remained_loaded <<
        ",\"inertBypassPreservedState\":" << inert_bypass <<
        ",\"entryEhcont\":" << (report.entry_ehcont != 0) <<
        ",\"resumeEhcont\":" << (report.resume_ehcont != 0) <<
        ",\"entryEhcontState\":" << static_cast<unsigned int>(report.entry_ehcont_state) <<
        ",\"resumeEhcontState\":" << static_cast<unsigned int>(report.resume_ehcont_state) <<
        ",\"legacyExeWithoutEhcont\":" << legacy_host <<
        ",\"cfgEnabled\":" << (report.cfg != 0) << ",\"cetEnabled\":" << (report.cet != 0) <<
        ",\"cetIpValidation\":" << (report.ip_validation != 0) <<
        ",\"unwindPassed\":" << report.unwind_passed << ",\"unwindExamined\":" << report.unwind_examined <<
        ",\"imagesBeyondRel32\":" << (image_distance > 0x7fffffffULL) << "}\n";
    return passed ? 0 : 1;
}
