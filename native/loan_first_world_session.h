#pragma once
#include "loan_resume_authority.h"

namespace tf3loanfirstworld {
// Scalar correlation only. The caller must independently qualify the exact
// native Loan callback, live game/manager objects, and current thread before
// calling ObserveLoan. These values alone prove no TF3 engine fact.
struct Identity {
    std::uint64_t game = 0;
    std::uint64_t manager = 0;
    DWORD thread = 0;
};

// Construct both objects for process lifetime; Authority must outlive Session.
// This Session must be the sole caller of Authority::OpenWorld/Invalidate/Arm/ArmDue
// for its Authority instance. Direct external calls break lifecycle admission.
// Every method takes lifecycle_ before any Authority lock. Never call these
// methods from VEH, recursively, or while holding an Authority lock. Release
// all locks before Lua, engine mutation, stock Join, or other callbacks.
// It exposes no Lua or IPC permission surface. Consume accepts only detached
// facts from an independently revalidated current native Loan invocation.
class Session final {
    tf3loanresume::Authority& authority_;
    SRWLOCK lifecycle_ = SRWLOCK_INIT;
    enum class Phase { unbound, bound, open, closed } phase_ = Phase::unbound;
    tf3loanresume::Epoch epoch_{};
    tf3loanresume::World world_{};
    Identity identity_{};
    struct Lock {
        SRWLOCK* value;
        explicit Lock(SRWLOCK* p) noexcept : value(p) { AcquireSRWLockExclusive(value); }
        ~Lock() { ReleaseSRWLockExclusive(value); }
        Lock(const Lock&) = delete;
        Lock& operator=(const Lock&) = delete;
    };
    static bool Valid(const Identity& value) noexcept {
        return value.game != 0 && value.manager != 0 && value.thread != 0;
    }
    static bool Same(const Identity& a, const Identity& b) noexcept {
        return a.game == b.game && a.manager == b.manager && a.thread == b.thread;
    }
    static bool Same(const tf3loanresume::World& a, const tf3loanresume::World& b) noexcept {
        return a.generation == b.generation && a.epoch == b.epoch;
    }
    void CloseLocked() noexcept {
        if (phase_ == Phase::closed) return;
        phase_ = Phase::closed;
        epoch_ = {}; world_ = {}; identity_ = {};
        authority_.Invalidate();
    }
public:
    explicit Session(tf3loanresume::Authority& authority) noexcept : authority_(authority) {}
    Session(const Session&) = delete;
    Session& operator=(const Session&) = delete;

