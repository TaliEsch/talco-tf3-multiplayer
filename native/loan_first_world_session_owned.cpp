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
        std::printf("{\"scope\":\"loan-first-world-session-owned\",\"checks\":%u,"
            "\"concurrentOpens\":32,\"passed\":true,\"tf3Qualified\":false,"
            "\"consumeExposed\":true,\"consumeCloseRaces\":32}\n", checks);
        return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "loan_first_world_session_failed: %s\n", error.what()); return 1;
    }
}
