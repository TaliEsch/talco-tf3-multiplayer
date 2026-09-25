#include "inprocess_vehicle_observer.h"

#ifdef TF3_VEHICLE_OBSERVER_TEST_DLL
extern "C" __declspec(dllexport) tf3vehicleobserver::Status TestStart(void* factory, void* factory_post,
                                                                      void* admission, void* callback_tail,
                                                                      void* send_return, void* marshaler_return,
                                                                      void* post_send_body) {
    return tf3vehicleobserver::StartOwnedFixture(factory, factory_post, admission, callback_tail,
                                                send_return, marshaler_return, post_send_body);
}
extern "C" __declspec(dllexport) tf3vehicleobserver::Status TestStop() {
    return tf3vehicleobserver::Stop();
}
extern "C" __declspec(dllexport) tf3vehicleobserver::Snapshot TestSnapshot() {
    return tf3vehicleobserver::Read();
}
extern "C" __declspec(dllexport) tf3vehicleobserver::Status TestArmCancellation(
    const tf3vehicleobserver::CancellationArmRequest* request) {
    return request ? tf3vehicleobserver::ArmCancellation(*request) : tf3vehicleobserver::Status::invalid_site;
}
extern "C" __declspec(dllexport) tf3vehicleobserver::CancellationArmSnapshot TestCancellationArmSnapshot() {
    return tf3vehicleobserver::ReadCancellationArm();
}
extern "C" __declspec(dllexport) LONG TestDispatch(EXCEPTION_POINTERS* pointers) {
    return tf3vehicleobserver::DispatchOwnedException(pointers);
}
#else
#include <array>
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <thread>

extern "C" unsigned char OwnedVehicleFactorySite;
extern "C" unsigned char OwnedVehicleFactoryPostSite;
extern "C" unsigned char OwnedVehicleAdmissionSite;
extern "C" unsigned char OwnedVehicleCallbackTailSite;
extern "C" unsigned char OwnedVehicleSendReturnSite;
extern "C" unsigned char OwnedVehicleMarshalerReturnSite;
extern "C" unsigned char OwnedVehiclePostSendBodySite;
extern "C" std::uint32_t OwnedVehicleFactoryExecute(void*, void*, std::uint32_t, std::uint8_t);
extern "C" void* OwnedVehicleAdmissionExecute(void*, void*, void*, void*);
extern "C" void* OwnedVehicleCallbackExecute(void*, void*);
extern "C" void* OwnedVehicleMarshalerExecute(void*, void*);
extern "C" void* OwnedVehiclePostSendBodyExecute(void*, void*, void*, void*);

namespace {
void Require(bool value, const char* name) {
    if (!value) { std::fprintf(stderr, "FAIL: %s (win32=%lu)\n", name, GetLastError()); std::exit(1); }
}
template<class T> T Symbol(HMODULE library, const char* name) {
    const auto value = GetProcAddress(library, name);
    Require(value != nullptr, name);
    return reinterpret_cast<T>(value);
}
struct Entry {
    std::uintptr_t command;
    std::array<std::uintptr_t, 6> rest{};
};
struct CallbackValue { std::array<std::byte, 0x38> prefix{}; void* implementation = nullptr; };
struct CallbackImplementation { void* vtable = nullptr; };
std::array<std::uintptr_t, 3> image_adapter_table{};
struct CleanupCounts {
    unsigned entry = 0, callback = 0, progress = 0, false_callbacks = 0, original_submissions = 0;
    bool throw_callback = false;
};
CleanupCounts* cleanup_counts = nullptr;
struct OwnedCleanup {
    unsigned& count;
    ~OwnedCleanup() { ++count; }
};
void CountOriginalSubmission(void*, void*, void*, void*) {
    ++cleanup_counts->original_submissions;
}
void CountFalseCallback(void* implementation, void* entry) {
    Require(cleanup_counts != nullptr && cleanup_counts->entry == 0 &&
        cleanup_counts->callback == 0 && cleanup_counts->progress == 0,
        "callback runs while caller owns all three live values");
    Require(*reinterpret_cast<const unsigned char*>(static_cast<unsigned char*>(entry) + 0x30) == 0,
        "failure callback receives zero result");
    ++cleanup_counts->false_callbacks;
    (void)OwnedVehicleCallbackExecute(implementation, entry);
    if (cleanup_counts->throw_callback) throw std::runtime_error("owned callback unwind");
}
}

