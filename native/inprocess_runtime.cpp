// Exact-build, in-process transport bootstrap. The boundary gate is advertised
// only after its image/site/mitigation checks and patch succeed. Live evidence
// qualifies bounded hold, one-update release, halt and detach; gameplay command
// capture/application remains absent and is never inferred from gate startup.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <array>
#include <atomic>
#include <cstdint>
#include <cwchar>
#include <string>

#include "inprocess_runtime_api.h"
#include "inprocess_start_trace.h"
#include "inprocess_post_observer.h"
#include "inprocess_vehicle_observer.h"
#include "production_boundary_gate.h"
#include "probe_api.h"
#include "runtime_ipc.h"

namespace {

HMODULE runtime_module = nullptr;

DWORD Run40401Passive() {
    // Independent terminal experiment: no probe, IPC, production gate or provider.
    if (tf3postobserver::Diagnose40401WithoutHooks() != tf3postobserver::Status::started)
        return TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE;
    static volatile LONG attempted = 0;
    if (InterlockedCompareExchange(&attempted, 1, 0) != 0)
        return TF3_INPROCESS_RUNTIME_PASSIVE_FAILED;
    wchar_t directory[MAX_PATH]{}, path[MAX_PATH]{};
    const DWORD length = GetTempPathW(_countof(directory), directory);
    if (!length || length >= _countof(directory) ||
        swprintf_s(path, L"%stf3mp-passive40401-%lu.jsonl", directory, GetCurrentProcessId()) < 0)
        return TF3_INPROCESS_RUNTIME_PASSIVE_FAILED;
    HANDLE file = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_NEW,
                               FILE_ATTRIBUTE_TEMPORARY, nullptr);
    if (file == INVALID_HANDLE_VALUE) return TF3_INPROCESS_RUNTIME_PASSIVE_FAILED;
    // Qualify every vehicle site while the shared post-site byte is pristine.
    const auto vehicle = tf3vehicleobserver::Start40401Passive();
    const auto post = vehicle == tf3vehicleobserver::Status::started
        ? tf3postobserver::Start40401Passive() : tf3postobserver::Status::never_started;
    TraceNativeStart(L"-runtime-passive-start.txt", "passive-40401-start",
        static_cast<unsigned>(vehicle), static_cast<unsigned>(post));
    bool ok = vehicle == tf3vehicleobserver::Status::started && post == tf3postobserver::Status::started;
    try {
        // At most 301 bounded records over five minutes. Snapshots are observations,
        // not an atomic transaction or gameplay receipts. No borrowed pointer escapes.
        for (unsigned sample = 0; ok && sample <= 300; ++sample) {
            const auto p = tf3postobserver::ReadSnapshot();
            const auto v = tf3vehicleobserver::Read();
            std::string line = "{";
            const auto field = [&line](const char* name, auto value) {
                if (line.size() > 1) line += ',';
                line += '\"'; line += name; line += "\":"; line += std::to_string(value);
            };
            field("sample", sample); field("tickMs", GetTickCount64());
            FILETIME wall{}; GetSystemTimeAsFileTime(&wall);
            field("filetime", (static_cast<unsigned long long>(wall.dwHighDateTime) << 32) | wall.dwLowDateTime);
            field("boundaryHits", p.hits); field("headroom", p.minimum_stack_headroom);
            field("boundaryThread", p.owner_thread); field("unaligned", p.unaligned_stack);
            field("boundaryCrossThread", p.cross_thread); field("boundarySaturated", p.saturated);
            field("cfgKnown", p.cfg_known); field("cfg", p.cfg_flags);
            field("cetKnown", p.cet_known); field("cet", p.cet_flags);
            field("factory", v.factory_hits); field("admission", v.admission_hits);
            field("correlated", v.correlated_hits); field("dropped", v.dropped_candidates);
            field("vehicleThread", v.owner_thread); field("vehicleCrossThread", v.cross_thread);
            field("vehicleSaturated", v.saturated); field("entity", v.latest_entity);
            field("stopped", v.latest_stopped); field("valid", v.latest_valid);
            field("entryZero", v.latest_entry_result_zero); field("callbackShape", v.latest_callback_shape_matches);
            field("adapterTableRva", v.latest_adapter_table_rva);
            field("adapterInvokeRva", v.latest_adapter_invoke_rva);
            field("factoryThread", v.latest_correlated_factory_thread);
            field("progressKnown", v.latest_admission_progress_known); field("progressEmpty", v.latest_admission_progress_empty);
            field("admissionToken", v.latest_correlated_admission_invocation);
            field("admissionThread", v.latest_correlated_admission_thread);
            field("callback", v.callback_hits); field("callbackThread", v.callback_thread);
            field("callbackValid", v.latest_callback_valid); field("callbackResult", v.latest_callback_result);
            field("callbackMatches", v.latest_callback_matches_admission_storage);
            field("send", v.send_return_hits); field("sendToken", v.latest_send_return_invocation);
            field("sendMatches", v.latest_send_return_matches_admission_storage);
            field("marshaler", v.marshaler_return_hits); field("marshalerValid", v.latest_marshaler_valid);
            field("marshalerResult", v.latest_marshaler_result);
            field("marshalerAdmissionMatches", v.latest_marshaler_matches_admission_storage);
            field("marshalerCallbackMatches", v.latest_marshaler_matches_callback_storage);
            field("body", v.post_send_body_hits); field("bodyCorrelated", v.post_send_body_correlated_hits);
            field("bodyToken", v.latest_post_send_body_invocation); field("bodyValid", v.latest_post_send_body_valid);
            field("bodyEntity", v.latest_post_send_body_entity); field("bodyStopped", v.latest_post_send_body_stopped);
            field("bodyThread", v.latest_post_send_body_thread);
            line += "}\n";
            DWORD written = 0;
            ok = line.size() <= 4096 && WriteFile(file, line.data(), static_cast<DWORD>(line.size()), &written, nullptr)
                && written == line.size() && FlushFileBuffers(file);
            if (ok && sample < 300) Sleep(1000);
        }
    } catch (...) { ok = false; }
    const auto post_stop = tf3postobserver::Stop();
    const auto vehicle_stop = tf3vehicleobserver::Stop();
    CloseHandle(file);
    TraceNativeStart(L"-runtime-passive-stop.txt", "passive-40401-stop",
        static_cast<unsigned>(vehicle_stop), static_cast<unsigned>(post_stop));
    return ok && post_stop == tf3postobserver::Status::stopped && vehicle_stop == tf3vehicleobserver::Status::stopped
        ? TF3_INPROCESS_RUNTIME_PASSIVE_COMPLETE : TF3_INPROCESS_RUNTIME_PASSIVE_FAILED;
}

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

