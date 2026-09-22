#include "inprocess_control.h"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <thread>

extern "C" void OwnedControlBoundaryMarker();
namespace {
using tf3inprocesscontrol::BoundaryResult;
using tf3inprocesscontrol::Control;
using tf3inprocesscontrol::Result;
using tf3inprocesscontrol::State;
void Require(bool value, const char* what) {
    if (!value) { std::fprintf(stderr, "FAIL: %s\n", what); std::exit(1); }
}
bool WaitFor(const std::atomic<std::uint64_t>& value, std::uint64_t minimum, DWORD timeout) {
    const ULONGLONG deadline = GetTickCount64() + timeout;
    while (value.load() < minimum && GetTickCount64() < deadline) Sleep(1);
    return value.load() >= minimum;
}
}

int wmain() {
    OwnedControlBoundaryMarker();
    Control control;
    std::atomic<bool> exited{false};
    std::atomic<std::uint64_t> iterations{0};
    std::atomic<std::uint64_t> traffic{0};
    std::thread worker([&] {
        for (;;) {
            if (control.Boundary() == BoundaryResult::halt) break;
            iterations.fetch_add(1, std::memory_order_release);
        }
        exited.store(true, std::memory_order_release);
    });
    std::thread traffic_thread([&] {
        while (!exited.load(std::memory_order_acquire)) {
            traffic.fetch_add(1, std::memory_order_relaxed);
            Sleep(1);
        }
    });
    Require(WaitFor(iterations, 20, 2000), "worker starts");
    Require(control.Hold(2000) == Result::accepted, "hold acknowledged at boundary");
    const auto held = control.Read();
    Require(held.state == State::held && held.hold_requests == 1 && held.hold_acknowledged == 1,
            "held snapshot");
    const auto paused = iterations.load();
    const auto traffic_before = traffic.load();
    Sleep(80);
    Require(iterations.load() == paused, "worker remains stopped while held");
    Require(traffic.load() > traffic_before, "control traffic keeps running while worker held");
    Require(control.Hold(10) == Result::already_held, "duplicate hold rejected");
    Require(control.ReleaseOne(2000) == Result::accepted, "one release acknowledged");
    Require(WaitFor(iterations, paused + 1, 2000), "one released boundary advances");
    Sleep(80);
    Require(iterations.load() == paused + 1 && control.Read().state == State::held,
            "exactly one boundary then held again");
    Require(control.ReleaseOne(2000) == Result::accepted, "second release acknowledged");
    Require(WaitFor(iterations, paused + 2, 2000), "second release advances");
    Sleep(40);
    Require(iterations.load() == paused + 2, "second release not replayed");
    Require(control.Disconnect(2000) == Result::accepted, "disconnect halts worker");
    const ULONGLONG exit_deadline = GetTickCount64() + 2000;
    while (!exited.load() && GetTickCount64() < exit_deadline) Sleep(1);
    Require(exited.load(), "halt observed by worker");
    Require(control.ReleaseOne(10) == Result::already_halted, "out-of-order release rejected after halt");
    Require(control.Halt(10) == Result::already_halted, "duplicate halt idempotent");
    worker.join(); traffic_thread.join();

    Control concurrent;
    std::atomic<bool> concurrent_exit{false};
    std::thread concurrent_worker([&] {
        while (concurrent.Boundary() == BoundaryResult::advance) {}
        concurrent_exit.store(true, std::memory_order_release);
    });
    Result first = Result::invalid_transition, second = Result::invalid_transition;
    std::thread first_control([&] { first = concurrent.Hold(2000); });
    std::thread second_control([&] { second = concurrent.Hold(2000); });
    first_control.join(); second_control.join();
    Require((first == Result::accepted && (second == Result::already_held || second == Result::already_pending)) ||
            (second == Result::accepted && (first == Result::already_held || first == Result::already_pending)),
            "concurrent holds admit exactly one request");
    Require(concurrent.Halt(2000) == Result::accepted, "concurrent fixture halt");
    const ULONGLONG concurrent_deadline = GetTickCount64() + 2000;
    while (!concurrent_exit.load() && GetTickCount64() < concurrent_deadline) Sleep(1);
    Require(concurrent_exit.load(), "concurrent worker halts");
    concurrent_worker.join();

    Control timeout;
    Require(timeout.Hold(10) == Result::timeout, "hold without boundary times out fail-closed");
    Require(timeout.ReleaseOne(10) == Result::already_pending, "release before held rejected");
    Require(timeout.Halt(10) == Result::timeout, "halt without boundary reports unacknowledged");
    Require(timeout.Stop(10) == Result::timeout, "stop cannot promote an unacknowledged halt");
    std::thread halt_acknowledger([&] {
        Require(timeout.Boundary() == BoundaryResult::halt, "pending halt reaches terminal boundary");
    });
    halt_acknowledger.join();
    Require(timeout.Stop(100) == Result::accepted, "stop follows an acknowledged halt");
    Require(timeout.Halt(10) == Result::stopped, "halt never reverses terminal stopped state");
    const auto final = control.Read();
    std::printf("owned-inprocess-control PASS held=1 exact-releases=2 traffic-while-held=1 disconnect-halt=1 duplicates=1 concurrency=1 timeout-fail-closed=1 state=%u\n",
        static_cast<unsigned>(final.state));
    return 0;
}
