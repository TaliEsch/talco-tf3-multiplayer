#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <cstdint>
#include <optional>

// Passive data collection for the exact-build common-exit MOV R12,[RSP+40h].
// The caller owns trap identity, byte restoration, and all CONTEXT changes.
// This module installs nothing and grants no control or live qualification.
namespace tf3commonexitpassive {
struct Snapshot {
    std::uint64_t attempts;
    std::uint64_t valid_samples;
    std::uint64_t owner_unestablished;
    std::uint64_t owner_match;
    std::uint64_t owner_mismatch;
    std::uint64_t rejected_stack;
    std::uint64_t rejected_read_fault;
    std::uint64_t zero_r12d;
    std::uint64_t nonzero_r12d;
    std::uint64_t return_11e32b;
    std::uint64_t return_11ecd9;
    std::uint64_t unknown_return_rva;
    std::uint64_t unaligned_rsp;
    std::uint64_t headroom_below_8k;
    std::uint64_t minimum_stack_headroom;
    std::uint32_t latest_original_r12d;
    std::uint32_t latest_return_rva;
    std::uint32_t latest_thread;
    std::uint32_t latest_expected_owner;
    bool has_minimum_stack_headroom;
    bool latest_return_rva_known;
    bool latest_return_unknown;
    bool counter_saturated;
    bool counter_contention;
};

// Call only after the owning VEH has verified its exact trap. ownerThread is
// the caller's previously established owner, or zero when not established.
// Owner mismatch and unknown return are observations, not emulation failures.
// Empty is false and contains no replacement R12; present is the saved
// full-width R12 for the caller's instruction emulation. R12D is recorded as
// raw pre-MOV bits, not as a signed loop count or completed iteration count.
std::optional<std::uint64_t> Observe(const CONTEXT& context,
                                     std::uint32_t ownerThread,
                                     std::uintptr_t imageBase,
                                     std::uint32_t imageSize) noexcept;

// Atomic fields are read independently: a snapshot is not transactional.
// It contains no stack addresses or absolute image pointers, only return RVAs.
Snapshot Read() noexcept;
}
