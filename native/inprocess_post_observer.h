#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <cstdint>

// Read-only observation of the audited post-iteration instruction. This does
// not establish a world update, a simulation-control capability, or determinism.
namespace tf3postobserver {
enum class Status : std::uint32_t {
    started, already_started, stopped, never_started, unsupported_image,
    incompatible_mitigation, invalid_site, pin_failed, handler_failed,
    patch_failed, restore_failed, foreign_patch, restart_disallowed,
    image_file_failed, image_hash_mismatch, mapped_header_mismatch,
    site_section_mismatch, mapped_memory_mismatch, mapped_dos_mismatch,
    mapped_nt_core_mismatch, mapped_file_header_mismatch,
    mapped_optional_header_mismatch, mapped_section_table_mismatch
};
struct Snapshot {
    std::uint64_t hits;
    std::uint64_t minimum_stack_headroom;
    std::uint32_t owner_thread;
    std::uint32_t cfg_flags;
    std::uint32_t cet_flags;
    bool cfg_known;
    bool cet_known;
    bool active;
    bool cross_thread;
    bool saturated;
};
// Call Start/Stop from an ordinary worker, never DllMain or an engine callback.
// One lifecycle only: successful Stop permanently disallows rearming. The VEH
// and containing module remain pinned until process exit to serve late traps.
Status Start() noexcept;
Status Stop() noexcept;
Snapshot ReadSnapshot() noexcept;
// Shared read-only exact-build/site qualification for the exclusive production
// boundary owner. This never installs a handler or changes executable bytes.
Status QualifyExactSite(void** site) noexcept;

#ifdef TF3_POST_OBSERVER_OWNED_TEST
Status StartOwnedFixture(void* site) noexcept;
LONG DispatchOwnedException(EXCEPTION_POINTERS* pointers) noexcept;
void EmulateOwnedIncrement(CONTEXT* context) noexcept;
void SetOwnedHitCounter(std::uint64_t value) noexcept;
#endif
}  // namespace tf3postobserver
