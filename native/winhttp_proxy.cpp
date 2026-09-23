#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#define _WINHTTP_INTERNAL_
#include <winhttp.h>
#include <softpub.h>
#include <wintrust.h>

#include <array>
#include <cstring>
#include <cwctype>
#include <new>
#include <string>

#include "inprocess_runtime_api.h"
#include "inprocess_start_trace.h"
#include "native_session_handoff.h"

// An opt-in application-local forwarding proxy.  It exports precisely the 14
// WinHTTP names imported by the audited TF3 executable.  It does not observe,
// alter, retry, or synthesize HTTP calls: every exported function forwards its
// original arguments and return value to the signed System32 winhttp.dll.
//
// DllMain intentionally does nothing beyond retaining our module handle.  The
// real forwarder and optional runtime are initialized only after a normal API
// call, so no LoadLibrary/worker work is performed under this DLL's loader lock.

namespace {

constexpr wchar_t kRuntimeName[] = L"TF3InProcessRuntime.dll";
constexpr wchar_t kPipeEnvironment[] = L"TF3_MP_NATIVE_PIPE";
constexpr wchar_t kTokenEnvironment[] = L"TF3_MP_NATIVE_TOKEN";
constexpr DWORD kMaxPipeCharacters = 80;
constexpr DWORD kMaxTokenCharacters = 64;
constexpr std::uint8_t kSessionMagic[8] = {'T','C','T','F','3','S','1',0};

HMODULE g_proxy_module = nullptr;
HMODULE g_system_winhttp = nullptr;
INIT_ONCE g_forwarder_once = INIT_ONCE_STATIC_INIT;
volatile LONG g_runtime_started = 0;
std::wstring g_system_winhttp_path;

using AddRequestHeadersFn = BOOL(WINAPI *)(HINTERNET, LPCWSTR, DWORD, DWORD);
using CloseHandleFn = BOOL(WINAPI *)(HINTERNET);
using ConnectFn = HINTERNET(WINAPI *)(HINTERNET, LPCWSTR, INTERNET_PORT, DWORD);
using OpenFn = HINTERNET(WINAPI *)(LPCWSTR, DWORD, LPCWSTR, LPCWSTR, DWORD);
using OpenRequestFn = HINTERNET(WINAPI *)(HINTERNET, LPCWSTR, LPCWSTR, LPCWSTR,
                                           LPCWSTR, LPCWSTR*, DWORD);
using QueryDataAvailableFn = BOOL(WINAPI *)(HINTERNET, LPDWORD);
using QueryHeadersFn = BOOL(WINAPI *)(HINTERNET, DWORD, LPCWSTR, LPVOID, LPDWORD, LPDWORD);
using ReadDataFn = BOOL(WINAPI *)(HINTERNET, LPVOID, DWORD, LPDWORD);
using ReceiveResponseFn = BOOL(WINAPI *)(HINTERNET, LPVOID);
using SendRequestFn = BOOL(WINAPI *)(HINTERNET, LPCWSTR, DWORD, LPVOID, DWORD, DWORD, DWORD_PTR);
using SetOptionFn = BOOL(WINAPI *)(HINTERNET, DWORD, LPVOID, DWORD);
using SetStatusCallbackFn = WINHTTP_STATUS_CALLBACK(WINAPI *)(
    HINTERNET, WINHTTP_STATUS_CALLBACK, DWORD, DWORD_PTR);
using SetTimeoutsFn = BOOL(WINAPI *)(HINTERNET, int, int, int, int);
using WriteDataFn = BOOL(WINAPI *)(HINTERNET, LPCVOID, DWORD, LPDWORD);

struct Forwarders {
    AddRequestHeadersFn add_request_headers = nullptr;
    CloseHandleFn close_handle = nullptr;
    ConnectFn connect = nullptr;
    OpenFn open = nullptr;
    OpenRequestFn open_request = nullptr;
    QueryDataAvailableFn query_data_available = nullptr;
    QueryHeadersFn query_headers = nullptr;
    ReadDataFn read_data = nullptr;
    ReceiveResponseFn receive_response = nullptr;
    SendRequestFn send_request = nullptr;
    SetOptionFn set_option = nullptr;
    SetStatusCallbackFn set_status_callback = nullptr;
    SetTimeoutsFn set_timeouts = nullptr;
    WriteDataFn write_data = nullptr;
};

Forwarders g_forwarders;

bool SystemDirectoryPath(std::wstring* output) {
    std::array<wchar_t, 32768> directory{};
    const UINT length = GetSystemDirectoryW(directory.data(), static_cast<UINT>(directory.size()));
    if (length == 0 || length >= directory.size()) {
        return false;
    }
    *output = directory.data();
    if (output->empty() || output->back() != L'\\') {
        output->push_back(L'\\');
    }
    output->append(L"winhttp.dll");
    return true;
}

bool HasTrustedSignature(const std::wstring& path) {
    WINTRUST_FILE_INFO file_info{};
    file_info.cbStruct = sizeof(file_info);
    file_info.pcwszFilePath = path.c_str();
    WINTRUST_DATA trust_data{};
    trust_data.cbStruct = sizeof(trust_data);
    trust_data.dwUIChoice = WTD_UI_NONE;
    trust_data.fdwRevocationChecks = WTD_REVOKE_NONE;
    trust_data.dwUnionChoice = WTD_CHOICE_FILE;
    trust_data.pFile = &file_info;
    trust_data.dwStateAction = WTD_STATEACTION_VERIFY;
    trust_data.dwProvFlags = WTD_CACHE_ONLY_URL_RETRIEVAL;
    GUID action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    const LONG status = WinVerifyTrust(nullptr, &action, &trust_data);
    trust_data.dwStateAction = WTD_STATEACTION_CLOSE;
    (void)WinVerifyTrust(nullptr, &action, &trust_data);
    return status == ERROR_SUCCESS;
}

template <typename T>
bool Resolve(T* slot, const char* name) {
    *slot = reinterpret_cast<T>(GetProcAddress(g_system_winhttp, name));
    return *slot != nullptr;
}

BOOL CALLBACK InitializeForwarders(PINIT_ONCE, PVOID, PVOID*) {
    std::wstring path;
    if (!SystemDirectoryPath(&path)) {
        return FALSE;
    }
    if (!HasTrustedSignature(path)) {
        return FALSE;
    }
    HMODULE module = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (module == nullptr) {
        return FALSE;
    }
    g_system_winhttp = module;
    g_system_winhttp_path = path;
    const bool complete =
        Resolve(&g_forwarders.add_request_headers, "WinHttpAddRequestHeaders") &&
        Resolve(&g_forwarders.close_handle, "WinHttpCloseHandle") &&
        Resolve(&g_forwarders.connect, "WinHttpConnect") &&
        Resolve(&g_forwarders.open, "WinHttpOpen") &&
        Resolve(&g_forwarders.open_request, "WinHttpOpenRequest") &&
        Resolve(&g_forwarders.query_data_available, "WinHttpQueryDataAvailable") &&
        Resolve(&g_forwarders.query_headers, "WinHttpQueryHeaders") &&
        Resolve(&g_forwarders.read_data, "WinHttpReadData") &&
        Resolve(&g_forwarders.receive_response, "WinHttpReceiveResponse") &&
        Resolve(&g_forwarders.send_request, "WinHttpSendRequest") &&
        Resolve(&g_forwarders.set_option, "WinHttpSetOption") &&
        Resolve(&g_forwarders.set_status_callback, "WinHttpSetStatusCallback") &&
        Resolve(&g_forwarders.set_timeouts, "WinHttpSetTimeouts") &&
        Resolve(&g_forwarders.write_data, "WinHttpWriteData");
    if (!complete) {
        FreeLibrary(module);
        g_system_winhttp = nullptr;
        g_system_winhttp_path.clear();
        return FALSE;
    }
    return TRUE;
}

bool EnsureForwarders() {
    if (!InitOnceExecuteOnce(&g_forwarder_once, InitializeForwarders, nullptr, nullptr)) {
        SetLastError(ERROR_PROC_NOT_FOUND);
        return false;
    }
    return true;
}

bool ReadBoundedEnvironment(const wchar_t* name, DWORD maximum, std::wstring* output) {
    // The current two callers have maxima no larger than the pipe capacity.
    // Keep a single fixed stack buffer rather than accepting an unbounded
    // environment value into the game process.
    std::array<wchar_t, kMaxPipeCharacters + 1> buffer{};
    const DWORD capacity = maximum + 1;
    const DWORD size = GetEnvironmentVariableW(name, buffer.data(), capacity);
    if (size == 0 || size >= capacity || size > maximum) {
        return false;
    }
    output->assign(buffer.data(), size);
    return true;
}

struct RuntimeWorkerRequest {
    std::wstring pipe_name;
    std::wstring session_token;
    HMODULE worker_reference = nullptr;
};

bool ValidSessionToken(const wchar_t* token) {
    if (wcsnlen_s(token, kMaxTokenCharacters + 1) != kMaxTokenCharacters) return false;
    for (DWORD index = 0; index < kMaxTokenCharacters; ++index) {
        if (!((token[index] >= L'0' && token[index] <= L'9') ||
              (token[index] >= L'a' && token[index] <= L'f'))) return false;
    }
    return true;
}

bool ValidSessionPipe(const wchar_t* pipe) {
    const size_t length = wcsnlen_s(pipe, kMaxPipeCharacters + 1);
    if (length == 0 || length > kMaxPipeCharacters) return false;
    for (size_t index = 0; index < length; ++index) {
        if (!(std::iswalnum(pipe[index]) || pipe[index] == L'_' || pipe[index] == L'-')) return false;
    }
    return true;
}

bool ProxySiblingPath(const wchar_t* file, std::wstring* output) {
    std::array<wchar_t, 32768> buffer{};
    const DWORD length = GetModuleFileNameW(g_proxy_module, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (length == 0 || length >= buffer.size()) return false;
    output->assign(buffer.data(), length);
    const auto slash = output->find_last_of(L"\\/");
    if (slash == std::wstring::npos) return false;
    output->resize(slash + 1);
    output->append(file);
    return true;
}

bool TryConsumeSession(RuntimeWorkerRequest* output) {
    std::wstring path;
    if (!ProxySiblingPath(TF3_NATIVE_SESSION_FILE, &path)) return false;
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ | DELETE, 0, nullptr, OPEN_EXISTING,
                              FILE_FLAG_DELETE_ON_CLOSE, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    Tf3NativeSessionV1 record{};
    LARGE_INTEGER size{};
    DWORD read = 0;
    const bool complete = GetFileSizeEx(file, &size) && size.QuadPart == sizeof(record) &&
        ReadFile(file, &record, sizeof(record), &read, nullptr) && read == sizeof(record);
    CloseHandle(file); // consume malformed/stale records too.
    if (!complete || std::memcmp(record.magic, kSessionMagic, sizeof(kSessionMagic)) != 0 ||
        record.version != TF3_NATIVE_SESSION_VERSION || record.struct_size != sizeof(record)) return false;
    FILETIME now{}; GetSystemTimeAsFileTime(&now);
    ULARGE_INTEGER current{now.dwLowDateTime, now.dwHighDateTime};
    ULARGE_INTEGER created{record.created.dwLowDateTime, record.created.dwHighDateTime};
    constexpr ULONGLONG kMaximumAge = 120ULL * 10000000ULL;
    if (created.QuadPart > current.QuadPart || current.QuadPart - created.QuadPart > kMaximumAge ||
        !ValidSessionPipe(record.pipe_name) || !ValidSessionToken(record.session_token)) return false;
    output->pipe_name = record.pipe_name;
    output->session_token = record.session_token;
    return true;
}

DWORD WINAPI RuntimeWorker(void* parameter) {
    auto* request = static_cast<RuntimeWorkerRequest*>(parameter);
    const HMODULE worker_reference = request->worker_reference;
    TraceNativeStart(L"-proxy-start.txt", "worker-entered");
    std::wstring proxy_path;
    std::array<wchar_t, 32768> buffer{};
    const DWORD length = GetModuleFileNameW(g_proxy_module, buffer.data(),
                                             static_cast<DWORD>(buffer.size()));
    if (length != 0 && length < buffer.size()) {
        proxy_path.assign(buffer.data(), length);
        const std::wstring::size_type separator = proxy_path.find_last_of(L"\\/");
        if (separator != std::wstring::npos) {
            proxy_path.resize(separator + 1);
            proxy_path.append(kRuntimeName);
            HMODULE runtime = LoadLibraryExW(proxy_path.c_str(), nullptr,
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
            if (runtime != nullptr) {
                TraceNativeStart(L"-proxy-load.txt", "runtime-loaded");
                const auto start = reinterpret_cast<Tf3InProcessRuntimeFunctionV1>(
                    GetProcAddress(runtime, "Tf3InProcessRuntimeV1"));
                if (start != nullptr) {
                    const Tf3InProcessRuntimeRequestV1 runtime_request{
                        sizeof(Tf3InProcessRuntimeRequestV1), TF3_INPROCESS_RUNTIME_ABI_VERSION,
                        request->pipe_name.c_str(), request->session_token.c_str()};
                    const auto result = start(&runtime_request);
                    TraceNativeStart(L"-proxy-result.txt", "runtime-returned", result);
                } else {
                    TraceNativeStart(L"-proxy-result.txt", "entry-missing", GetLastError());
                }
                FreeLibrary(runtime);
            } else {
                TraceNativeStart(L"-proxy-load.txt", "runtime-load-failed", GetLastError());
            }
        }
    }
    delete request;
    FreeLibraryAndExitThread(worker_reference, 0);
}

void StartRuntimeIfConfigured() {
    if (InterlockedCompareExchange(&g_runtime_started, 0, 0) != 0) {
        return;
    }
    auto* request = new (std::nothrow) RuntimeWorkerRequest();
    if (request == nullptr ||
        !(TryConsumeSession(request) ||
          (ReadBoundedEnvironment(kPipeEnvironment, kMaxPipeCharacters, &request->pipe_name) &&
           ReadBoundedEnvironment(kTokenEnvironment, kMaxTokenCharacters, &request->session_token)))) {
        delete request;
        return;
    }
    if (InterlockedCompareExchange(&g_runtime_started, 1, 0) != 0) {
        delete request;
        return;
    }
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
                            reinterpret_cast<LPCWSTR>(&g_proxy_module),
                            &request->worker_reference)) {
        delete request;
        InterlockedExchange(&g_runtime_started, 0);
        return;
    }
    HANDLE thread = CreateThread(nullptr, 0, RuntimeWorker, request, 0, nullptr);
    if (thread == nullptr) {
        FreeLibrary(request->worker_reference);
        delete request;
        InterlockedExchange(&g_runtime_started, 0);
        return;
    }
    CloseHandle(thread);
}

void AfterResolvedForwarder() {
    StartRuntimeIfConfigured();
}

// Loading the trusted forwarder and considering the optional runtime can call
// Win32 APIs that modify LastError.  A real WinHTTP implementation observes the
// caller's incoming value until it does its own work, so keep this proxy's lazy
// bookkeeping transparent.  Forwarder failure remains deliberately fail-closed.
bool PrepareForwarder() {
    const DWORD caller_last_error = GetLastError();
    if (!EnsureForwarders()) {
        return false;
    }
    AfterResolvedForwarder();
    SetLastError(caller_last_error);
    return true;
}

}  // namespace

