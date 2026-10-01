// Owned instruction/frame check. Passing this cannot qualify a live TF3 hook.
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <iostream>

extern "C" {
std::uint64_t CommonExitFixtureStep(std::uint64_t steps);
std::uint64_t CommonExitFixtureSeededStep(std::uint64_t steps);
extern unsigned char CommonExitFixtureTrap, CommonExitFixtureResume;
std::uint64_t CommonExitExpectedRbx=0, CommonExitExpectedRbp=0;
std::uint64_t CommonExitExpectedR12=0, CommonExitExpectedR13=0;
std::uint64_t CommonExitExpectedR14=0, CommonExitExpectedRsp=0;
std::uint64_t CommonExitExpectedRip=0, CommonExitIterations=0;
std::uint64_t CommonExitExpectedRsi=0, CommonExitExpectedRdi=0, CommonExitExpectedR15=0;
alignas(16) M128A CommonExitExpectedXmm6{};
}
namespace {
unsigned hits=0;
bool instruction_preserved=true, unwind_preserved=true, loop_registers_restored=true;
LONG CALLBACK Handler(EXCEPTION_POINTERS* p) noexcept {
    const auto trap=reinterpret_cast<DWORD64>(&CommonExitFixtureTrap);
    if (!p || !p->ExceptionRecord || !p->ContextRecord ||
        p->ExceptionRecord->ExceptionCode!=EXCEPTION_BREAKPOINT ||
        p->ExceptionRecord->ExceptionFlags!=0 ||
        reinterpret_cast<DWORD64>(p->ExceptionRecord->ExceptionAddress)!=trap ||
        p->ContextRecord->Rip!=trap) return EXCEPTION_CONTINUE_SEARCH;
    const CONTEXT before=*p->ContextRecord;
    CONTEXT expected=before;
    // Actual audited instruction reads one stack slot, changes R12 and RIP,
    // and leaves flags, other registers and interrupted RSP unchanged.
    std::uint64_t restored=0;
    std::memcpy(&restored,reinterpret_cast<const void*>(before.Rsp+0x40),sizeof(restored));
    p->ContextRecord->R12=restored;
    p->ContextRecord->Rip=trap+5;
    expected.R12=restored; expected.Rip=trap+5;
    instruction_preserved=instruction_preserved &&
        restored==CommonExitExpectedR12 &&
        restored==0x1122334455667788ULL &&
        expected.Rip==reinterpret_cast<DWORD64>(&CommonExitFixtureResume) &&
        std::memcmp(&expected,p->ContextRecord,sizeof(CONTEXT))==0;
    loop_registers_restored=loop_registers_restored &&
        before.Rsi==CommonExitExpectedRsi && before.Rdi==CommonExitExpectedRdi &&
        before.R15==CommonExitExpectedR15 &&
        before.Xmm6.Low==CommonExitExpectedXmm6.Low &&
        before.Xmm6.High==CommonExitExpectedXmm6.High;
    // Check collapsed common-frame unwind at the trap, before the restored
    // instruction. This tests frame metadata rather than epilogue scanning.
    CONTEXT unwound=before;
    DWORD64 image_base=0,establisher=0;
    const auto function=RtlLookupFunctionEntry(trap,&image_base,nullptr);
    if (!function) unwind_preserved=false;
    else {
        PVOID handler_data=nullptr;
        RtlVirtualUnwind(UNW_FLAG_NHANDLER,image_base,trap,function,&unwound,
                        &handler_data,&establisher,nullptr);
        unwind_preserved=unwind_preserved &&
            unwound.Rip==CommonExitExpectedRip && unwound.Rsp==CommonExitExpectedRsp &&
            unwound.Rbx==CommonExitExpectedRbx && unwound.Rbp==CommonExitExpectedRbp &&
            unwound.R12==CommonExitExpectedR12 && unwound.R13==CommonExitExpectedR13 &&
            unwound.R14==CommonExitExpectedR14;
    }
    ++hits;
    return EXCEPTION_CONTINUE_EXECUTION;
}
}
int main() {
    auto handler=AddVectoredExceptionHandler(1,Handler);
    if (!handler) return 1;
    const bool zero=CommonExitFixtureSeededStep(0)==0 && hits==1;
    const bool positive=CommonExitFixtureSeededStep(3)==3 && hits==2;
    const bool removed=RemoveVectoredExceptionHandler(handler)!=0;
    const bool passed=zero && positive && instruction_preserved && unwind_preserved && loop_registers_restored && removed;
    std::cout << std::boolalpha
      << "{\"scope\":\"common-exit-instruction-frame-owned\",\"activationPermitted\":false,\"tf3Qualified\":false,\"passed\":" << passed
      << ",\"zeroStepReached\":" << zero << ",\"positiveStepReached\":" << positive
      << ",\"instructionPreserved\":" << instruction_preserved
      << ",\"unwindPreserved\":" << unwind_preserved
      << ",\"loopRegistersRestored\":" << loop_registers_restored
      << ",\"fullXstateQualified\":false,\"chainedUnwindQualified\":false,\"livePauseCadenceQualified\":false,\"ownerParkingQualified\":false}\n";
    return passed ? 0 : 2;
}
