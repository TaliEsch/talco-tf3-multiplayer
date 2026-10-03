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
        printf("{\"scope\":\"loan-resume-authority-owned\",\"cases\":%u,\"invalidationRaces\":64,"
            "\"passed\":true,\"activationPermitted\":false,\"tf3Qualified\":false}\n", cases);
        return 0;
    } catch (const std::exception& e) { fprintf(stderr, "loan_resume_authority_failed: %s\n", e.what()); return 1; }
}
