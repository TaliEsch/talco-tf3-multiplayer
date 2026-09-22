#pragma once
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>

// Private owned-fixture ABI only. No production runtime consumes this contract.
enum class OwnedCrossEhContinuationState : std::uint32_t {
    table_absent = 0,
    target_missing = 1,
    target_present = 2,
};
enum class OwnedCrossResumePolicy : std::uint32_t {
    require_ehcont = 0,
    require_legacy_no_table = 1,
};
struct OwnedCrossConfig {
    std::uint32_t size;
    HMODULE executable;
    void* trap;
    void* continuation;
    HANDLE entered;
    HANDLE release;
    std::uint64_t xcr0;
    OwnedCrossResumePolicy resume_policy;
};
struct OwnedCrossReport {
    std::uint32_t size, entries, returns, bypasses, owner, in_flight, parked;
    std::uint32_t stopped, pinned, native_fault, unwind_passed, unwind_examined;
    std::uint32_t entry_ehcont, resume_ehcont, cfg, cet, ip_validation;
    OwnedCrossEhContinuationState entry_ehcont_state, resume_ehcont_state;
    std::uint32_t gate_stack_bytes, owner_xstate_bytes, owner_xstate_committed;
    std::uint32_t owner_xstate_external, ehcont_parser_cases;
    std::uint64_t owner_xstate_address;
};
using OwnedCrossStartFn = BOOL (*)(const OwnedCrossConfig*);
using OwnedCrossArmFn = BOOL (*)();
using OwnedCrossFaultFn = void (*)(BOOL);
using OwnedCrossFinishFn = BOOL (*)(BOOL);
using OwnedCrossStopFn = BOOL (*)();
using OwnedCrossReportFn = BOOL (*)(OwnedCrossReport*);
