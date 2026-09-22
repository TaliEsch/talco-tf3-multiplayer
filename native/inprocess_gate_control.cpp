#include "inprocess_gate_control.h"

#include <windows.h>
#include <intrin.h>
#include <limits>

namespace inprocess_gate {
namespace {
using U32 = std::uint32_t;
using U64 = std::uint64_t;
constexpr U64 kPhaseMask = 0x7f;
constexpr U64 kHaltBit = 0x80;
constexpr U64 kMaxGeneration = (std::numeric_limits<U64>::max)() >> 8;

constexpr U64 Pack(State phase, U64 generation, bool halted = false) {
    return (generation << 8) | static_cast<U64>(phase) | (halted ? kHaltBit : 0);
}
constexpr State Phase(U64 word) { return static_cast<State>(word & kPhaseMask); }
constexpr U64 Generation(U64 word) { return word >> 8; }
constexpr bool Halted(U64 word) { return (word & kHaltBit) != 0; }
bool Terminal(State phase) {
    return phase == State::terminal_requested || phase == State::terminal_parked;
}
bool Detaching(State phase) {
    return phase == State::detach_prepared || phase == State::detach_confirmed ||
        phase == State::detach_returning || phase == State::detached;
}
U32 Load32(const volatile U32* value) {
    return static_cast<U32>(_InterlockedCompareExchange(
        reinterpret_cast<volatile LONG*>(const_cast<volatile U32*>(value)), 0, 0));
}
void Store32(volatile U32* value, U32 next) {
    _InterlockedExchange(reinterpret_cast<volatile LONG*>(value), static_cast<LONG>(next));
    WakeByAddressAll(const_cast<U32*>(value));
}
U64 Load64(const volatile U64* value) {
    return static_cast<U64>(_InterlockedCompareExchange64(
        reinterpret_cast<volatile LONG64*>(const_cast<volatile U64*>(value)), 0, 0));
}
bool Compare64(volatile U64* value, U64 expected, U64 next) {
    const auto observed = static_cast<U64>(_InterlockedCompareExchange64(
        reinterpret_cast<volatile LONG64*>(value), static_cast<LONG64>(next),
        static_cast<LONG64>(expected)));
    if (observed == expected) WakeByAddressAll(const_cast<U64*>(value));
    return observed == expected;
}
U64 Or64(volatile U64* value, U64 bits) {
    const auto previous = static_cast<U64>(_InterlockedOr64(
        reinterpret_cast<volatile LONG64*>(value), static_cast<LONG64>(bits)));
    WakeByAddressAll(const_cast<U64*>(value));
    return previous;
}
void And64(volatile U64* value, U64 bits) {
    (void)_InterlockedAnd64(reinterpret_cast<volatile LONG64*>(value),
                            static_cast<LONG64>(bits));
    WakeByAddressAll(const_cast<U64*>(value));
}
void Store64(volatile U64* value, U64 next) {
    _InterlockedExchange64(reinterpret_cast<volatile LONG64*>(value),
                           static_cast<LONG64>(next));
}
void WaitWord(volatile U64* value, U64 expected) {
    WaitOnAddress(const_cast<U64*>(value), &expected, sizeof(expected), INFINITE);
}
}

GateControl::GateControl(U64 secret) noexcept
    : secret_(secret), control_(Pack(State::running, 0)), owner_(0), in_gate_(0),
      consumed_(0), applied_(0), cancelled_(0) {}

Result GateControl::RequestHold() noexcept {
    for (;;) {
        const auto word = Load64(&control_);
        const auto phase = Phase(word);
        if (Halted(word) || Terminal(phase) || Detaching(phase)) return Result::terminal;
        if (phase != State::running) return Result::release_already_outstanding;
        if (Compare64(&control_, word, Pack(State::hold_requested, Generation(word))))
            return Result::accepted;
    }
}

Result GateControl::RequestRelease(U64 generation) noexcept {
    if (generation > kMaxGeneration) return Result::stale_generation;
    if (Compare64(&control_, Pack(State::held, generation),
                  Pack(State::release_issued, generation))) return Result::accepted;
    const auto word = Load64(&control_);
    if (Generation(word) != generation) return Result::stale_generation;
    const auto phase = Phase(word);
    if (Halted(word) || Terminal(phase) || Detaching(phase)) return Result::terminal;
    if (phase == State::release_issued || phase == State::release_consuming ||
        phase == State::release_returning || phase == State::release_consumed ||
        phase == State::advancing) return Result::release_already_outstanding;
    return Result::not_held;
}

Result GateControl::HaltOrDisconnect() noexcept {
    for (;;) {
        auto word = Load64(&control_);
        auto phase = Phase(word);
        const auto generation = Generation(word);
        if (phase == State::detach_returning || phase == State::detached)
            return Result::protocol_error;
        if (!Halted(word)) {
            if (!Compare64(&control_, word, word | kHaltBit)) continue;
            word |= kHaltBit;
            phase = Phase(word);
        }
        if (Terminal(phase)) return Result::accepted;
        if (phase == State::cancel_publishing) {
            WaitWord(&control_, word);
            continue;
        }
        if (phase == State::release_consuming || phase == State::release_returning ||
            phase == State::release_consumed || phase == State::advancing)
            return Result::accepted;
        if (phase == State::release_issued) {
            if (!Compare64(&control_, word,
                           Pack(State::cancel_publishing, generation, true))) continue;
            Store64(&cancelled_, generation);
            (void)Compare64(&control_, Pack(State::cancel_publishing, generation, true),
                            Pack(State::terminal_parked, generation, true));
            return Result::accepted;
        }
        const auto terminal = phase == State::held || phase == State::detach_prepared ||
            phase == State::detach_confirmed ? State::terminal_parked
                                             : State::terminal_requested;
        if (Compare64(&control_, word, Pack(terminal, generation, true)))
            return Result::accepted;
    }
}

Result GateControl::SignalBoundaryFault() noexcept {
    const auto previous = Or64(&control_, kHaltBit);
    const auto phase = Phase(previous);
    const auto generation = Generation(previous);
    if (phase == State::detach_returning || phase == State::detached) {
        // Clean detach already linearized. Undo this late diagnostic latch so
        // the owner return trap can finish the committed teardown.
        And64(&control_, ~kHaltBit);
        return Result::protocol_error;
    }
    const auto halted = previous | kHaltBit;
    if (phase == State::release_issued &&
        Compare64(&control_, halted, Pack(State::cancel_publishing, generation, true))) {
        Store64(&cancelled_, generation);
        (void)Compare64(&control_, Pack(State::cancel_publishing, generation, true),
                        Pack(State::terminal_parked, generation, true));
    } else if (phase == State::held || phase == State::detach_prepared ||
               phase == State::detach_confirmed) {
        (void)Compare64(&control_, halted, Pack(State::terminal_parked, generation, true));
    } else if (phase == State::running || phase == State::hold_requested) {
        (void)Compare64(&control_, halted, Pack(State::terminal_requested, generation, true));
    }
    // Even if the best-effort phase collapse races, the halt bit is now
    // irrevocably present in the same word used by every admission CAS.
    return Result::accepted;
}

Result GateControl::PrepareDetach(U64 secret, U64 generation) noexcept {
    if (secret != secret_) return Result::authentication_failed;
    if (generation > kMaxGeneration) return Result::stale_generation;
    if (Compare64(&control_, Pack(State::held, generation),
                  Pack(State::detach_prepared, generation))) return Result::accepted;
    const auto word = Load64(&control_);
    if (Generation(word) != generation) return Result::stale_generation;
    return Halted(word) || Terminal(Phase(word)) ? Result::terminal : Result::not_held;
}

Result GateControl::ConfirmExternalByteRestored(U64 generation) noexcept {
    if (generation > kMaxGeneration) return Result::protocol_error;
    return Compare64(&control_, Pack(State::detach_prepared, generation),
                     Pack(State::detach_confirmed, generation))
        ? Result::accepted : Result::protocol_error;
}

OwnerResult GateControl::EnterOwnerBoundary() noexcept {
    auto word = Load64(&control_);
    if (Phase(word) == State::detached) return OwnerResult::observing;
    const U32 thread = GetCurrentThreadId();
    U32 owner = Load32(&owner_);
    if (owner == 0) {
        (void)_InterlockedCompareExchange(reinterpret_cast<volatile LONG*>(&owner_),
                                          static_cast<LONG>(thread), 0);
        owner = Load32(&owner_);
    }
    if (owner != thread) {
        (void)HaltOrDisconnect();
        return OwnerResult::faulted;
    }
    if (_InterlockedCompareExchange(reinterpret_cast<volatile LONG*>(&in_gate_), 1, 0) != 0) {
        (void)HaltOrDisconnect();
        return OwnerResult::faulted;
    }
    for (;;) {
        word = Load64(&control_);
        const auto phase = Phase(word);
        const auto generation = Generation(word);
        const bool halted = Halted(word);
        if (phase == State::running) {
            if (halted) {
                if (generation == kMaxGeneration) {
                    if (Compare64(&control_, word,
                                  Pack(State::terminal_parked, generation, true)))
                        return OwnerResult::terminal_parked;
                } else if (Compare64(&control_, word,
                                     Pack(State::terminal_parked, generation + 1, true)))
                    return OwnerResult::terminal_parked;
                continue;
            }
            if (Load64(&control_) != word) continue;
            Store32(&in_gate_, 0);
            return OwnerResult::observing;
        }
        if (phase == State::hold_requested || phase == State::terminal_requested) {
            const auto next_generation = generation == kMaxGeneration
                ? generation : generation + 1;
            const auto next_phase = halted || phase == State::terminal_requested ||
                generation == kMaxGeneration ? State::terminal_parked : State::held;
            if (Compare64(&control_, word, Pack(next_phase, next_generation,
                                                next_phase == State::terminal_parked)))
                return next_phase == State::terminal_parked
                    ? OwnerResult::terminal_parked : OwnerResult::held;
            continue;
        }
        if (phase == State::release_consumed) {
            if (!Compare64(&control_, word, Pack(State::advancing, generation, halted)))
                continue;
            Store64(&applied_, Load64(&consumed_));
            for (;;) {
                const auto advancing = Load64(&control_);
                if (Phase(advancing) != State::advancing ||
                    Generation(advancing) != generation) return OwnerResult::faulted;
                const bool terminal = Halted(advancing) || generation == kMaxGeneration;
                const auto next_generation = generation == kMaxGeneration
                    ? generation : generation + 1;
                if (Compare64(&control_, advancing,
                              Pack(terminal ? State::terminal_parked : State::held,
                                   next_generation, terminal)))
                    return terminal ? OwnerResult::terminal_parked : OwnerResult::held;
            }
        }
        if (phase == State::terminal_parked) return OwnerResult::terminal_parked;
        if (phase == State::detach_confirmed && !halted)
            return OwnerResult::detach_confirmed;
        (void)HaltOrDisconnect();
        return OwnerResult::faulted;
    }
}

OwnerResult GateControl::WaitForRelease(U64 generation) noexcept {
    if (generation > kMaxGeneration || Load32(&owner_) != GetCurrentThreadId() ||
        !Load32(&in_gate_)) return OwnerResult::faulted;
    for (;;) {
        auto word = Load64(&control_);
        const auto phase = Phase(word);
        if (Generation(word) != generation) return OwnerResult::faulted;
        if (Halted(word)) {
            if (phase == State::release_consuming) {
                Store64(&consumed_, generation);
                if (!Compare64(&control_, word,
                               Pack(State::release_returning, generation, true))) continue;
                return OwnerResult::release_consumed;
            }
            if (phase == State::release_issued) {
                if (!Compare64(&control_, word,
                               Pack(State::cancel_publishing, generation, true))) continue;
                Store64(&cancelled_, generation);
                (void)Compare64(&control_, Pack(State::cancel_publishing, generation, true),
                                Pack(State::terminal_parked, generation, true));
                continue;
            }
            if (phase == State::held || phase == State::detach_prepared ||
                phase == State::detach_confirmed) {
                if (!Compare64(&control_, word,
                               Pack(State::terminal_parked, generation, true))) continue;
                return OwnerResult::terminal_parked;
            }
        }
        if (phase == State::release_issued) {
            if (!Compare64(&control_, word,
                           Pack(State::release_consuming, generation))) continue;
            Store64(&consumed_, generation);
            for (;;) {
                const auto consuming = Load64(&control_);
                if (Phase(consuming) != State::release_consuming ||
                    Generation(consuming) != generation) break;
                if (Compare64(&control_, consuming,
                              Pack(State::release_returning, generation, Halted(consuming))))
                    return OwnerResult::release_consumed;
            }
            continue;
        }
        if (Terminal(phase)) return OwnerResult::terminal_parked;
        if (phase == State::detach_confirmed) return OwnerResult::detach_confirmed;
        if (phase != State::held && phase != State::detach_prepared &&
            phase != State::release_consuming && phase != State::cancel_publishing)
            return OwnerResult::faulted;
        WaitWord(&control_, word);
    }
}

Result GateControl::ConfirmReleaseReturned(U64 generation) noexcept {
    if (generation > kMaxGeneration || Load32(&owner_) != GetCurrentThreadId() ||
        !Load32(&in_gate_)) return Result::wrong_owner;
    for (;;) {
        const auto word = Load64(&control_);
        if (Phase(word) != State::release_returning || Generation(word) != generation)
            return Result::protocol_error;
        if (Compare64(&control_, word,
                      Pack(State::release_consumed, generation, Halted(word)))) {
            Store32(&in_gate_, 0);
            return Result::accepted;
        }
    }
}

Result GateControl::OwnerExitGate(U64 generation) noexcept {
    if (generation > kMaxGeneration || Load32(&owner_) != GetCurrentThreadId() ||
        !Load32(&in_gate_)) return generation > kMaxGeneration
            ? Result::protocol_error : Result::wrong_owner;
    return Compare64(&control_, Pack(State::detach_confirmed, generation),
                     Pack(State::detach_returning, generation))
        ? Result::accepted : Result::protocol_error;
}

Result GateControl::ConfirmOwnerExitedGate(U64 generation) noexcept {
    if (generation > kMaxGeneration || Load32(&owner_) != GetCurrentThreadId() ||
        !Load32(&in_gate_)) return generation > kMaxGeneration
            ? Result::protocol_error : Result::wrong_owner;
    for (;;) {
        const auto word = Load64(&control_);
        if (Phase(word) != State::detach_returning || Generation(word) != generation)
            return Result::protocol_error;
        // Once OwnerExitGate commits detach_returning, clean detach wins. A
        // concurrent late boundary fault may transiently OR the halt bit, but
        // cannot revoke the already-restored byte and completed gate frame.
        if (Compare64(&control_, word, Pack(State::detached, generation))) break;
    }
    Store32(&in_gate_, 0);
    Store32(&owner_, 0);
    return Result::accepted;
}

Snapshot GateControl::Read() const noexcept {
    const auto word = Load64(&control_);
    return {Phase(word), Load32(&owner_), Generation(word), Load64(&consumed_),
            Load64(&applied_), Load64(&cancelled_), Halted(word),
            Load32(&in_gate_) != 0};
}
}