extern "C" BOOL WINAPI WinHttpAddRequestHeaders(HINTERNET h, LPCWSTR v, DWORD n, DWORD m) { if (!PrepareForwarder()) return FALSE; return g_forwarders.add_request_headers(h, v, n, m); }
extern "C" BOOL WINAPI WinHttpCloseHandle(HINTERNET h) { if (!PrepareForwarder()) return FALSE; return g_forwarders.close_handle(h); }
extern "C" HINTERNET WINAPI WinHttpConnect(HINTERNET h, LPCWSTR s, INTERNET_PORT p, DWORD r) { if (!PrepareForwarder()) return nullptr; return g_forwarders.connect(h, s, p, r); }
extern "C" HINTERNET WINAPI WinHttpOpen(LPCWSTR a, DWORD t, LPCWSTR p, LPCWSTR b, DWORD f) { if (!PrepareForwarder()) return nullptr; return g_forwarders.open(a, t, p, b, f); }
extern "C" HINTERNET WINAPI WinHttpOpenRequest(HINTERNET h, LPCWSTR v, LPCWSTR o, LPCWSTR q, LPCWSTR r, LPCWSTR* x, DWORD f) { if (!PrepareForwarder()) return nullptr; return g_forwarders.open_request(h, v, o, q, r, x, f); }
extern "C" BOOL WINAPI WinHttpQueryDataAvailable(HINTERNET h, LPDWORD n) { if (!PrepareForwarder()) return FALSE; return g_forwarders.query_data_available(h, n); }
extern "C" BOOL WINAPI WinHttpQueryHeaders(HINTERNET h, DWORD i, LPCWSTR n, LPVOID b, LPDWORD l, LPDWORD x) { if (!PrepareForwarder()) return FALSE; return g_forwarders.query_headers(h, i, n, b, l, x); }
extern "C" BOOL WINAPI WinHttpReadData(HINTERNET h, LPVOID b, DWORD n, LPDWORD r) { if (!PrepareForwarder()) return FALSE; return g_forwarders.read_data(h, b, n, r); }
extern "C" BOOL WINAPI WinHttpReceiveResponse(HINTERNET h, LPVOID r) { if (!PrepareForwarder()) return FALSE; return g_forwarders.receive_response(h, r); }
extern "C" BOOL WINAPI WinHttpSendRequest(HINTERNET h, LPCWSTR q, DWORD qn, LPVOID o, DWORD on, DWORD c, DWORD_PTR z) { if (!PrepareForwarder()) return FALSE; return g_forwarders.send_request(h, q, qn, o, on, c, z); }
extern "C" BOOL WINAPI WinHttpSetOption(HINTERNET h, DWORD o, LPVOID b, DWORD n) { if (!PrepareForwarder()) return FALSE; return g_forwarders.set_option(h, o, b, n); }
extern "C" WINHTTP_STATUS_CALLBACK WINAPI WinHttpSetStatusCallback(HINTERNET h, WINHTTP_STATUS_CALLBACK c, DWORD f, DWORD_PTR x) { if (!PrepareForwarder()) return WINHTTP_INVALID_STATUS_CALLBACK; return g_forwarders.set_status_callback(h, c, f, x); }
extern "C" BOOL WINAPI WinHttpSetTimeouts(HINTERNET h, int r, int c, int s, int v) { if (!PrepareForwarder()) return FALSE; return g_forwarders.set_timeouts(h, r, c, s, v); }
extern "C" BOOL WINAPI WinHttpWriteData(HINTERNET h, LPCVOID b, DWORD n, LPDWORD w) { if (!PrepareForwarder()) return FALSE; return g_forwarders.write_data(h, b, n, w); }

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        g_proxy_module = instance;
        DisableThreadLibraryCalls(instance);
    }
    return TRUE;
}
