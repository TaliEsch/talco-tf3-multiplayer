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
        *output = world_; return true;
    }
    // The returned serial belongs to this lifecycle transition. Its matching
    // completion must pass it to OpenWorld; an older completion is rejected.
    std::uint64_t Invalidate() noexcept {
        Lock guard(&lock_);
        Advance(); grant_ = {}; phase_ = Phase::revoked; world_open_ = false;
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
};
}