struct PendingGateOperation {
    bool active;
    bool receipt_sent;
    bool detach_restore_started;
    tf3runtimeipc::GateRequest request;
};
std::array<PendingGateOperation, 4> pending_gate{};
std::atomic<std::uint64_t> gate_epoch{0};

bool SubmitGate(const tf3runtimeipc::GateRequest& request) noexcept {
    using tf3runtimeipc::GateControl;
    const auto prior_epoch = gate_epoch.load();
    if ((prior_epoch != 0 && prior_epoch != request.epoch) || request.epoch == 0)
        return false;
    for (const auto& pending : pending_gate)
        if (pending.active && (pending.request.correlation_id == request.correlation_id ||
            pending.request.control == request.control)) return false;
    const auto snapshot = tf3boundary::Read().gate;
    inprocess_gate::Result result = inprocess_gate::Result::protocol_error;
    switch (request.control) {
        case GateControl::hold:
            if (snapshot.boundary_generation == UINT64_MAX ||
                request.generation != snapshot.boundary_generation + 1) return false;
            result = tf3boundary::RequestHold(); break;
        case GateControl::release:
            if (request.generation != snapshot.boundary_generation) return false;
            result = tf3boundary::RequestRelease(request.generation); break;
        case GateControl::halt:
            if (request.generation != snapshot.boundary_generation) return false;
            result = tf3boundary::RequestHalt(); break;
        case GateControl::detach:
            if (request.generation != snapshot.boundary_generation) return false;
            result = tf3boundary::PrepareDetach(request.generation); break;
    }
    if (result != inprocess_gate::Result::accepted) return false;
    std::size_t index = static_cast<std::size_t>(request.control);
    pending_gate[index] = {true, false, false, request};
    if (prior_epoch == 0) gate_epoch.store(request.epoch);
    return true;
}

