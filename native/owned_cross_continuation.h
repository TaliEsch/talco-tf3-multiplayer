#pragma once
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>

// Private owned-fixture ABI only. No production runtime consumes this contract.
struct OwnedCrossConfig {
    std::uint32_t size;
    HMODULE executable;
    void* trap;
    void* continuation;
    HANDLE entered;
    HANDLE release;
    std::uint64_t xcr0;
};
struct OwnedCrossReport {
    std::uint32_t size, entries, returns, bypasses, owner, in_flight, parked;
    std::uint32_t stopped, pinned, native_fault, unwind_passed, unwind_examined;
    std::uint32_t entry_ehcont, resume_ehcont, cfg, cet, ip_validation;
};
using OwnedCrossStartFn = BOOL (*)(const OwnedCrossConfig*);
using OwnedCrossArmFn = BOOL (*)();
using OwnedCrossFaultFn = void (*)(BOOL);
using OwnedCrossFinishFn = BOOL (*)(BOOL);
using OwnedCrossStopFn = BOOL (*)();
using OwnedCrossReportFn = BOOL (*)(OwnedCrossReport*);
