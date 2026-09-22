#include "inprocess_gate_control.h"

#include <atomic>
#include <iostream>
#include <thread>

using namespace inprocess_gate;

namespace {
constexpr std::uint64_t kSecret = 0x7a91d4c2e851063bULL;

bool CycleAndStale() {
    GateControl gate(kSecret);
    if (gate.RequestHold() != Result::accepted ||
        gate.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto first = gate.Read().boundary_generation;
    if (gate.RequestRelease(first) != Result::accepted ||
        gate.WaitForRelease(first) != OwnerResult::release_consumed ||
        gate.ConfirmReleaseReturned(first) != Result::accepted ||
        gate.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto second = gate.Read();
    return second.boundary_generation == first + 1 &&
        second.release_applied_generation == first &&
        gate.RequestRelease(first) == Result::stale_generation &&
        gate.RequestRelease(second.boundary_generation) == Result::accepted;
}

bool CancelAndConcurrentHalt() {
    GateControl gate(kSecret);
    gate.RequestHold();
    if (gate.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto generation = gate.Read().boundary_generation;
    if (gate.RequestRelease(generation) != Result::accepted) return false;
    std::atomic<int> accepted{0};
    std::thread first([&] { if (gate.HaltOrDisconnect() == Result::accepted) ++accepted; });
    std::thread second([&] { if (gate.HaltOrDisconnect() == Result::accepted) ++accepted; });
    first.join();
    second.join();
    const auto snapshot = gate.Read();
    return accepted == 2 && snapshot.state == State::terminal_parked &&
        snapshot.cancelled_generation == generation && snapshot.halt_requested &&
        gate.WaitForRelease(generation) == OwnerResult::terminal_parked;
}

bool ForeignDuringConsumedAdvance() {
    GateControl gate(kSecret);
    gate.RequestHold();
    if (gate.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto generation = gate.Read().boundary_generation;
    if (gate.RequestRelease(generation) != Result::accepted ||
        gate.WaitForRelease(generation) != OwnerResult::release_consumed) return false;
    std::atomic<OwnerResult> result{OwnerResult::observing};
    std::thread foreign([&] { result.store(gate.EnterOwnerBoundary()); });
    foreign.join();
    if (result != OwnerResult::faulted || gate.Read().state != State::release_returning ||
        !gate.Read().halt_requested || !gate.Read().owner_in_gate ||
        gate.ConfirmReleaseReturned(generation) != Result::accepted) return false;
    return gate.Read().state == State::release_consumed &&
        gate.Read().halt_requested && !gate.Read().owner_in_gate &&
        gate.EnterOwnerBoundary() == OwnerResult::terminal_parked &&
        gate.Read().release_applied_generation == generation;
}

bool RunningHalt() {
    GateControl gate(kSecret);
    if (gate.HaltOrDisconnect() != Result::accepted) return false;
    const auto requested = gate.Read();
    return requested.state == State::terminal_requested &&
        !requested.owner_in_gate && requested.halt_requested &&
        gate.RequestHold() == Result::terminal &&
        gate.RequestRelease(0) == Result::terminal &&
        gate.EnterOwnerBoundary() == OwnerResult::terminal_parked &&
        gate.Read().boundary_generation == 1 && gate.Read().owner_in_gate;
}

bool DetachBeforeReturn() {
    GateControl gate(kSecret);
    gate.RequestHold();
    if (gate.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto generation = gate.Read().boundary_generation;
    if (gate.PrepareDetach(kSecret ^ 1, generation) != Result::authentication_failed ||
        gate.PrepareDetach(kSecret, generation + 1) != Result::stale_generation ||
        gate.PrepareDetach(kSecret, generation) != Result::accepted ||
        gate.ConfirmExternalByteRestored(generation + 1) != Result::protocol_error ||
        gate.ConfirmExternalByteRestored(generation) != Result::accepted ||
        gate.WaitForRelease(generation) != OwnerResult::detach_confirmed ||
        gate.OwnerExitGate(generation) != Result::accepted) return false;
    const auto returning = gate.Read();
    std::atomic<Result> foreign{Result::accepted};
    std::thread other([&] { foreign.store(gate.ConfirmOwnerExitedGate(generation)); });
    other.join();
    return returning.state == State::detach_returning && returning.owner_in_gate &&
        foreign == Result::wrong_owner &&
        gate.ConfirmOwnerExitedGate(generation) == Result::accepted &&
        gate.Read().state == State::detached && !gate.Read().owner_in_gate &&
        gate.EnterOwnerBoundary() == OwnerResult::observing;
}

bool HaltDetachRacePolicy() {
    GateControl beforeRestore(kSecret);
    beforeRestore.RequestHold();
    if (beforeRestore.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto first = beforeRestore.Read().boundary_generation;
    if (beforeRestore.PrepareDetach(kSecret, first) != Result::accepted ||
        beforeRestore.HaltOrDisconnect() != Result::accepted ||
        beforeRestore.Read().state != State::terminal_parked ||
        beforeRestore.ConfirmExternalByteRestored(first) != Result::protocol_error ||
        beforeRestore.WaitForRelease(first) != OwnerResult::terminal_parked) return false;

    GateControl afterRestore(kSecret);
    afterRestore.RequestHold();
    if (afterRestore.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto second = afterRestore.Read().boundary_generation;
    if (afterRestore.PrepareDetach(kSecret, second) != Result::accepted ||
        afterRestore.ConfirmExternalByteRestored(second) != Result::accepted ||
        afterRestore.HaltOrDisconnect() != Result::accepted ||
        afterRestore.Read().state != State::terminal_parked ||
        afterRestore.WaitForRelease(second) != OwnerResult::terminal_parked) return false;

    GateControl alreadyReturning(kSecret);
    alreadyReturning.RequestHold();
    if (alreadyReturning.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto third = alreadyReturning.Read().boundary_generation;
    if (alreadyReturning.PrepareDetach(kSecret, third) != Result::accepted ||
        alreadyReturning.ConfirmExternalByteRestored(third) != Result::accepted ||
        alreadyReturning.WaitForRelease(third) != OwnerResult::detach_confirmed ||
        alreadyReturning.OwnerExitGate(third) != Result::accepted ||
        alreadyReturning.HaltOrDisconnect() != Result::protocol_error ||
        alreadyReturning.ConfirmOwnerExitedGate(third) != Result::accepted) return false;
    return alreadyReturning.Read().state == State::detached;
}

bool ConcurrentRelease() {
    GateControl gate(kSecret);
    gate.RequestHold();
    if (gate.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto generation = gate.Read().boundary_generation;
    std::atomic<int> winners{0};
    std::thread first([&] { if (gate.RequestRelease(generation) == Result::accepted) ++winners; });
    std::thread second([&] { if (gate.RequestRelease(generation) == Result::accepted) ++winners; });
    first.join();
    second.join();
    return winners == 1;
}

bool GenerationAliasesAndNestedEntry() {
    GateControl gate(kSecret);
    gate.RequestHold();
    if (gate.EnterOwnerBoundary() != OwnerResult::held) return false;
    const auto generation = gate.Read().boundary_generation;
    constexpr std::uint64_t alias = 1ULL << 56;
    if (gate.RequestRelease(generation + alias) != Result::stale_generation ||
        gate.PrepareDetach(kSecret, generation + alias) != Result::stale_generation) return false;
    const auto nested = gate.EnterOwnerBoundary();
    return nested == OwnerResult::faulted &&
        gate.Read().state == State::terminal_parked && gate.Read().halt_requested;
}

bool AtomicFaultAdmissionRaces() {
    for (int iteration = 0; iteration != 256; ++iteration) {
        GateControl release(kSecret);
        release.RequestHold();
        if (release.EnterOwnerBoundary() != OwnerResult::held) return false;
        const auto generation = release.Read().boundary_generation;
        std::atomic<bool> go{false};
        std::atomic<Result> release_result{Result::protocol_error};
        std::atomic<Result> fault_result{Result::protocol_error};
        std::thread requester([&] {
            while (!go.load()) std::this_thread::yield();
            release_result.store(release.RequestRelease(generation));
        });
        std::thread fault([&] {
            while (!go.load()) std::this_thread::yield();
            fault_result.store(release.SignalBoundaryFault());
        });
        go.store(true);
        requester.join();
        fault.join();
        const auto release_snapshot = release.Read();
        if (fault_result != Result::accepted || !release_snapshot.halt_requested ||
            release_snapshot.state != State::terminal_parked ||
            release.WaitForRelease(generation) != OwnerResult::terminal_parked ||
            (release_result != Result::accepted && release_result != Result::terminal))
            return false;

        GateControl detach(kSecret);
        detach.RequestHold();
        if (detach.EnterOwnerBoundary() != OwnerResult::held) return false;
        const auto detach_generation = detach.Read().boundary_generation;
        go.store(false);
        std::atomic<Result> prepare_result{Result::protocol_error};
        fault_result.store(Result::protocol_error);
        std::thread preparer([&] {
            while (!go.load()) std::this_thread::yield();
            prepare_result.store(detach.PrepareDetach(kSecret, detach_generation));
        });
        std::thread detach_fault([&] {
            while (!go.load()) std::this_thread::yield();
            fault_result.store(detach.SignalBoundaryFault());
        });
        go.store(true);
        preparer.join();
        detach_fault.join();
        const auto detach_snapshot = detach.Read();
        if (fault_result != Result::accepted || !detach_snapshot.halt_requested ||
            detach_snapshot.state != State::terminal_parked ||
            detach.WaitForRelease(detach_generation) != OwnerResult::terminal_parked ||
            (prepare_result != Result::accepted && prepare_result != Result::terminal))
            return false;

        GateControl owner_exit(kSecret);
        owner_exit.RequestHold();
        if (owner_exit.EnterOwnerBoundary() != OwnerResult::held) return false;
        const auto exit_generation = owner_exit.Read().boundary_generation;
        if (owner_exit.PrepareDetach(kSecret, exit_generation) != Result::accepted ||
            owner_exit.ConfirmExternalByteRestored(exit_generation) != Result::accepted ||
            owner_exit.WaitForRelease(exit_generation) != OwnerResult::detach_confirmed)
            return false;
        go.store(false);
        fault_result.store(Result::protocol_error);
        std::thread exit_fault([&] {
            while (!go.load()) std::this_thread::yield();
            fault_result.store(owner_exit.SignalBoundaryFault());
        });
        go.store(true);
        const auto exit_result = owner_exit.OwnerExitGate(exit_generation);
        if (exit_result == Result::accepted) {
            const auto confirm_result = owner_exit.ConfirmOwnerExitedGate(exit_generation);
            exit_fault.join();
            if (fault_result != Result::protocol_error || confirm_result != Result::accepted ||
                owner_exit.Read().state != State::detached) return false;
        } else {
            exit_fault.join();
            if (exit_result != Result::protocol_error || fault_result != Result::accepted ||
                owner_exit.Read().state != State::terminal_parked ||
                owner_exit.WaitForRelease(exit_generation) != OwnerResult::terminal_parked)
                return false;
        }
    }
    return true;
}
}

int main(int argc, char**) {
    if (argc != 1) {
        std::cerr << "{\"activationPermitted\":false,\"error\":\"gate control host accepts no arguments\"}\n";
        return 2;
    }
    const auto cycle = CycleAndStale();
    const auto cancel = CancelAndConcurrentHalt();
    const auto foreign = ForeignDuringConsumedAdvance();
    const auto runningHalt = RunningHalt();
    const auto detach = DetachBeforeReturn();
    const auto detachRace = HaltDetachRacePolicy();
    const auto concurrent = ConcurrentRelease();
    const auto aliasNested = GenerationAliasesAndNestedEntry();
    const auto faultRaces = AtomicFaultAdmissionRaces();
    const auto passed = cycle && cancel && foreign && runningHalt && detach && detachRace &&
        concurrent && aliasNested && faultRaces;
    std::cout << std::boolalpha
        << "{\"scope\":\"owned-process-gate-control\",\"activationPermitted\":false,"
        << "\"productionLifecycleQualified\":false,\"passed\":" << passed
        << ",\"delayedAck\":" << cycle
        << ",\"repeatedSameOwnerBoundaries\":" << cycle
        << ",\"staleGenerationAba\":" << cycle
        << ",\"concurrentRelease\":" << concurrent
        << ",\"cancelBeforeConsumption\":" << cancel
        << ",\"concurrentHaltCancellation\":" << cancel
        << ",\"haltLatchedDuringReleaseReturn\":" << foreign
        << ",\"releaseFrameOccupancy\":" << foreign
        << ",\"foreignOwnerFaultClosed\":" << foreign
        << ",\"nestedOwnerFaultClosed\":" << aliasNested
        << ",\"generationAliasRejected\":" << aliasNested
        << ",\"atomicFaultAdmissionRaces\":" << faultRaces
        << ",\"unacknowledgedStop\":" << cancel
        << ",\"runningHaltNextBoundary\":" << runningHalt
        << ",\"detachBeforeReturn\":" << detach
        << ",\"foreignDetachConfirmationRejected\":" << detach
        << ",\"haltDetachRacePolicy\":" << detachRace
        << ",\"modeledOwnerDetach\":" << detach << "}\n";
    return passed ? 0 : 1;
}
