#include "owned_integrated_gate.h"

#include <windows.h>
#include <iostream>
#include <string>

namespace {
bool RunTerminalChild(const wchar_t* mode) {
    wchar_t executable[MAX_PATH]{};
    if (!GetModuleFileNameW(nullptr, executable, MAX_PATH)) return false;
    std::wstring command = L"\"";
    command += executable;
    command += L"\" ";
    command += mode;
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    if (!CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE,
            CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process)) return false;
    const auto wait = WaitForSingleObject(process.hProcess, 10000);
    DWORD exit_code = 1;
    if (wait == WAIT_OBJECT_0) {
        (void)GetExitCodeProcess(process.hProcess, &exit_code);
    } else {
        // Owned disposable fixture only; never force-resume a parked thread.
        (void)TerminateProcess(process.hProcess, 3);
        (void)WaitForSingleObject(process.hProcess, 5000);
    }
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return wait == WAIT_OBJECT_0 && exit_code == 0;
}
}

int main(int argc, char** argv) {
    if (argc == 2 && std::string(argv[1]) == "--halt-before-child") {
        const bool passed = owned_integrated::RunTerminalFixture(false);
        std::cout.flush();
        ExitProcess(passed ? 0u : 1u);
    }
    if (argc == 2 && std::string(argv[1]) == "--halt-after-child") {
        const bool passed = owned_integrated::RunTerminalFixture(true);
        std::cout.flush();
        ExitProcess(passed ? 0u : 1u);
    }
    if (argc == 2 && std::string(argv[1]) == "--halt-running-child") {
        const bool passed = owned_integrated::RunRunningHaltFixture();
        std::cout.flush();
        ExitProcess(passed ? 0u : 1u);
    }
    if (argc == 2 && std::string(argv[1]) == "--foreign-boundary-child") {
        const bool passed = owned_integrated::RunForeignBoundaryFixture();
        std::cout.flush();
        ExitProcess(passed ? 0u : 1u);
    }
    if (argc != 1) {
        std::cerr << "{\"activationPermitted\":false,\"error\":\"owned diagnostic rejects activation arguments\"}\n";
        return 2;
    }

    owned_integrated::Report report{};
    const bool base = owned_integrated::RunFixture(report);
    report.halt_before = RunTerminalChild(L"--halt-before-child");
    report.halt_after = RunTerminalChild(L"--halt-after-child");
    report.halt_while_running = RunTerminalChild(L"--halt-running-child");
    report.foreign_boundary = RunTerminalChild(L"--foreign-boundary-child");
    const bool passed = base && report.halt_before && report.halt_after &&
        report.halt_while_running && report.foreign_boundary;
    std::cout << std::boolalpha
        << "{\"scope\":\"owned-integrated-gate\",\"activationPermitted\":false,"
        << "\"tf3Qualified\":false,\"fixturePassed\":" << passed
        << ",\"passiveObservation\":" << report.passive
        << ",\"requestHold\":" << report.held
        << ",\"helperOutsideVeh\":" << report.helper_outside_veh
        << ",\"controllerProgress\":" << report.controller_progress
        << ",\"oneReleaseRehold\":" << report.release_reheld
        << ",\"appliedVsConsumed\":" << report.applied_consumed
        << ",\"haltBeforeConsumption\":" << report.halt_before
        << ",\"haltAfterConsumption\":" << report.halt_after
        << ",\"haltWhileRunningAtNextBoundary\":" << report.halt_while_running
        << ",\"foreignBoundaryRejectedBeforeXstate\":" << report.foreign_boundary
        << ",\"modeledDetachHandshake\":" << report.detach
        << ",\"controlWrongOwnerFaultClosed\":" << report.wrong_owner
        << ",\"controlNestedFaultClosed\":" << report.nested
        << ",\"stepEmulatedExactlyOnce\":" << report.step_exactly_once
        << ",\"incrementFlagsEmulated\":" << report.flags_emulated
        << ",\"helperAbiAligned\":" << report.helper_abi_aligned
        << ",\"completeEnabledXstate\":" << report.complete_xstate
        << ",\"enabledXstatePreserved\":" << report.xstate_preserved
        << ",\"faultParkUnwindQualified\":" << report.fault_park_unwind
        << ",\"xcr0\":" << report.xcr0
        << ",\"xstateBytes\":" << report.xstate_bytes
        << ",\"generation\":" << report.generation
        << ",\"consumed\":" << report.consumed
        << ",\"applied\":" << report.applied << "}\n";
    return passed ? 0 : 1;
}