bool PollGate(tf3runtimeipc::GateNotification* notification) noexcept {
    using namespace tf3runtimeipc;
    for (auto& pending : pending_gate) {
        if (!pending.active) continue;
        const auto snapshot = tf3boundary::Read().gate;
        const auto control_kind = pending.request.control;
        bool receipt_ready = false;
        GateReceipt receipt = GateReceipt::held;
        switch (control_kind) {
            case GateControl::hold:
                receipt = GateReceipt::held;
                receipt_ready = snapshot.state == inprocess_gate::State::held &&
                    snapshot.boundary_generation == pending.request.generation;
                break;
            case GateControl::release:
                receipt = GateReceipt::permit_consumed;
                receipt_ready = snapshot.permit_consumed_generation == pending.request.generation;
                break;
            case GateControl::halt:
                receipt = GateReceipt::halt_requested;
                receipt_ready = snapshot.halt_requested;
                break;
            case GateControl::detach:
                receipt = GateReceipt::detach_prepared;
                receipt_ready = snapshot.state == inprocess_gate::State::detach_prepared ||
                    snapshot.state == inprocess_gate::State::detach_confirmed ||
                    snapshot.state == inprocess_gate::State::detach_returning ||
                    snapshot.state == inprocess_gate::State::detached;
                break;
        }
        if (!pending.receipt_sent && receipt_ready) {
            pending.receipt_sent = true;
            *notification = {GateNotificationKind::receipt, pending.request, receipt,
                             GateEvent::boundary_applied};
            if (control_kind == GateControl::hold) pending.active = false;
            return true;
        }
        if (!pending.receipt_sent) continue;
        if (control_kind == GateControl::release &&
            snapshot.release_applied_generation == pending.request.generation &&
            snapshot.state == inprocess_gate::State::held &&
            snapshot.boundary_generation == pending.request.generation + 1) {
            *notification = {GateNotificationKind::event, pending.request, receipt,
                             GateEvent::boundary_applied};
            pending.active = false; return true;
        }
        if (control_kind == GateControl::halt &&
            snapshot.state == inprocess_gate::State::terminal_parked) {
            *notification = {GateNotificationKind::event, pending.request, receipt,
                             GateEvent::terminal_parked};
            pending.active = false; return true;
        }
        if (control_kind == GateControl::detach) {
            if (!pending.detach_restore_started) {
                pending.detach_restore_started = true;
                if (tf3boundary::RestoreAndConfirmDetach(pending.request.generation) !=
                        inprocess_gate::Result::accepted) continue;
            }
            const auto detached = tf3boundary::Read();
            if (detached.gate.state == inprocess_gate::State::detached &&
                !detached.active && !detached.owns_breakpoint_byte) {
                *notification = {GateNotificationKind::event, pending.request, receipt,
                                 GateEvent::detached};
                pending.active = false; return true;
            }
        }
    }
    return false;
}

// Live-qualified on the exact A484... build: detach mode held at update/tick
// 2978/57266, re-held at 2979/57267 and resumed at 2980/57268. A separate halt
// run went directly from running generation zero to terminal park at 2979/57267
// while authenticated IPC remained responsive. These are exact-build boundary
// controls, not gameplay proof.
const tf3runtimeipc::GateProvider production_gate_provider{
    true, true, &SubmitGate, &PollGate};
// Same control implementation; one real 40401 boundary-only hold/release passed.
// This provider still does not qualify any vehicle command or production session.
const tf3runtimeipc::GateProvider boundary_40401_experiment_provider{
    true, false, &SubmitGate, &PollGate};

