#pragma once
#include <windows.h>
#include <array>
#include <cstdint>
#include <limits>

namespace tf3loanresume {
using Epoch = std::array<unsigned char, 16>;
using Nonce = std::array<unsigned char, 16>;
using Digest = std::array<unsigned char, 32>;
struct World { Epoch epoch{}; std::uint64_t generation = 0; };
struct Grant {
    World world{};
    Nonce nonce{};
    Digest digest{};
    std::int32_t owner = 0;
    std::uint32_t loan = 0;
    std::uint64_t expires_at = 0;
};
// Detached repayment facts. The semantic digest covers the complete approved
// authorization/projection; local_candidate_digest binds this game's candidate.
// At consumption these must come from qualified current Loan readback and the
// authenticated approval, never a caller-provided identity or clock.
struct DueObservation {
    Nonce nonce{};
    Digest semantic_digest{}, candidate_hash{}, local_candidate_digest{};
    std::uint64_t request_id = 0, host_sequence = 0, installment = 0;
    std::int32_t owner = 0;
    std::uint32_t loan = 0;
    std::uint64_t update_count = 0, game_time = 0;
};
struct DueGrant {
    World world{};
    DueObservation payment{};
    std::uint64_t expires_at = 0;
};
enum class Phase { closed, empty, armed, consumed, revoked };

// Pointer-free permission storage, not an engine adapter. Only authenticated
// native ingress may arm. A qualified lifecycle adapter must open/invalidate
// worlds; a qualified current-thread Loan adapter must establish identity and
// ownership before Consume. No method is exposed directly to Lua or IPC.
// Consumption is atomic with invalidation, but does not exclude subsequent
// engine mutation from teardown. That exclusion remains an integration gate.
// Blocking SRW operations must run outside VEH/exception handling and cannot
// be called recursively. No lock is retained across Lua, mutation or joins.
class Authority final {
public:
    using Clock = std::uint64_t (*)() noexcept;
private:
    static std::uint64_t NativeNow() noexcept { return GetTickCount64(); }
    Clock clock_;
    SRWLOCK lock_ = SRWLOCK_INIT;
    World world_{};
    Grant grant_{};
    Phase phase_ = Phase::closed;
    DueGrant due_grant_{};
    Phase due_phase_ = Phase::closed;
    std::uint64_t due_armed_at_ = 0;
    std::uint64_t due_checked_at_ = 0;
    bool world_open_ = false;
    bool exhausted_ = false;
    std::uint64_t armed_at_ = 0;
    struct Lock {
        SRWLOCK* value;
        explicit Lock(SRWLOCK* p) noexcept : value(p) { AcquireSRWLockExclusive(value); }
        ~Lock() { ReleaseSRWLockExclusive(value); }
        Lock(const Lock&) = delete;
        Lock& operator=(const Lock&) = delete;
    };
    template<std::size_t N> static bool Nonzero(const std::array<unsigned char, N>& value) noexcept {
        unsigned char aggregate = 0;
        for (auto byte : value) aggregate |= byte;
        return aggregate != 0;
    }
    static bool Same(const World& a, const World& b) noexcept {
        return a.generation == b.generation && a.epoch == b.epoch;
    }
    static bool Valid(const DueObservation& value) noexcept {
        constexpr std::uint64_t max = 2147483647ULL;
        return Nonzero(value.nonce) && Nonzero(value.semantic_digest) &&
            Nonzero(value.candidate_hash) && Nonzero(value.local_candidate_digest) &&
            value.request_id > 0 && value.request_id <= max &&
            value.host_sequence > 0 && value.host_sequence <= max &&
            value.installment > 0 && value.installment <= max && value.owner > 0 &&
            value.loan < 2147483647u && value.update_count <= 2147483647u && value.game_time <= max;
    }
    static bool Same(const DueObservation& a, const DueObservation& b) noexcept {
        return a.nonce == b.nonce && a.semantic_digest == b.semantic_digest &&
            a.candidate_hash == b.candidate_hash && a.local_candidate_digest == b.local_candidate_digest &&
            a.request_id == b.request_id &&
            a.host_sequence == b.host_sequence && a.installment == b.installment &&
            a.owner == b.owner && a.loan == b.loan && a.update_count == b.update_count &&
            a.game_time == b.game_time;
    }
    bool Advance() noexcept {
        if (exhausted_ || world_.generation == (std::numeric_limits<std::uint64_t>::max)()) {
            exhausted_ = true; phase_ = Phase::revoked; return false;
        }
        ++world_.generation; return true;
    }
public:
    // Injectable only by owned fixtures; production uses the monotonic native
    // clock, sampled after lock acquisition at the serialized decision.
    explicit Authority(Clock clock = NativeNow) noexcept : clock_(clock) {}
    Authority(const Authority&) = delete;
    Authority& operator=(const Authority&) = delete;
    // Never infer a new world from saved Lua state or a reused VM pointer.
    bool OpenWorld(const Epoch& authenticated_epoch, std::uint64_t transition, World* output) noexcept {
        if (!output || !Nonzero(authenticated_epoch)) return false;
        Lock guard(&lock_);
        if (world_open_ || transition != world_.generation) return false;
        if (!Advance()) return false;
        world_.epoch = authenticated_epoch; grant_ = {}; phase_ = Phase::empty; world_open_ = true;
        due_grant_ = {}; due_phase_ = Phase::empty; due_armed_at_ = due_checked_at_ = 0;
        *output = world_; return true;
    }
    // The returned serial belongs to this lifecycle transition. Its matching
    // completion must pass it to OpenWorld; an older completion is rejected.
    std::uint64_t Invalidate() noexcept {
        Lock guard(&lock_);
        Advance(); grant_ = {}; phase_ = Phase::revoked; world_open_ = false;
        due_grant_ = {}; due_phase_ = Phase::revoked; due_armed_at_ = due_checked_at_ = 0;
        return world_.generation;
    }
    bool Arm(const Grant& grant) noexcept {
        if (!clock_ || !Nonzero(grant.nonce) || !Nonzero(grant.digest) || grant.owner <= 0 ||
            grant.loan >= 2147483647u) return false;
        Lock guard(&lock_);
        if (exhausted_ || !world_open_ || phase_ != Phase::empty || !Same(world_, grant.world)) return false;
        const auto native_now = clock_();
        if (grant.expires_at < native_now || grant.expires_at - native_now > 60000) return false;
        grant_ = grant; armed_at_ = native_now; phase_ = Phase::armed; return true;
    }
    // world/owner/loan are fresh observations from the qualified Loan adapter,
    // not values supplied by the Lua caller. nonce/digest are exact decoded args.
    bool Consume(const World& world, const Nonce& nonce, const Digest& digest,
        std::int32_t observed_owner, std::uint32_t observed_loan) noexcept {
        Lock guard(&lock_);
        if (!clock_ || exhausted_ || !world_open_ || phase_ != Phase::armed || !Same(world_, world)) return false;
        const auto native_now = clock_();
        if (native_now < armed_at_ || native_now > grant_.expires_at) { phase_ = Phase::revoked; return false; }
        if (nonce != grant_.nonce || digest != grant_.digest || observed_owner != grant_.owner ||
            observed_loan != grant_.loan) return false;
        // Remains spent even if the caller's later Lua marker or engine action
        // fails. There is no rollback/retry/rearm within this open world.
        phase_ = Phase::consumed; return true;
    }
    // Separate purpose and one repayment per loaded world. Initialization stays
    // spent; neither method can consume/rearm its permission. Ingress must have
    // independently authenticated the full approval before calling ArmDue.
    bool ArmDue(const DueGrant& grant) noexcept {
        if (!clock_ || !Valid(grant.payment)) return false;
        Lock guard(&lock_);
        if (exhausted_ || !world_open_ || phase_ != Phase::consumed ||
            due_phase_ != Phase::empty || !Same(world_, grant.world) ||
            grant.payment.nonce != grant_.nonce || grant.payment.owner != grant_.owner ||
            grant.payment.loan != grant_.loan) return false;
        const auto native_now = clock_();
        if (grant.expires_at < native_now || grant.expires_at - native_now > 5000) return false;
        due_grant_ = grant; due_armed_at_ = native_now; due_checked_at_ = 0;
        due_phase_ = Phase::armed; return true;
    }
    // The integration must first prove current native invocation, receiver and
    // protected-update execution condition. Scalar equality cannot prove those
    // engine facts. Consume before mutation; every admitted attempt stays spent
    // even on mismatch/expiry or an unknown subsequent Lua/engine outcome.
    bool ConsumeDue(const World& world, const DueObservation& observed) noexcept {
        Lock guard(&lock_);
        if (!clock_ || exhausted_ || !world_open_ || due_phase_ != Phase::armed) return false;
        due_phase_ = Phase::revoked;
        const auto native_now = clock_();
        if (!Same(world_, world) || native_now < due_armed_at_ || native_now > due_grant_.expires_at ||
            !Same(observed, due_grant_.payment)) return false;
        due_checked_at_ = native_now; due_phase_ = Phase::consumed; return true;
    }
    // Fresh native-clock check of an already spent exact observation. A failed
    // check after consumption is terminal for this world, including rollback
    // relative to either consumption or a previous successful check. This
    // scalar predicate does not prove a live engine invocation or receiver.
    bool CheckConsumedDue(const World& world, const DueObservation& observed) noexcept {
        Lock guard(&lock_);
        if (due_phase_ != Phase::consumed) return false;
        if (!clock_ || exhausted_ || !world_open_ || !Same(world_, world) ||
            !Same(observed, due_grant_.payment)) {
            due_phase_ = Phase::revoked; return false;
        }
        const auto native_now = clock_();
        if (native_now < due_checked_at_ || native_now > due_grant_.expires_at) {
            due_phase_ = Phase::revoked; return false;
        }
        due_checked_at_ = native_now;
        return true;
    }
};
}
