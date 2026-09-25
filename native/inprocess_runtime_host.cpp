#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdio>
#include <string>

#include "inprocess_runtime_api.h"

int wmain(int argc, wchar_t** argv) {
    if (argc != 2 && argc != 3 && argc != 4) return 2;
    const bool diagnostic_test = argc >= 3;
    const bool pipe_diagnostic = argc == 4 && wcscmp(argv[3], L"pipe") == 0;
    const bool passive_diagnostic = argc == 4 && wcscmp(argv[3], L"passive-pipe") == 0;
    const bool passive_conflict = argc == 4 && wcscmp(argv[3], L"passive-conflict") == 0;
    const bool boundary_diagnostic = argc == 4 && wcscmp(argv[3], L"boundary-pipe") == 0;
    const bool boundary_conflict = argc == 4 && wcscmp(argv[3], L"boundary-conflict") == 0;
    const bool cancellation_diagnostic = argc == 4 && wcscmp(argv[3], L"cancel-pipe") == 0;
    const bool cancellation_conflict = argc == 4 && wcscmp(argv[3], L"cancel-conflict") == 0;
    if (argc == 4 && !pipe_diagnostic && !passive_diagnostic && !passive_conflict &&
        !boundary_diagnostic && !boundary_conflict && !cancellation_diagnostic && !cancellation_conflict) return 2;
    if (!SetEnvironmentVariableW(L"TF3MP_NATIVE_DIAGNOSTIC",
                                diagnostic_test && !pipe_diagnostic && !passive_diagnostic &&
                                !boundary_diagnostic && !cancellation_diagnostic ? argv[2] : nullptr)) return 8;
    HMODULE module = LoadLibraryExW(argv[1], nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR |
                                                       LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (module == nullptr) return 3;
    const auto function = reinterpret_cast<Tf3InProcessRuntimeFunctionV1>(
        GetProcAddress(module, "Tf3InProcessRuntimeV1"));
    if (function == nullptr) {
        FreeLibrary(module);
        return 4;
    }
    if (function(nullptr) != TF3_INPROCESS_RUNTIME_INVALID_REQUEST) {
        FreeLibrary(module);
        return 5;
    }
    Tf3InProcessRuntimeRequestV1 malformed{sizeof(malformed),
                                           TF3_INPROCESS_RUNTIME_ABI_VERSION,
                                           L"../unsafe", L"bad"};
    if (function(&malformed) != TF3_INPROCESS_RUNTIME_INVALID_CREDENTIALS) {
        FreeLibrary(module);
        return 6;
    }
    const std::wstring token(64, L'a');
    Tf3InProcessRuntimeRequestV1 valid{sizeof(valid),
                                       TF3_INPROCESS_RUNTIME_ABI_VERSION,
                                       cancellation_diagnostic || cancellation_conflict ? L"tf3mp_cancel40401_owned" :
                                       boundary_diagnostic || boundary_conflict ? L"tf3mp_boundary40401_owned" :
                                       passive_diagnostic || passive_conflict ? L"tf3mp_passive40401_owned" :
                                       pipe_diagnostic ? L"tf3mp_diag40401_owned" : L"tf3mp_owned_runtime_test",
                                       token.c_str()};
    const DWORD result = function(&valid);
    const bool probe_loaded = GetModuleHandleW(L"TF3NativeProbe.dll") != nullptr;
    FreeLibrary(module);
    const DWORD expected = passive_conflict || boundary_conflict || cancellation_conflict || (diagnostic_test && !pipe_diagnostic &&
        !passive_diagnostic && !boundary_diagnostic && !cancellation_diagnostic && wcscmp(argv[2], L"40401") != 0)
        ? TF3_INPROCESS_RUNTIME_INVALID_DIAGNOSTIC : TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE;
    if (result != expected || (diagnostic_test && probe_loaded)) return 7;
    if (diagnostic_test) std::printf("diagnostic-rejected-no-probe=1 ");
    std::printf("inprocess-runtime-gate-passed status=%lu\n",
                static_cast<unsigned long>(result));
    return 0;
}