int wmain(int argc, wchar_t** argv) {
    Require(argc == 2 || (argc == 3 && wcscmp(argv[2], L"unwind") == 0), "DLL argument");
    const bool unwind_test = argc == 3;
    HMODULE library = LoadLibraryExW(argv[1], nullptr,
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    Require(library != nullptr, "load observer DLL");
    const auto start = Symbol<tf3vehicleobserver::Status(*)(void*, void*, void*, void*, void*, void*, void*)>(library, "TestStart");
    const auto stop = Symbol<tf3vehicleobserver::Status(*)()>(library, "TestStop");
    const auto snapshot = Symbol<tf3vehicleobserver::Snapshot(*)()>(library, "TestSnapshot");
    const auto arm_cancellation = Symbol<tf3vehicleobserver::Status(*)(const tf3vehicleobserver::CancellationArmRequest*)>(library, "TestArmCancellation");
    const auto arm_snapshot = Symbol<tf3vehicleobserver::CancellationArmSnapshot(*)()>(library, "TestCancellationArmSnapshot");
    const auto dispatch = Symbol<LONG(*)(EXCEPTION_POINTERS*)>(library, "TestDispatch");
    using S = tf3vehicleobserver::Status;

    Require(stop() == S::never_started, "stop before start");
    Require(start(&OwnedVehicleFactorySite + 1, &OwnedVehicleFactoryPostSite,
                  &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                  &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite,
                  &OwnedVehiclePostSendBodySite) == S::invalid_site,
            "wrong factory boundary rejected");
    Require(start(&OwnedVehicleFactorySite, &OwnedVehicleFactoryPostSite,
                  &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                  &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite,
                  &OwnedVehiclePostSendBodySite + 1) == S::invalid_site,
            "wrong post-send-body boundary rejected");
    const auto begin = start(&OwnedVehicleFactorySite, &OwnedVehicleFactoryPostSite,
                             &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                             &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite,
                             &OwnedVehiclePostSendBodySite);
    Require(begin == S::started, "start owned sites");
    Require(OwnedVehicleFactorySite == 0xcc && OwnedVehicleFactoryPostSite == 0xcc &&
            OwnedVehicleAdmissionSite == 0xcc && OwnedVehicleCallbackTailSite == 0xcc &&
            OwnedVehicleSendReturnSite == 0xcc && OwnedVehicleMarshalerReturnSite == 0xcc &&
            OwnedVehiclePostSendBodySite == 0xcc, "all trap bytes installed");
    std::int32_t post_send_body_displacement = 0;
    std::memcpy(&post_send_body_displacement, &OwnedVehiclePostSendBodySite - 4,
                sizeof(post_send_body_displacement));
    Require(*(&OwnedVehiclePostSendBodySite - 5) == 0xe8 &&
            reinterpret_cast<std::uintptr_t>(&OwnedVehiclePostSendBodySite) +
                post_send_body_displacement == reinterpret_cast<std::uintptr_t>(&OwnedVehicleAdmissionExecute),
            "post-send-body NOP directly follows the owned send-body call");
    Require(start(&OwnedVehicleFactorySite, &OwnedVehicleFactoryPostSite,
                  &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                  &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite,
                  &OwnedVehiclePostSendBodySite) == S::already_started,
            "duplicate start rejected");

    int unrelated_implementation = 0;
    Require(OwnedVehicleCallbackExecute(&unrelated_implementation, nullptr) ==
            static_cast<void*>(reinterpret_cast<unsigned char*>(&unrelated_implementation) + 8),
            "unrelated callback still executes");
    Require(snapshot().callback_hits == 0 && snapshot().callback_thread == 0,
            "unrelated callback cannot masquerade as vehicle receipt");
    Require(OwnedVehicleMarshalerExecute(nullptr, &unrelated_implementation) == &unrelated_implementation &&
            snapshot().marshaler_return_hits == 0, "invalid marshaler pack preserves execution without a receipt");

    std::array<unsigned char, 0x9c0> command{};
    Entry entry{};
    std::array<std::uintptr_t, 3> callback_vtable{};
    callback_vtable[2] = reinterpret_cast<std::uintptr_t>(&CountFalseCallback);
    CallbackImplementation callback_implementation{callback_vtable.data()};
    std::array<std::uintptr_t, 3> submission_vtable{};
    submission_vtable[2] = reinterpret_cast<std::uintptr_t>(&CountOriginalSubmission);
    CallbackImplementation submission_implementation{submission_vtable.data()};
    CallbackValue callback_value{};
    callback_value.implementation = &callback_implementation;
    std::array<std::uintptr_t, 2> progress_pair{};
    entry.command = reinterpret_cast<std::uintptr_t>(command.data());
    const std::int32_t entity = 66005;
    std::memcpy(command.data(), &entity, sizeof(entity));
    command[4] = 1;
    command[0x9b8] = 0x32;
    std::thread unrelated_admission([&] {
        command[0x9b8] = 0x31;
        (void)OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair);
    });
    unrelated_admission.join();
    Require(snapshot().owner_thread == 0 && !snapshot().cross_thread &&
            snapshot().admission_hits == 0,
            "unrelated command cannot set vehicle thread ownership");
    command[0x9b8] = 0x32;
    Require(arm_snapshot().state == tf3vehicleobserver::CancellationArmState::disabled,
            "default cancellation arm is disabled");
    const tf3vehicleobserver::CancellationArmRequest cancellation_request{
        entity, 1, GetTickCount64() + 1000};
    Require(arm_cancellation(&cancellation_request) == S::started &&
            arm_snapshot().state == tf3vehicleobserver::CancellationArmState::armed,
            "one exact cancellation arm is accepted");
    Require(arm_cancellation(&cancellation_request) == S::restart_disallowed,
            "second arm is refused for process lifetime");
    Require(OwnedVehicleFactoryExecute(&entry, nullptr, entity, 1) == static_cast<std::uint32_t>(entity),
            "actual factory trap emulates mov");
    // The owned assembly does not model TF3's vtable load into RAX. Drive the
    // same trapped boundaries with a bounded synthetic context so the arm's
    // register substitution and receipt state can be exercised without an
    // engine pointer or a TF3 launch.
    using SendFrame = std::array<std::uintptr_t, 0x180 / sizeof(std::uintptr_t) + 1>;
    SendFrame arm_frame{};
    arm_frame[0x178 / sizeof(std::uintptr_t)] = reinterpret_cast<std::uintptr_t>(&OwnedVehiclePostSendBodySite);
    const auto syntheticTrapHere = [&](unsigned char* site, CONTEXT& registers) {
        EXCEPTION_RECORD trap{};
        trap.ExceptionCode = EXCEPTION_BREAKPOINT;
        trap.ExceptionAddress = site;
        registers.Rip = reinterpret_cast<DWORD64>(site);
        EXCEPTION_POINTERS pending{&trap, &registers};
        Require(dispatch(&pending) == EXCEPTION_CONTINUE_EXECUTION, "owned arm continuation dispatch");
    };
    CONTEXT arm_admission{};
    arm_admission.Rbx = reinterpret_cast<DWORD64>(&entry);
    arm_admission.R8 = reinterpret_cast<DWORD64>(&callback_value);
    arm_admission.R9 = reinterpret_cast<DWORD64>(&progress_pair);
    arm_admission.Rcx = reinterpret_cast<DWORD64>(&submission_implementation);
    arm_admission.Rax = reinterpret_cast<DWORD64>(submission_vtable.data());
    arm_admission.Rsp = reinterpret_cast<DWORD64>(arm_frame.data());
    syntheticTrapHere(&OwnedVehicleAdmissionSite, arm_admission);
    Require(arm_admission.Rdx == reinterpret_cast<DWORD64>(&entry) &&
            arm_admission.Rcx == reinterpret_cast<DWORD64>(&submission_implementation) &&
            arm_admission.Rax != reinterpret_cast<DWORD64>(submission_vtable.data()) &&
            *reinterpret_cast<const std::uintptr_t*>(arm_admission.Rax + 0x10) != 0 &&
            arm_snapshot().state == tf3vehicleobserver::CancellationArmState::claimed,
            "claim preserves entry/implementation and redirects only the call table");
    using FailureCall = void (*)(void*, void*, void*, void*);
    const auto failure_call = reinterpret_cast<FailureCall>(
        *reinterpret_cast<const std::uintptr_t*>(arm_admission.Rax + 0x10));
    CleanupCounts ownership{};
    ownership.throw_callback = unwind_test;
    cleanup_counts = &ownership;
    bool callback_threw = false;
    try {
        // Model the send body's caller-owned locals around the substituted
        // native call. The shim must neither destroy nor retain these values.
        OwnedCleanup progress_owner{ownership.progress};
        OwnedCleanup callback_owner{ownership.callback};
        OwnedCleanup entry_owner{ownership.entry};
        failure_call(reinterpret_cast<void*>(arm_admission.Rcx), &entry, &callback_value,
                     progress_pair.data());
    } catch (const std::runtime_error&) { callback_threw = true; }
    Require(callback_threw == unwind_test && ownership.entry == 1 && ownership.callback == 1 &&
        ownership.progress == 1 && ownership.false_callbacks == 1 && ownership.original_submissions == 0,
        "caller cleans each value once on normal return or callback unwind without original submission");
    if (unwind_test) {
        Require(arm_snapshot().state == tf3vehicleobserver::CancellationArmState::claimed &&
            arm_snapshot().callback_result_zero && !arm_snapshot().send_return && !arm_snapshot().post_send_body,
            "callback unwind remains claimed unknown without completion receipts");
        Require(arm_cancellation(&cancellation_request) == S::restart_disallowed,
            "uncertain callback unwind cannot rearm");
        Require(stop() == S::stopped, "unwind observer restored");
        std::puts("owned-cancel-unwind=1 false-callback=1 original-submissions=0 caller-cleanup=1 unknown=1");
        return 0;
    }
    std::puts("owned-cancel-normal=1 false-callback=1 original-submissions=0 caller-cleanup=1");
    syntheticTrapHere(&OwnedVehicleSendReturnSite, arm_admission);
    CONTEXT arm_post{};
    arm_post.Rsp = arm_admission.Rsp + 0x180;
    syntheticTrapHere(&OwnedVehiclePostSendBodySite, arm_post);
    Require(arm_snapshot().state == tf3vehicleobserver::CancellationArmState::completed &&
            arm_snapshot().callback_result_zero && arm_snapshot().send_return && arm_snapshot().post_send_body,
            "claimed arm completes only after callback zero send return and post receipt");
    auto observed = snapshot();
    Require(observed.factory_hits == 1 && observed.admission_hits == 1 &&
            observed.dropped_candidates == 0 && observed.latest_valid &&
            observed.latest_entity == entity && observed.latest_stopped == 1 &&
            observed.latest_entry_result_zero && observed.latest_admission_progress_known &&
            observed.latest_admission_progress_empty && observed.active &&
            observed.latest_correlated_admission_thread == GetCurrentThreadId(),
            "correlated pointer-free observation");
    Require(observed.send_return_hits == 1 && observed.send_return_thread == GetCurrentThreadId() &&
            observed.latest_send_return_matches_admission_storage,
            "normal send return matches the admission invocation and storage identity");
    Require(observed.post_send_body_hits == 1 && observed.post_send_body_thread == GetCurrentThreadId(),
            "post-send-body receipt occurs after normal send-body cleanup");
    Require(observed.post_send_body_correlated_hits == 1 && observed.latest_post_send_body_valid &&
            observed.latest_post_send_body_entity == entity && observed.latest_post_send_body_stopped == 1 &&
            observed.latest_post_send_body_thread == GetCurrentThreadId() &&
            observed.latest_post_send_body_invocation == observed.latest_correlated_admission_invocation &&
            observed.latest_post_send_body_invocation == observed.latest_send_return_invocation,
            "real owned frame depth correlates complete cleanup to exactly one admission token");
    Require(OwnedVehicleCallbackExecute(&callback_implementation, &entry) ==
            static_cast<void*>(reinterpret_cast<unsigned char*>(&callback_implementation) + 8),
            "actual callback-tail JMP emulates after native ADD");
    observed = snapshot();
    Require(observed.callback_hits == 2 && observed.callback_thread == GetCurrentThreadId() &&
            observed.latest_callback_valid && observed.latest_callback_entity == entity &&
            observed.latest_callback_stopped == 1 && observed.latest_callback_result == 0 &&
            observed.latest_callback_matches_admission_storage,
            "callback is bounded and identity-correlated without pointer export");
    std::array<std::uintptr_t, 3> marshaler_pack{0, reinterpret_cast<std::uintptr_t>(&entry), 0};
    entry.rest[5] = 1; // entry+0x30, the native result byte
    Require(OwnedVehicleMarshalerExecute(marshaler_pack.data(), &entry) == &entry,
            "actual marshaler normal-return NOP preserves return value");
    observed = snapshot();
    Require(observed.marshaler_return_hits == 1 && observed.marshaler_return_thread == GetCurrentThreadId() &&
            observed.latest_marshaler_valid && observed.latest_marshaler_entity == entity &&
            observed.latest_marshaler_stopped == 1 && observed.latest_marshaler_result == 1 &&
            observed.latest_marshaler_matches_admission_storage && observed.latest_marshaler_matches_callback_storage,
            "marshaler return reads the bounded pack and correlates both storage identities");
    entry.rest[5] = 0;

    command[0x9b8] = 0x31;
    Require(OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry, "unsupported tag preserves execution");
    observed = snapshot();
    Require(observed.admission_hits == 1 && observed.dropped_candidates == 0,
            "unsupported commands are ignored");
    command[0x9b8] = 0x32;
    std::int32_t other_entity = entity + 1;
    std::memcpy(command.data(), &other_entity, sizeof(other_entity));
    Require(OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry, "mismatch preserves execution");
    Require(snapshot().admission_hits == 2 && snapshot().dropped_candidates == 1,
            "uncorrelated action is dropped");

    std::array<unsigned char, 0x9c0> second_command{};
    Entry second_entry{};
    second_entry.command = reinterpret_cast<std::uintptr_t>(second_command.data());
    std::memcpy(command.data(), &entity, sizeof(entity)); command[4] = 1;
    std::memcpy(second_command.data(), &entity, sizeof(entity)); second_command[4] = 1;
    command[0x9b8] = second_command[0x9b8] = 0x32;
    Require(OwnedVehicleFactoryExecute(&second_entry, nullptr, entity, 1) ==
            static_cast<std::uint32_t>(entity), "second identical factory executes");
    Require(OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry,
            "different identical command storage preserves execution");
    Require(snapshot().admission_hits == 3 && snapshot().dropped_candidates == 2,
            "payload equality cannot replace command-storage identity");
    marshaler_pack[1] = reinterpret_cast<std::uintptr_t>(&second_entry);
    (void)OwnedVehicleMarshalerExecute(marshaler_pack.data(), &second_entry);
    observed = snapshot();
    Require(observed.marshaler_return_hits == 2 && !observed.latest_marshaler_matches_admission_storage &&
            !observed.latest_marshaler_matches_callback_storage,
            "equal payload with different storage cannot produce a matched marshaler receipt");

    std::thread foreign([&] {
        command[4] = 0;
        (void)OwnedVehicleFactoryExecute(&entry, nullptr, entity, 0);
        (void)OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair);
    });
    foreign.join();
    observed = snapshot();
    Require(observed.cross_thread && observed.factory_hits == 3 &&
            observed.admission_hits == 4 && observed.dropped_candidates == 2 &&
            observed.latest_valid && observed.latest_entity == entity &&
            observed.latest_stopped == 0,
            "bounded multi-thread observation preserves command identity");

    command[4] = 1;
    std::thread producer([&] {
        (void)OwnedVehicleFactoryExecute(&entry, nullptr, entity, 1);
    });
    producer.join();
    Require(OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry,
            "cross-thread admission preserves execution");
    observed = snapshot();
    Require(observed.factory_hits == 4 && observed.admission_hits == 5 &&
            observed.dropped_candidates == 2 && observed.latest_stopped == 1,
            "factory-to-admission transfer is synchronized across threads");

    command[4] = 0;
    (void)OwnedVehicleFactoryExecute(&entry, nullptr, entity, 0);
    command[4] = 1;
    (void)OwnedVehicleFactoryExecute(&entry, nullptr, entity, 1);
    (void)OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair);
    (void)OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair);
    observed = snapshot();
    Require(observed.factory_hits == 6 && observed.admission_hits == 7 &&
            observed.dropped_candidates == 4 && observed.latest_stopped == 1,
            "storage reuse invalidates stale identity and remains exactly once");

    const auto stress_before = snapshot();
    std::array<std::thread, 4> workers{};
    std::atomic<std::uint32_t> barrier_arrivals{0};
    std::atomic<std::uint32_t> barrier_phase{0};
    for (std::size_t worker = 0; worker != workers.size(); ++worker) {
        workers[worker] = std::thread([worker, &barrier_arrivals, &barrier_phase] {
            std::array<unsigned char, 0x9c0> local_command{};
            Entry local_entry{};
            int local_callback_implementation = 0;
            CallbackValue local_callback_value{};
            local_callback_value.implementation = &local_callback_implementation;
            std::array<std::uintptr_t, 2> local_progress_pair{};
            local_entry.command = reinterpret_cast<std::uintptr_t>(local_command.data());
            local_command[0x9b8] = 0x32;
            for (std::int32_t iteration = 0; iteration != 128; ++iteration) {
                const auto local_entity = static_cast<std::int32_t>(100000 + worker * 1000 + iteration);
                const auto local_stopped = static_cast<std::uint8_t>(iteration & 1);
                std::memcpy(local_command.data(), &local_entity, sizeof(local_entity));
                local_command[4] = local_stopped;
                (void)OwnedVehicleFactoryExecute(&local_entry, nullptr, local_entity, local_stopped);
                (void)OwnedVehiclePostSendBodyExecute(&local_entry, &local_callback_implementation,
                    &local_callback_value, &local_progress_pair);
                const auto phase = barrier_phase.load(std::memory_order_acquire);
                if (barrier_arrivals.fetch_add(1, std::memory_order_acq_rel) == 3) {
                    barrier_arrivals.store(0, std::memory_order_relaxed);
                    barrier_phase.fetch_add(1, std::memory_order_release);
                } else {
                    while (barrier_phase.load(std::memory_order_acquire) == phase)
                        std::this_thread::yield();
                }
            }
        });
    }
    for (auto& worker : workers) worker.join();
    observed = snapshot();
    const auto stress_dropped = observed.dropped_candidates - stress_before.dropped_candidates;
    const auto stress_correlated = observed.correlated_hits - stress_before.correlated_hits;
    Require(observed.factory_hits == stress_before.factory_hits + 512 &&
            observed.admission_hits == stress_before.admission_hits + 512 &&
            stress_correlated == 512 && stress_dropped <= 1 &&
            !observed.saturated && observed.latest_valid,
            "concurrent ring wrap is bounded and accounts for every admission");
    Require(observed.post_send_body_correlated_hits == stress_before.post_send_body_correlated_hits + 512 &&
            observed.latest_post_send_body_valid,
            "concurrent complete send bodies each publish one correlated cleanup receipt");

    CONTEXT context{};
    context.Rip = reinterpret_cast<DWORD64>(&OwnedVehicleFactorySite);
    EXCEPTION_RECORD record{};
    record.ExceptionCode = EXCEPTION_ACCESS_VIOLATION;
    record.ExceptionAddress = &OwnedVehicleFactorySite;
    EXCEPTION_POINTERS pointers{&record, &context};
    Require(dispatch(&pointers) == EXCEPTION_CONTINUE_SEARCH, "foreign exception passes through");

    const auto syntheticTrap = [&](unsigned char* site, CONTEXT& registers) {
        EXCEPTION_RECORD trap{};
        trap.ExceptionCode = EXCEPTION_BREAKPOINT;
        trap.ExceptionAddress = site;
        registers.Rip = reinterpret_cast<DWORD64>(site);
        EXCEPTION_POINTERS pending{&trap, &registers};
        Require(dispatch(&pending) == EXCEPTION_CONTINUE_EXECUTION, "owned continuation dispatch");
    };
    (void)OwnedVehicleFactoryExecute(&entry, nullptr, entity, 1);
    CONTEXT invocation{};
    invocation.Rbx = reinterpret_cast<DWORD64>(&entry);
    invocation.Rsp = 0x100000;
    invocation.R9 = reinterpret_cast<DWORD64>(&progress_pair);
    syntheticTrap(&OwnedVehicleAdmissionSite, invocation);
    const auto moved_before = snapshot();
    const auto saved_storage = entry.command;
    entry.command = 0; // adapter has transferred ownership before returning
    syntheticTrap(&OwnedVehicleSendReturnSite, invocation);
    Require(snapshot().send_return_hits == moved_before.send_return_hits + 1 &&
            snapshot().latest_send_return_matches_admission_storage,
            "moved-from entry return correlates captured identity without dereferencing it");
    entry.command = saved_storage;

    (void)OwnedVehicleFactoryExecute(&entry, nullptr, entity, 1);
    syntheticTrap(&OwnedVehicleAdmissionSite, invocation);
    const auto unwind_before = snapshot();
    command[0x9b8] = 0x31; // new unrelated admission reuses a frame after unwind
    syntheticTrap(&OwnedVehicleAdmissionSite, invocation);
    syntheticTrap(&OwnedVehicleSendReturnSite, invocation);
    Require(snapshot().send_return_hits == unwind_before.send_return_hits &&
            snapshot().dropped_candidates == unwind_before.dropped_candidates + 1,
            "unwound invocation cannot match a reused frame's unrelated return");
    command[0x9b8] = 0x32;

    // Synthetic stack contexts test admission/return matching without retaining
    // or dereferencing a native object at the post-cleanup boundary.
    using SendFrame = std::array<std::uintptr_t, 0x180 / sizeof(std::uintptr_t) + 1>;
    SendFrame outer_frame{}, inner_frame{};
    const auto makeInvocation = [&](SendFrame& frame) {
        frame[0x178 / sizeof(std::uintptr_t)] = reinterpret_cast<std::uintptr_t>(&OwnedVehiclePostSendBodySite);
        CONTEXT value{};
        value.Rsp = reinterpret_cast<DWORD64>(frame.data());
        value.Rbx = reinterpret_cast<DWORD64>(&entry);
        value.R9 = reinterpret_cast<DWORD64>(&progress_pair);
        return value;
    };
    const auto admit = [&](CONTEXT& value) {
        (void)OwnedVehicleFactoryExecute(&entry, nullptr, entity, 1);
        syntheticTrap(&OwnedVehicleAdmissionSite, value);
        return snapshot().latest_correlated_admission_invocation;
    };
    const auto postBody = [&](const CONTEXT& value) {
        CONTEXT post{};
        post.Rsp = value.Rsp + 0x180;
        post.Rbx = 1; // Native entry is dead: this must never be dereferenced.
        syntheticTrap(&OwnedVehiclePostSendBodySite, post);
    };
    auto outer = makeInvocation(outer_frame);
    auto inner = makeInvocation(inner_frame);
    const auto outer_token = admit(outer);
    const auto before_nested = snapshot();
    postBody(outer);
    Require(snapshot().post_send_body_correlated_hits == before_nested.post_send_body_correlated_hits,
            "post-body boundary alone cannot bypass required send-return receipt");
    const auto inner_token = admit(inner);
    Require(inner_token != outer_token, "nested invocations receive distinct tokens");
    syntheticTrap(&OwnedVehicleSendReturnSite, inner);
    postBody(inner);
    Require(snapshot().latest_post_send_body_invocation == inner_token,
            "nested inner return matches its own caller stack");
    syntheticTrap(&OwnedVehicleSendReturnSite, outer);
    const auto retained_storage = entry.command;
    entry.command = 0;
    postBody(outer);
    entry.command = retained_storage;
    Require(snapshot().latest_post_send_body_invocation == outer_token &&
            snapshot().post_send_body_correlated_hits == before_nested.post_send_body_correlated_hits + 2,
            "outer cleanup retains its own token despite newer admission and dead entry");
    const auto before_duplicate = snapshot();
    postBody(outer);
    Require(snapshot().post_send_body_hits == before_duplicate.post_send_body_hits + 1 &&
            snapshot().post_send_body_correlated_hits == before_duplicate.post_send_body_correlated_hits,
            "generic and duplicate hits cannot mint a correlated receipt");

    const auto thread_token = admit(outer);
    syntheticTrap(&OwnedVehicleSendReturnSite, outer);
    const auto before_foreign_return = snapshot();
    std::thread wrong_thread([&] { postBody(outer); });
    wrong_thread.join();
    Require(snapshot().post_send_body_correlated_hits == before_foreign_return.post_send_body_correlated_hits &&
            snapshot().owner_thread == before_foreign_return.owner_thread,
            "foreign-thread generic hit cannot consume or taint a vehicle invocation");
    postBody(outer);
    Require(snapshot().latest_post_send_body_invocation == thread_token,
            "owning thread still consumes its pending cleanup once");

    (void)admit(outer);
    syntheticTrap(&OwnedVehicleSendReturnSite, outer);
    const auto before_stale_cleanup = snapshot();
    command[0x9b8] = 0x31;
    syntheticTrap(&OwnedVehicleAdmissionSite, outer);
    command[0x9b8] = 0x32;
    postBody(outer);
    Require(snapshot().post_send_body_correlated_hits == before_stale_cleanup.post_send_body_correlated_hits &&
            snapshot().dropped_candidates == before_stale_cleanup.dropped_candidates + 1,
            "unrelated admission invalidates a stale post-cleanup frame before tag filtering");

    image_adapter_table[2] = reinterpret_cast<std::uintptr_t>(&OwnedVehicleCallbackExecute);
    CONTEXT adapter_identity{};
    adapter_identity.Rbx = reinterpret_cast<DWORD64>(&entry);
    adapter_identity.Rax = reinterpret_cast<DWORD64>(image_adapter_table.data());
    adapter_identity.R9 = reinterpret_cast<DWORD64>(&progress_pair);
    syntheticTrap(&OwnedVehicleAdmissionSite, adapter_identity);
    const auto image = reinterpret_cast<std::uintptr_t>(GetModuleHandleW(nullptr));
    observed = snapshot();
    Require(observed.latest_adapter_table_rva ==
                reinterpret_cast<std::uintptr_t>(image_adapter_table.data()) - image &&
            observed.latest_adapter_invoke_rva ==
                reinterpret_cast<std::uintptr_t>(&OwnedVehicleCallbackExecute) - image,
            "unknown image-resident adapter retains bounded table and invoke RVAs");

    // Leave 16 distinct invocations waiting for cleanup; the seventeenth must
    // latch overflow and never manufacture a valid completion receipt.
    std::array<SendFrame, 17> overflow_frames{};
    std::array<CONTEXT, 17> overflow_invocations{};
    const auto before_overflow = snapshot();
    for (std::size_t i = 0; i != overflow_frames.size(); ++i) {
        overflow_invocations[i] = makeInvocation(overflow_frames[i]);
        (void)admit(overflow_invocations[i]);
        syntheticTrap(&OwnedVehicleSendReturnSite, overflow_invocations[i]);
    }
    Require(snapshot().saturated && !snapshot().latest_post_send_body_valid,
            "bounded pending cleanup overflow invalidates qualification");
    for (const auto& value : overflow_invocations) postBody(value);
    Require(snapshot().post_send_body_correlated_hits == before_overflow.post_send_body_correlated_hits,
            "overflow cannot turn raw cleanup hits into correlated success");

    std::atomic<bool> keep_calling{true};
    std::atomic<std::uint32_t> concurrent_calls{0};
    std::atomic<bool> preserved_return{true};
    std::thread teardown_caller([&] {
        while (keep_calling.load(std::memory_order_acquire)) {
            if (OwnedVehicleMarshalerExecute(nullptr, &unrelated_implementation) != &unrelated_implementation)
                preserved_return.store(false, std::memory_order_release);
            concurrent_calls.fetch_add(1, std::memory_order_release);
        }
    });
    while (concurrent_calls.load(std::memory_order_acquire) < 256) std::this_thread::yield();
    const auto stopped = stop();
    keep_calling.store(false, std::memory_order_release);
    teardown_caller.join();
    Require(stopped == S::stopped && preserved_return.load(), "concurrent native calls survive all-site restoration");
    Require(OwnedVehicleFactorySite == 0x41 && OwnedVehicleFactoryPostSite == 0x90 &&
            OwnedVehicleAdmissionSite == 0x48 && OwnedVehicleCallbackTailSite == 0xe9 &&
            OwnedVehicleSendReturnSite == 0x90 && OwnedVehicleMarshalerReturnSite == 0x90 &&
            OwnedVehiclePostSendBodySite == 0x90, "original bytes restored");
    const auto before = snapshot();
    Require(OwnedVehicleFactoryExecute(&entry, nullptr, entity, 0) == static_cast<std::uint32_t>(entity) &&
            OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry,
            "original instructions execute after stop");
    Require(snapshot().factory_hits == before.factory_hits &&
            snapshot().admission_hits == before.admission_hits && !snapshot().active,
            "stopped observer remains inert");
    for (auto* site : {&OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite, &OwnedVehiclePostSendBodySite}) {
        CONTEXT late{};
        late.Rip = reinterpret_cast<DWORD64>(site);
        late.Rax = 0x1234; late.Rbx = 0x5678; late.EFlags = 0x246;
        auto expected = late;
        ++expected.Rip;
        EXCEPTION_RECORD trap{};
        trap.ExceptionCode = EXCEPTION_BREAKPOINT;
        trap.ExceptionAddress = site;
        EXCEPTION_POINTERS pending{&trap, &late};
        Require(dispatch(&pending) == EXCEPTION_CONTINUE_EXECUTION &&
                std::memcmp(&late, &expected, sizeof(late)) == 0,
                "late restored-site NOP trap preserves registers and flags");
    }
    Require(snapshot().send_return_hits == before.send_return_hits &&
            snapshot().marshaler_return_hits == before.marshaler_return_hits &&
            snapshot().post_send_body_hits == before.post_send_body_hits,
            "late return traps cannot publish receipts after stop");
    Require(stop() == S::stopped, "idempotent stop");
    Require(start(&OwnedVehicleFactorySite, &OwnedVehicleFactoryPostSite,
                  &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                  &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite,
                  &OwnedVehiclePostSendBodySite) == S::restart_disallowed,
            "single lifecycle enforced");
    std::puts("owned-vehicle-observer PASS actual-traps=1 correlation=1 invalid-tag=1 mismatch=1 cross-thread=1 restored=1");
    return 0;
}
#endif
