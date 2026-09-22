#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#include <psapi.h>

#include <array>
#include <cwchar>
#include <iostream>
#include <string>
#include <vector>

// Owned-process harness for the application-local proxy.  This host imports no
// WinHTTP APIs itself: it loads a candidate local winhttp.dll by absolute path,
// invokes its WinHttpOpen/CloseHandle exports, then proves that the proxy caused
// a separately loaded System32 winhttp.dll to appear in this process.  It never
// opens TF3, a game save, or a network connection.

namespace {

using OpenFn = HINTERNET(WINAPI *)(LPCWSTR, DWORD, LPCWSTR, LPCWSTR, DWORD);
using CloseHandleFn = BOOL(WINAPI *)(HINTERNET);

bool IsAbsolute(const wchar_t* path) {
    return path != nullptr &&
        (((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')) &&
         path[1] == L':' && (path[2] == L'\\' || path[2] == L'/'));
}

std::wstring SystemWinHttpPath() {
    std::array<wchar_t, 32768> buffer{};
    const UINT count = GetSystemDirectoryW(buffer.data(), static_cast<UINT>(buffer.size()));
    if (count == 0 || count >= buffer.size()) {
        return {};
    }
    std::wstring path(buffer.data(), count);
    path.append(L"\\winhttp.dll");
    return path;
}

std::wstring Lowercase(std::wstring value) {
    for (wchar_t& character : value) {
        if (character >= L'A' && character <= L'Z') {
            character = static_cast<wchar_t>(character - L'A' + L'a');
        }
    }
    return value;
}

bool HasExactSystemForwarder() {
    DWORD needed = 0;
    if (!EnumProcessModules(GetCurrentProcess(), nullptr, 0, &needed) || needed == 0) {
        return false;
    }
    std::vector<HMODULE> modules(needed / sizeof(HMODULE));
    if (!EnumProcessModules(GetCurrentProcess(), modules.data(),
                            static_cast<DWORD>(modules.size() * sizeof(HMODULE)), &needed)) {
        return false;
    }
    const std::wstring expected = Lowercase(SystemWinHttpPath());
    unsigned int matching_basename_count = 0;
    bool found_expected = false;
    std::array<wchar_t, 32768> path{};
    for (const HMODULE module : modules) {
        const DWORD length = GetModuleFileNameW(module, path.data(), static_cast<DWORD>(path.size()));
        if (length == 0 || length >= path.size()) {
            continue;
        }
        const std::wstring loaded = Lowercase(std::wstring(path.data(), length));
        const std::wstring::size_type separator = loaded.find_last_of(L"\\/");
        if (loaded.substr(separator == std::wstring::npos ? 0 : separator + 1) == L"winhttp.dll") {
            ++matching_basename_count;
        }
        if (loaded == expected) {
            found_expected = true;
        }
    }
    if (!found_expected || matching_basename_count < 2) {
        std::wcerr << L"expected distinct local and System32 winhttp.dll modules; found system="
                   << (found_expected ? L"yes" : L"no") << L", basename-count="
                   << matching_basename_count << L"\n";
        return false;
    }
    std::wcout << L"forwarder_path=" << SystemWinHttpPath() << L"\n";
    return true;
}

bool OpenAndClose(OpenFn open, CloseHandleFn close, DWORD marker, DWORD* observed_error) {
    SetLastError(marker);
    HINTERNET session = open(L"TalCo-TF3-owned-proxy-check", WINHTTP_ACCESS_TYPE_NO_PROXY,
                             WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    *observed_error = GetLastError();
    if (session == nullptr || !close(session)) {
        std::wcerr << L"WinHttpOpen/CloseHandle failed: " << GetLastError() << L"\n";
        return false;
    }
    return true;
}

bool VerifyLastErrorTransparency(OpenFn proxy_open, CloseHandleFn proxy_close) {
    const std::wstring path = SystemWinHttpPath();
    HMODULE system = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (system == nullptr) {
        std::wcerr << L"could not load System32 forwarder for LastError baseline\n";
        return false;
    }
    const auto direct_open = reinterpret_cast<OpenFn>(GetProcAddress(system, "WinHttpOpen"));
    const auto direct_close = reinterpret_cast<CloseHandleFn>(GetProcAddress(system, "WinHttpCloseHandle"));
    DWORD direct_error = 0;
    DWORD proxy_error = 0;
    const bool complete = direct_open != nullptr && direct_close != nullptr &&
        OpenAndClose(direct_open, direct_close, 0x4321, &direct_error) &&
        OpenAndClose(proxy_open, proxy_close, 0x4321, &proxy_error);
    FreeLibrary(system);
    if (!complete || direct_error != proxy_error) {
        std::wcerr << L"proxy LastError differs from direct System32 WinHTTP call\n";
        return false;
    }
    std::wcout << L"last_error_transparency=" << proxy_error << L"\n";
    return true;
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
    if (argc != 2 || !IsAbsolute(argv[1])) {
        std::wcerr << L"usage: TF3WinHttpProxyHost.exe <absolute-path-to-local-winhttp.dll>\n";
        return 2;
    }
    // Explicitly remove activation inputs for this owned check.  The proxy must
    // remain inactive without both bounded inputs; no sibling runtime is loaded.
    SetEnvironmentVariableW(L"TF3_MP_NATIVE_PIPE", nullptr);
    SetEnvironmentVariableW(L"TF3_MP_NATIVE_TOKEN", nullptr);
    HMODULE proxy = LoadLibraryExW(argv[1], nullptr,
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (proxy == nullptr) {
        std::wcerr << L"LoadLibraryExW failed: " << GetLastError() << L"\n";
        return 3;
    }
    const auto open = reinterpret_cast<OpenFn>(GetProcAddress(proxy, "WinHttpOpen"));
    const auto close = reinterpret_cast<CloseHandleFn>(GetProcAddress(proxy, "WinHttpCloseHandle"));
    if (open == nullptr || close == nullptr) {
        std::wcerr << L"candidate does not expose required WinHTTP names\n";
        FreeLibrary(proxy);
        return 4;
    }
    // Do the direct baseline before the first proxy API call.  This means the
    // proxy side of the comparison includes its one-time loader/bootstrap
    // bookkeeping, rather than merely an already-initialized wrapper call.
    if (!VerifyLastErrorTransparency(open, close)) {
        FreeLibrary(proxy);
        return 5;
    }
    if (!HasExactSystemForwarder()) {
        FreeLibrary(proxy);
        return 6;
    }
    FreeLibrary(proxy);
    std::wcout << L"winhttp proxy owned-process qualification passed\n";
    return 0;
}
