#include "inprocess_vehicle_observer.h"

#ifdef TF3_VEHICLE_OBSERVER_TEST_DLL
extern "C" __declspec(dllexport) tf3vehicleobserver::Status TestStart(void* factory, void* factory_post,
                                                                      void* admission, void* callback_tail,
                                                                      void* send_return, void* marshaler_return) {
    return tf3vehicleobserver::StartOwnedFixture(factory, factory_post, admission, callback_tail,
                                                send_return, marshaler_return);
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
extern "C" std::uint32_t OwnedVehicleFactoryExecute(void*, void*, std::uint32_t, std::uint8_t);
extern "C" void* OwnedVehicleAdmissionExecute(void*, void*, void*, void*);
extern "C" void* OwnedVehicleCallbackExecute(void*, void*);
extern "C" void* OwnedVehicleMarshalerExecute(void*, void*);

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
    const auto start = Symbol<tf3vehicleobserver::Status(*)(void*, void*, void*, void*, void*, void*)>(library, "TestStart");
    const auto stop = Symbol<tf3vehicleobserver::Status(*)()>(library, "TestStop");
    const auto snapshot = Symbol<tf3vehicleobserver::Snapshot(*)()>(library, "TestSnapshot");
    const auto dispatch = Symbol<LONG(*)(EXCEPTION_POINTERS*)>(library, "TestDispatch");
    using S = tf3vehicleobserver::Status;

    Require(stop() == S::never_started, "stop before start");
    Require(start(&OwnedVehicleFactorySite + 1, &OwnedVehicleFactoryPostSite,
                  &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                  &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite) == S::invalid_site,
            "wrong factory boundary rejected");
    const auto begin = start(&OwnedVehicleFactorySite, &OwnedVehicleFactoryPostSite,
                             &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                             &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite);
    Require(begin == S::started, "start owned sites");
    Require(OwnedVehicleFactorySite == 0xcc && OwnedVehicleFactoryPostSite == 0xcc &&
            OwnedVehicleAdmissionSite == 0xcc && OwnedVehicleCallbackTailSite == 0xcc &&
            OwnedVehicleSendReturnSite == 0xcc && OwnedVehicleMarshalerReturnSite == 0xcc, "all trap bytes installed");
    Require(start(&OwnedVehicleFactorySite, &OwnedVehicleFactoryPostSite,
                  &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                  &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite) == S::already_started,
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
    Require(OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry,
            "actual admission trap emulates mov");
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
                (void)OwnedVehicleAdmissionExecute(&local_entry, &local_callback_implementation,
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
            OwnedVehicleSendReturnSite == 0x90 && OwnedVehicleMarshalerReturnSite == 0x90, "original bytes restored");
    const auto before = snapshot();
    Require(OwnedVehicleFactoryExecute(&entry, nullptr, entity, 0) == static_cast<std::uint32_t>(entity) &&
            OwnedVehicleAdmissionExecute(&entry, &callback_implementation, &callback_value, &progress_pair) == &entry,
            "original instructions execute after stop");
    Require(snapshot().factory_hits == before.factory_hits &&
            snapshot().admission_hits == before.admission_hits && !snapshot().active,
            "stopped observer remains inert");
    for (auto* site : {&OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite}) {
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
            snapshot().marshaler_return_hits == before.marshaler_return_hits,
            "late return traps cannot publish receipts after stop");
    Require(stop() == S::stopped, "idempotent stop");
    Require(start(&OwnedVehicleFactorySite, &OwnedVehicleFactoryPostSite,
                  &OwnedVehicleAdmissionSite, &OwnedVehicleCallbackTailSite,
                  &OwnedVehicleSendReturnSite, &OwnedVehicleMarshalerReturnSite) == S::restart_disallowed,
            "single lifecycle enforced");
    std::puts("owned-vehicle-observer PASS actual-traps=1 correlation=1 invalid-tag=1 mismatch=1 cross-thread=1 restored=1");
    return 0;
}
#endif
