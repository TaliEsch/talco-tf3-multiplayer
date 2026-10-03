#pragma once
#include <windows.h>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace tf3loanlifecycle {
// Diagnostic evidence only. Caller must independently admit the exact 40408
// image/hash, instruction bytes and debug-event lifetime before using Capture.
// Retained addresses are correlation candidates, never a world generation.
enum class Point { stop_before, destructor_before, stop_after, destructor_after };
struct Site { Point point; std::uint32_t rva; std::array<unsigned char, 6> bytes; std::size_t size; };
inline constexpr std::array<Site, 4> Sites{{
    {Point::stop_before, 0x11F541, {0x86,0x81,0xB0,0,0,0}, 6},
    {Point::destructor_before, 0x11AD9C, {0x86,0x81,0xB0,0,0,0}, 6},
    {Point::stop_after, 0x11F5D0, {0xB9,0x08,0,0,0,0}, 5},
    {Point::destructor_after, 0x11AE14, {0xB9,0x08,0,0,0,0}, 5}
}};
using Reader = bool (*)(void*, std::uint64_t, void*, std::size_t) noexcept;
enum class Failure {
    none, invalid_argument, invalid_site, invalid_address, read_failed,
    changed_identity, invalid_registers, invalid_thread, thread_not_zero,
    unmatched, duplicate, mismatch, missing_return, exception, thread_exit,
    zero_thread_exit, interrupted
};
struct Observation {
    Point point = Point::stop_before;
    std::uint64_t game = 0;
    std::uint64_t manager = 0;
    std::uint32_t event_thread = 0;
    std::uint32_t simulation_thread = 0;
    unsigned char stop_flag = 0;
    std::array<unsigned char, 16> thread_object{};
};
inline bool Before(Point point) noexcept {
    return point == Point::stop_before || point == Point::destructor_before;
}
inline bool Address(std::uint64_t value, std::size_t length) noexcept {
    constexpr std::uint64_t last = 0x00007FFFFFFFFFFFULL;
    return length != 0 && value >= 0x10000 && value <= last && length - 1 <= last - value;
}
inline bool Zero(const std::array<unsigned char, 16>& value) noexcept {
    unsigned char aggregate = 0;
    for (auto byte : value) aggregate |= byte;
    return aggregate == 0;
}
inline std::uint32_t ObjectThread(const Observation& value) noexcept {
    std::uint32_t id = 0;
    std::memcpy(&id, value.thread_object.data() + 8, sizeof(id));
    return id;
}
inline bool WellFormed(const Observation& value) noexcept {
    if (!Address(value.game, 0x1F8) || !Address(value.manager, 0xB1) || !value.event_thread ||
        ObjectThread(value) != value.simulation_thread) return false;
    if (Before(value.point)) return value.simulation_thread != 0 && value.simulation_thread != value.event_thread;
    if (value.point != Point::stop_after && value.point != Point::destructor_after) return false;
    return Zero(value.thread_object) && value.simulation_thread == 0;
}

