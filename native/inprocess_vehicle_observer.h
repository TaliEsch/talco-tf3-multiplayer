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

// This arm is deliberately inert until a separately authenticated runtime path
// supplies an exact, already-observed invocation.  It contains identifiers and
// register values only; it never accepts or exposes engine pointers.
enum class CancellationArmState : std::uint32_t {
    disabled, armed, claiming, claimed, expired, revoked, failed, completed
};

struct CancellationArmRequest {
    std::int32_t expected_entity;
    std::uint8_t expected_stopped;
    std::uint64_t deadline_tick;
};

struct CancellationArmSnapshot {
    CancellationArmState state;
    std::uint64_t expected_invocation;
    std::uint64_t claimed_invocation;
    std::int32_t expected_entity;
    std::int32_t claimed_entity;
    std::uint8_t expected_stopped;
    std::uint8_t claimed_stopped;
    std::uint32_t claimed_thread;
    std::uint64_t claimed_caller_rsp;
    std::uint64_t deadline_tick;
    bool callback_result_zero;
    bool send_return;
    bool post_send_body;
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
    std::uint64_t callback_hits;
    std::uint32_t callback_thread;
    std::int32_t latest_callback_entity;
    std::uint8_t latest_callback_stopped;
    std::uint8_t latest_callback_result;
    bool latest_callback_valid;
    bool latest_callback_matches_admission_storage;
    bool latest_admission_progress_known;
    bool latest_admission_progress_empty;
    // Last admission that matched an observer-owned factory candidate.
    // Unlike owner_thread, callback observation never overwrites this value.
    std::uint32_t latest_correlated_admission_thread;
    // These boundaries mean normal native call return, not Lua success.
    std::uint64_t send_return_hits;
    std::uint32_t send_return_thread;
    bool latest_send_return_matches_admission_storage;
    std::uint64_t marshaler_return_hits;
    std::uint32_t marshaler_return_thread;
    std::int32_t latest_marshaler_entity;
    std::uint8_t latest_marshaler_stopped;
    std::uint8_t latest_marshaler_result;
    bool latest_marshaler_valid;
    bool latest_marshaler_matches_admission_storage;
    bool latest_marshaler_matches_callback_storage;
    // Reached only after e17833's send-body CALL returns normally to e17838.
    std::uint64_t post_send_body_hits;
    std::uint32_t post_send_body_thread;
    // Correlated cleanup receipts are separate from the hot, generic site.
    // Latest tuple publication is bounded/best-effort under contention: require
    // valid and matching admission/send-return tokens, never count alone.
    std::uint64_t post_send_body_correlated_hits;
    std::uint64_t latest_correlated_admission_invocation;
    std::uint64_t latest_send_return_invocation;
    std::uint64_t latest_post_send_body_invocation;
    std::int32_t latest_post_send_body_entity;
    std::uint8_t latest_post_send_body_stopped;
    bool latest_post_send_body_valid;
    std::uint32_t latest_post_send_body_thread;
    // Bounded image-relative observation, including unrecognized adapters.
    // Zero means unavailable/outside image. These do not authorize execution.
    std::uint32_t latest_adapter_table_rva;
    std::uint32_t latest_adapter_invoke_rva;
    std::uint32_t latest_correlated_factory_thread;
};

// Exact-build, passive observation only. No engine pointer escapes this API.
// Start/Stop must run on an ordinary worker, never DllMain or an engine callback.
Status Start() noexcept;
Status Start40401Passive() noexcept;
// Isolated one-use cancellation qualification. Never authorizes replay.
Status Start40401CancellationExperiment() noexcept;
Status Stop() noexcept;
Snapshot Read() noexcept;
// A request is accepted at most once in a process lifetime. It atomically
// reserves the next factory sequence, and must name a stopped vehicle plus a
// short, future TickCount64 deadline.
Status ArmCancellation(const CancellationArmRequest& request) noexcept;
CancellationArmSnapshot ReadCancellationArm() noexcept;

#ifdef TF3_VEHICLE_OBSERVER_OWNED_TEST
Status StartOwnedFixture(void* factory_site, void* factory_post_site,
                         void* admission_site, void* callback_tail_site,
                         void* send_return_site, void* marshaler_return_site,
                         void* post_send_body_site) noexcept;
LONG DispatchOwnedException(EXCEPTION_POINTERS* pointers) noexcept;
#endif

}  // namespace tf3vehicleobserver
