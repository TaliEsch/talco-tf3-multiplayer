#include "loan_invocation_stack.h"
#include "loan_simulation_witness.h"
#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>

extern "C" void LoanOwnedInvocation(std::uint64_t descriptor, std::uint64_t wrapper);
extern "C" void LoanOwnedUnregistered();
extern "C" unsigned char LoanOwnedInvocationReturn, LoanOwnedInvocationEnd;
namespace {
tf3loaninvocation::Site site{};
std::uint64_t expected_descriptor = 0, expected_wrapper = 0;
unsigned cases = 0;
bool nested_case = false;
bool missing_metadata_case = false;
bool simulation_case = false;
bool simulation_expected = true;
std::uint64_t simulation_game = 0;
bool deny_simulation_read = false;
unsigned nesting = 0;
void Require(bool value, const char* label) { if (!value) throw std::runtime_error(label); }
bool ReadOwned(std::uint64_t address, void* output, std::size_t bytes) noexcept {
    if (deny_simulation_read) return false;
    MEMORY_BASIC_INFORMATION region{};
    if (!bytes || VirtualQuery(reinterpret_cast<const void*>(address), &region, sizeof region) != sizeof region ||
        region.State != MEM_COMMIT || (region.Protect & (PAGE_GUARD | PAGE_NOACCESS))) return false;
    const auto begin = reinterpret_cast<std::uint64_t>(region.BaseAddress);
    if (address < begin || address - begin >= region.RegionSize || bytes > region.RegionSize - (address - begin))
        return false;
    SIZE_T copied = 0;
    return ReadProcessMemory(GetCurrentProcess(), reinterpret_cast<const void*>(address), output, bytes, &copied) &&
        copied == bytes;
}
unsigned selected_reads = 0, selected_fail_at = 0, selected_change_at = 0;
std::uint64_t selected_change_value = 0;
bool ReadSelected(std::uint64_t address, void* output, std::size_t bytes) noexcept {
    ++selected_reads;
    if (selected_reads == selected_fail_at) return false;
    if (!ReadOwned(address, output, bytes)) return false;
    if (selected_reads == selected_change_at) {
        if (bytes > sizeof selected_change_value) return false;
        std::memcpy(output, &selected_change_value, bytes);
    }
    return true;
}
void CheckSelectedState() {
    // Owned storage exercises the decoder, not a real engine lifetime/lock.
    std::array<unsigned char, 0x200> game{};
    std::array<unsigned char, 0xb0> manager{};
    std::array<std::array<unsigned char, 0x20>, 2> states{};
    std::array<std::uint64_t, 2> engines{};
    const auto manager_pointer = reinterpret_cast<std::uint64_t>(manager.data());
    const auto state0 = reinterpret_cast<std::uint64_t>(states[0].data());
    const auto state1 = reinterpret_cast<std::uint64_t>(states[1].data());
    const auto engine0 = reinterpret_cast<std::uint64_t>(&engines[0]);
    const auto engine1 = reinterpret_cast<std::uint64_t>(&engines[1]);
    const DWORD thread = GetCurrentThreadId();
    std::memcpy(game.data() + 0x1f0, &manager_pointer, sizeof manager_pointer);
    std::memcpy(manager.data() + 0xa8, &thread, sizeof thread);
    std::memcpy(manager.data() + 0x78, &state0, sizeof state0);
    std::memcpy(manager.data() + 0x80, &state1, sizeof state1);
    std::memcpy(states[0].data() + 0x18, &engine0, sizeof engine0);
    std::memcpy(states[1].data() + 0x18, &engine1, sizeof engine1);
    const tf3loansimulation::Snapshot witness{
        reinterpret_cast<std::uint64_t>(game.data()), manager_pointer, thread};
    auto run = [&](const tf3loansimulation::Snapshot& observed, std::uint64_t engine,
                   bool expected, const char* label) {
        selected_reads = 0;
        tf3loansimulation::SelectedState result{-77, 0xabcdef, 0x123456};
        Require(tf3loansimulation::CaptureSelectedState(observed, engine, ReadSelected, &result) == expected,
            label);
        Require(expected ? result.engine == engine && result.state == (result.index == 0 ? state0 : state1)
            : result.index == -77 && result.state == 0xabcdef && result.engine == 0x123456,
            "selected state publishes only complete evidence");
        ++cases;
    };
    run(witness, engine0, true, "selected slot zero");
    Require(selected_reads == 10, "selected chain is fully bracketed"); ++cases;
    std::int32_t index = 1;
    std::memcpy(manager.data() + 0x98, &index, sizeof index);
    run(witness, engine1, true, "selected slot one");
    run(witness, engine0, false, "wrong selected engine denied");
    for (const std::int32_t invalid : {-1, 2, 0x7fffffff}) {
        std::memcpy(manager.data() + 0x98, &invalid, sizeof invalid);
        run(witness, engine0, false, "out of range signed index denied");
        Require(selected_reads == 3, "invalid index never addresses a state slot"); ++cases;
    }
    index = 0;
    std::memcpy(manager.data() + 0x98, &index, sizeof index);
    for (unsigned failure = 1; failure <= 10; ++failure) {
        selected_fail_at = failure;
        run(witness, engine0, false, "each selected-chain read failure denied");
    }
    selected_fail_at = 0;
    // Initial chain: manager/thread/index/state/engine; reverse reread follows.
    const std::array<std::uint64_t, 5> changes{
        engine1, state1, 1, static_cast<std::uint64_t>(thread ^ 0x40000000), manager_pointer + 8};
    for (unsigned i = 0; i < changes.size(); ++i) {
        selected_change_at = 6 + i; selected_change_value = changes[i];
        run(witness, engine0, false, "changed engine/state/index/thread/manager denied");
    }
    selected_change_at = 0;
    auto foreign = witness;
    foreign.thread_id ^= 0x40000000;
    run(foreign, engine0, false, "foreign witness owner denied");
    foreign = witness; foreign.thread_id = 0;
    run(foreign, engine0, false, "missing witness owner denied");
    foreign = witness; foreign.manager += 8;
    run(foreign, engine0, false, "wrong witnessed manager denied");
    foreign = witness; foreign.game = 0x7fffffffffffULL;
    run(foreign, engine0, false, "game field overflow denied");
    foreign = witness; foreign.manager = 0x7fffffffffffULL;
    run(foreign, engine0, false, "manager field overflow denied");
    run(witness, 0, false, "missing Loan engine denied");
    for (const std::uint64_t invalid : {0ULL, 0x7fffffffffffULL, 1ULL}) {
        std::memcpy(manager.data() + 0x78, &invalid, sizeof invalid);
        run(witness, engine0, false, "null overflowing or unreadable state denied");
    }
    std::memcpy(manager.data() + 0x78, &state0, sizeof state0);
    const std::uint64_t missing_engine = 0;
    std::memcpy(states[0].data() + 0x18, &missing_engine, sizeof missing_engine);
    run(witness, engine0, false, "null selected Engine denied");
    std::memcpy(states[0].data() + 0x18, &engine0, sizeof engine0);
    tf3loansimulation::SelectedState result{};
    Require(!tf3loansimulation::CaptureSelectedState(witness, engine0, nullptr, &result) &&
        !tf3loansimulation::CaptureSelectedState(witness, engine0, ReadSelected, nullptr),
        "missing selected reader/output denied"); ++cases;
}
__declspec(noinline) void CaptureNested() {
    CONTEXT output{};
    const auto result = tf3loaninvocation::CaptureCurrent(site, &output);
    Require(result == tf3loaninvocation::Result::found, "recover current invocation");
    Require(output.R13 == expected_descriptor && output.Rbp >= 0x80 &&
        *reinterpret_cast<const std::uint64_t*>(output.Rbp - 0x80) == expected_wrapper,
        "recover native descriptor and wrapper"); ++cases;
    CONTEXT unchanged{}; unchanged.R13 = 0xabcdef;
    const auto wrong = tf3loaninvocation::Site{site.image_base, site.begin_rva, site.end_rva, site.return_rva + 1};
    Require(tf3loaninvocation::CaptureCurrent(wrong, &unchanged) == tf3loaninvocation::Result::wrong_return &&
        unchanged.R13 == 0xabcdef, "nearest wrong return publishes nothing"); ++cases;
    Require(tf3loaninvocation::CaptureCurrent(site, &unchanged, 1) == tf3loaninvocation::Result::depth_limit &&
        unchanged.R13 == 0xabcdef, "bounded search publishes nothing"); ++cases;
}
}
extern "C" __declspec(noinline) void LoanOwnedCallback() {
    if (simulation_case) {
        Require(tf3loansimulation::MatchesCurrent(site, ReadOwned) == simulation_expected,
            "owned simulation identity result"); ++cases;
        tf3loansimulation::Snapshot snapshot{};
        snapshot.game = 0xabcdef;
        Require(tf3loansimulation::CaptureCurrent(site, ReadOwned, &snapshot) == simulation_expected,
            "owned simulation snapshot result"); ++cases;
        Require(simulation_expected ? snapshot.game == simulation_game && snapshot.manager != 0 &&
            snapshot.thread_id == GetCurrentThreadId() : snapshot.game == 0xabcdef,
            "simulation snapshot publishes only verified same-manager identity"); ++cases;
        deny_simulation_read = true;
        Require(!tf3loansimulation::MatchesCurrent(site, ReadOwned), "failed simulation read denied"); ++cases;
        snapshot.game = 0xabcdef;
        Require(!tf3loansimulation::CaptureCurrent(site, ReadOwned, &snapshot) && snapshot.game == 0xabcdef,
            "failed read publishes no simulation identity"); ++cases;
        deny_simulation_read = false;
        Require(!tf3loansimulation::MatchesCurrent(site, nullptr), "missing simulation reader denied"); ++cases;
        return;
    }
    if (missing_metadata_case) { LoanOwnedUnregistered(); return; }
    if (nested_case && nesting == 0) {
        const auto outer_descriptor = expected_descriptor, outer_wrapper = expected_wrapper;
        std::uint64_t foreign_descriptor = 56, foreign_wrapper = 78;
        expected_descriptor = reinterpret_cast<std::uint64_t>(&foreign_descriptor);
        expected_wrapper = reinterpret_cast<std::uint64_t>(&foreign_wrapper);
        ++nesting;
        LoanOwnedInvocation(expected_descriptor, expected_wrapper);
        --nesting;
        expected_descriptor = outer_descriptor; expected_wrapper = outer_wrapper;
        // Once the nested callback returns, the current witness is the outer
        // invocation again; there is no lingering thread-local authority.
    }
    CaptureNested();
}
extern "C" __declspec(noinline) void LoanOwnedMissingMetadataCallback() {
    CONTEXT output{}; output.R13 = 0xabcdef;
    Require(tf3loaninvocation::CaptureCurrent(site, &output) ==
        tf3loaninvocation::Result::missing_metadata && output.R13 == 0xabcdef,
        "unregistered frame cannot expose older invocation"); ++cases;
}
int main(int argc, char**) {
    if (argc != 1) return 2;
    try {
        CheckSelectedState();
        DWORD64 image = 0;
        const auto* function = RtlLookupFunctionEntry(reinterpret_cast<DWORD64>(&LoanOwnedInvocationReturn), &image, nullptr);
        Require(function && image, "owned unwind entry");
        site = {image, function->BeginAddress, function->EndAddress,
            static_cast<std::uint32_t>(reinterpret_cast<DWORD64>(&LoanOwnedInvocationReturn) - image)};
        Require(image + site.end_rva == reinterpret_cast<DWORD64>(&LoanOwnedInvocationEnd), "owned range");
        std::uint64_t descriptor = 12, wrapper = 34;
        expected_descriptor = reinterpret_cast<std::uint64_t>(&descriptor);
        expected_wrapper = reinterpret_cast<std::uint64_t>(&wrapper);
        LoanOwnedInvocation(expected_descriptor, expected_wrapper);
        nested_case = true;
        LoanOwnedInvocation(expected_descriptor, expected_wrapper);
        nested_case = false;
        missing_metadata_case = true;
        LoanOwnedInvocation(expected_descriptor, expected_wrapper);
        missing_metadata_case = false;
        // Owned layout only: this does not qualify a TF3 CGame or manager.
        std::array<unsigned char, 0x200> game{};
        std::array<unsigned char, 0xb0> manager{};
        const auto manager_pointer = reinterpret_cast<std::uint64_t>(manager.data());
        auto thread_id = GetCurrentThreadId();
        std::memcpy(game.data() + 0x1f0, &manager_pointer, sizeof manager_pointer);
        std::memcpy(manager.data() + 0xa8, &thread_id, sizeof thread_id);
        simulation_case = true;
        simulation_game = reinterpret_cast<std::uint64_t>(game.data());
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        simulation_expected = false;
        thread_id = 0;
        std::memcpy(manager.data() + 0xa8, &thread_id, sizeof thread_id);
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        thread_id = GetCurrentThreadId() ^ 0x40000000;
        std::memcpy(manager.data() + 0xa8, &thread_id, sizeof thread_id);
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        std::memset(game.data() + 0x1f0, 0, sizeof manager_pointer);
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        simulation_case = false;
        Require(!tf3loansimulation::MatchesCurrent(site, ReadOwned), "simulation witness absent after return"); ++cases;
        std::uint64_t field = 0;
        Require(!tf3loansimulation::Field(0, 0x1f0, 8, &field) &&
            !tf3loansimulation::Field(0x7fffffffffffULL, 0x1f0, 8, &field) &&
            !tf3loansimulation::Field(0x7ffffffffffeULL, 0, 8, &field),
            "simulation address bounds reject null and overflow"); ++cases;
        CONTEXT output{}; output.R13 = 0xabcdef;
        Require(tf3loaninvocation::CaptureCurrent(site, &output) == tf3loaninvocation::Result::missing &&
            output.R13 == 0xabcdef, "returned callback is absent"); ++cases;
        Require(tf3loaninvocation::CaptureCurrent({}, &output) == tf3loaninvocation::Result::invalid_site &&
            output.R13 == 0xabcdef, "invalid adapter publishes nothing"); ++cases;
        printf("{\"scope\":\"loan-invocation-stack-owned\",\"cases\":%u,\"passed\":true,\"activationPermitted\":false,\"tf3Qualified\":false}\n", cases);
        return 0;
    } catch (const std::exception& e) { fprintf(stderr,"loan_invocation_stack_owned_failed: %s\n",e.what());return 1; }
}