// No target calls, allocations, exception handlers or process APIs. Reader must
// return true only for an exact complete copy and must not throw. In an external
// observer all reads occur while its owned debug event remains pending.
inline Failure Capture(std::uint64_t image_base, const CONTEXT& context,
    std::uint32_t event_thread, Reader read, void* opaque, Observation* output) noexcept {
    if (!read || !output || !event_thread) return Failure::invalid_argument;
    if (!Address(image_base, 0x11F5D5)) return Failure::invalid_address;
    const Site* site = nullptr;
    for (const auto& candidate : Sites) {
        if (context.Rip == image_base + candidate.rva) { site = &candidate; break; }
    }
    if (!site) return Failure::invalid_site;
    // RBX remains the original CGame at all four sites. In the stop routine it
    // changes to CGame+1E8 only at 11F5EF, after the observed join return.
    Observation value{};
    value.point = site->point; value.game = context.Rbx; value.event_thread = event_thread;
    if (!Address(value.game, 0x1F8)) return Failure::invalid_address;
    if (!read(opaque, value.game + 0x1F0, &value.manager, sizeof(value.manager))) return Failure::read_failed;
    if (!Address(value.manager, 0xB1)) return Failure::invalid_address;
    if (Before(value.point) && ((context.Rax & 0xFF) != 1 || context.Rcx != value.manager))
        return Failure::invalid_registers;
    if (!read(opaque, value.manager + 0xA0, value.thread_object.data(), value.thread_object.size()) ||
        !read(opaque, value.manager + 0xA8, &value.simulation_thread, sizeof(value.simulation_thread)) ||
        !read(opaque, value.manager + 0xB0, &value.stop_flag, sizeof(value.stop_flag))) return Failure::read_failed;
    Observation again{};
    if (!read(opaque, value.game + 0x1F0, &again.manager, sizeof(again.manager))) return Failure::read_failed;
    if (again.manager != value.manager) return Failure::changed_identity;
    if (!read(opaque, value.manager + 0xA0, again.thread_object.data(), again.thread_object.size()) ||
        !read(opaque, value.manager + 0xA8, &again.simulation_thread, sizeof(again.simulation_thread)) ||
        !read(opaque, value.manager + 0xB0, &again.stop_flag, sizeof(again.stop_flag))) return Failure::read_failed;
    if (value.thread_object != again.thread_object || value.simulation_thread != again.simulation_thread ||
        value.stop_flag != again.stop_flag || ObjectThread(value) != value.simulation_thread)
        return Failure::changed_identity;
    if (Before(value.point)) {
        if (!value.simulation_thread || value.simulation_thread == event_thread) return Failure::invalid_thread;
    } else if (!Zero(value.thread_object) || value.simulation_thread) return Failure::thread_not_zero;
    // No output on failure. Flag is captured verbatim: these sites alone do not
    // prove all possible writers or that its pre/post value must be zero/one.
    *output = value;
    return Failure::none;
}

struct Candidate { std::uint64_t game = 0, manager = 0; std::uint32_t simulation_thread = 0; };
enum class Phase { awaiting_before, awaiting_after, complete, rejected };
struct Pair { Observation before{}, after{}; };
// Single diagnostic transaction. It cannot reopen, grant permission or infer
// reload identity, even when both addresses and the thread ID are reused.
class Pairing final {
    Candidate candidate_;
    Pair pair_{};
    Phase phase_ = Phase::awaiting_before;
    Failure failure_ = Failure::none;
    bool Reject(Failure why) noexcept {
        if (phase_ != Phase::rejected) { phase_ = Phase::rejected; failure_ = why; }
        return false;
    }
public:
    explicit Pairing(Candidate candidate) noexcept : candidate_(candidate) {
        if (!Address(candidate.game, 0x1F8) || !Address(candidate.manager, 0xB1) || !candidate.simulation_thread)
            Reject(Failure::invalid_argument);
    }
    Phase phase() const noexcept { return phase_; }
    Failure failure() const noexcept { return failure_; }
    bool Observe(const Observation& value) noexcept {
        if (phase_ == Phase::rejected) return false;
        if (phase_ == Phase::complete) return Reject(Failure::duplicate);
        if (!WellFormed(value)) return Reject(Failure::invalid_argument);
        if (value.game != candidate_.game || value.manager != candidate_.manager) return Reject(Failure::mismatch);
        if (phase_ == Phase::awaiting_before) {
            if (!Before(value.point)) return Reject(Failure::unmatched);
            if (value.simulation_thread != candidate_.simulation_thread) return Reject(Failure::mismatch);
            pair_.before = value; phase_ = Phase::awaiting_after; return true;
        }
        if (Before(value.point)) return Reject(Failure::duplicate);
        const auto expected = pair_.before.point == Point::stop_before ? Point::stop_after : Point::destructor_after;
        if (value.point != expected || value.event_thread != pair_.before.event_thread)
            return Reject(Failure::mismatch);
        pair_.after = value; phase_ = Phase::complete; return true;
    }
    // Controller must report observed exception/thread exit, failed read,
    // zero-thread bypass, timeout or lost event. Four sites alone cannot see a
    // bypass; ending the observation without a pair is always a failure.
    bool Abort(Failure why) noexcept { return Reject(why == Failure::none ? Failure::interrupted : why); }
    bool Finish(Pair* output) noexcept {
        if (phase_ != Phase::complete) return Reject(Failure::missing_return);
        if (!output) return Reject(Failure::invalid_argument);
        *output = pair_; return true;
    }
};
}
