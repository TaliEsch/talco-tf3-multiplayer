#include "loan_lifecycle_observation.h"
#include <cstdio>
#include <cstdlib>

namespace {
using namespace tf3loanlifecycle;
constexpr std::uint64_t Image = 0x140000000, Game = 0x100000, Manager = 0x200000;
constexpr std::uint32_t Caller = 17, Simulation = 29;
unsigned checks = 0;
void Check(bool result, const char* label) {
    ++checks;
    if (!result) { std::fprintf(stderr, "FAIL %s\n", label); std::exit(1); }
}
struct Memory {
    std::array<unsigned char, 0x1F8> game{};
    std::array<unsigned char, 0xB1> manager{};
    unsigned reads = 0, fail = 0, corrupt = 0;
    template<typename T> static void Put(unsigned char* where, T value) { std::memcpy(where, &value, sizeof(value)); }
    explicit Memory(bool before = true) {
        Put(game.data() + 0x1F0, Manager);
        if (before) { Put(manager.data() + 0xA0, std::uint64_t{0x123456}); Put(manager.data() + 0xA8, Simulation); }
        manager[0xB0] = before ? 0 : 1;
    }
    static bool Read(void* opaque, std::uint64_t address, void* out, std::size_t length) noexcept {
        auto& self = *static_cast<Memory*>(opaque);
        if (++self.reads == self.fail) return false;
        const unsigned char* source = nullptr;
        if (address >= Game && address - Game <= self.game.size() && length <= self.game.size() - (address - Game))
            source = self.game.data() + (address - Game);
        if (address >= Manager && address - Manager <= self.manager.size() && length <= self.manager.size() - (address - Manager))
            source = self.manager.data() + (address - Manager);
        if (!source) return false;
        std::memcpy(out, source, length);
        if (self.reads == self.corrupt) static_cast<unsigned char*>(out)[0] ^= 1;
        return true;
    }
};
CONTEXT Frame(std::size_t index) {
    CONTEXT value{};
    value.Rip = Image + Sites[index].rva; value.Rbx = Game; value.Rcx = Manager; value.Rax = 0xDEAD01;
    return value;
}
Observation Observe(std::size_t index) {
    Memory memory(Before(Sites[index].point));
    Observation output{};
    Check(Capture(Image, Frame(index), Caller, Memory::Read, &memory, &output) == Failure::none, "capture site");
    Check(output.game == Game && output.manager == Manager && output.event_thread == Caller &&
        output.point == Sites[index].point && memory.reads == 8, "capture identity and bounded reads");
    return output;
}
void Denies(CONTEXT context, Memory& memory, Failure expected, std::uint32_t caller = Caller, std::uint64_t image = Image) {
    Observation output{}; output.game = 0xBAD;
    Check(Capture(image, context, caller, Memory::Read, &memory, &output) == expected, "capture rejection reason");
    Check(output.game == 0xBAD, "no partial output");
}
Candidate Bound() { return {Game, Manager, Simulation}; }
void Rejected(Pairing& model, Failure reason) {
    Check(model.phase() == Phase::rejected && model.failure() == reason, "pair rejection reason");
    Pair output{}; output.before.game = 0xBAD;
    Check(!model.Finish(&output) && output.before.game == 0xBAD && model.failure() == reason, "rejection latched without output");
}
}
int main() {
    const auto before = Observe(0), destructor = Observe(1), after = Observe(2), destroyed = Observe(3);
    {
        Memory memory; auto context = Frame(0); ++context.Rip;
        Denies(context, memory, Failure::invalid_site);
    }
    for (auto index : {std::size_t{0}, std::size_t{1}}) {
        Memory a; auto context = Frame(index); context.Rax = 0;
        Denies(context, a, Failure::invalid_registers);
        Memory b; context = Frame(index); context.Rcx += 8;
        Denies(context, b, Failure::invalid_registers);
    }
    { Memory m; Denies(Frame(0), m, Failure::invalid_argument, 0); }
    { Memory m; Denies(Frame(0), m, Failure::invalid_thread, Simulation); }
    { Memory m; Memory::Put(m.manager.data() + 0xA8, std::uint32_t{0}); Denies(Frame(0), m, Failure::invalid_thread); }
    { Memory m; auto c = Frame(0); c.Rbx = 0; Denies(c, m, Failure::invalid_address); }
    { Memory m; auto c = Frame(0); c.Rbx = 0x7FFFFFFFFF00; Denies(c, m, Failure::invalid_address); }
    { Memory m; Memory::Put(m.game.data() + 0x1F0, std::uint64_t{0}); Denies(Frame(0), m, Failure::invalid_address); }
    { Memory m; Denies(Frame(0), m, Failure::invalid_address, Caller, 0xFFFFFFFFFFFFFFFF); }
    { Memory m; auto c = Frame(0); c.Rbx += 0x1000; Denies(c, m, Failure::read_failed); }
    for (unsigned ordinal = 1; ordinal <= 8; ++ordinal) {
        Memory m; m.fail = ordinal; Denies(Frame(0), m, Failure::read_failed);
    }
    for (unsigned ordinal = 5; ordinal <= 8; ++ordinal) {
        Memory m; m.corrupt = ordinal; Denies(Frame(0), m, Failure::changed_identity);
    }
    { Memory m; m.corrupt = 3; Denies(Frame(0), m, Failure::changed_identity); }
    for (std::size_t byte = 0; byte < 16; ++byte) {
        Memory m(false); m.manager[0xA0 + byte] = 1;
        Denies(Frame(2), m, Failure::thread_not_zero);
    }
    for (bool use_destructor : {false, true}) {
        Pairing model(Bound()); Pair result{};
        Check(model.Observe(use_destructor ? destructor : before), "pair before");
        Check(model.Observe(use_destructor ? destroyed : after), "pair after");
        Check(model.Finish(&result) && result.before.simulation_thread == Simulation &&
            result.after.simulation_thread == 0, "matched diagnostic pair");
        Check(!model.Observe(after), "duplicate return denied"); Rejected(model, Failure::duplicate);
    }
    { Pairing m(Bound()); Check(!m.Observe(after), "unmatched return"); Rejected(m, Failure::unmatched); }
    { Pairing m(Bound()); m.Observe(before); Check(!m.Observe(before), "duplicate before"); Rejected(m, Failure::duplicate); }
    { Pairing m(Bound()); m.Observe(before); Check(!m.Observe(destroyed), "different join path"); Rejected(m, Failure::mismatch); }
    for (unsigned field = 0; field < 3; ++field) {
        auto wrong = before;
        if (field == 0) wrong.game += 0x1000;
        if (field == 1) wrong.manager += 0x1000;
        if (field == 2) { ++wrong.simulation_thread; Memory::Put(wrong.thread_object.data() + 8, wrong.simulation_thread); }
        Pairing m(Bound()); Check(!m.Observe(wrong), "candidate identity mismatch"); Rejected(m, Failure::mismatch);
    }
    for (unsigned field = 0; field < 3; ++field) {
        auto wrong = after;
        if (field == 0) wrong.game += 0x1000;
        if (field == 1) wrong.manager += 0x1000;
        if (field == 2) ++wrong.event_thread;
        Pairing m(Bound()); m.Observe(before);
        Check(!m.Observe(wrong), "return identity mismatch"); Rejected(m, Failure::mismatch);
    }
    for (auto reason : {Failure::exception, Failure::thread_exit, Failure::zero_thread_exit,
        Failure::interrupted, Failure::read_failed, Failure::changed_identity}) {
        Pairing m(Bound()); m.Observe(before); m.Abort(reason);
        Check(!m.Observe(after), "interrupted return denied"); Rejected(m, reason);
    }
    { Pairing m(Bound()); Pair output{}; Check(!m.Finish(&output), "absent pair"); Rejected(m, Failure::missing_return); }
    { Pairing m(Bound()); m.Observe(before); Pair output{}; Check(!m.Finish(&output), "missing return"); Rejected(m, Failure::missing_return); }
    { Pairing m({Game, Manager, 0}); Rejected(m, Failure::invalid_argument); }
    { Pairing m(Bound()); auto malformed = after; malformed.thread_object[0] = 1;
      m.Observe(before); Check(!m.Observe(malformed), "synthetic malformed post rejected"); Rejected(m, Failure::invalid_argument); }
    std::printf("{\"fixture\":\"loan-lifecycle-observation-owned\",\"checks\":%u,\"passed\":true,\"engineCalls\":0,\"permission\":false}\n", checks);
    return 0;
}
