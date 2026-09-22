#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <cstdint>

namespace tf3vehicleobserver {

enum class Status : std::uint32_t {
    started, already_started, stopped, never_started, unsupported_image,
    incompatible_mitigation, invalid_site, pin_failed, handler_failed,
    patch_failed, restore_failed, foreign_patch, restart_disallowed
};

struct Snapshot {
    std::uint64_t factory_hits;
    std::uint64_t admission_hits;
    std::uint64_t correlated_hits;
    std::uint64_t dropped_candidates;
    std::uint32_t owner_thread;
    std::int32_t latest_entity;
    std::uint8_t latest_stopped;
    bool latest_valid;
    bool latest_entry_result_zero;
    bool latest_callback_shape_matches;
    bool active;
    bool cross_thread;
    bool saturated;
};

// Exact-build, passive observation only. No engine pointer escapes this API.
// Start/Stop must run on an ordinary worker, never DllMain or an engine callback.
Status Start() noexcept;
Status Stop() noexcept;
Snapshot Read() noexcept;

#ifdef TF3_VEHICLE_OBSERVER_OWNED_TEST
Status StartOwnedFixture(void* factory_site, void* factory_post_site,
                         void* admission_site) noexcept;
LONG DispatchOwnedException(EXCEPTION_POINTERS* pointers) noexcept;
#endif

}  // namespace tf3vehicleobserver
