#pragma once

// Owned-process integration fixture; never a TF3 hook or activation surface.
#include <cstdint>

namespace owned_integrated {
struct Report {
    bool passive;
    bool held;
    bool helper_outside_veh;
    bool controller_progress;
    bool release_reheld;
    bool applied_consumed;
    bool halt_before;
    bool halt_after;
    bool halt_while_running;
    bool foreign_boundary;
    bool detach;
    bool wrong_owner;
    bool nested;
    bool step_exactly_once;
    bool flags_emulated;
    bool helper_abi_aligned;
    bool complete_xstate;
    bool xstate_preserved;
    bool fault_park_unwind;
    std::uint64_t generation;
    std::uint64_t consumed;
    std::uint64_t applied;
    std::uint64_t xcr0;
    std::uint32_t xstate_bytes;
};

bool RunFixture(Report&) noexcept;
bool RunTerminalFixture(bool after_consumption) noexcept;
bool RunRunningHaltFixture() noexcept;
bool RunForeignBoundaryFixture() noexcept;
}
