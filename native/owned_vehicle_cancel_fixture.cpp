// Owned-only ABI fixture.  It never loads TF3 and has no activation, IPC, or
// engine object path.  The process owns every object used below.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <thread>

extern "C" {
extern unsigned char OwnedVehicleCancelMovSite;
void OwnedVehicleCancelExecute(void*, void*, void*, void*, void*);
}

namespace {
constexpr unsigned char kMovBytes[] = {0x48, 0x8b, 0xd3};
constexpr unsigned char kCallBytes[] = {0xff, 0x50, 0x10};
constexpr std::uint64_t kEntryShape = 0x454e545259534850ULL;
constexpr std::uint64_t kValueShape = 0x56414c5545534850ULL;
constexpr std::uint64_t kProgressShape = 0x50524f4753484150ULL;
constexpr std::uint64_t kImplMagic = 0x544633494d504c31ULL;

enum class Lifecycle : std::uint32_t { disabled, armed, claimed, completed, failed, revoked };
struct Entry { std::uint64_t identity = 0, shape = kEntryShape; };
struct Action;
struct Impl;
struct Value {
    std::byte padding[0x38]{};
    Impl* impl = nullptr;
    std::uint64_t identity = 0, shape = kValueShape;
};
static_assert(offsetof(Value, impl) == 0x38);
struct Vtable { void* unused[2]{}; void (*invoke)(Impl*, Entry*, Value*, void*) = nullptr; };
static_assert(offsetof(Vtable, invoke) == 0x10);
struct Impl { Vtable* vtable = nullptr; std::uint64_t magic = kImplMagic; };
struct Progress { Action* action = nullptr; std::uint64_t identity = 0, shape = kProgressShape; };

struct OwnedAllocation {
    std::atomic<int>* destructed;
    explicit OwnedAllocation(std::atomic<int>* counter) : destructed(counter) {}
    ~OwnedAllocation() { destructed->fetch_add(1, std::memory_order_relaxed); }
};
struct OwnedResources {
    std::atomic<int> destructed{0};
    std::atomic<bool> released{false};
    std::unique_ptr<OwnedAllocation> command;
    std::unique_ptr<OwnedAllocation> callback;
    std::unique_ptr<OwnedAllocation> progress;
    std::unique_ptr<OwnedAllocation> registry;
    OwnedResources() : command(new OwnedAllocation(&destructed)), callback(new OwnedAllocation(&destructed)),
        progress(new OwnedAllocation(&destructed)), registry(new OwnedAllocation(&destructed)) {}
    void ReleaseOnce() noexcept {
        if (released.exchange(true, std::memory_order_acq_rel)) return;
        command.reset(); callback.reset(); progress.reset(); registry.reset();
    }
    bool ReleasedExactlyOnce() const noexcept {
        return !command && !callback && !progress && !registry && destructed.load() == 4;
    }
};
struct Invocation;
struct Action {
    std::uint64_t identity = 0;
    OwnedResources resources{};
    std::atomic<int> submissions{0}, cancellations{0};
    std::atomic<int> value{77};
    std::atomic<bool> entered_cancel{false}, release_cancel{true};
    bool throw_from_cancel = false, callback_returns_false = false, force_post_claim_mismatch = false;
    std::atomic<std::uint8_t> callback_result{0};
    Invocation* nested = nullptr;
};
struct Invocation { Entry entry{}; Value value{}; Progress progress{}; };

struct ArmSpec {
    // Identifiers only.  Production-shaped state stores no pointer to an
    // engine entry, callback, or progress object.
    std::uint64_t entry_id = 0, value_id = 0, progress_id = 0, action_id = 0;
    ULONGLONG deadline = 0;
    std::atomic<Lifecycle> state{Lifecycle::disabled};
    std::atomic<Lifecycle> terminal{Lifecycle::disabled};
} arm;

struct PreparedAdmission {
    // This is stack-scoped, owned-fixture call metadata.  The VEH compares
    // register values only; it never dereferences any of these addresses.
    DWORD thread = 0;
    const Entry* entry = nullptr;
    const Value* value = nullptr;
    const Progress* progress = nullptr;
    const Impl* original_impl = nullptr;
    const Vtable* original_vtable = nullptr;
    bool valid = false;
};
thread_local PreparedAdmission prepared{};
struct PreparedScope {
    PreparedAdmission previous;
    explicit PreparedScope(Invocation& call);
    ~PreparedScope() { prepared = previous; }
};

std::atomic<LONG> handler_hits{0}, handler_depth{0};
PVOID handler = nullptr;
unsigned char original_byte = 0;
DWORD original_protection = 0;
bool patched = false;
Vtable submission_vtable{}, cancel_vtable{};
Impl submission_impl{&submission_vtable, kImplMagic};
Impl cancel_impl{&cancel_vtable, kImplMagic};

void Fail(const char* message) { std::fprintf(stderr, "FAIL: %s (win32=%lu)\n", message, GetLastError()); std::exit(1); }
void Require(bool value, const char* message) { if (!value) Fail(message); }
bool IsOwnedShape(const Entry* entry, const Value* value, const Progress* progress) noexcept {
    return entry && value && progress && progress->action && entry->shape == kEntryShape &&
        value->shape == kValueShape && value->impl == &submission_impl && progress->shape == kProgressShape;
}
bool MatchesArm(const Entry* entry, const Value* value, const Progress* progress) noexcept {
    return IsOwnedShape(entry, value, progress) && entry->identity == arm.entry_id &&
        value->identity == arm.value_id && progress->identity == arm.progress_id &&
        progress->action->identity == arm.action_id;
}
PreparedScope::PreparedScope(Invocation& call) : previous(prepared) {
    prepared = {GetCurrentThreadId(), &call.entry, &call.value, &call.progress, &submission_impl,
        &submission_vtable, IsOwnedShape(&call.entry, &call.value, &call.progress)};
}
void Release(Action* action) noexcept { if (action) action->resources.ReleaseOnce(); }
void __fastcall Submit(Impl*, Entry*, Value*, void* raw_progress) {
    auto* progress = static_cast<Progress*>(raw_progress);
    Require(progress && progress->action, "original owned target accepts progress");
    progress->action->submissions.fetch_add(1, std::memory_order_relaxed);
    progress->action->value.fetch_add(1, std::memory_order_relaxed);
    Release(progress->action);
}
void Complete(Lifecycle result) noexcept {
    arm.terminal.store(result, std::memory_order_release);
    arm.state.store(result, std::memory_order_release);
}
void Execute(Invocation& call) {
    PreparedScope scope(call);
    OwnedVehicleCancelExecute(&submission_impl, &call.entry, &call.value, &call.progress, &submission_vtable);
}
void __fastcall Cancel(Impl*, Entry* entry, Value* value, void* raw_progress) {
    auto* progress = static_cast<Progress*>(raw_progress);
    // This is a second identity/shape/progress check after target substitution.
    // A post-claim mismatch is unknown execution.  It must never retry the
    // original target because that could duplicate the mutation.
    const bool matches = MatchesArm(entry, value, progress) && progress && progress->action &&
        !progress->action->force_post_claim_mismatch;
    if (!matches) {
        Release(progress ? progress->action : nullptr);
        Complete(Lifecycle::failed);
        return;
    }
    Action* action = progress->action;
    action->cancellations.fetch_add(1, std::memory_order_relaxed);
    action->entered_cancel.store(true, std::memory_order_release);
    while (!action->release_cancel.load(std::memory_order_acquire)) Sleep(1);
    try {
        if (action->nested) Execute(*action->nested);
        if (action->throw_from_cancel) throw std::runtime_error("owned cancel callback fault");
        if (action->callback_returns_false) {
            action->callback_result.store(0, std::memory_order_release);
            Release(action);
            Complete(Lifecycle::failed);
            return;
        }
        action->callback_result.store(1, std::memory_order_release);
        Release(action);
        Complete(Lifecycle::completed);
    } catch (...) {
        Release(action);
        Complete(Lifecycle::failed);
        throw;
    }
}
Invocation MakeInvocation(Action& action, std::uint64_t entry, std::uint64_t value, std::uint64_t progress) {
    Invocation call{};
    call.entry.identity = entry;
    call.value.impl = &submission_impl;
    call.value.identity = value;
    call.progress.action = &action;
    call.progress.identity = progress;
    return call;
}
bool Arm(Invocation& call, DWORD timeout_ms) noexcept {
    if (!IsOwnedShape(&call.entry, &call.value, &call.progress) || arm.state.load(std::memory_order_acquire) != Lifecycle::disabled)
        return false;
    arm.entry_id = call.entry.identity; arm.value_id = call.value.identity;
    arm.progress_id = call.progress.identity; arm.action_id = call.progress.action->identity;
    arm.deadline = GetTickCount64() + timeout_ms;
    arm.terminal.store(Lifecycle::disabled, std::memory_order_relaxed);
    arm.state.store(Lifecycle::armed, std::memory_order_release);
    return true;
}
// This private reset is only reachable from the fixture's own test driver.
// It is intentionally not part of Start/Stop or any production-shaped API.
bool ResetForNextOwnedTest() noexcept {
    const auto current = arm.state.load(std::memory_order_acquire);
    if (current != Lifecycle::completed && current != Lifecycle::failed && current != Lifecycle::revoked) return false;
    arm.state.store(Lifecycle::disabled, std::memory_order_release);
    return true;
}
bool Revoke() noexcept {
    auto expected = Lifecycle::armed;
    if (!arm.state.compare_exchange_strong(expected, Lifecycle::revoked, std::memory_order_acq_rel)) return false;
    arm.terminal.store(Lifecycle::revoked, std::memory_order_release);
    return true;
}
bool ClaimPreparedAdmission(CONTEXT* context) noexcept {
    // Register equality is bounded and pointer-free from the VEH's point of
    // view.  Preparation performed all owned shape/identity reads before the
    // trap, so unrelated calls fail closed without consuming the arm.
    const bool matches = prepared.valid && prepared.thread == GetCurrentThreadId() &&
        context->Rbx == reinterpret_cast<DWORD64>(prepared.entry) &&
        context->R8 == reinterpret_cast<DWORD64>(prepared.value) &&
        context->R9 == reinterpret_cast<DWORD64>(prepared.progress) &&
        context->Rcx == reinterpret_cast<DWORD64>(prepared.original_impl) &&
        context->Rax == reinterpret_cast<DWORD64>(prepared.original_vtable);
    if (!matches) return false;
    auto expected = Lifecycle::armed;
    if (GetTickCount64() >= arm.deadline) {
        if (arm.state.compare_exchange_strong(expected, Lifecycle::failed, std::memory_order_acq_rel))
            arm.terminal.store(Lifecycle::failed, std::memory_order_release);
        return false;
    }
    return arm.state.compare_exchange_strong(expected, Lifecycle::claimed, std::memory_order_acq_rel);
}
bool WaitForTerminal(DWORD timeout_ms = 2000) noexcept {
    const auto deadline = GetTickCount64() + timeout_ms;
    while (arm.state.load(std::memory_order_acquire) == Lifecycle::claimed) {
        if (GetTickCount64() >= deadline) return false;
        Sleep(1);
    }
    return true;
}
LONG CALLBACK RedirectMov(EXCEPTION_POINTERS* pointers) noexcept {
    if (!pointers || !pointers->ExceptionRecord || !pointers->ContextRecord ||
        pointers->ExceptionRecord->ExceptionCode != EXCEPTION_BREAKPOINT || pointers->ExceptionRecord->ExceptionFlags != 0 ||
        pointers->ExceptionRecord->ExceptionAddress != &OwnedVehicleCancelMovSite ||
        pointers->ContextRecord->Rip != reinterpret_cast<DWORD64>(&OwnedVehicleCancelMovSite)) return EXCEPTION_CONTINUE_SEARCH;
    handler_depth.fetch_add(1, std::memory_order_acq_rel);
    pointers->ContextRecord->Rdx = pointers->ContextRecord->Rbx; // emulate MOV first
    pointers->ContextRecord->Rip += sizeof(kMovBytes);
    if (ClaimPreparedAdmission(pointers->ContextRecord)) {
        pointers->ContextRecord->Rcx = reinterpret_cast<DWORD64>(&cancel_impl);
        pointers->ContextRecord->Rax = reinterpret_cast<DWORD64>(&cancel_vtable);
        handler_hits.fetch_add(1, std::memory_order_relaxed);
    }
    handler_depth.fetch_sub(1, std::memory_order_release);
    return EXCEPTION_CONTINUE_EXECUTION;
}
bool Stop() noexcept {
    auto expected = Lifecycle::armed;
    if (arm.state.compare_exchange_strong(expected, Lifecycle::revoked, std::memory_order_acq_rel))
        arm.terminal.store(Lifecycle::revoked, std::memory_order_release);
    if (!WaitForTerminal()) return false;
    arm.state.store(Lifecycle::disabled, std::memory_order_release);
    const auto deadline = GetTickCount64() + 2000;
    while (handler_depth.load(std::memory_order_acquire) != 0) { if (GetTickCount64() >= deadline) return false; Sleep(1); }
    bool result = true;
    if (patched) {
        DWORD old = 0;
        if (!VirtualProtect(&OwnedVehicleCancelMovSite, 1, PAGE_EXECUTE_READWRITE, &old)) result = false;
        else {
            const char prior = _InterlockedCompareExchange8(reinterpret_cast<volatile char*>(&OwnedVehicleCancelMovSite), static_cast<char>(original_byte), static_cast<char>(0xcc));
            const bool restored = static_cast<unsigned char>(prior) == 0xcc || static_cast<unsigned char>(prior) == original_byte;
            const bool flushed = FlushInstructionCache(GetCurrentProcess(), &OwnedVehicleCancelMovSite, 1) != FALSE;
            DWORD ignored = 0; const bool protected_again = VirtualProtect(&OwnedVehicleCancelMovSite, 1, original_protection, &ignored) != FALSE;
            result = restored && flushed && protected_again; if (result) patched = false;
        }
    }
    if (result && !patched && handler) { result = RemoveVectoredExceptionHandler(handler) != FALSE; if (result) handler = nullptr; }
    return result;
}
bool Start(void* site) noexcept {
    if (patched || handler || site != &OwnedVehicleCancelMovSite || arm.state.load() != Lifecycle::disabled ||
        std::memcmp(site, kMovBytes, sizeof(kMovBytes)) != 0 || std::memcmp(static_cast<unsigned char*>(site) + sizeof(kMovBytes), kCallBytes, sizeof(kCallBytes)) != 0) return false;
    DWORD old = 0; if (!VirtualProtect(site, 1, PAGE_EXECUTE_READWRITE, &old)) return false;
    original_byte = *static_cast<unsigned char*>(site); original_protection = old;
    handler = AddVectoredExceptionHandler(1, RedirectMov);
    if (!handler) { DWORD ignored = 0; (void)VirtualProtect(site, 1, old, &ignored); return false; }
    const char prior = _InterlockedCompareExchange8(reinterpret_cast<volatile char*>(site), static_cast<char>(0xcc), static_cast<char>(kMovBytes[0]));
    if (static_cast<unsigned char>(prior) != kMovBytes[0]) { RemoveVectoredExceptionHandler(handler); handler = nullptr; DWORD ignored = 0; (void)VirtualProtect(site, 1, old, &ignored); return false; }
    patched = true; const bool flushed = FlushInstructionCache(GetCurrentProcess(), site, 1) != FALSE; DWORD ignored = 0;
    if (!flushed || !VirtualProtect(site, 1, old, &ignored)) { (void)Stop(); return false; }
    return true;
}
void RequireReleased(const Action& action, const char* message) { Require(action.resources.ReleasedExactlyOnce(), message); }
void Next() { Require(ResetForNextOwnedTest(), "private owned test reset after terminal state"); }
} // namespace

