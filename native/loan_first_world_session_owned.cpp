#include "loan_first_world_session.h"
#include <atomic>
#include <cstdio>
#include <stdexcept>
#include <thread>

namespace {
using tf3loanfirstworld::Identity;
using tf3loanfirstworld::Session;
using tf3loanresume::Authority;
using tf3loanresume::Epoch;
using tf3loanresume::Grant;
using tf3loanresume::World;
unsigned checks = 0;
std::atomic<std::uint64_t> native_ticks{1000};
std::uint64_t NativeClock() noexcept { return native_ticks.load(); }
void Check(bool value, const char* label) {
    if (!value) throw std::runtime_error(label);
    ++checks;
}
Epoch Authenticated() { Epoch value{}; value[0] = 17; return value; }
Identity Witness() { return {0x100000, 0x200000, 41}; }
Grant Permission(const World& world) {
    Grant value{};
    value.world = world; value.nonce[0] = 7; value.digest[0] = 9;
    value.owner = 12; value.loan = 100; value.expires_at = GetTickCount64() + 1000;
    return value;
}
bool Same(const World& a, const World& b) { return a.epoch == b.epoch && a.generation == b.generation; }
tf3loanresume::DueGrant DuePermission(const World& world) {
    tf3loanresume::DueGrant value{};
    value.world = world; value.expires_at = GetTickCount64() + 1000;
    auto& p = value.payment;
    p.nonce[0] = 7; p.semantic_digest[0] = 10; p.local_candidate_digest[0] = 11; p.candidate_hash[0] = 12;
    p.owner = 12; p.loan = 100; p.request_id = 2; p.host_sequence = 3; p.installment = 1;
    p.update_count = 366; p.game_time = 4000;
    return value;
}
void Initialize(Session& session, const Identity& current, World* world) {
    Check(session.Bind(Authenticated()) && session.ObserveLoan(current, world), "due session opens");
    const auto grant = Permission(*world);
    Check(session.Arm(grant) && session.Consume(current, grant.nonce, grant.digest, grant.owner, grant.loan),
        "due session consumes initialization");
}
void DueChecks() {
    const Identity current{0x100000, 0x200000, GetCurrentThreadId()};
    {
        Authority authority; Session session(authority); World world{};
        Check(!session.ArmDue(DuePermission(world)) && !session.ConsumeDue(current, DuePermission(world).payment),
            "unbound due cannot open session");
        Initialize(session, current, &world);
        auto due = DuePermission(world); auto wrong = due; ++wrong.world.generation;
        Check(!session.ArmDue(wrong), "due session rejects wrong generation");
        wrong = due; ++wrong.world.epoch[1];
        Check(!session.ArmDue(wrong), "due session rejects wrong epoch");
        Check(session.ArmDue(due), "due session arms after initialization");
        Check(session.ConsumeDue(current, due.payment), "fresh current-thread due consumes");
        Check(!session.ConsumeDue(current, due.payment) && !session.ArmDue(due), "due session cannot repeat");
        const auto resume = Permission(world);
        Check(!session.Arm(resume) && !session.Consume(current, resume.nonce, resume.digest, resume.owner, resume.loan),
            "due leaves initialization spent");
    }
    for (unsigned field = 0; field < 4; ++field) {
        Authority authority; Session session(authority); World world{};
        Initialize(session, current, &world);
        const auto due = DuePermission(world); Check(session.ArmDue(due), "due identity fixture arms");
        auto changed = current;
        if (field == 0) ++changed.game;
        if (field == 1) ++changed.manager;
        if (field == 2) ++changed.thread;
        bool consumed = false;
        if (field == 3) {
            // Even the unchanged admitted identity cannot be forwarded from a
            // worker: ConsumeDue compares against the actual current thread.
            std::thread other([&] { consumed = session.ConsumeDue(current, due.payment); });
            other.join();
        } else consumed = session.ConsumeDue(changed, due.payment);
        Check(!consumed && !session.CurrentWorld(&world) && !session.ArmDue(due)
            && !session.ConsumeDue(current, due.payment), "changed or forwarded due identity permanently closes");
    }
    for (unsigned reason = 0; reason < 3; ++reason) {
        Authority authority; Session session(authority); World world{};
        Initialize(session, current, &world);
        const auto due = DuePermission(world); Check(session.ArmDue(due), "due lifecycle fixture arms");
        if (reason == 0) session.OnJoin();
        if (reason == 1) session.OnIpcFailure();
        if (reason == 2) session.OnRegistrationFailure();
        Check(!session.ConsumeDue(current, due.payment) && !session.ArmDue(due)
            && !authority.ConsumeDue(world, due.payment) && !authority.ArmDue(due)
            && !session.CurrentWorld(&world), "all actual session close paths revoke due authority");
    }
    for (unsigned i = 0; i < 32; ++i) {
        Authority authority; Session session(authority);
        std::atomic<bool> ready{false}, start{false}, closed{false};
        bool initialized = false, armed = false, after_close = true;
        std::thread worker([&] {
            const Identity observed{0x100000, 0x200000, GetCurrentThreadId()}; World world{};
            initialized = session.Bind(Authenticated()) && session.ObserveLoan(observed, &world);
            const auto resume = Permission(world);
            initialized = initialized && session.Arm(resume) &&
                session.Consume(observed, resume.nonce, resume.digest, resume.owner, resume.loan);
            const auto due = DuePermission(world); armed = session.ArmDue(due); ready = true;
            while (!start.load()) std::this_thread::yield();
            session.ConsumeDue(observed, due.payment);
            while (!closed.load()) std::this_thread::yield();
            after_close = session.ConsumeDue(observed, due.payment) || session.ArmDue(due);
        });
        while (!ready.load()) std::this_thread::yield();
        start = true;
        if (i % 3 == 0) session.OnJoin();
        else if (i % 3 == 1) session.OnIpcFailure();
        else session.OnRegistrationFailure();
        closed = true; worker.join();
        Check(initialized && armed && !after_close, "due consume serialized against lifecycle closure");
    }
}
void FreshDueChecks() {
    auto arm = [](Session& session, const Identity& current, World* world) {
        native_ticks = 1000;
        Check(session.Bind(Authenticated()) && session.ObserveLoan(current, world),
            "fresh session opens");
        auto initial = Permission(*world); initial.expires_at = 1100;
        Check(session.Arm(initial) && session.Consume(current, initial.nonce, initial.digest,
            initial.owner, initial.loan), "fresh session initialization consumes");
        auto due = DuePermission(*world); due.expires_at = 1100;
        Check(session.ArmDue(due), "fresh session due arms");
        return due;
    };
    const Identity current{0x100000, 0x200000, GetCurrentThreadId()};
    {
        Authority authority(NativeClock); Session session(authority); World world{};
        const auto due = arm(session, current, &world);
        Check(!session.CheckConsumedDue(current, world, due.payment) &&
            session.ConsumeDue(current, due.payment), "pre-consumption check leaves due armed");
        Check(session.CheckConsumedDue(current, world, due.payment), "fresh session check succeeds");
        native_ticks = 1020;
        Check(session.CheckConsumedDue(current, world, due.payment) &&
            !session.ConsumeDue(current, due.payment), "repeat check does not consume twice");
        native_ticks = 1019;
        Check(!session.CheckConsumedDue(current, world, due.payment), "session forwards clock rollback");
        native_ticks = 1030;
        Check(!session.CheckConsumedDue(current, world, due.payment), "rollback stays denied");
    }
    for (unsigned mismatch = 0; mismatch < 4; ++mismatch) {
        Authority authority(NativeClock); Session session(authority); World world{};
        const auto due = arm(session, current, &world);
        Check(session.ConsumeDue(current, due.payment), "identity fixture consumes due");
        auto observed = current; auto expected = world;
        if (mismatch == 0) ++observed.game;
        if (mismatch == 1) ++observed.manager;
        if (mismatch == 2) ++observed.thread;
        if (mismatch == 3) ++expected.generation;
        Check(!session.CheckConsumedDue(observed, expected, due.payment) &&
            !session.CheckConsumedDue(current, world, due.payment) &&
            !session.CurrentWorld(&world), "world or identity mismatch closes spent session");
    }
    {
        Authority authority(NativeClock); Session session(authority); World world{};
        const auto due = arm(session, current, &world);
        Check(session.ConsumeDue(current, due.payment), "observation fixture consumes due");
        auto changed = due.payment; ++changed.request_id;
        Check(!session.CheckConsumedDue(current, world, changed) &&
            !session.CheckConsumedDue(current, world, due.payment),
            "wrong observation permanently revokes spent due");
    }
    {
        Authority authority(NativeClock); Session session(authority); World world{};
        const auto due = arm(session, current, &world);
        Check(session.ConsumeDue(current, due.payment), "thread fixture consumes due");
        bool forwarded = true;
        std::thread worker([&] { forwarded = session.CheckConsumedDue(current, world, due.payment); });
        worker.join();
        Check(!forwarded && !session.CheckConsumedDue(current, world, due.payment),
            "copied identity on another current thread permanently closes");
    }
    for (unsigned failure = 0; failure < 3; ++failure) {
        Authority authority(NativeClock); Session session(authority); World world{};
        const auto due = arm(session, current, &world);
        Check(session.ConsumeDue(current, due.payment), "close fixture consumes due");
        if (failure == 0) session.OnJoin();
        if (failure == 1) session.OnIpcFailure();
        if (failure == 2) session.OnRegistrationFailure();
        Check(!session.CheckConsumedDue(current, world, due.payment) &&
            !authority.CheckConsumedDue(world, due.payment), "lifecycle closes fresh due validation");
    }
}
}
int main() {
    try {
        {
            Authority authority; Session session(authority); World world{};
            Check(!session.CurrentWorld(&world) && !session.Arm(Permission(world)), "unbound read and arm denied");
            Check(session.Bind(Authenticated()), "authenticated bind");
            Check(!session.CurrentWorld(&world) && !session.Arm(Permission(world)), "bind does not open");
            Check(session.ObserveLoan(Witness(), &world) && world.generation == 1 &&
                world.epoch == Authenticated(), "first qualified witness opens transition zero");
            World again{};
            Check(session.ObserveLoan(Witness(), &again) && Same(world, again), "same witness cannot reopen");
            Check(session.CurrentWorld(&again) && Same(world, again), "read-only current world");
            auto wrong = Permission(world); ++wrong.world.generation;
            Check(!session.Arm(wrong), "changed world cannot arm");
            wrong = Permission(world); wrong.world.epoch[1] = 1;
            Check(!session.Arm(wrong), "changed epoch cannot arm");
            Check(session.Arm(Permission(world)), "valid world can arm once");
            Check(!session.Arm(Permission(world)), "authority denies replacement arm");
            auto changed = Witness(); ++changed.game;
            Check(!session.ObserveLoan(changed, &again), "game mismatch closes");
            Check(!session.CurrentWorld(&again) && !session.Arm(Permission(world)) &&
                !session.ObserveLoan(Witness(), &again) && !session.Bind(Authenticated()),
                "mismatch invalidates and permanently closes");
            Check(!authority.Arm(Permission(world)), "underlying authority invalidated");
            Check(!authority.OpenWorld(Authenticated(), 0, &again), "stale transition cannot reopen authority");
        }
        for (unsigned field = 0; field < 3; ++field) {
            Authority authority; Session session(authority); World world{};
            Check(session.Bind(Authenticated()) && session.ObserveLoan(Witness(), &world), "identity fixture open");
            auto changed = Witness();
            if (field == 0) ++changed.game;
            if (field == 1) ++changed.manager;
            if (field == 2) ++changed.thread;
            Check(!session.ObserveLoan(changed, &world) && !session.CurrentWorld(&world),
                "every identity field mismatch closes");
        }
        {
            Authority authority; Session session(authority); World world{};
            session.Close();
            Check(!session.Bind(Authenticated()) && !session.ObserveLoan(Witness(), &world),
                "close before bind permanent");
        }
        {
            Authority authority; Session session(authority); World world{};
            Check(session.Bind(Authenticated()), "bind before close");
            session.Close();
            Check(!session.ObserveLoan(Witness(), &world) && !session.CurrentWorld(&world),
                "close before first callback permanent");
        }
        {
            Authority authority; Session session(authority); World world{};
            Check(!session.Bind({}) && !session.Bind(Authenticated()) &&
                !session.ObserveLoan(Witness(), &world), "zero epoch fail closed");
        }
        {
            Authority authority; Session session(authority); World world{};
            Check(session.Bind(Authenticated()) && !session.Bind(Authenticated()) &&
                !session.ObserveLoan(Witness(), &world), "duplicate bind closes without opening");
        }
        {
            Authority authority; Session session(authority); World world{};
            Check(session.Bind(Authenticated()), "bind for invalid witness");
            Check(!session.ObserveLoan({}, &world) && !session.ObserveLoan(Witness(), &world),
                "invalid witness closes");
        }
        {
            Authority authority; Session session(authority); World world{};
            Check(session.Bind(Authenticated()), "bind for missing output");
            Check(!session.ObserveLoan(Witness(), nullptr) && !session.ObserveLoan(Witness(), &world),
                "missing output closes");
        }
        for (unsigned reason = 0; reason < 3; ++reason) {
            Authority authority; Session session(authority); World world{};
            Check(session.Bind(Authenticated()) && session.ObserveLoan(Witness(), &world),
                "lifecycle failure fixture open");
            auto grant = Permission(world);
            Check(session.Arm(grant), "lifecycle failure fixture arm");
            if (reason == 0) session.OnJoin();
            if (reason == 1) session.OnIpcFailure();
            if (reason == 2) session.OnRegistrationFailure();
            Check(!session.CurrentWorld(&world) && !session.Arm(grant) && !authority.Arm(grant) &&
                !session.ObserveLoan(Witness(), &world), "join IPC registration invalidate permanently");
            session.Close();
        }
        for (unsigned i = 0; i < 32; ++i) {
            Authority authority; Session session(authority); World first{}, second{};
            Check(session.Bind(Authenticated()), "parallel bind");
            std::atomic<unsigned> ready{0}; std::atomic<bool> start{false};
            bool a = false, b = false;
            std::thread one([&] { ++ready; while (!start.load()) std::this_thread::yield();
                a = session.ObserveLoan(Witness(), &first); });
            std::thread two([&] { ++ready; while (!start.load()) std::this_thread::yield();
                b = session.ObserveLoan(Witness(), &second); });
            while (ready.load() != 2) std::this_thread::yield();
            start = true; one.join(); two.join();
            Check(a && b && Same(first, second) && first.generation == 1,
                "concurrent same identity opens only once");
            session.Close();
            Check(!session.Arm(Permission(first)) && !session.CurrentWorld(&first),
                "post-close publication denied");
        }
        {
            Authority authority; Session session(authority); World world{};
            const Identity current{0x100000,0x200000,GetCurrentThreadId()};
            Check(!session.Consume(current,{}, {},12,100),"unbound consume cannot open");
            Check(session.Bind(Authenticated()) && session.ObserveLoan(current,&world),
                "current-thread consume fixture opens");
            const auto grant=Permission(world);
            Check(!session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan),
                "unarmed callback cannot consume");
            Check(session.Arm(grant),"consume fixture arms");
            Check(!session.Consume(current,grant.nonce,grant.digest,grant.owner+1,grant.loan),
                "wrong observed borrower denied");
            Check(!session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan+1),
                "wrong observed loan denied");
            Check(session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan),
                "current qualified identity consumes once");
            Check(!session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan)
                && !session.Arm(grant),"consumed cannot repeat or rearm");
            session.Close();
            Check(!session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan),
                "completed close denies consumption");
        }
        for (unsigned field=0;field<4;++field) {
            Authority authority; Session session(authority); World world{};
            Identity current{0x100000,0x200000,GetCurrentThreadId()};
            // Last case admits a non-current identity then tries to reuse it;
            // Session must independently check the actual invoking thread.
            if(field==3)++current.thread;
            Check(session.Bind(Authenticated()) && session.ObserveLoan(current,&world),
                "identity denial fixture opens");
            const auto grant=Permission(world);Check(session.Arm(grant),"identity denial fixture arms");
            auto changed=current;
            if(field==0)++changed.game;
            if(field==1)++changed.manager;
            if(field==2)++changed.thread;
            Check(!session.Consume(changed,grant.nonce,grant.digest,grant.owner,grant.loan)
                && !session.CurrentWorld(&world),"changed or non-current identity permanently closes");
            Check(!session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan),
                "identity failure cannot retry");
        }
        for(unsigned i=0;i<32;++i){
            Authority authority;Session session(authority);
            std::atomic<bool> ready{false},start{false},closed{false};
            bool opened=false,armed=false,consumed=false,afterClose=true;
            std::thread worker([&]{
                const Identity current{0x100000,0x200000,GetCurrentThreadId()};World world{};
                opened=session.Bind(Authenticated())&&session.ObserveLoan(current,&world);
                const auto grant=Permission(world);armed=session.Arm(grant);ready=true;
                while(!start.load())std::this_thread::yield();
                consumed=session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan);
                while(!closed.load())std::this_thread::yield();
                afterClose=session.Consume(current,grant.nonce,grant.digest,grant.owner,grant.loan);
            });
            while(!ready.load())std::this_thread::yield();
            start=true;
            if(i%3==0)session.OnJoin();
            else if(i%3==1)session.OnIpcFailure();
            else session.OnRegistrationFailure();
            closed=true;worker.join();
            Check(opened&&armed&&!afterClose,"serialized close always fences subsequent consume");
            (void)consumed; // Either race winner is valid; later success is not.
        }
        {
            Authority authority; Session session(authority); World world{};
            const Identity current{0x100000,0x200000,GetCurrentThreadId()};
            Check(!session.MatchesObservedWorld(current, world), "read-only witness cannot open unbound world");
            Check(session.Bind(Authenticated()), "read-only witness fixture binds");
            Check(!session.MatchesObservedWorld(current, world), "read-only witness cannot open bound world");
            Check(session.ObserveLoan(current, &world), "read-only witness fixture opens");
            const auto grant = Permission(world);
            Check(session.Arm(grant), "read-only witness fixture arms");
            Check(session.MatchesObservedWorld(current, world), "same original world identity matches");
            auto changed = current; ++changed.game;
            Check(!session.MatchesObservedWorld(changed, world), "changed game rejected without closing");
            changed = current; ++changed.manager;
            Check(!session.MatchesObservedWorld(changed, world), "changed manager rejected without closing");
            changed = current; ++changed.thread;
            Check(!session.MatchesObservedWorld(changed, world), "changed thread rejected without closing");
            auto stale = world; ++stale.generation;
            Check(!session.MatchesObservedWorld(current, stale), "stale generation rejected");
            stale = world; stale.epoch[0] ^= 1;
            Check(!session.MatchesObservedWorld(current, stale), "foreign epoch rejected");
            bool workerMatched = true;
            std::thread worker([&] { workerMatched = session.MatchesObservedWorld(current, world); });
            worker.join();
            Check(!workerMatched, "another invoking thread rejected even with copied witness");
            Check(session.MatchesObservedWorld(current, world), "rejected reads leave original session open");
            Check(session.Consume(current, grant.nonce, grant.digest, grant.owner, grant.loan),
                "read-only checks never spend armed permission");
            session.Close();
            Check(!session.MatchesObservedWorld(current, world), "closed world never matches old witness");
        }
        DueChecks();
        FreshDueChecks();
        std::printf("{\"scope\":\"loan-first-world-session-owned\",\"checks\":%u,"
            "\"concurrentOpens\":32,\"passed\":true,\"tf3Qualified\":false,"
            "\"consumeExposed\":true,\"consumeCloseRaces\":32,\"dueConsumeCloseRaces\":32,"
            "\"activationPermitted\":false}\n", checks);
        return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "loan_first_world_session_failed: %s\n", error.what()); return 1;
    }
}