bool ArmVehicleCancellation(const tf3runtimeipc::VehicleCancelArmRequest& request,
                            tf3runtimeipc::VehicleCancelArmReceipt* receipt) noexcept {
    if (receipt == nullptr || request.stopped != 1) return false;
    const tf3vehicleobserver::CancellationArmRequest arm{
        request.entity, request.stopped, request.deadline_ms};
    if (tf3vehicleobserver::ArmCancellation(arm) != tf3vehicleobserver::Status::started)
        return false;
    const auto state = tf3vehicleobserver::ReadCancellationArm();
    if (state.state != tf3vehicleobserver::CancellationArmState::armed ||
        state.expected_invocation == 0) return false;
    receipt->expected_invocation = state.expected_invocation;
    return true;
}

tf3runtimeipc::VehicleCancelArmSnapshot ReadVehicleCancellation() noexcept {
    const auto native = tf3vehicleobserver::ReadCancellationArm();
    using Native = tf3vehicleobserver::CancellationArmState;
    using Wire = tf3runtimeipc::VehicleCancelArmState;
    Wire state = Wire::failed;
    switch (native.state) {
        case Native::disabled: state = Wire::disabled; break;
        case Native::armed: state = Wire::armed; break;
        case Native::claiming: state = Wire::claiming; break;
        case Native::claimed: state = Wire::claimed; break;
        case Native::completed: state = Wire::completed; break;
        case Native::expired: state = Wire::expired; break;
        case Native::revoked: state = Wire::revoked; break;
        case Native::failed: state = Wire::failed; break;
    }
    return {state, native.expected_invocation, native.claimed_invocation,
            native.expected_entity, native.claimed_entity,
            native.expected_stopped, native.claimed_stopped, native.claimed_thread,
            native.callback_result_zero, native.send_return, native.post_send_body};
}

const tf3runtimeipc::VehicleCancelProvider production_vehicle_cancel_provider{
    &ArmVehicleCancellation, &ReadVehicleCancellation};


}  // namespace

tf3runtimeipc::RuntimeObservation ReadObservation() noexcept {
    const auto snapshot = tf3postobserver::ReadSnapshot();
    return {snapshot.hits, snapshot.minimum_stack_headroom, snapshot.owner_thread,
            snapshot.cfg_flags, snapshot.cet_flags, snapshot.cfg_known,
            snapshot.cet_known, snapshot.active,
            snapshot.cross_thread, snapshot.saturated};
}

tf3runtimeipc::RuntimeObservation ReadBoundaryObservation() noexcept {
    const auto snapshot = tf3boundary::Read();
    return {snapshot.hits, snapshot.minimum_stack_headroom,
            snapshot.observed_owner_thread, snapshot.cfg_flags, snapshot.cet_flags,
            snapshot.cfg_known, snapshot.cet_known, snapshot.active,
            snapshot.cross_thread, false};
}

DWORD Run40401BoundaryExperiment(const std::wstring& pipe, const std::string& token) {
    // Explicit one-use experiment: qualify this build independently of the
    // legacy probe and vehicle path. No command capture or cancellation provider.
    const auto status = tf3boundary::Start40401BoundaryExperiment();
    TraceNativeStart(L"-runtime-boundary40401.txt", "boundary-40401-start",
                    static_cast<unsigned>(status), 0);
    if (status != tf3boundary::Status::started) {
        // Start owns patch-failure cleanup. Never release an uncertain owner.
        if (tf3boundary::Read().active) (void)tf3boundary::RequestHalt();
        const auto stopped = tf3boundary::Stop();
        return stopped != tf3boundary::Status::stopped
            ? TF3_INPROCESS_RUNTIME_OBSERVER_STOP_FAILED
            : TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE;
    }
    const int server_status = tf3runtimeipc::ServeInProcess(
        pipe, token, &ReadBoundaryObservation, 0, &boundary_40401_experiment_provider,
        TF3_RUNTIME_IPC_INPROCESS_GATE_LEASE_MS, nullptr, nullptr);
    if (tf3boundary::Read().gate.state != inprocess_gate::State::detached)
        (void)tf3boundary::RequestHalt();
    const auto stopped = tf3boundary::Stop();
    TraceNativeStart(L"-runtime-boundary40401-stop.txt", "boundary-40401-stop",
                    static_cast<unsigned>(server_status), static_cast<unsigned>(stopped));
    return server_status == 0 && stopped == tf3boundary::Status::stopped
        ? TF3_INPROCESS_RUNTIME_STOPPED : TF3_INPROCESS_RUNTIME_SERVER_FAILED;
}

