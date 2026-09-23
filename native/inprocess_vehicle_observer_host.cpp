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
extern "C" __declspec(dllexport) LONG TestDispatch(EXCEPTION_POINTERS* pointers) {
    return tf3vehicleobserver::DispatchOwnedException(pointers);
}
#else
#include <array>
#include <atomic>
#include <cstdio>
#include <cstdlib>
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
}

int wmain(int argc, wchar_t** argv) {
    Require(argc == 2, "DLL argument");
    HMODULE library = LoadLibraryExW(argv[1], nullptr,
        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    Require(library != nullptr, "load observer DLL");
    const auto start = Symbol<tf3vehicleobserver::Status(*)(void*, void*, void*, void*, void*, void*, void*)>(library, "TestStart");
    const auto stop = Symbol<tf3vehicleobserver::Status(*)()>(library, "TestStop");
    const auto snapshot = Symbol<tf3vehicleobserver::Snapshot(*)()>(library, "TestSnapshot");
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
    int callback_implementation = 0;
    CallbackValue callback_value{};
    callback_value.implementation = &callback_implementation;
    std::array<std::uintptr_t, 2> progress_pair{};
    entry.command = reinterpret_cast<std::uintptr_t>(command.data());
    const std::int32_t entity = 66005;
    std::memcpy(command.data(), &entity, sizeof(entity));
    command[4] = 1;
    command[0x9b8] = 0x32;
    Require(OwnedVehicleFactoryExecute(&entry, nullptr, entity, 1) == static_cast<std::uint32_t>(entity),
            "actual factory trap emulates mov");
    Require(OwnedVehiclePostSendBodyExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry,
            "actual post-send-body trap follows normal send-body return");
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
    Require(observed.callback_hits == 1 && observed.callback_thread == GetCurrentThreadId() &&
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