    // Authenticated, process-unique epoch supplied by native session ingress.
    // Binding reserves it once and does not publish an open world. Any second
    // bind or malformed bind is a permanent failure.
    bool Bind(const tf3loanresume::Epoch& epoch) noexcept {
        Lock guard(&lifecycle_);
        if (phase_ != Phase::unbound) { CloseLocked(); return false; }
        unsigned char aggregate = 0;
        for (auto byte : epoch) aggregate |= byte;
        if (!aggregate) { CloseLocked(); return false; }
        epoch_ = epoch; phase_ = Phase::bound; return true;
    }
    // First independently qualified callback opens transition zero exactly
    // once. Later qualified callbacks must retain the same native identity.
    // Qualification failure must be reported with Close before any further
    // action; do not pass a synthetic or caller-controlled identity here.
    bool ObserveLoan(const Identity& observed, tf3loanresume::World* output) noexcept {
        Lock guard(&lifecycle_);
        if (phase_ == Phase::closed) return false;
        if (phase_ == Phase::unbound || !Valid(observed) || !output) { CloseLocked(); return false; }
        if (phase_ == Phase::bound) {
            tf3loanresume::World opened{};
            if (!authority_.OpenWorld(epoch_, 0, &opened)) { CloseLocked(); return false; }
            identity_ = observed; world_ = opened; phase_ = Phase::open;
        } else if (!Same(identity_, observed)) { CloseLocked(); return false; }
        *output = world_; return true;
    }
    // Read-only scalar snapshot. It confers no right to call Consume or to
    // retain native pointers. A concurrent Close may follow immediately.
    bool CurrentWorld(tf3loanresume::World* output) noexcept {
        Lock guard(&lifecycle_);
        if (phase_ != Phase::open || !output) return false;
        *output = world_; return true;
    }
    // Read-only revalidation of an independently captured invocation witness.
    // Unlike ObserveLoan, this cannot open, rebind or close a world, and unlike
    // Consume it never spends authority. It confers no engine lifetime guarantee.
    bool MatchesObservedWorld(const Identity& observed,
        const tf3loanresume::World& expected) noexcept {
        Lock guard(&lifecycle_);
        return phase_ == Phase::open && Valid(observed) &&
            observed.thread == GetCurrentThreadId() && Same(identity_, observed) &&
            Same(world_, expected);
    }
    // Caller must authenticate the grant before entry. The lifecycle lock
    // rechecks session/world and remains held through Authority::Arm.
    bool Arm(const tf3loanresume::Grant& grant) noexcept {
        Lock guard(&lifecycle_);
        return phase_ == Phase::open && Same(grant.world, world_) && authority_.Arm(grant);
    }
    // This serializes permission consumption with native lifecycle revocation.
    // It does not retain locks or pointers across the following Lua continuation
    // and does not itself prove engine lifetime or persisted origin/history.
    bool Consume(const Identity& freshly_observed,
        const tf3loanresume::Nonce& nonce, const tf3loanresume::Digest& digest,
        std::int32_t observed_owner, std::uint32_t observed_loan) noexcept {
        Lock guard(&lifecycle_);
        if (phase_ != Phase::open) return false;
        if (!Valid(freshly_observed) || !Same(identity_, freshly_observed) ||
            freshly_observed.thread != GetCurrentThreadId()) {
            CloseLocked(); return false;
        }
        return authority_.Consume(world_, nonce, digest, observed_owner, observed_loan);
    }
    // Dormant servicing seam. Only authenticated native ingress may arm; it
    // shares this world's lifetime, but never renews initialization permission.
    bool ArmDue(const tf3loanresume::DueGrant& grant) noexcept {
        Lock guard(&lifecycle_);
        return phase_ == Phase::open && Same(grant.world, world_) && authority_.ArmDue(grant);
    }
    // Caller must independently qualify the protected-update execution condition
    // and freshly read all payment facts at the exact native Loan invocation.
    // Lua arguments, saved tables or boundary snapshots alone do not qualify it.
    // Locks serialize revocation only; none protect later engine mutation.
    bool ConsumeDue(const Identity& freshly_observed,
        const tf3loanresume::DueObservation& payment) noexcept {
        Lock guard(&lifecycle_);
        if (phase_ != Phase::open) return false;
        if (!Valid(freshly_observed) || !Same(identity_, freshly_observed) ||
            freshly_observed.thread != GetCurrentThreadId()) {
            CloseLocked(); return false;
        }
        return authority_.ConsumeDue(world_, payment);
    }
    // Check the spent due observation against the current session identity and
    // native clock. Mismatch closes the session; Authority permanently revokes
    // a consumed due grant on world/payment/clock failure. The caller still
    // needs an independently qualified live invocation before each use.
    bool CheckConsumedDue(const Identity& freshly_observed,
        const tf3loanresume::World& expected_world,
        const tf3loanresume::DueObservation& payment) noexcept {
        Lock guard(&lifecycle_);
        if (phase_ != Phase::open) return false;
        if (!Valid(freshly_observed) || !Same(identity_, freshly_observed) ||
            freshly_observed.thread != GetCurrentThreadId() || !Same(world_, expected_world)) {
            CloseLocked(); return false;
        }
        return authority_.CheckConsumedDue(world_, payment);
    }
    // Call from join, IPC failure, registration failure, or any inability to
    // prove the callback identity. Invalidation completes before lock release.
    void Close() noexcept { Lock guard(&lifecycle_); CloseLocked(); }
    void OnJoin() noexcept { Close(); }
    void OnIpcFailure() noexcept { Close(); }
    void OnRegistrationFailure() noexcept { Close(); }
};
}
