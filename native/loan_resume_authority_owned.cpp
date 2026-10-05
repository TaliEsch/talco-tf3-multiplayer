#include "loan_resume_authority.h"
#include <atomic>
#include <cstdio>
#include <stdexcept>
#include <thread>

namespace {
unsigned cases = 0;
std::atomic<std::uint64_t> ticks{1000};
std::uint64_t Clock() noexcept { return ticks.load(); }
HANDLE clock_entered = nullptr, clock_release = nullptr, waiter_entered = nullptr;
std::atomic<bool> block_clock{false};
std::atomic<unsigned> clock_reads{0};
std::atomic<DWORD> clock_wait{WAIT_OBJECT_0};
std::uint64_t BlockingClock() noexcept {
    ++clock_reads;
    const auto sampled = ticks.load();
    if (block_clock.exchange(false)) {
        SetEvent(clock_entered);
        clock_wait = WaitForSingleObject(clock_release, 2000);
    }
    return sampled;
}
void Require(bool value, const char* label) {
    if (!value) throw std::runtime_error(label);
    ++cases;
}
tf3loanresume::Epoch Epoch() { tf3loanresume::Epoch value{}; value[0] = 1; return value; }
tf3loanresume::Grant Grant(const tf3loanresume::World& world) {
    tf3loanresume::Grant value{};
    value.world = world; value.nonce[0] = 2; value.digest[0] = 3;
    value.owner = 15702; value.loan = 0; value.expires_at = 1100;
    return value;
}
bool Consume(tf3loanresume::Authority& gate, const tf3loanresume::Grant& grant,
    std::uint64_t now = 1000) {
    ticks = now;
    return gate.Consume(grant.world, grant.nonce, grant.digest, grant.owner, grant.loan);
}
bool Arm(tf3loanresume::Authority& gate, const tf3loanresume::Grant& grant, std::uint64_t now) {
    ticks = now; return gate.Arm(grant);
}
tf3loanresume::DueGrant Due(const tf3loanresume::World& world) {
    tf3loanresume::DueGrant value{};
    value.world = world; value.expires_at = 1100;
    auto& p = value.payment;
    p.nonce[0] = 2; p.semantic_digest[0] = 4; p.local_candidate_digest[0] = 5; p.candidate_hash[0] = 6;
    p.request_id = 8; p.host_sequence = 9; p.installment = 2;
    p.owner = 15702; p.loan = 0; p.update_count = 366; p.game_time = 4000;
    return value;
}
void OpenInitialized(tf3loanresume::Authority& gate, tf3loanresume::World* world) {
    ticks = 1000;
    Require(gate.OpenWorld(Epoch(), 0, world), "due fixture opens");
    const auto resume = Grant(*world);
    Require(gate.Arm(resume) && Consume(gate, resume), "due fixture consumes initialization");
}
void DueChecks() {
    using tf3loanresume::Authority;
    using tf3loanresume::World;
    {
        Authority gate(Clock); World world{};
        Require(!gate.ArmDue(Due(world)) && !gate.ConsumeDue(world, Due(world).payment), "closed due denies");
        Require(gate.OpenWorld(Epoch(), 0, &world), "due purpose fixture open");
        auto due = Due(world); const auto resume = Grant(world);
        Require(!gate.ArmDue(due), "uninitialized world denies due");
        Require(gate.Arm(resume) && !gate.ArmDue(due), "pending initialization denies due");
        Require(!gate.ConsumeDue(world, due.payment) && Consume(gate, resume), "due cannot consume initialization");
        Require(gate.ArmDue(due) && !gate.ArmDue(due), "due arms separately once");
        Require(!Consume(gate, resume) && !gate.Arm(resume), "due cannot renew resume");
        ticks = 1100;
        Require(gate.ConsumeDue(world, due.payment), "due accepts exact native deadline");
        Require(!gate.ConsumeDue(world, due.payment) && !gate.ArmDue(due), "completed due never repeats");
        ++due.payment.installment; ++due.payment.request_id; ++due.payment.host_sequence;
        Require(!gate.ArmDue(due), "next installment requires another world");
    }
    for (unsigned field = 0; field < 20; ++field) {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        auto invalid = Due(world);
        switch (field) {
        case 0: invalid.payment.nonce = {}; break;
        case 1: invalid.payment.semantic_digest = {}; break;
        case 2: invalid.payment.local_candidate_digest = {}; break;
        case 3: invalid.payment.request_id = 0; break;
        case 4: invalid.payment.host_sequence = 2147483648ULL; break;
        case 5: invalid.payment.installment = 0; break;
        case 6: invalid.payment.owner = 0; break;
        case 7: invalid.payment.loan = 2147483647u; break;
        case 8: invalid.payment.update_count = 2147483648ULL; break;
        case 9: invalid.payment.game_time = 2147483648ULL; break;
        case 10: invalid.expires_at = 999; break;
        case 11: invalid.expires_at = 6001; break;
        case 12: ++invalid.world.generation; break;
        case 13: ++invalid.world.epoch[1]; break;
        case 14: ++invalid.payment.nonce[1]; break;
        case 15: invalid.payment.candidate_hash = {}; break;
        case 16: invalid.payment.request_id = 2147483648ULL; break;
        case 17: invalid.payment.installment = 2147483648ULL; break;
        case 18: ++invalid.payment.owner; break;
        case 19: ++invalid.payment.loan; break;
        }
        Require(!gate.ArmDue(invalid), "invalid due arm denied");
    }
    for (unsigned field = 0; field < 15; ++field) {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        const auto due = Due(world); Require(gate.ArmDue(due), "due mismatch fixture arms");
        auto observed = due.payment; auto observed_world = world;
        switch (field) {
        case 0: ++observed.nonce[1]; break;
        case 1: ++observed.semantic_digest[1]; break;
        case 2: ++observed.local_candidate_digest[1]; break;
        case 3: ++observed.request_id; break;
        case 4: ++observed.host_sequence; break;
        case 5: ++observed.installment; break;
        case 6: ++observed.owner; break;
        case 7: ++observed.loan; break;
        case 8: ++observed.update_count; break;
        case 9: ++observed.game_time; break;
        case 10: ++observed_world.generation; break;
        case 11: ++observed_world.epoch[1]; break;
        case 12: ticks = 1101; break;
        case 13: ticks = 999; break;
        case 14: ++observed.candidate_hash[1]; break;
        }
        Require(!gate.ConsumeDue(observed_world, observed), "fresh due mismatch or deadline denies");
        ticks = 1000;
        Require(!gate.ConsumeDue(world, due.payment) && !gate.ArmDue(due), "failed due consumption stays spent");
    }
    {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        const auto due = Due(world); Require(gate.ArmDue(due), "due concurrent arm");
        std::atomic<unsigned> accepted{0};
        std::thread first([&] { if (gate.ConsumeDue(world, due.payment)) ++accepted; });
        std::thread second([&] { if (gate.ConsumeDue(world, due.payment)) ++accepted; });
        first.join(); second.join();
        Require(accepted == 1, "due concurrent consumers accept exactly once");
        const auto transition = gate.Invalidate();
        Require(!gate.ConsumeDue(world, due.payment) && !gate.ArmDue(due), "due lifecycle invalidation");
        World next{}; Require(gate.OpenWorld(Epoch(), transition, &next), "next due world opens");
        auto resume = Grant(next); Require(gate.Arm(resume) && Consume(gate, resume), "new world initialization");
        Require(!gate.ArmDue(due), "old due grant cannot cross generation");
        const auto fresh = Due(next);
        Require(gate.ArmDue(fresh) && gate.ConsumeDue(next, fresh.payment), "new world separate due permission");
    }
    for (unsigned i = 0; i < 64; ++i) {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        const auto due = Due(world); Require(gate.ArmDue(due), "due close race arm");
        std::thread invalidate([&] { gate.Invalidate(); });
        std::thread consume([&] { gate.ConsumeDue(world, due.payment); });
        invalidate.join(); consume.join();
        Require(!gate.ConsumeDue(world, due.payment) && !gate.ArmDue(due), "due close race permanently fences");
    }
}
void FreshDueChecks() {
    using tf3loanresume::Authority;
    using tf3loanresume::World;
    {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        const auto due = Due(world);
        Require(!gate.CheckConsumedDue(world, due.payment), "unarmed due cannot validate as consumed");
        Require(gate.ArmDue(due), "fresh due fixture arms");
        Require(!gate.CheckConsumedDue(world, due.payment) && gate.ConsumeDue(world, due.payment),
            "validation before consumption neither grants nor spends due");
        Require(gate.CheckConsumedDue(world, due.payment), "consumed due validates at native time");
        ticks = 1050;
        Require(gate.CheckConsumedDue(world, due.payment) &&
            !gate.ConsumeDue(world, due.payment) && !gate.ArmDue(due),
            "repeat validation does not consume or rearm");
        ticks = 1100;
        Require(gate.CheckConsumedDue(world, due.payment), "fresh check accepts exact deadline");
    }
    for (unsigned mismatch = 0; mismatch < 2; ++mismatch) {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        const auto due = Due(world);
        Require(gate.ArmDue(due) && gate.ConsumeDue(world, due.payment), "mismatch fixture consumes");
        auto observed = due.payment; auto observed_world = world;
        if (mismatch == 0) ++observed.host_sequence;
        else ++observed_world.generation;
        Require(!gate.CheckConsumedDue(observed_world, observed), "post-consumption mismatch revokes");
        Require(!gate.CheckConsumedDue(world, due.payment) && !gate.ArmDue(due),
            "correct values cannot revive mismatched due");
    }
    for (unsigned failure = 0; failure < 2; ++failure) {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        const auto due = Due(world);
        Require(gate.ArmDue(due) && gate.ConsumeDue(world, due.payment), "native-clock fixture consumes");
        ticks = failure == 0 ? 1101 : 1020;
        if (failure == 1)
            Require(gate.CheckConsumedDue(world, due.payment), "later accepted check advances clock floor");
        if (failure == 1) ticks = 1019;
        Require(!gate.CheckConsumedDue(world, due.payment), "expiry or native-clock rollback revokes");
        ticks = 1050;
        Require(!gate.CheckConsumedDue(world, due.payment), "later valid clock cannot revive due");
    }
    {
        Authority gate(Clock); World world{}; OpenInitialized(gate, &world);
        const auto due = Due(world);
        Require(gate.ArmDue(due) && gate.ConsumeDue(world, due.payment), "invalidation fixture consumes");
        gate.Invalidate();
        Require(!gate.CheckConsumedDue(world, due.payment), "lifecycle invalidation denies later check");
    }
}
}
int main(int argc, char**) {
    if (argc != 1) return 2;
    try {
        using tf3loanresume::Authority;
        using tf3loanresume::World;
        Authority gate(Clock); World world{}; std::uint64_t transition = 0;
        Require(!gate.OpenWorld({}, transition, &world) && !gate.OpenWorld(Epoch(), transition, nullptr), "invalid world");
        Require(gate.OpenWorld(Epoch(), transition, &world), "open native world");
        auto grant = Grant(world);
        Require(!Consume(gate, grant), "unarmed denies");
        auto bad = grant; bad.owner = 0;
        Require(!Arm(gate, bad, 1000), "invalid owner denies");
        bad = grant; bad.expires_at = 61001;
        Require(!Arm(gate, bad, 1000), "bounded native deadline");
        bad = grant; bad.world.generation++;
        Require(!Arm(gate, bad, 1000), "wrong generation denies");
        Require(Arm(gate, grant, 1000), "arm once");
        Require(!Arm(gate, grant, 1000) && !gate.OpenWorld(Epoch(), transition, &world), "no replacement of pending arm");
        bad = grant; bad.nonce[1] = 1;
        Require(!Consume(gate, bad), "foreign nonce denies");
        bad = grant; bad.digest[1] = 1;
        Require(!Consume(gate, bad), "foreign digest denies");
        bad = grant; bad.owner = 28619;
        Require(!Consume(gate, bad), "foreign company denies");
        bad = grant; bad.loan = 1;
        Require(!Consume(gate, bad), "foreign loan denies");
        Require(Consume(gate, grant, 1100), "exact deadline accepted");
        Require(!Consume(gate, grant) && !Arm(gate, grant, 1000), "consumed cannot retry or rearm");
        transition = gate.Invalidate();
        Require(!Consume(gate, grant) && !Arm(gate, grant, 1000), "invalidated world denies consume and publication");
        Require(gate.OpenWorld(Epoch(), transition, &world) && world.generation > grant.world.generation,
            "same epoch new native generation");
        Require(!Arm(gate, grant, 1000), "saved grant cannot reactivate");
        grant = Grant(world);
        Require(Arm(gate, grant, 1000) && !Consume(gate, grant, 1101) && !Consume(gate, grant, 1000),
            "expiry irreversibly revokes");
        Require(!gate.OpenWorld(Epoch(), transition, &world), "expiry is not a world transition");
        transition = gate.Invalidate(); Require(gate.OpenWorld(Epoch(), transition, &world), "open after invalidation");
        grant = Grant(world);
        Require(Arm(gate, grant, 1000) && !Consume(gate, grant, 999) && !Consume(gate, grant, 1000)
            && !gate.OpenWorld(Epoch(), transition, &world), "backward clock revokes without world reopen");
        const auto stale_transition = gate.Invalidate(); transition = gate.Invalidate();
        Require(!gate.OpenWorld(Epoch(), stale_transition, &world), "stale load completion cannot open world");
        Require(gate.OpenWorld(Epoch(), transition, &world), "new world before concurrent arm");
        grant = Grant(world); Require(Arm(gate, grant, 1000), "concurrent arm");
        std::atomic<unsigned> accepted{0};
        std::thread first([&] { if (Consume(gate, grant)) ++accepted; });
        std::thread second([&] { if (Consume(gate, grant)) ++accepted; });
        first.join(); second.join();
        Require(accepted == 1, "two concurrent consumers accept exactly once");
        for (unsigned i = 0; i < 64; ++i) {
            Authority race(Clock); World race_world{};
            if (!race.OpenWorld(Epoch(), 0, &race_world)) throw std::runtime_error("race world");
            auto race_grant = Grant(race_world);
            if (!Arm(race, race_grant, 1000)) throw std::runtime_error("race arm");
            std::thread invalidate([&] { race.Invalidate(); });
            std::thread consume([&] { Consume(race, race_grant); });
            invalidate.join(); consume.join();
            if (Consume(race, race_grant) || Arm(race, race_grant, 1000))
                throw std::runtime_error("race leaves no live permission");
        }
        ++cases;
        clock_entered = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        clock_release = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        waiter_entered = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        Require(clock_entered && clock_release && waiter_entered, "owned expiry barriers");
        Authority waiting(BlockingClock); World waiting_world{};
        Require(waiting.OpenWorld(Epoch(), 0, &waiting_world), "expiry-wait world");
        auto waiting_grant = Grant(waiting_world);
        Require(Arm(waiting, waiting_grant, 1000), "expiry-wait arm");
        auto foreign_nonce = waiting_grant.nonce; foreign_nonce[1] = 1;
        block_clock = true;
        std::atomic<bool> first_accepted{false}, waiter_accepted{false};
        std::thread holding([&] {
            first_accepted = waiting.Consume(waiting_world, foreign_nonce, waiting_grant.digest,
                waiting_grant.owner, waiting_grant.loan);
        });
        const auto entered_result = WaitForSingleObject(clock_entered, 2000);
        if (entered_result != WAIT_OBJECT_0) {
            SetEvent(clock_release); holding.join();
            throw std::runtime_error("expiry holder not entered");
        }
        std::thread waiter([&] {
            SetEvent(waiter_entered);
            waiter_accepted = waiting.Consume(waiting_world, waiting_grant.nonce, waiting_grant.digest,
                waiting_grant.owner, waiting_grant.loan);
        });
        const auto waiter_result = WaitForSingleObject(waiter_entered, 2000);
        ticks = 1101; SetEvent(clock_release);
        holding.join(); waiter.join();
        Require(waiter_result == WAIT_OBJECT_0 && clock_wait == WAIT_OBJECT_0 && clock_reads == 3 &&
            !first_accepted && !waiter_accepted, "waiting consumer samples clock after serialized deadline");
        Require(!Consume(waiting, waiting_grant, 1000) && !waiting.OpenWorld(Epoch(), 0, &waiting_world),
            "waiting expiry remains revoked");
        CloseHandle(clock_entered); CloseHandle(clock_release); CloseHandle(waiter_entered);
        DueChecks();
        FreshDueChecks();
        printf("{\"scope\":\"loan-resume-authority-owned\",\"cases\":%u,\"invalidationRaces\":64,"
            "\"dueInvalidationRaces\":64,\"passed\":true,\"activationPermitted\":false,\"tf3Qualified\":false}\n", cases);
        return 0;
    } catch (const std::exception& e) { fprintf(stderr, "loan_resume_authority_failed: %s\n", e.what()); return 1; }
}
