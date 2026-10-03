#include "loan_invocation_stack.h"
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
unsigned nesting = 0;
void Require(bool value, const char* label) { if (!value) throw std::runtime_error(label); }
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
        CONTEXT output{}; output.R13 = 0xabcdef;
        Require(tf3loaninvocation::CaptureCurrent(site, &output) == tf3loaninvocation::Result::missing &&
            output.R13 == 0xabcdef, "returned callback is absent"); ++cases;
        Require(tf3loaninvocation::CaptureCurrent({}, &output) == tf3loaninvocation::Result::invalid_site &&
            output.R13 == 0xabcdef, "invalid adapter publishes nothing"); ++cases;
        printf("{\"scope\":\"loan-invocation-stack-owned\",\"cases\":%u,\"passed\":true,\"activationPermitted\":false,\"tf3Qualified\":false}\n", cases);
        return 0;
    } catch (const std::exception& e) { fprintf(stderr,"loan_invocation_stack_owned_failed: %s\n",e.what());return 1; }
}
