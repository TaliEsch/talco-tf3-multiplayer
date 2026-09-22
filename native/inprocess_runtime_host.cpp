#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdio>
#include <string>

#include "inprocess_runtime_api.h"

int wmain(int argc, wchar_t** argv) {
    if (argc != 2) return 2;
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
                                       L"tf3mp_owned_runtime_test", token.c_str()};
    const DWORD result = function(&valid);
    FreeLibrary(module);
    if (result != TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE) return 7;
    std::printf("inprocess-runtime-gate-passed status=%lu\n",
                static_cast<unsigned long>(result));
    return 0;
}
