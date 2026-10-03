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
