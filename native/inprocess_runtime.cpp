// Exact-build, in-process transport bootstrap. Loading this DLL alone is not
// hook qualification. The observer capability is advertised only after its
// exact-image gate and patch succeed; hold, halt and gameplay remain absent.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <array>
#include <cstdint>
#include <cwchar>
#include <string>

#include "inprocess_runtime_api.h"
#include "inprocess_post_observer.h"
#include "probe_api.h"
#include "runtime_ipc.h"

namespace {

HMODULE runtime_module = nullptr;

bool CopyBounded(const wchar_t* source, std::size_t maximum, std::wstring* output) {
    if (source == nullptr) return false;
    const std::size_t length = wcsnlen_s(source, maximum + 1);
    if (length == 0 || length > maximum) return false;
    output->assign(source, length);
    return true;
}

bool SiblingPath(const wchar_t* name, std::wstring* output) {
    std::array<wchar_t, 32768> path{};
    const DWORD length = GetModuleFileNameW(runtime_module, path.data(),
                                            static_cast<DWORD>(path.size()));
    if (length == 0 || length >= path.size()) return false;
    std::wstring directory(path.data(), length);
    const auto slash = directory.find_last_of(L"\\/");
    if (slash == std::wstring::npos) return false;
    directory.resize(slash + 1);
    if (directory.size() + std::wcslen(name) >= path.size()) return false;
    *output = directory + name;
    return true;
}

bool ExactModulePath(HMODULE module, const std::wstring& expected) {
    std::array<wchar_t, 32768> path{};
    const DWORD length = GetModuleFileNameW(module, path.data(),
                                            static_cast<DWORD>(path.size()));
    return length != 0 && length < path.size() &&
           _wcsicmp(std::wstring(path.data(), length).c_str(), expected.c_str()) == 0;
}

}  // namespace

tf3runtimeipc::RuntimeObservation ReadObservation() noexcept {
    const auto snapshot = tf3postobserver::ReadSnapshot();
    return {snapshot.hits, snapshot.owner_thread, snapshot.active,
            snapshot.cross_thread, snapshot.saturated};
}

extern "C" __declspec(dllexport) DWORD WINAPI Tf3InProcessRuntimeV1(
    const Tf3InProcessRuntimeRequestV1* request) {
    if (request == nullptr || request->struct_size != sizeof(*request) ||
        request->abi_version != TF3_INPROCESS_RUNTIME_ABI_VERSION) {
        return TF3_INPROCESS_RUNTIME_INVALID_REQUEST;
    }

    std::wstring pipe;
    std::wstring wide_token;
    if (!CopyBounded(request->pipe_name, 80, &pipe) ||
        !CopyBounded(request->session_token, 64, &wide_token)) {
        return TF3_INPROCESS_RUNTIME_INVALID_CREDENTIALS;
    }
    std::string token;
    token.reserve(wide_token.size());
    for (wchar_t c : wide_token) {
        if (c > 0x7f) return TF3_INPROCESS_RUNTIME_INVALID_CREDENTIALS;
        token.push_back(static_cast<char>(c));
    }
    if (!tf3runtimeipc::ValidPipeName(pipe) || !tf3runtimeipc::ValidToken(token)) {
        return TF3_INPROCESS_RUNTIME_INVALID_CREDENTIALS;
    }

    std::wstring probe_path;
    if (!SiblingPath(L"TF3NativeProbe.dll", &probe_path)) {
        return TF3_INPROCESS_RUNTIME_PROBE_LOAD_FAILED;
    }
    HMODULE probe = LoadLibraryExW(probe_path.c_str(), nullptr,
                                  LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR |
                                      LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (probe == nullptr || !ExactModulePath(probe, probe_path)) {
        if (probe != nullptr) FreeLibrary(probe);
        return TF3_INPROCESS_RUNTIME_PROBE_LOAD_FAILED;
    }
    const auto probe_function = reinterpret_cast<Tf3NativeProbeResult(__stdcall*)(
        const Tf3NativeProbeRequest*)>(GetProcAddress(probe, "Tf3NativeProbeV1"));
    if (probe_function == nullptr) {
        FreeLibrary(probe);
        return TF3_INPROCESS_RUNTIME_PROBE_ABI_FAILED;
    }
    const Tf3NativeProbeRequest probe_request{sizeof(probe_request),
                                               TF3_NATIVE_PROBE_ABI_VERSION};
    const Tf3NativeProbeResult result = probe_function(&probe_request);
    FreeLibrary(probe);
    if (result.struct_size != sizeof(result) ||
        result.abi_version != TF3_NATIVE_PROBE_ABI_VERSION) {
        return TF3_INPROCESS_RUNTIME_PROBE_ABI_FAILED;
    }
    if (result.status != TF3_NATIVE_PROBE_STATUS_OBSERVATION_ONLY_MATCH ||
        result.capability_flags != TF3_NATIVE_PROBE_CAPABILITY_NONE) {
        return TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE;
    }

    const auto observer_status = tf3postobserver::Start();
    if (observer_status != tf3postobserver::Status::started) {
        (void)tf3postobserver::Stop();
        (void)tf3runtimeipc::ServeInProcess(
            pipe, token, nullptr, static_cast<std::uint32_t>(observer_status));
        return TF3_INPROCESS_RUNTIME_OBSERVER_START_FAILED;
    }
    const int server_status = tf3runtimeipc::ServeInProcess(pipe, token, &ReadObservation);
    const auto stop_status = tf3postobserver::Stop();
    if (stop_status != tf3postobserver::Status::stopped) {
        return TF3_INPROCESS_RUNTIME_OBSERVER_STOP_FAILED;
    }
    return server_status == 0 ? TF3_INPROCESS_RUNTIME_STOPPED
                              : TF3_INPROCESS_RUNTIME_SERVER_FAILED;
}

BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        runtime_module = module;
        DisableThreadLibraryCalls(module);
    }
    return TRUE;
}
