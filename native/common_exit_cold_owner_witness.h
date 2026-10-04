#pragma once

#include "loan_simulation_witness.h"

#include <cstddef>
#include <cstdint>

namespace tf3commonexitcoldowner {
// Exact build 40408, read-only diagnostic. The caller must first establish the
// interrupted common-exit frame, including its image, RIP, return site, stack
// bounds and readable saved R13 at RSP+38h. That saved register is CGame;
// CONTEXT.R13 is not CGame at this point. Never call CaptureCurrent from a VEH.
// The supplied reader must reject unreadable, uncommitted and guard pages.
using ReadSpan = tf3loansimulation::ReadSpan;
struct Snapshot {
    std::uint32_t thread_id = 0;
};
enum class Result {
    matched,
    invalid_input,
    invalid_game,
    invalid_manager,
    read_fault,
    zero_thread,
    foreign_thread,
    changed_manager,
    changed_thread
};

// This bounded decoder does no unwind, memory write, owner assignment or
// authorization. savedGame is a transient scalar from the validated frame;
// neither it nor the manager address is published in Snapshot. On failure,
// output is untouched. A readable pointer does not establish object lifetime.
inline Result CaptureSavedRoot(std::uint64_t savedGame,
    std::uint32_t currentThread, ReadSpan read, Snapshot* output) noexcept {
    if (!currentThread || !read || !output) return Result::invalid_input;
    if ((savedGame & 7u) != 0) return Result::invalid_game;
    std::uint64_t managerField = 0;
    if (!tf3loansimulation::Field(savedGame, 0x1f0, sizeof(std::uint64_t),
                                   &managerField)) return Result::invalid_game;

    std::uint64_t manager = 0;
    if (!read(managerField, &manager, sizeof manager)) return Result::read_fault;
    if ((manager & 7u) != 0) return Result::invalid_manager;
    std::uint64_t threadField = 0;
    if (!tf3loansimulation::Field(manager, 0xa8, sizeof(std::uint32_t),
                                   &threadField)) return Result::invalid_manager;

    std::uint32_t thread = 0;
    if (!read(threadField, &thread, sizeof thread)) return Result::read_fault;
    if (!thread) return Result::zero_thread;
    if (thread != currentThread) return Result::foreign_thread;

    std::uint64_t freshManager = 0;
    if (!read(managerField, &freshManager, sizeof freshManager)) return Result::read_fault;
    if (freshManager != manager) return Result::changed_manager;
    std::uint32_t freshThread = 0;
    if (!read(threadField, &freshThread, sizeof freshThread)) return Result::read_fault;
    if (freshThread != thread) return Result::changed_thread;

    *output = {thread};
    return Result::matched;
}
}