tf3runtimeipc::PassiveVehicleActionObservation ReadPassiveVehicleObservation() noexcept {
    const auto snapshot = tf3vehicleobserver::Read();
    return {snapshot.factory_hits, snapshot.admission_hits,
            snapshot.correlated_hits, snapshot.dropped_candidates, snapshot.owner_thread,
            snapshot.latest_entity, snapshot.latest_stopped,
            snapshot.latest_valid, snapshot.latest_entry_result_zero,
            snapshot.latest_callback_shape_matches, snapshot.active,
            snapshot.cross_thread, snapshot.saturated,
            snapshot.callback_hits, snapshot.callback_thread,
            snapshot.latest_callback_entity, snapshot.latest_callback_stopped,
            snapshot.latest_callback_result, snapshot.latest_callback_valid,
            snapshot.latest_callback_matches_admission_storage,
            snapshot.latest_admission_progress_known,
            snapshot.latest_admission_progress_empty,
            snapshot.latest_correlated_admission_thread,
            snapshot.send_return_hits, snapshot.send_return_thread,
            snapshot.latest_send_return_matches_admission_storage,
            snapshot.marshaler_return_hits, snapshot.marshaler_return_thread,
            snapshot.latest_marshaler_entity, snapshot.latest_marshaler_stopped,
            snapshot.latest_marshaler_result, snapshot.latest_marshaler_valid,
            snapshot.latest_marshaler_matches_admission_storage,
            snapshot.latest_marshaler_matches_callback_storage,
            snapshot.post_send_body_hits, snapshot.post_send_body_thread,
            snapshot.post_send_body_correlated_hits,
            snapshot.latest_correlated_admission_invocation,
            snapshot.latest_send_return_invocation,
            snapshot.latest_post_send_body_invocation,
            snapshot.latest_post_send_body_entity,
            snapshot.latest_post_send_body_stopped,
            snapshot.latest_post_send_body_valid,
            snapshot.latest_post_send_body_thread};
}

DWORD Run40401CancellationExperiment(const std::wstring& pipe, const std::string& token) {
    // Cancellation only: no production qualification, simulation controls or
    // replay provider. Arm is authenticated, Host-bound and process-lifetime
    // one-use; the original native send body retains all cleanup ownership.
    const auto vehicle = tf3vehicleobserver::Start40401CancellationExperiment();
    const auto post = vehicle == tf3vehicleobserver::Status::started
        ? tf3postobserver::Start40401Passive() : tf3postobserver::Status::never_started;
    TraceNativeStart(L"-runtime-cancel40401.txt", "cancel-40401-start",
        static_cast<unsigned>(vehicle), static_cast<unsigned>(post));
    int server_status = -1;
    if (vehicle == tf3vehicleobserver::Status::started && post == tf3postobserver::Status::started) {
        try {
            server_status = tf3runtimeipc::ServeInProcess(pipe, token, &ReadObservation, 0,
                nullptr, TF3_RUNTIME_IPC_INPROCESS_GATE_LEASE_MS,
                &ReadPassiveVehicleObservation, &production_vehicle_cancel_provider);
        } catch (...) { /* Restore observers; no uncertain action is retried. */ }
    }
    const auto post_stop = tf3postobserver::Stop();
    const auto vehicle_stop = tf3vehicleobserver::Stop();
    TraceNativeStart(L"-runtime-cancel40401-stop.txt", "cancel-40401-stop",
        static_cast<unsigned>(vehicle_stop), static_cast<unsigned>(post_stop));
    if ((post_stop != tf3postobserver::Status::stopped && post_stop != tf3postobserver::Status::never_started) ||
        (vehicle_stop != tf3vehicleobserver::Status::stopped && vehicle_stop != tf3vehicleobserver::Status::never_started))
        return TF3_INPROCESS_RUNTIME_OBSERVER_STOP_FAILED;
    if (vehicle != tf3vehicleobserver::Status::started || post != tf3postobserver::Status::started)
        return TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE;
    return server_status == 0 ? TF3_INPROCESS_RUNTIME_STOPPED : TF3_INPROCESS_RUNTIME_SERVER_FAILED;
}

