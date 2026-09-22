// Owned-process ABI fixture only. It has no TF3 loading, addresses, IPC, or
// activation path. A pass proves only this owned MOV/CALL ABI mechanism.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>

extern "C" {
extern unsigned char OwnedVehicleCancelMovSite;
void OwnedVehicleCancelExecute(void* submission_impl, void* entry, void* callback_value,
                               void* progress_pair, void* submission_vtable);
}
namespace {
constexpr std::uintptr_t kImplMagic = 0x544633494d504c31ULL;
constexpr std::uintptr_t kValueMagic = 0x54463356414c5545ULL;
constexpr unsigned char kMovBytes[] = {0x48, 0x8b, 0xd3};
constexpr unsigned char kCallBytes[] = {0xff, 0x50, 0x10};
struct Entry { std::uint64_t identity = 0x1d3e5a7c9bULL; };
struct Action; struct CallbackImpl;
struct CallbackValue {
    std::byte prefix[0x38]{};
    CallbackImpl* impl = nullptr;
    std::uintptr_t magic = kValueMagic;
};
static_assert(offsetof(CallbackValue, impl) == 0x38);
struct Vtable {
    void* unused[2]{};
    void (*invoke)(CallbackImpl*, Entry*, CallbackValue*, void*) = nullptr;
};
static_assert(offsetof(Vtable, invoke) == 0x10);
struct CallbackImpl { Vtable* vtable = nullptr; std::uintptr_t magic = kImplMagic; };
struct ProgressPair { Action* action = nullptr; std::uint64_t progress = 0x41; };
struct Action {
    int submissions = 0, cancellations = 0, value = 77;
    bool request_nested = false, throw_from_cancel = false;
    Entry* expected_entry = nullptr; CallbackValue* expected_value = nullptr;
    ProgressPair* expected_progress = nullptr; CallbackImpl* submission_impl = nullptr;
    Vtable* submission_vtable = nullptr;
};
std::atomic<bool> active{false}; std::atomic<LONG> handler_hits{0};
PVOID handler = nullptr; unsigned char original_byte = 0; DWORD original_protection = 0;
bool patched = false; CallbackImpl cancel_impl{}; Vtable cancel_vtable{};
const CallbackValue* qualified_callback_value = nullptr;
void Fail(const char* what) { std::fprintf(stderr, "FAIL: %s (win32=%lu)\n", what, GetLastError()); std::exit(1); }
void Require(bool value, const char* what) { if (!value) Fail(what); }
bool IsOwnedCallbackValue(const CallbackValue* value) noexcept {
    return value != nullptr && value->magic == kValueMagic && value->impl == &cancel_impl &&
        cancel_impl.magic == kImplMagic && cancel_impl.vtable == &cancel_vtable && cancel_vtable.invoke != nullptr;
}
bool ArgumentsAreExpected(Entry* entry, CallbackValue* value, void* progress_raw) noexcept {
    const auto* progress = static_cast<ProgressPair*>(progress_raw);
    return progress != nullptr && progress->action != nullptr && entry == progress->action->expected_entry &&
        value == progress->action->expected_value && progress == progress->action->expected_progress;
}
void __fastcall Submit(CallbackImpl*, Entry* entry, CallbackValue* value, void* progress_raw) {
    Require(ArgumentsAreExpected(entry, value, progress_raw), "submission ABI arguments");
    auto* action = static_cast<ProgressPair*>(progress_raw)->action; ++action->submissions; ++action->value;
}
void __fastcall Cancel(CallbackImpl*, Entry* entry, CallbackValue* value, void* progress_raw) {
    Require(ArgumentsAreExpected(entry, value, progress_raw), "cancel ABI arguments");
    auto* action = static_cast<ProgressPair*>(progress_raw)->action; ++action->cancellations;
    if (action->request_nested) {
        action->request_nested = false;
        OwnedVehicleCancelExecute(action->submission_impl, entry, value, progress_raw, action->submission_vtable);
    }
    if (action->throw_from_cancel) throw std::runtime_error("owned cancel callback fault");
}
LONG CALLBACK RedirectMov(EXCEPTION_POINTERS* pointers) noexcept {
    if (!pointers || !pointers->ExceptionRecord || !pointers->ContextRecord ||
        pointers->ExceptionRecord->ExceptionCode != EXCEPTION_BREAKPOINT || pointers->ExceptionRecord->ExceptionFlags != 0 ||
        pointers->ExceptionRecord->ExceptionAddress != &OwnedVehicleCancelMovSite ||
        pointers->ContextRecord->Rip != reinterpret_cast<DWORD64>(&OwnedVehicleCancelMovSite)) return EXCEPTION_CONTINUE_SEARCH;
    // Always emulate the patched MOV before consulting active state. This
    // makes the owned Start/Stop patch windows passive rather than crashing a
    // caller that races the one-byte patch. No callback, allocation, lock,
    // entry/progress dereference, or R8 dereference occurs in VEH.
    pointers->ContextRecord->Rdx = pointers->ContextRecord->Rbx;
    pointers->ContextRecord->Rip += sizeof(kMovBytes);
    // The candidate must have been qualified outside the trap; an untrusted
    // R8 simply receives normal original MOV/CALL behavior.
    if (!active.load(std::memory_order_acquire) ||
        pointers->ContextRecord->R8 != reinterpret_cast<DWORD64>(qualified_callback_value))
        return EXCEPTION_CONTINUE_EXECUTION;
    pointers->ContextRecord->Rcx = reinterpret_cast<DWORD64>(&cancel_impl);
    pointers->ContextRecord->Rax = reinterpret_cast<DWORD64>(&cancel_vtable);
    // RDX now contains the emulated MOV result: the original RBX entry.
    handler_hits.fetch_add(1, std::memory_order_relaxed);
    return EXCEPTION_CONTINUE_EXECUTION;
}
bool Stop() noexcept;
bool Start(void* site) noexcept {
    if (active.load(std::memory_order_acquire) || patched || site != &OwnedVehicleCancelMovSite ||
        std::memcmp(site, kMovBytes, sizeof(kMovBytes)) != 0 ||
        std::memcmp(static_cast<unsigned char*>(site) + sizeof(kMovBytes), kCallBytes, sizeof(kCallBytes)) != 0) return false;
    DWORD old = 0; if (!VirtualProtect(site, 1, PAGE_EXECUTE_READWRITE, &old)) return false;
    original_byte = *static_cast<unsigned char*>(site); original_protection = old;
    handler = AddVectoredExceptionHandler(1, RedirectMov);
    if (!handler) { DWORD ignored = 0; (void)VirtualProtect(site, 1, old, &ignored); return false; }
    const char previous = _InterlockedCompareExchange8(reinterpret_cast<volatile char*>(site), static_cast<char>(0xcc), static_cast<char>(kMovBytes[0]));
    if (static_cast<unsigned char>(previous) != kMovBytes[0]) { RemoveVectoredExceptionHandler(handler); handler = nullptr; DWORD ignored = 0; (void)VirtualProtect(site, 1, old, &ignored); return false; }
    patched = true;
    const bool flushed = FlushInstructionCache(GetCurrentProcess(), site, 1) != FALSE;
    DWORD ignored = 0; const bool protected_again = VirtualProtect(site, 1, old, &ignored) != FALSE;
    if (!flushed || !protected_again) { (void)Stop(); return false; }
    active.store(true, std::memory_order_release); return true;
}
bool Stop() noexcept {
    active.store(false, std::memory_order_release); bool result = true;
    qualified_callback_value = nullptr;
    if (patched) {
        DWORD old = 0;
        if (!VirtualProtect(&OwnedVehicleCancelMovSite, 1, PAGE_EXECUTE_READWRITE, &old)) result = false;
        else {
            const char previous = _InterlockedCompareExchange8(reinterpret_cast<volatile char*>(&OwnedVehicleCancelMovSite), static_cast<char>(original_byte), static_cast<char>(0xcc));
            const bool byte_restored = static_cast<unsigned char>(previous) == 0xcc || static_cast<unsigned char>(previous) == original_byte;
            // Do both cleanup operations even if the CAS or cache flush failed:
            // leaving an RW code page is worse than reporting a failed restore.
            const bool flushed = FlushInstructionCache(GetCurrentProcess(), &OwnedVehicleCancelMovSite, 1) != FALSE;
            DWORD ignored = 0;
            const bool protected_again = VirtualProtect(&OwnedVehicleCancelMovSite, 1, original_protection, &ignored) != FALSE;
            result = byte_restored && flushed && protected_again;
            if (result) patched = false;
        }
    }
    // If code restoration failed, retain the VEH. It still emulates the MOV
    // passively while inactive, including a stale cached INT3, until a later
    // successful Stop can prove the original byte and protection are back.
    if (result && !patched && handler) {
        result = RemoveVectoredExceptionHandler(handler) != FALSE;
        if (result) handler = nullptr;
    }
    return result;
}
void Execute(CallbackImpl* submission, Entry* entry, CallbackValue* value, ProgressPair* progress, Vtable* vtable) {
    OwnedVehicleCancelExecute(submission, entry, value, progress, vtable);
}
}
int main(int argc, char**) {
    if (argc != 1) { std::fputs("owned cancel fixture accepts no activation arguments\n", stderr); return 2; }
    Vtable submission_vtable{}; submission_vtable.invoke = &Submit;
    CallbackImpl submission_impl{&submission_vtable, kImplMagic};
    cancel_vtable.invoke = &Cancel; cancel_impl = {&cancel_vtable, kImplMagic};
    CallbackValue callback_value{}; callback_value.impl = &cancel_impl; Entry entry{};
    Require(IsOwnedCallbackValue(&callback_value), "owned callback value qualified before trap");
    qualified_callback_value = &callback_value;
    Require(!Start(&OwnedVehicleCancelMovSite + 1), "wrong MOV site rejected");
    Require(OwnedVehicleCancelMovSite == kMovBytes[0] && std::memcmp(&OwnedVehicleCancelMovSite + sizeof(kMovBytes), kCallBytes, sizeof(kCallBytes)) == 0, "unpatched MOV/CALL shape");
    Require(Start(&OwnedVehicleCancelMovSite), "arm owned MOV trap");
    Action ordinary{}; ProgressPair ordinary_progress{&ordinary};
    ordinary.expected_entry = &entry; ordinary.expected_value = &callback_value; ordinary.expected_progress = &ordinary_progress; ordinary.submission_impl = &submission_impl; ordinary.submission_vtable = &submission_vtable;
    Execute(&submission_impl, &entry, &callback_value, &ordinary_progress, &submission_vtable);
    Require(ordinary.cancellations == 1 && ordinary.submissions == 0 && ordinary.value == 77, "one cancel callback without submission");
    Action nested{}; ProgressPair nested_progress{&nested};
    nested.expected_entry = &entry; nested.expected_value = &callback_value; nested.expected_progress = &nested_progress; nested.submission_impl = &submission_impl; nested.submission_vtable = &submission_vtable; nested.request_nested = true;
    Execute(&submission_impl, &entry, &callback_value, &nested_progress, &submission_vtable);
    Require(nested.cancellations == 2 && nested.submissions == 0 && nested.value == 77, "nested callback cancellation exactly once per entry");
    Action exceptional{}; ProgressPair exceptional_progress{&exceptional};
    exceptional.expected_entry = &entry; exceptional.expected_value = &callback_value; exceptional.expected_progress = &exceptional_progress; exceptional.submission_impl = &submission_impl; exceptional.submission_vtable = &submission_vtable; exceptional.throw_from_cancel = true;
    bool unwound = false; try { Execute(&submission_impl, &entry, &callback_value, &exceptional_progress, &submission_vtable); } catch (const std::runtime_error&) { unwound = true; }
    Require(unwound && exceptional.cancellations == 1 && exceptional.submissions == 0 && exceptional.value == 77, "callback exception unwinds with unchanged action");
    Require(handler_hits.load(std::memory_order_acquire) == 4, "each owned admission hits MOV trap once");
    Require(Stop(), "restore and remove handler"); Require(OwnedVehicleCancelMovSite == kMovBytes[0], "MOV byte restored after teardown");
    Action after_stop{}; ProgressPair after_stop_progress{&after_stop};
    after_stop.expected_entry = &entry; after_stop.expected_value = &callback_value; after_stop.expected_progress = &after_stop_progress; after_stop.submission_impl = &submission_impl; after_stop.submission_vtable = &submission_vtable;
    Execute(&submission_impl, &entry, &callback_value, &after_stop_progress, &submission_vtable);
    Require(after_stop.cancellations == 0 && after_stop.submissions == 1 && after_stop.value == 78, "normal submission after teardown");
    std::puts("{\"scope\":\"owned-vehicle-cancel-mov-rax-vtable-call\",\"fixturePassed\":true,\"activationPermitted\":false,\"tf3Qualified\":false,\"unpatchedIndirectCall\":true,\"rdxEntryPreserved\":true,\"rcxAndRaxSubstituted\":true,\"exactlyOnceCancel\":true,\"noSubmission\":true,\"unchangedActionState\":true,\"nestedCallback\":true,\"callbackExceptionUnwound\":true,\"teardownRestored\":true,\"sequentialLifecycleOnly\":true}");
    return 0;
}
