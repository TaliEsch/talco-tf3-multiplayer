#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <atomic>
#include <cstdint>

// Owned-process control primitive.  It deliberately has no knowledge of TF3,
// code addresses, IPC, or exception handling.  A future qualified adapter may
// call Boundary() at one proven engine boundary; this component alone is not
// evidence that any game can safely be held.
namespace tf3inprocesscontrol {
enum class State : std::uint32_t {
    running, hold_requested, held, release_once, halted, stopped
};
enum class Result : std::uint32_t {
    accepted, already_held, already_pending, already_halted, stopped,
    timeout, invalid_transition
};
enum class BoundaryResult : std::uint32_t { advance, halt };
struct Snapshot {
    State state;
    bool held_ready;
    std::uint64_t hold_requests;
    std::uint64_t hold_acknowledged;
    std::uint64_t releases;
    std::uint64_t release_acknowledged;
    std::uint64_t halts;
    std::uint64_t halt_acknowledged;
};

class Control final {
public:
    Control() noexcept;
    Control(const Control&) = delete;
    Control& operator=(const Control&) = delete;

    // Called only from ordinary execution by the owner of a separately
    // qualified boundary. It must never run inside VEH or another exception
    // callback. It uses no heap, mutex, IPC, logging, or game-memory access.
    // While held it waits without consuming CPU; independent control traffic
    // can continue on a different thread. Mutation controls have one producer;
    // callers must not manufacture concurrent release requests.
    BoundaryResult Boundary() noexcept;
    Result Hold(DWORD timeout_ms) noexcept;
    Result ReleaseOne(DWORD timeout_ms) noexcept;
    Result Halt(DWORD timeout_ms) noexcept;
    // A transport disconnect is a fail-stop event, never an implicit release.
    Result Disconnect(DWORD timeout_ms) noexcept;
    Result Stop(DWORD timeout_ms) noexcept;
    Snapshot Read() const noexcept;

private:
    bool WaitForAtLeast(const std::atomic<std::uint64_t>& value,
                        std::uint64_t expected, DWORD timeout_ms) const noexcept;
    bool WaitForTrue(const std::atomic<bool>& value, DWORD timeout_ms) const noexcept;
    void Wake() noexcept;
    std::atomic<State> state_;
    std::atomic<bool> held_ready_;
    std::atomic<bool> halt_published_;
    std::atomic<bool> release_active_;
    std::atomic<std::uint64_t> hold_requests_;
    std::atomic<std::uint64_t> hold_acknowledged_;
    std::atomic<std::uint64_t> releases_;
    std::atomic<std::uint64_t> release_acknowledged_;
    std::atomic<std::uint64_t> halts_;
    std::atomic<std::uint64_t> halt_acknowledged_;
};
}  // namespace tf3inprocesscontrol
