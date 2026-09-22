#pragma once
#include <cstdint>
namespace inprocess_gate {
enum class State : std::uint8_t { running, hold_requested, held, release_issued, release_consuming, release_returning, release_consumed, advancing, cancel_publishing, terminal_requested, terminal_parked, detach_prepared, detach_confirmed, detach_returning, detached };
enum class Result : std::uint32_t { accepted, wrong_owner, nested_entry, stale_generation, not_held, release_already_outstanding, terminal, authentication_failed, protocol_error };
// Only release_consumed permits ordinary helper return. terminal/detach results never do.
enum class OwnerResult : std::uint32_t { observing, held, release_consumed, terminal_parked, detach_confirmed, faulted };
struct Snapshot { State state; std::uint32_t owner_thread_id; std::uint64_t boundary_generation, permit_consumed_generation, release_applied_generation, cancelled_generation; bool halt_requested, owner_in_gate; };
class GateControl final {
public:
 explicit GateControl(std::uint64_t detach_secret) noexcept;
 GateControl(const GateControl&)=delete; GateControl& operator=(const GateControl&)=delete;
 Result RequestHold() noexcept; Result RequestRelease(std::uint64_t) noexcept; Result HaltOrDisconnect() noexcept;
 // Bounded, non-waiting fault publication for an exception callback.
 Result SignalBoundaryFault() noexcept;
 Result PrepareDetach(std::uint64_t, std::uint64_t) noexcept;
 Result ConfirmExternalByteRestored(std::uint64_t) noexcept;
 OwnerResult EnterOwnerBoundary() noexcept; OwnerResult WaitForRelease(std::uint64_t) noexcept;
 Result ConfirmReleaseReturned(std::uint64_t) noexcept;
 Result OwnerExitGate(std::uint64_t) noexcept;
 // Called by the owner-thread return-boundary trap after the gate frame is gone.
 Result ConfirmOwnerExitedGate(std::uint64_t) noexcept;
 Snapshot Read() const noexcept;
private:
 std::uint64_t secret_; alignas(8) volatile std::uint64_t control_; alignas(4) volatile std::uint32_t owner_, in_gate_; alignas(8) volatile std::uint64_t consumed_, applied_, cancelled_;
}; }
