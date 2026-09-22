#pragma once

// Exact-build TF3 boundary adapter. The production build enables Start() only
// for the audited executable/site; ordinary fixture builds retain the disabled
// path so a harness cannot accidentally become a TF3 patching binary.
#include "inprocess_gate_control.h"
#include <windows.h>
#include <cstdint>

namespace tf3boundary {
enum class Status : std::uint32_t { disabled_pending_live_qualification, started, already_started, stopped, invalid_site, incompatible_mitigation, pin_failed, handler_failed, patch_failed, foreign_patch, restore_failed, terminal };
struct Snapshot {
    inprocess_gate::Snapshot gate;
    bool active;
    bool owns_breakpoint_byte;
    bool external_xstate_aligned;
    bool helper_outside_veh;
    bool full_xstate_enabled;
    std::uint64_t xcr0;
    std::uint32_t xstate_bytes;
    std::uint64_t hits;
    std::uint64_t minimum_stack_headroom;
    std::uint32_t cfg_flags;
    std::uint32_t cet_flags;
    bool cfg_known;
    bool cet_known;
    bool cross_thread;
    std::uint32_t observed_owner_thread;
};

// Production entry point: intentionally cannot patch a TF3 process yet.
Status Start() noexcept;
Status Stop() noexcept;
Snapshot Read() noexcept;
inprocess_gate::Result RequestHold() noexcept;
inprocess_gate::Result RequestRelease(std::uint64_t generation) noexcept;
inprocess_gate::Result RequestHalt() noexcept;
inprocess_gate::Result PrepareDetach(std::uint64_t generation) noexcept;
inprocess_gate::Result RestoreAndConfirmDetach(std::uint64_t generation) noexcept;

#ifdef TF3_BOUNDARY_OWNED_TEST
// Owned harness only.  This is the sole breakpoint owner for its supplied
// first byte; no observer may be active for that byte.
Status StartOwnedFixture(void* exact_inc_r15d_site, void* resume) noexcept;
inprocess_gate::Result PrepareOwnedDetach(std::uint64_t secret, std::uint64_t generation) noexcept;
inprocess_gate::Result ConfirmByteRestored(std::uint64_t generation) noexcept;
LONG DispatchOwnedException(EXCEPTION_POINTERS*) noexcept;
#endif
}  // namespace tf3boundary
