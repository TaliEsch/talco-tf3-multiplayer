#include "inprocess_control.h"

#include <limits>

namespace tf3inprocesscontrol {
namespace {
static_assert(std::atomic<State>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);

DWORD Remaining(ULONGLONG deadline) noexcept {
    const ULONGLONG now = GetTickCount64();
    if (now >= deadline) return 0;
    const ULONGLONG remaining = deadline - now;
    return remaining > MAXDWORD ? MAXDWORD : static_cast<DWORD>(remaining);
}
}

Control::Control() noexcept : state_(State::running), held_ready_(false), halt_published_(false),
    release_active_(false), hold_requests_(0), hold_acknowledged_(0), releases_(0),
    release_acknowledged_(0), halts_(0), halt_acknowledged_(0) {}

void Control::Wake() noexcept { WakeByAddressAll(&state_); }

bool Control::WaitForAtLeast(const std::atomic<std::uint64_t>& value,
                              std::uint64_t expected, DWORD timeout_ms) const noexcept {
    const ULONGLONG deadline = GetTickCount64() + timeout_ms;
    for (;;) {
        // Use the same acquire sample as both predicate and WaitOnAddress's
        // undesired value. A second load could observe the completion after its
        // wake and then sleep until the full timeout waiting for another change.
        auto observed = value.load(std::memory_order_acquire);
        if (observed >= expected) return true;
        const DWORD remaining = Remaining(deadline);
        if (remaining == 0) return value.load(std::memory_order_acquire) >= expected;
        (void)WaitOnAddress(const_cast<std::atomic<std::uint64_t>*>(&value),
                            &observed, sizeof(observed), remaining);
    }
}

bool Control::WaitForTrue(const std::atomic<bool>& value, DWORD timeout_ms) const noexcept {
    const ULONGLONG deadline = GetTickCount64() + timeout_ms;
    for (;;) {
        bool observed = value.load(std::memory_order_acquire);
        if (observed) return true;
        const DWORD remaining = Remaining(deadline);
        if (remaining == 0) return value.load(std::memory_order_acquire);
        (void)WaitOnAddress(const_cast<std::atomic<bool>*>(&value),
                            &observed, sizeof(observed), remaining);
    }
}

BoundaryResult Control::Boundary() noexcept {
    // This loop is the entire callback path. WaitOnAddress only blocks this
    // boundary owner; it does not impede callers of Hold/ReleaseOne/Halt.
    for (;;) {
        const State observed = state_.load(std::memory_order_acquire);
        if (observed == State::running) return BoundaryResult::advance;
        if (observed == State::halted || observed == State::stopped) {
            halt_acknowledged_.fetch_add(1, std::memory_order_release);
            WakeByAddressAll(&halt_acknowledged_);
            return BoundaryResult::halt;
        }
        if (observed == State::hold_requested) {
            State expected = State::hold_requested;
            if (state_.compare_exchange_strong(expected, State::held, std::memory_order_acq_rel)) {
                hold_acknowledged_.fetch_add(1, std::memory_order_release);
                WakeByAddressAll(&hold_acknowledged_);
                // Release admission becomes visible only after the boundary's
                // acknowledgement. State::held alone is not a release permit.
                held_ready_.store(true, std::memory_order_release);
                WakeByAddressAll(&held_ready_);
            }
            continue;
        }
        if (observed == State::release_once) {
            State expected = State::release_once;
            if (state_.compare_exchange_strong(expected, State::hold_requested, std::memory_order_acq_rel)) {
                release_acknowledged_.fetch_add(1, std::memory_order_release);
                WakeByAddressAll(&release_acknowledged_);
                Wake();
                return BoundaryResult::advance;
            }
            continue;
        }
        // Only State::held remains.  A spurious wake or a state change loops.
        State held = State::held;
        (void)WaitOnAddress(&state_, &held, sizeof(held), INFINITE);
    }
}

Result Control::Hold(DWORD timeout_ms) noexcept {
    State expected = State::running;
    if (!state_.compare_exchange_strong(expected, State::hold_requested, std::memory_order_acq_rel)) {
        if (expected == State::held) return held_ready_.load(std::memory_order_acquire)
            ? Result::already_held : Result::already_pending;
        if (expected == State::hold_requested || expected == State::release_once) return Result::already_pending;
        return expected == State::halted ? Result::already_halted : Result::stopped;
    }
    // The callback increments its acknowledgement independently, so it is
    // safe if it reaches the boundary before this request counter increments.
    const std::uint64_t request = hold_requests_.fetch_add(1, std::memory_order_acq_rel) + 1;
    Wake();
    return WaitForAtLeast(hold_acknowledged_, request, timeout_ms) ? Result::accepted : Result::timeout;
}

Result Control::ReleaseOne(DWORD timeout_ms) noexcept {
    const State initial = state_.load(std::memory_order_acquire);
    if (initial == State::halted) return Result::already_halted;
    if (initial == State::stopped) return Result::stopped;
    bool inactive = false;
    if (!release_active_.compare_exchange_strong(inactive, true, std::memory_order_acq_rel)) {
        const State current = state_.load(std::memory_order_acquire);
        if (current == State::halted) return Result::already_halted;
        if (current == State::stopped) return Result::stopped;
        return Result::already_pending;
    }
    const ULONGLONG deadline = GetTickCount64() + timeout_ms;
    const std::uint64_t completion = hold_acknowledged_.load(std::memory_order_acquire) + 1;
    bool ready = true;
    if (!held_ready_.compare_exchange_strong(ready, false, std::memory_order_acq_rel)) {
        const State observed = state_.load(std::memory_order_acquire);
        release_active_.store(false, std::memory_order_release);
        if (observed == State::halted) return Result::already_halted;
        if (observed == State::stopped) return Result::stopped;
        return Result::already_pending;
    }
    State expected = State::held;
    if (!state_.compare_exchange_strong(expected, State::release_once, std::memory_order_acq_rel)) {
        release_active_.store(false, std::memory_order_release);
        if (expected == State::halted) return Result::already_halted;
        if (expected == State::stopped) return Result::stopped;
        return expected == State::release_once ? Result::already_pending : Result::invalid_transition;
    }
    const std::uint64_t release = releases_.fetch_add(1, std::memory_order_acq_rel) + 1;
    Wake();
    if (!WaitForAtLeast(release_acknowledged_, release, Remaining(deadline))) return Result::timeout;
    // Consuming the permit only starts an advance. It is successful exactly
    // when the owner reaches and acknowledges the following boundary. A
    // timeout after consumption remains unknown and must never be retried.
    if (!WaitForAtLeast(hold_acknowledged_, completion, Remaining(deadline)))
        return Result::timeout;
    release_active_.store(false, std::memory_order_release);
    return Result::accepted;
}

Result Control::Halt(DWORD timeout_ms) noexcept {
    const ULONGLONG deadline = GetTickCount64() + timeout_ms;
    State observed = state_.load(std::memory_order_acquire);
    for (;;) {
        if (observed == State::stopped) return Result::stopped;
        if (observed == State::halted) {
            if (!WaitForTrue(halt_published_, Remaining(deadline))) return Result::timeout;
            const auto request = halts_.load(std::memory_order_acquire);
            return WaitForAtLeast(halt_acknowledged_, request, Remaining(deadline))
                ? Result::already_halted : Result::timeout;
        }
        if (state_.compare_exchange_weak(observed, State::halted, std::memory_order_acq_rel)) break;
    }
    held_ready_.store(false, std::memory_order_release);
    const std::uint64_t halt = halts_.fetch_add(1, std::memory_order_acq_rel) + 1;
    halt_published_.store(true, std::memory_order_release);
    WakeByAddressAll(&halt_published_);
    Wake();
    return WaitForAtLeast(halt_acknowledged_, halt, Remaining(deadline))
        ? Result::accepted : Result::timeout;
}

Result Control::Disconnect(DWORD timeout_ms) noexcept { return Halt(timeout_ms); }

Result Control::Stop(DWORD timeout_ms) noexcept {
    const Result halted = Halt(timeout_ms);
    if (halted == Result::stopped) return Result::stopped;
    if (halted != Result::accepted && halted != Result::already_halted) return halted;
    State expected = State::halted;
    if (!state_.compare_exchange_strong(expected, State::stopped, std::memory_order_acq_rel))
        return expected == State::stopped ? Result::stopped : Result::invalid_transition;
    Wake();
    return Result::accepted;
}

Snapshot Control::Read() const noexcept {
    return {state_.load(std::memory_order_acquire), held_ready_.load(std::memory_order_acquire),
            hold_requests_.load(std::memory_order_acquire),
            hold_acknowledged_.load(std::memory_order_acquire), releases_.load(std::memory_order_acquire),
            release_acknowledged_.load(std::memory_order_acquire), halts_.load(std::memory_order_acquire),
            halt_acknowledged_.load(std::memory_order_acquire)};
}
}  // namespace tf3inprocesscontrol
