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
bool deep_case = false, deep_exhaustion = false;
unsigned deep_depth = 0;
volatile unsigned deep_returns = 0;
bool simulation_expected = true;
std::uint64_t simulation_game = 0;
tf3loansimulation::CaptureFailure simulation_failure = tf3loansimulation::CaptureFailure::none;
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
unsigned simulation_reads = 0, simulation_fail_at = 0, simulation_change_at = 0;
std::uint64_t simulation_change_value = 0;
bool ReadSimulation(std::uint64_t address, void* output, std::size_t bytes) noexcept {
    ++simulation_reads;
    if (simulation_reads == simulation_fail_at) return false;
    if (!ReadOwned(address, output, bytes)) return false;
    if (simulation_reads == simulation_change_at) {
        if (bytes > sizeof simulation_change_value) return false;
        std::memcpy(output, &simulation_change_value, bytes);
    }
    return true;
}
bool Unchanged(const tf3loansimulation::Snapshot& snapshot) {
    return snapshot.game == 0xabcdef && snapshot.manager == 0x123456 && snapshot.thread_id == 123;
}
void CheckSimulationReport() {
    using Failure = tf3loansimulation::CaptureFailure;
    using Result = tf3loaninvocation::Result;
    tf3loansimulation::Snapshot snapshot{0xabcdef, 0x123456, 123};
    tf3loansimulation::CaptureReport report{};
    report.game = report.manager = report.manager_after = 1;
    report.thread_id = report.thread_after = 1;
    Require(tf3loansimulation::CaptureCurrent(site, ReadOwned, &snapshot, &report) == simulation_expected &&
        report.failure == simulation_failure && report.invocation_checked &&
        report.invocation_result == Result::found && report.game == simulation_game,
        "simulation report identifies qualified frame and precise decoder outcome"); ++cases;
    Require(simulation_expected ? report.manager == snapshot.manager && report.manager_after == snapshot.manager &&
        report.thread_id == snapshot.thread_id && report.thread_after == snapshot.thread_id :
        Unchanged(snapshot) && report.manager_after == 0 && report.thread_after == 0,
        "simulation report preserves rejected output and resets unavailable facts"); ++cases;
    if (simulation_failure == Failure::thread_owner) {
        Require(report.manager != 0 && report.thread_id != GetCurrentThreadId(),
            "thread ownership report retains observed rejected owner"); ++cases;
    }
    if (simulation_failure == Failure::thread_field) {
        Require(report.manager == 0 && report.thread_id == 0,
            "null manager report never reads thread"); ++cases;
    }
    if (simulation_expected) {
        const auto manager = snapshot.manager;
        const Failure failures[] = {Failure::manager_read, Failure::thread_read,
            Failure::manager_reread, Failure::thread_reread};
        for (unsigned i = 1; i <= 4; ++i) {
            simulation_reads = 0; simulation_fail_at = i;
            snapshot = {0xabcdef, 0x123456, 123};
            Require(!tf3loansimulation::CaptureCurrent(site, ReadSimulation, &snapshot, &report) &&
                report.failure == failures[i - 1] && report.invocation_checked &&
                report.invocation_result == Result::found && simulation_reads == i && Unchanged(snapshot),
                "each simulation read failure is precise and stops without publishing"); ++cases;
            Require(report.manager == (i > 1 ? manager : 0) &&
                report.thread_id == (i > 2 ? GetCurrentThreadId() : 0) &&
                report.manager_after == (i > 3 ? manager : 0) && report.thread_after == 0,
                "failed-read report contains only successfully observed facts"); ++cases;
        }
        simulation_fail_at = 0;
        for (unsigned i = 3; i <= 4; ++i) {
            simulation_reads = 0; simulation_change_at = i;
            simulation_change_value = i == 3 ? manager + 8 : GetCurrentThreadId() ^ 0x40000000;
            snapshot = {0xabcdef, 0x123456, 123};
            Require(!tf3loansimulation::CaptureCurrent(site, ReadSimulation, &snapshot, &report) &&
                report.failure == (i == 3 ? Failure::manager_changed : Failure::thread_changed) &&
                report.invocation_result == Result::found && simulation_reads == i && Unchanged(snapshot),
                "changed simulation reread denied with precise report"); ++cases;
            Require(report.manager == manager && report.thread_id == GetCurrentThreadId() &&
                (i == 3 ? report.manager_after == simulation_change_value && report.thread_after == 0 :
                    report.manager_after == manager && report.thread_after == simulation_change_value),
                "changed reread report retains both observed values"); ++cases;
        }
        simulation_change_at = 0;
        simulation_reads = 0;
        Require(tf3loansimulation::CaptureCurrent(site, ReadSimulation, &snapshot, &report) &&
            report.failure == Failure::none && simulation_reads == 4,
            "successful reported capture retains four-read budget"); ++cases;
        const auto wrong = tf3loaninvocation::Site{site.image_base, site.begin_rva, site.end_rva, site.return_rva + 1};
        snapshot = {0xabcdef, 0x123456, 123};
        simulation_reads = 0;
        Require(!tf3loansimulation::CaptureCurrent(wrong, ReadSimulation, &snapshot, &report) &&
            report.failure == Failure::invocation && report.invocation_checked &&
            report.invocation_result == Result::wrong_return && simulation_reads == 0 &&
            report.game == 0 && report.manager == 0 && Unchanged(snapshot),
            "wrong-return report performs no object read or snapshot publication"); ++cases;
    }
    snapshot = {0xabcdef, 0x123456, 123};
    Require(!tf3loansimulation::CaptureCurrent(site, nullptr, &snapshot, &report) &&
        report.failure == Failure::arguments && !report.invocation_checked &&
        report.invocation_result == Result::invalid_site && report.game == 0 && Unchanged(snapshot),
        "missing reader report cannot imply frame capture"); ++cases;
    Require(!tf3loansimulation::CaptureCurrent(site, ReadOwned, nullptr, &report) &&
        report.failure == Failure::arguments && !report.invocation_checked,
        "missing output report cannot imply frame capture"); ++cases;
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
__declspec(noinline) void CheckDeep(unsigned remaining) {
    if (remaining) {
        CheckDeep(remaining - 1);
        // Observable work after the call prevents a tail-call loop at /O2.
        ++deep_returns;
        return;
    }
    using Result = tf3loaninvocation::Result;
    using Failure = tf3loansimulation::CaptureFailure;
    CONTEXT output{}; output.R13 = 0xabcdef;
    tf3loaninvocation::WalkReport walk{};
    Require(tf3loaninvocation::CaptureCurrent(site, &output, 64, &walk) == Result::depth_limit &&
        output.R13 == 0xabcdef && walk.frames_examined == 64 && walk.has_function &&
        walk.image_base != 0 && walk.begin_rva < walk.end_rva,
        "deep metadata-backed stack rejects 64 without publishing"); ++cases;
    if (deep_exhaustion) {
        Require(tf3loaninvocation::CaptureCurrent(site, &output, 128, &walk) == Result::depth_limit &&
            output.R13 == 0xabcdef && walk.frames_examined == 128 && walk.has_function &&
            walk.image_base != 0 && walk.begin_rva < walk.end_rva,
            "finite 128-frame exhaustion retains last-frame metadata"); ++cases;
        tf3loansimulation::Snapshot snapshot{0xabcdef, 0x123456, 123};
        tf3loansimulation::CaptureReport report{};
        simulation_reads = 0;
        Require(!tf3loansimulation::CaptureCurrent(site, ReadSimulation, &snapshot, &report) &&
            report.failure == Failure::invocation && report.invocation_checked &&
            report.invocation_result == Result::depth_limit && report.walk.frames_examined == 128 &&
            report.walk.has_function && simulation_reads == 0 && report.game == 0 &&
            Unchanged(snapshot),
            "simulation exhaustion reads no object and leaves output unchanged"); ++cases;
        return;
    }
    Require(tf3loaninvocation::CaptureCurrent(site, &output, 128, &walk) == Result::found &&
        walk.frames_examined > 64 && walk.frames_examined <= 128 && walk.has_function &&
        walk.rip == output.Rip && walk.image_base == site.image_base &&
        walk.begin_rva == site.begin_rva && walk.end_rva == site.end_rva &&
        output.R13 == simulation_game,
        "deep 128-frame walk finds exact current register and return"); ++cases;
    tf3loansimulation::Snapshot snapshot{0xabcdef, 0x123456, 123};
    tf3loansimulation::CaptureReport report{};
    simulation_reads = 0;
    Require(tf3loansimulation::CaptureCurrent(site, ReadSimulation, &snapshot, &report) &&
        report.failure == Failure::none && report.invocation_result == Result::found &&
        report.walk.frames_examined > 64 && report.walk.frames_examined <= 128 &&
        snapshot.game == simulation_game && report.game == simulation_game &&
        snapshot.manager != 0 && snapshot.manager == report.manager &&
        snapshot.manager == report.manager_after && snapshot.thread_id == GetCurrentThreadId() &&
        report.thread_id == snapshot.thread_id && report.thread_after == snapshot.thread_id &&
        simulation_reads == 4,
        "deep simulation captures current game manager and thread through four reads"); ++cases;
    const auto wrong = tf3loaninvocation::Site{site.image_base, site.begin_rva,
        site.end_rva, site.return_rva + 1};
    output.R13 = 0xabcdef;
    Require(tf3loaninvocation::CaptureCurrent(wrong, &output, 128, &walk) == Result::wrong_return &&
        output.R13 == 0xabcdef && walk.frames_examined > 64 &&
        walk.rip == site.image_base + site.return_rva && walk.has_function,
        "deep nearest wrong return rejects without publishing"); ++cases;
    snapshot = {0xabcdef, 0x123456, 123};
    simulation_reads = 0;
    Require(!tf3loansimulation::CaptureCurrent(wrong, ReadSimulation, &snapshot, &report) &&
        report.failure == Failure::invocation && report.invocation_result == Result::wrong_return &&
        report.walk.frames_examined > 64 && simulation_reads == 0 && Unchanged(snapshot),
        "deep wrong return performs no manager or thread read"); ++cases;
    output.R13 = 0xabcdef;
    walk = {99, 1, 2, 3, 4, true};
    Require(tf3loaninvocation::CaptureCurrent(site, &output, 129, &walk) == Result::invalid_site &&
        output.R13 == 0xabcdef && walk.frames_examined == 0 && !walk.has_function,
        "129-frame request is invalid without reading a frame"); ++cases;
}
__declspec(noinline) void CaptureNested() {
    CONTEXT output{};
    tf3loaninvocation::WalkReport walk{};
    const auto result = tf3loaninvocation::CaptureCurrent(site, &output, 64, &walk);
    Require(result == tf3loaninvocation::Result::found, "recover current invocation");
    Require(walk.frames_examined > 0 && walk.frames_examined <= 64 && walk.has_function &&
        walk.rip == output.Rip && walk.image_base == site.image_base &&
        walk.begin_rva == site.begin_rva && walk.end_rva == site.end_rva,
        "selected frame report identifies exact qualified metadata"); ++cases;
    Require(output.R13 == expected_descriptor && output.Rbp >= 0x80 &&
        *reinterpret_cast<const std::uint64_t*>(output.Rbp - 0x80) == expected_wrapper,
        "recover native descriptor and wrapper"); ++cases;
    CONTEXT unchanged{}; unchanged.R13 = 0xabcdef;
    const auto wrong = tf3loaninvocation::Site{site.image_base, site.begin_rva, site.end_rva, site.return_rva + 1};
    Require(tf3loaninvocation::CaptureCurrent(wrong, &unchanged, 64, &walk) == tf3loaninvocation::Result::wrong_return &&
        unchanged.R13 == 0xabcdef, "nearest wrong return publishes nothing"); ++cases;
    Require(walk.frames_examined > 0 && walk.frames_examined <= 64 && walk.has_function &&
        walk.rip == site.image_base + site.return_rva && walk.image_base == site.image_base &&
        walk.begin_rva == site.begin_rva && walk.end_rva == site.end_rva,
        "wrong-return report retains actual nearest return and metadata"); ++cases;
    Require(tf3loaninvocation::CaptureCurrent(site, &unchanged, 1, &walk) == tf3loaninvocation::Result::depth_limit &&
        unchanged.R13 == 0xabcdef, "bounded search publishes nothing"); ++cases;
    Require(walk.frames_examined == 1 && walk.rip != 0 && walk.has_function && walk.image_base != 0 &&
        walk.begin_rva < walk.end_rva && walk.rip >= walk.image_base + walk.begin_rva &&
        walk.rip < walk.image_base + walk.end_rva,
        "depth-limit report identifies last budgeted frame"); ++cases;
}
}
extern "C" __declspec(noinline) void LoanOwnedCallback() {
    if (deep_case) { CheckDeep(deep_depth); return; }
    if (simulation_case) {
        CheckSimulationReport();
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
    tf3loaninvocation::WalkReport walk{99, 1, 2, 3, 4, true};
    Require(tf3loaninvocation::CaptureCurrent(site, &output, 64, &walk) ==
        tf3loaninvocation::Result::missing_metadata && output.R13 == 0xabcdef,
        "unregistered frame cannot expose older invocation"); ++cases;
    Require(walk.frames_examined > 0 && walk.frames_examined <= 64 && walk.rip != 0 &&
        !walk.has_function && walk.image_base == 0 && walk.begin_rva == 0 && walk.end_rva == 0,
        "missing-metadata report clears metadata from earlier frames"); ++cases;
    output.R13 = 0xabcdef;
    Require(tf3loaninvocation::CaptureCurrent(site, &output, 128, &walk) ==
        tf3loaninvocation::Result::missing_metadata && output.R13 == 0xabcdef &&
        walk.frames_examined > 0 && walk.frames_examined <= 128 && !walk.has_function &&
        walk.image_base == 0 && walk.begin_rva == 0 && walk.end_rva == 0,
        "larger budget still rejects unregistered frame before older invocation"); ++cases;
    tf3loansimulation::Snapshot snapshot{0xabcdef, 0x123456, 123};
    tf3loansimulation::CaptureReport report{};
    simulation_reads = 0;
    Require(!tf3loansimulation::CaptureCurrent(site, ReadSimulation, &snapshot, &report) &&
        report.failure == tf3loansimulation::CaptureFailure::invocation && report.invocation_checked &&
        report.invocation_result == tf3loaninvocation::Result::missing_metadata &&
        simulation_reads == 0 && report.game == 0 && Unchanged(snapshot),
        "missing-metadata report performs no object read or snapshot publication"); ++cases;
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
        deep_case = true;
        deep_depth = 76;
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        Require(deep_returns == deep_depth, "deep frames return through observable recursion"); ++cases;
        deep_exhaustion = true;
        deep_depth = 140;
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        Require(deep_returns == 216, "exhausted deep frames return through observable recursion"); ++cases;
        deep_case = false;
        deep_exhaustion = false;
        simulation_expected = false;
        simulation_failure = tf3loansimulation::CaptureFailure::thread_owner;
        thread_id = 0;
        std::memcpy(manager.data() + 0xa8, &thread_id, sizeof thread_id);
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        thread_id = GetCurrentThreadId() ^ 0x40000000;
        std::memcpy(manager.data() + 0xa8, &thread_id, sizeof thread_id);
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        std::memset(game.data() + 0x1f0, 0, sizeof manager_pointer);
        simulation_failure = tf3loansimulation::CaptureFailure::thread_field;
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(game.data()), expected_wrapper);
        simulation_failure = tf3loansimulation::CaptureFailure::manager_field;
        simulation_game = 0;
        LoanOwnedInvocation(0, expected_wrapper);
        simulation_case = false;
        Require(!tf3loansimulation::MatchesCurrent(site, ReadOwned), "simulation witness absent after return"); ++cases;
        tf3loansimulation::Snapshot missing_snapshot{0xabcdef, 0x123456, 123};
        tf3loansimulation::CaptureReport missing_report{};
        Require(!tf3loansimulation::CaptureCurrent(site, ReadOwned, &missing_snapshot, &missing_report) &&
            missing_report.failure == tf3loansimulation::CaptureFailure::invocation &&
            missing_report.invocation_checked && missing_report.invocation_result == tf3loaninvocation::Result::missing &&
            missing_report.game == 0 && Unchanged(missing_snapshot),
            "returned simulation frame reports missing without publishing"); ++cases;
        Require(!tf3loansimulation::CaptureCurrent({}, ReadOwned, &missing_snapshot, &missing_report) &&
            missing_report.failure == tf3loansimulation::CaptureFailure::invocation &&
            missing_report.invocation_checked && missing_report.invocation_result == tf3loaninvocation::Result::invalid_site &&
            missing_report.game == 0 && Unchanged(missing_snapshot),
            "invalid simulation site reports invocation rejection without publishing"); ++cases;
        std::uint64_t field = 0;
        Require(!tf3loansimulation::Field(0, 0x1f0, 8, &field) &&
            !tf3loansimulation::Field(0x7fffffffffffULL, 0x1f0, 8, &field) &&
            !tf3loansimulation::Field(0x7ffffffffffeULL, 0, 8, &field),
            "simulation address bounds reject null and overflow"); ++cases;
        CONTEXT output{}; output.R13 = 0xabcdef;
        Require(tf3loaninvocation::CaptureCurrent(site, &output) == tf3loaninvocation::Result::missing &&
            output.R13 == 0xabcdef, "returned callback is absent"); ++cases;
        tf3loaninvocation::WalkReport walk{99, 1, 2, 3, 4, true};
        Require(tf3loaninvocation::CaptureCurrent({}, &output, 64, &walk) == tf3loaninvocation::Result::invalid_site &&
            output.R13 == 0xabcdef, "invalid adapter publishes nothing"); ++cases;
        Require(walk.frames_examined == 0 && walk.rip == 0 && walk.image_base == 0 &&
            walk.begin_rva == 0 && walk.end_rva == 0 && !walk.has_function,
            "invalid-site report contains no examined frame"); ++cases;
        Require(tf3loaninvocation::CaptureCurrent(site, &output, 129, &walk) ==
            tf3loaninvocation::Result::invalid_site && output.R13 == 0xabcdef && walk.frames_examined == 0,
            "diagnostic report does not exceed maximum frame budget"); ++cases;
        printf("{\"scope\":\"loan-invocation-stack-owned\",\"cases\":%u,\"passed\":true,\"activationPermitted\":false,\"tf3Qualified\":false}\n", cases);
        return 0;
    } catch (const std::exception& e) { fprintf(stderr,"loan_invocation_stack_owned_failed: %s\n",e.what());return 1; }
}
