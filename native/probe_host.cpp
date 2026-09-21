#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdint>
#include <cwchar>
#include <iostream>
#include <iomanip>
#include <string>

#include "probe_api.h"

// This executable is a loader/ABI smoke test only.  It never starts TF3, opens
// another process, or passes any game path to the probe DLL.
static_assert(sizeof(void*) == 8, "probe_host must be built for x64");

namespace {

using ProbeFunction = Tf3NativeProbeResult(WINAPI *)(const Tf3NativeProbeRequest*);

void PrintWin32Error(const wchar_t* operation);

bool IsExplicitAbsolutePath(const wchar_t* path) {
    if (path == nullptr || path[0] == L'\0') {
        return false;
    }

    // Accept only drive-rooted, UNC, or extended Win32 absolute paths.  In
    // particular, reject drive-relative (C:foo) and root-relative (\\foo) input.
    const bool drive_rooted =
        ((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')) &&
        path[1] == L':' && (path[2] == L'\\' || path[2] == L'/');
    const bool unc = path[0] == L'\\' && path[1] == L'\\' && path[2] != L'\0';
    return drive_rooted || unc;
}

bool IsValidResultLayout(const Tf3NativeProbeResult& result) {
    return result.struct_size == sizeof(Tf3NativeProbeResult) &&
        result.abi_version == TF3_NATIVE_PROBE_ABI_VERSION &&
        result.pointer_width_bits == 64 &&
        result.capability_flags == TF3_NATIVE_PROBE_CAPABILITY_NONE;
}

bool CheckInvalidRequest(ProbeFunction probe, const Tf3NativeProbeRequest& request,
                         const wchar_t* label) {
    const Tf3NativeProbeResult result = probe(&request);
    if (!IsValidResultLayout(result) || result.status != TF3_NATIVE_PROBE_STATUS_INVALID_REQUEST) {
        std::wcerr << L"probe ABI check failed for " << label << L" request\n";
        return false;
    }
    return true;
}

bool ExerciseOwnedProcessMemoryMismatch(ProbeFunction probe,
                                        const Tf3NativeProbeRequest& request) {
    auto* dos = reinterpret_cast<IMAGE_DOS_HEADER*>(GetModuleHandleW(nullptr));
    if (dos == nullptr || dos->e_magic != IMAGE_DOS_SIGNATURE) {
        std::wcerr << L"host main module does not have a readable DOS header\n";
        return false;
    }

    DWORD old_protection = 0;
    if (!VirtualProtect(dos, sizeof(dos->e_magic), PAGE_READWRITE, &old_protection)) {
        PrintWin32Error(L"VirtualProtect(test header writable)");
        return false;
    }
    const WORD original_magic = dos->e_magic;
    dos->e_magic = 0;
    const Tf3NativeProbeResult mismatch = probe(&request);
    dos->e_magic = original_magic;
    DWORD ignored_protection = 0;
    if (!VirtualProtect(dos, sizeof(dos->e_magic), old_protection, &ignored_protection)) {
        PrintWin32Error(L"VirtualProtect(restore test header protection)");
        return false;
    }
    if (!IsValidResultLayout(mismatch) ||
        mismatch.status != TF3_NATIVE_PROBE_STATUS_LOADED_IMAGE_MISMATCH) {
        std::wcerr << L"probe did not fail closed on owned-process image-header mismatch\n";
        return false;
    }
    return true;
}

void PrintWin32Error(const wchar_t* operation) {
    std::wcerr << operation << L" failed (Win32 error " << GetLastError() << L")\n";
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
    const bool exercise_memory_mismatch = argc == 3 &&
        std::wcscmp(argv[2], L"--exercise-memory-mismatch") == 0;
    if ((argc != 2 && !exercise_memory_mismatch) ||
        !IsExplicitAbsolutePath(argc >= 2 ? argv[1] : nullptr)) {
        std::wcerr << L"usage: probe_host.exe <absolute-path-to-probe-dll> [--exercise-memory-mismatch]\n";
        return 2;
    }

    const DWORD attributes = GetFileAttributesW(argv[1]);
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
        std::wcerr << L"probe DLL path does not name a file\n";
        return 2;
    }

    // The path is caller-supplied and absolute. Dependencies are limited to the
    // DLL directory and System32; the current directory is never searched.
    HMODULE module = LoadLibraryExW(
        argv[1], nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (module == nullptr) {
        PrintWin32Error(L"LoadLibraryExW");
        return 3;
    }

    const auto probe = reinterpret_cast<ProbeFunction>(GetProcAddress(module, "Tf3NativeProbeV1"));
    if (probe == nullptr) {
        PrintWin32Error(L"GetProcAddress(Tf3NativeProbeV1)");
        FreeLibrary(module);
        return 4;
    }

    const Tf3NativeProbeRequest wrong_size{
        sizeof(Tf3NativeProbeRequest) - sizeof(std::uint32_t), TF3_NATIVE_PROBE_ABI_VERSION};
    const Tf3NativeProbeRequest wrong_version{
        sizeof(Tf3NativeProbeRequest), TF3_NATIVE_PROBE_ABI_VERSION + 1};
    if (!CheckInvalidRequest(probe, wrong_size, L"wrong-size") ||
        !CheckInvalidRequest(probe, wrong_version, L"wrong-version")) {
        FreeLibrary(module);
        return 5;
    }
    const Tf3NativeProbeResult null_result = probe(nullptr);
    if (!IsValidResultLayout(null_result) || null_result.status != TF3_NATIVE_PROBE_STATUS_INVALID_REQUEST) {
        std::wcerr << L"probe did not reject a null request\n";
        FreeLibrary(module);
        return 5;
    }

    const Tf3NativeProbeRequest valid_request{
        sizeof(Tf3NativeProbeRequest), TF3_NATIVE_PROBE_ABI_VERSION};
    if (exercise_memory_mismatch && !ExerciseOwnedProcessMemoryMismatch(probe, valid_request)) {
        FreeLibrary(module);
        return 6;
    }
    const Tf3NativeProbeResult result = probe(&valid_request);
    if (!IsValidResultLayout(result)) {
        std::wcerr << L"probe returned an incompatible result layout\n";
        FreeLibrary(module);
        return 6;
    }

    // The DLL fingerprints this host executable. It must reject it: this smoke
    // test is not TF3 and therefore cannot establish a supported game build.
    if (result.status != TF3_NATIVE_PROBE_STATUS_UNSUPPORTED_EXECUTABLE) {
        std::wcerr << L"probe did not reject this non-TF3 host (status " << result.status << L")\n";
        FreeLibrary(module);
        return 7;
    }

    FreeLibrary(module);
    std::wcout << L"executable_sha256=" << std::hex << std::setfill(L'0');
    for (const auto byte : result.executable_sha256) {
        std::wcout << std::setw(2) << static_cast<unsigned int>(byte);
    }
    std::wcout << L"\n";
    std::wcout << L"probe host smoke test passed: ABI rejected malformed requests and rejected this host executable\n";
    return 0;
}
