// Owned stack samples only: no VEH, patcher, TF3 launch or control admission.
#include "common_exit_passive_observer.h"
#include <cstring>
#include <iostream>
#include <limits>

int main() {
    alignas(16) std::uint64_t frame[16]{};
    constexpr std::uintptr_t imageBase=0x10000000;
    constexpr std::uint32_t imageSize=0x200000;
    constexpr std::uint64_t saved=0x1122334455667788ULL;
    frame[8]=saved;
    frame[11]=imageBase+0x11e32b;
    CONTEXT context{};
    context.Rsp=reinterpret_cast<DWORD64>(frame);
    context.R12=0x1234567800000000ULL;
    const auto unchanged=context;
    const auto thread=GetCurrentThreadId();
    bool passed=true;
    const auto check=[&](std::uint32_t expectedOwner) {
        const auto result=tf3commonexitpassive::Observe(context,expectedOwner,imageBase,imageSize);
        return result && *result==saved;
    };
    // Missing/mismatched ownership is evidence, never permission to discard
    // an otherwise safe original-instruction sample.
    passed=check(0) && check(thread) && passed;
    const auto zero=tf3commonexitpassive::Read();
    passed=zero.latest_original_r12d==0 && zero.latest_return_rva_known &&
        zero.latest_return_rva==0x11e32b && zero.latest_thread==thread &&
        zero.latest_expected_owner==thread && passed;
    context.R12=3;
    frame[11]=imageBase+0x11ecd9;
    passed=check(thread) && passed;
    const auto positive=tf3commonexitpassive::Read();
    passed=positive.latest_original_r12d==3 && positive.latest_return_rva==0x11ecd9 && passed;
    passed=check(thread==1 ? 2u : 1u) && passed;
    frame[11]=imageBase+0x1234; // Unknown caller inside the supplied image.
    passed=check(thread) && passed;
    frame[11]=imageBase+imageSize; // Outside image must not be accepted as an RVA.
    passed=check(thread) && passed;
    const auto afterValid=tf3commonexitpassive::Read();
    passed=afterValid.owner_unestablished==1 && afterValid.owner_match==4 &&
        afterValid.owner_mismatch==1 && afterValid.zero_r12d==2 &&
        afterValid.nonzero_r12d==4 && afterValid.return_11e32b==2 &&
        afterValid.return_11ecd9==2 && afterValid.unknown_return_rva==2 &&
        !afterValid.latest_return_rva_known && afterValid.latest_return_rva==0 &&
        afterValid.has_minimum_stack_headroom && afterValid.unaligned_rsp==0 &&
        !afterValid.counter_saturated && !afterValid.counter_contention && passed;
    CONTEXT invalid=context;
    invalid.Rsp=0;
    passed=!tf3commonexitpassive::Observe(invalid,thread,imageBase,imageSize) && passed;
    invalid.Rsp=(std::numeric_limits<DWORD64>::max)()-0x10;
    passed=!tf3commonexitpassive::Observe(invalid,thread,imageBase,imageSize) && passed;
    const auto afterInvalid=tf3commonexitpassive::Read();
    passed=afterValid.attempts==6 && afterValid.valid_samples==6 &&
        afterInvalid.attempts==8 && afterInvalid.valid_samples==6 &&
        afterInvalid.rejected_stack==2 && passed;
    // Observe must not edit the original register context.
    context=unchanged;
    frame[11]=imageBase+0x11e32b;
    passed=check(thread) && std::memcmp(&context,&unchanged,sizeof(context))==0 && passed;
    std::cout<<std::boolalpha
        <<"{\"scope\":\"common-exit-passive-observer-owned\",\"passed\":"<<passed
        <<",\"activationPermitted\":false,\"tf3Qualified\":false}\n";
    return passed ? 0 : 2;
}