extern "C" __declspec(dllexport) DWORD WINAPI Tf3InProcessRuntimeV1(
    const Tf3InProcessRuntimeRequestV1* request) {
    TraceNativeStart(L"-runtime-enter.txt", "runtime-entered");
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

    // Diagnostic requests terminate before the production path. The original
    // diagnostic has no hooks; the separate passive selector observes only.
    wchar_t diagnostic[16]{};
    SetLastError(ERROR_SUCCESS);
    const DWORD diagnostic_length = GetEnvironmentVariableW(
        L"TF3MP_NATIVE_DIAGNOSTIC", diagnostic, _countof(diagnostic));
    const DWORD diagnostic_error = GetLastError();
    // The one-use handoff carries the pipe name across a Steam relaunch even
    // when optional environment variables are lost. This prefix can select
    // only the terminal no-hook diagnostic, never a production capability.
    constexpr wchar_t diagnostic_pipe[] = L"tf3mp_diag40401_";
    const bool handoff_diagnostic = pipe.compare(0, _countof(diagnostic_pipe) - 1,
                                                  diagnostic_pipe) == 0;
    const bool environment_diagnostic = diagnostic_length != 0 ||
        diagnostic_error != ERROR_ENVVAR_NOT_FOUND;
    constexpr wchar_t cancellation_pipe[] = L"tf3mp_cancel40401_";
    if (pipe.compare(0, _countof(cancellation_pipe) - 1, cancellation_pipe) == 0) {
        if (environment_diagnostic) return TF3_INPROCESS_RUNTIME_INVALID_DIAGNOSTIC;
        return Run40401CancellationExperiment(pipe, token);
    }
    constexpr wchar_t boundary_pipe[] = L"tf3mp_boundary40401_";
    if (pipe.compare(0, _countof(boundary_pipe) - 1, boundary_pipe) == 0) {
        if (environment_diagnostic) return TF3_INPROCESS_RUNTIME_INVALID_DIAGNOSTIC;
        return Run40401BoundaryExperiment(pipe, token);
    }
    constexpr wchar_t passive_pipe[] = L"tf3mp_passive40401_";
    if (pipe.compare(0, _countof(passive_pipe) - 1, passive_pipe) == 0) {
        // Environment ambiguity is terminal; only the explicit one-use pipe
        // selector authorizes passive instrumentation across Steam relaunches.
        if (environment_diagnostic) return TF3_INPROCESS_RUNTIME_INVALID_DIAGNOSTIC;
        return Run40401Passive();
    }
    if (handoff_diagnostic || environment_diagnostic) {
        if (environment_diagnostic &&
            (diagnostic_length != 5 || wcscmp(diagnostic, L"40401") != 0)) {
            TraceNativeStart(L"-runtime-diagnostic.txt", "diagnostic-invalid");
            return TF3_INPROCESS_RUNTIME_INVALID_DIAGNOSTIC;
        }
        const auto status = tf3postobserver::Diagnose40401WithoutHooks();
        TraceNativeStart(L"-runtime-diagnostic.txt", "diagnostic-40401-no-hooks",
                         static_cast<unsigned>(status), 0);
        return status == tf3postobserver::Status::started
            ? TF3_INPROCESS_RUNTIME_DIAGNOSTIC_MATCH
            : TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE;
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
    TraceNativeStart(L"-runtime-probe.txt", "probe-result",
        static_cast<unsigned>(result.status), result.capability_flags);
    if (result.struct_size != sizeof(result) ||
        result.abi_version != TF3_NATIVE_PROBE_ABI_VERSION) {
        return TF3_INPROCESS_RUNTIME_PROBE_ABI_FAILED;
    }
    if (result.status != TF3_NATIVE_PROBE_STATUS_OBSERVATION_ONLY_MATCH ||
        result.capability_flags != TF3_NATIVE_PROBE_CAPABILITY_NONE) {
        return TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE;
    }

    // The live-qualified production gate remains exact-build and fail-closed.
    // It must not silently fall through to a second owner if activation changes
    // the instruction or handler state unexpectedly.
    // Qualify and arm the vehicle sites while the boundary byte is still the
    // exact audited image byte. The vehicle observer's hash/site qualifier is
    // intentionally unable to bless an image after another owner patches that
    // boundary. Its sites are disjoint from the production gate.
    const auto vehicle_status = tf3vehicleobserver::Start();
    const auto gate_status = tf3boundary::Start();
    TraceNativeStart(L"-runtime-gate.txt", "vehicle-gate",
        static_cast<unsigned>(vehicle_status), static_cast<unsigned>(gate_status));
    if (gate_status == tf3boundary::Status::started) {
        // The observer is diagnostic-only: it captures the exact vehicle
        // factory arguments and the common scripting submission boundary. It
        // neither suppresses nor replays the action and grants no command
        // authority. Failure to arm leaves the capability absent.
        const auto vehicle_provider = vehicle_status == tf3vehicleobserver::Status::started
            ? &ReadPassiveVehicleObservation : nullptr;
        const auto cancel_provider = vehicle_status == tf3vehicleobserver::Status::started
            ? &production_vehicle_cancel_provider : nullptr;
        const int server_status = tf3runtimeipc::ServeInProcess(
            pipe, token, &ReadBoundaryObservation, 0, &production_gate_provider,
            TF3_RUNTIME_IPC_INPROCESS_GATE_LEASE_MS, vehicle_provider, cancel_provider);
        TraceNativeStart(L"-runtime-server.txt", "server-returned",
            static_cast<unsigned>(server_status));
        const auto vehicle_stop = tf3vehicleobserver::Stop();
        const auto snapshot = tf3boundary::Read().gate;
        if (snapshot.state != inprocess_gate::State::detached)
            (void)tf3boundary::RequestHalt();
        const auto stop_status = tf3boundary::Stop();
        const bool vehicle_stopped = vehicle_stop == tf3vehicleobserver::Status::stopped ||
            (vehicle_status != tf3vehicleobserver::Status::started &&
             vehicle_stop == tf3vehicleobserver::Status::never_started);
        return server_status == 0 && vehicle_stopped &&
                stop_status == tf3boundary::Status::stopped
            ? TF3_INPROCESS_RUNTIME_STOPPED : TF3_INPROCESS_RUNTIME_SERVER_FAILED;
    }
    const auto vehicle_stop = tf3vehicleobserver::Stop();
    const bool vehicle_stopped = vehicle_stop == tf3vehicleobserver::Status::stopped ||
        (vehicle_status != tf3vehicleobserver::Status::started &&
         vehicle_stop == tf3vehicleobserver::Status::never_started);
    if (!vehicle_stopped) {
        if (tf3boundary::Read().active) (void)tf3boundary::RequestHalt();
        return TF3_INPROCESS_RUNTIME_OBSERVER_STOP_FAILED;
    }
    if (gate_status != tf3boundary::Status::disabled_pending_live_qualification) {
        if (tf3boundary::Read().active) (void)tf3boundary::RequestHalt();
        // Report the exact failed gate state over the authenticated diagnostic
        // transport. No observer, gate provider or gameplay capability is
        // exposed; a Host/Join client must reject this session.
        const int diagnostic_status = tf3runtimeipc::ServeInProcess(pipe, token, nullptr,
            100u + static_cast<std::uint32_t>(gate_status));
        TraceNativeStart(L"-runtime-server.txt", "diagnostic-returned",
            static_cast<unsigned>(diagnostic_status));
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