int main(int argc, char**) {
    if (argc != 1) { std::fputs("owned cancel fixture accepts no activation arguments\n", stderr); return 2; }
    submission_vtable.invoke = &Submit; cancel_vtable.invoke = &Cancel;
    Require(!Start(&OwnedVehicleCancelMovSite + 1), "wrong MOV site rejected");
    Require(OwnedVehicleCancelMovSite == kMovBytes[0] && std::memcmp(&OwnedVehicleCancelMovSite + sizeof(kMovBytes), kCallBytes, sizeof(kCallBytes)) == 0, "unpatched MOV/CALL shape");
    Require(Start(&OwnedVehicleCancelMovSite), "arm owned MOV trap");
    Action normal{0x1001}; auto n = MakeInvocation(normal, 0x11, 0x12, 0x13); Require(Arm(n, 1000), "arm normal"); Execute(n);
    Require(normal.cancellations == 1 && normal.submissions == 0 && normal.value == 77 && normal.callback_result == 1 && arm.terminal == Lifecycle::completed, "normal one-use cancellation"); RequireReleased(normal, "normal RAII resources"); Next();
    Action unrelated{0x1002}; auto u = MakeInvocation(unrelated, 0x21, 0x22, 0x23); Action target{0x1003}; auto target_call = MakeInvocation(target, 0x31, 0x32, 0x33); Require(Arm(target_call, 1000), "arm fail-closed target");
    // Call the raw candidate directly without PrepareScope: it must not consume the arm.
    OwnedVehicleCancelExecute(&submission_impl, &u.entry, &u.value, &u.progress, &submission_vtable);
    Require(unrelated.submissions == 1 && handler_hits == 1 && arm.state == Lifecycle::armed, "unrelated call does not claim armed session"); Execute(target_call);
    Require(target.cancellations == 1 && target.submissions == 0 && arm.terminal == Lifecycle::completed, "prepared exact match claims once"); RequireReleased(unrelated, "unrelated RAII resources"); RequireReleased(target, "target RAII resources"); Next();
    Action timeout{0x1004}; auto t = MakeInvocation(timeout, 0x41, 0x42, 0x43); Require(Arm(t, 0), "arm timeout"); Execute(t); Require(timeout.cancellations == 0 && timeout.submissions == 1 && arm.terminal == Lifecycle::failed, "timeout fallback"); RequireReleased(timeout, "timeout RAII resources"); Next();
    Action revoked{0x1005}; auto r = MakeInvocation(revoked, 0x51, 0x52, 0x53); Require(Arm(r, 1000) && Revoke(), "revoke armed"); Execute(r); Require(revoked.cancellations == 0 && revoked.submissions == 1 && arm.terminal == Lifecycle::revoked, "revoke fallback"); RequireReleased(revoked, "revoke RAII resources"); Next();
    Action outer{0x1006}, inner{0x1007}; auto o = MakeInvocation(outer, 0x61, 0x62, 0x63), i = MakeInvocation(inner, 0x71, 0x72, 0x73); outer.nested = &i; Require(Arm(o, 1000), "arm nested"); Execute(o); Require(outer.cancellations == 1 && inner.submissions == 1 && inner.cancellations == 0, "nested cannot claim twice"); RequireReleased(outer, "outer RAII resources"); RequireReleased(inner, "inner RAII resources"); Next();
    Action false_result{0x1008}; auto f = MakeInvocation(false_result, 0x81, 0x82, 0x83); false_result.callback_returns_false = true; Require(Arm(f, 1000), "arm false result"); Execute(f); Require(false_result.cancellations == 1 && false_result.submissions == 0 && false_result.callback_result == 0 && arm.terminal == Lifecycle::failed, "false callback result is preserved"); RequireReleased(false_result, "false-result RAII resources"); Next();
    Action unknown{0x1009}; auto q = MakeInvocation(unknown, 0x91, 0x92, 0x93); unknown.force_post_claim_mismatch = true; Require(Arm(q, 1000), "arm post-claim mismatch"); Execute(q); Require(unknown.cancellations == 0 && unknown.submissions == 0 && unknown.value == 77 && arm.terminal == Lifecycle::failed, "post-claim mismatch does not retry original submit"); RequireReleased(unknown, "unknown-result RAII resources"); Next();
    Action exceptional{0x1010}; auto e = MakeInvocation(exceptional, 0xa1, 0xa2, 0xa3); exceptional.throw_from_cancel = true; Require(Arm(e, 1000), "arm exception"); bool unwound = false; try { Execute(e); } catch (const std::runtime_error&) { unwound = true; } Require(unwound && exceptional.cancellations == 1 && arm.terminal == Lifecycle::failed, "exception cleanup"); RequireReleased(exceptional, "exception RAII resources"); Next();
    Action race{0x1010}; auto c = MakeInvocation(race, 0xa1, 0xa2, 0xa3); Require(Arm(c, 1000), "arm competing"); std::atomic<int> ready{0}; auto run = [&] { ready.fetch_add(1); while (ready.load() != 2) YieldProcessor(); Execute(c); }; std::thread first(run), second(run); first.join(); second.join(); Require(race.cancellations == 1 && race.submissions == 1, "competing calls claim once"); RequireReleased(race, "competing RAII resources"); Next();
    Action stopping{0x1011}; auto s = MakeInvocation(stopping, 0xb1, 0xb2, 0xb3); stopping.release_cancel.store(false); Require(Arm(s, 1000), "arm Stop race"); std::thread worker([&] { Execute(s); }); auto deadline = GetTickCount64() + 1000; while (!stopping.entered_cancel && GetTickCount64() < deadline) Sleep(1); Require(stopping.entered_cancel, "claimed before Stop"); bool stopped = false; std::thread stopper([&] { stopped = Stop(); }); Sleep(20); stopping.release_cancel.store(true); worker.join(); stopper.join(); Require(stopped && stopping.cancellations == 1 && stopping.submissions == 0, "Stop waits for claim"); RequireReleased(stopping, "Stop RAII resources"); Require(OwnedVehicleCancelMovSite == kMovBytes[0], "MOV restored");
    Action after{0x1012}; auto z = MakeInvocation(after, 0xc1, 0xc2, 0xc3); Execute(z); Require(after.submissions == 1 && after.cancellations == 0, "normal submission after Stop"); RequireReleased(after, "after Stop RAII resources");
    std::puts("{\"scope\":\"owned-vehicle-cancel-mov-rax-vtable-call\",\"fixturePassed\":true,\"activationPermitted\":false,\"tf3Qualified\":false,\"unpatchedIndirectCall\":true,\"rdxEntryPreserved\":true,\"rcxAndRaxSubstituted\":true,\"oneUseLifecycle\":true,\"exactIdentityShapeProgress\":true,\"unrelatedFailClosed\":true,\"postClaimMismatchNoRetry\":true,\"timeoutAndRevoke\":true,\"competingAndNested\":true,\"callbackExceptionUnwound\":true,\"callbackFalseResult\":true,\"uiCompletionUnqualified\":true,\"ownedResourcesDestroyedOnce\":true,\"stopRaceRestored\":true,\"noEnginePointersRetained\":true}");
    return 0;
}
