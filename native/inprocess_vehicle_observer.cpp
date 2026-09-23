#include "inprocess_vehicle_observer.h"

#include <intrin.h>
#include <array>
#include <atomic>
#include <cstring>
#include <limits>

#include "inprocess_post_observer.h"

namespace tf3vehicleobserver {
namespace {

constexpr DWORD kFactoryRva = 0x9eee72;
constexpr DWORD kFactoryPostRva = 0x9eeee8;
constexpr DWORD kAdmissionRva = 0xe26a2c;
constexpr DWORD kCallbackTailRva = 0xe3a504;
constexpr DWORD kCallbackContinuationRva = 0xe260d0;
constexpr DWORD kSendReturnRva = 0xe26a32;
constexpr DWORD kMarshalerReturnRva = 0xe0d707;
constexpr DWORD kCallbackVtableRva = 0x373a730;
constexpr DWORD kCallbackInvokeRva = 0xe3a500;
constexpr std::array<unsigned char, 3> kFactoryBytes{0x41, 0x8b, 0xd8}; // mov ebx,r8d
constexpr std::array<unsigned char, 1> kFactoryPostBytes{0x90}; // nop after constructed output
constexpr std::array<unsigned char, 3> kAdmissionBytes{0x48, 0x8b, 0xd3}; // mov rdx,rbx
constexpr std::array<unsigned char, 5> kCallbackTailBytes{0xe9, 0xc7, 0xbb, 0xfe, 0xff};
constexpr std::array<unsigned char, 1> kNormalReturnBytes{0x90};
constexpr std::array<unsigned char, 9> kSendReturnWindow{0x90, 0x48, 0x8b, 0xcb, 0xe8, 0x15, 0x8d, 0xba, 0xff};
constexpr std::array<unsigned char, 9> kMarshalerReturnWindow{0x90, 0x48, 0x8b, 0x94, 0x24, 0xb0, 0x00, 0x00, 0x00};
constexpr std::uintptr_t kMaximumUserPointer = 0x00007fffffffffffULL;
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
static_assert(std::atomic<std::uint32_t>::is_always_lock_free);
static_assert(std::atomic<std::uintptr_t>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);

struct SiteState {
    std::atomic<std::uintptr_t> address{0};
    unsigned char original = 0;
    DWORD protection = 0;
    bool restoration_pending = false;
    bool owns_byte = false;
};

SRWLOCK lifecycle_lock = SRWLOCK_INIT;
std::array<SiteState, 6> sites{};
PVOID handler = nullptr;
bool attempted = false;
std::atomic<bool> active{false};
std::atomic<bool> cross_thread{false};
std::atomic<bool> saturated{false};
std::atomic<std::uintptr_t> image_base{0};
std::atomic<std::uint32_t> observed_thread{0};
std::atomic<std::uint64_t> factory_hits{0};
std::atomic<std::uint64_t> admission_hits{0};
std::atomic<std::uint64_t> callback_hits{0};
std::atomic<std::uint32_t> callback_thread{0};
std::atomic<std::uint64_t> correlated_hits{0};
std::atomic<std::uint32_t> latest_correlated_admission_thread{0};
std::atomic<std::uint64_t> dropped_candidates{0};
constexpr std::size_t kPendingSlotCount = 16;
constexpr std::size_t kCandidateSlotCount = 64;

struct PendingSlot {
    // 0 free, 1 writer reserved, 2 published, 3 post handler consuming.
    std::atomic<std::uint32_t> state{0};
    std::atomic<std::uint32_t> thread{0};
    std::atomic<std::uintptr_t> output_entry{0};
    std::atomic<std::int32_t> entity{0};
    std::atomic<std::uint32_t> stopped{0};
};

struct CandidateSlot {
    // 0 free, 1 writer owns it, 2 ready, 3 admission owns it. A factory may
    // replace a ready slot after one complete ring lap, but never a slot that
    // an admission is consuming.
    std::atomic<std::uint32_t> state{0};
    std::atomic<std::uint64_t> sequence{0};
    std::atomic<std::uintptr_t> storage{0};
    std::atomic<std::int32_t> entity{0};
    std::atomic<std::uint32_t> factory_thread{0};
    std::atomic<std::uint32_t> stopped{0};
};

std::array<PendingSlot, kPendingSlotCount> pending_slots{};
std::array<CandidateSlot, kCandidateSlotCount> candidate_slots{};
std::atomic<std::uint64_t> next_candidate_sequence{0};
// Bits 0..31 entity, bit 32 stopped, bit 33 valid, bit 34 entry result zero,
// bit 35 expected callback shape. One atomic load gives IPC a
// coherent semantic payload even while a later action is being observed.
std::atomic<std::uint64_t> latest_action{0};
// Identity remains private to the observer. The state guards readers while a
// new correlated command-storage identity is published.
struct AdmissionIdentity {
    // 0 empty, 1 writer, 2 published.
    std::atomic<std::uint32_t> state{0};
    std::atomic<std::uintptr_t> storage{0};
};
AdmissionIdentity latest_admission{};
// entity (0..31), stopped (32), result byte (33..40), valid (41), match (42).
std::atomic<std::uint64_t> latest_callback{0};
std::atomic<std::uintptr_t> callback_continuation{0};
AdmissionIdentity latest_callback_identity{};
std::atomic<std::uint64_t> send_return_hits{0};
std::atomic<std::uint32_t> send_return_thread{0};
std::atomic<bool> latest_send_return_matches_admission_storage{false};
std::atomic<std::uint64_t> marshaler_return_hits{0};
std::atomic<std::uint32_t> marshaler_return_thread{0};
// Same packed fields as latest_callback, plus bit 43 for callback storage match.
std::atomic<std::uint64_t> latest_marshaler{0};
struct SendInvocation {
    // 0 free, 1 writer/consumer, 2 published. Never retains an owned object.
    std::atomic<std::uint32_t> state{0};
    std::atomic<std::uint32_t> thread{0};
    std::atomic<std::uintptr_t> stack{0}, entry{0}, storage{0};
};
std::array<SendInvocation, kPendingSlotCount> send_invocations{};

bool MatchesIdentity(const AdmissionIdentity& identity, std::uintptr_t storage) noexcept {
    if (identity.state.load(std::memory_order_acquire) != 2) return false;
    const auto observed_storage = identity.storage.load(std::memory_order_relaxed);
    return identity.state.load(std::memory_order_acquire) == 2 && observed_storage == storage;
}

void PublishIdentity(AdmissionIdentity& identity, std::uintptr_t storage) noexcept {
    auto ready = identity.state.load(std::memory_order_acquire);
    if ((ready == 0 || ready == 2) && identity.state.compare_exchange_strong(ready, 1, std::memory_order_acq_rel)) {
        identity.storage.store(storage, std::memory_order_relaxed);
        identity.state.store(2, std::memory_order_release);
    }
}

void IncrementSaturating(std::atomic<std::uint64_t>& value) noexcept {
    auto current = value.load(std::memory_order_relaxed);
    for (unsigned attempt = 0; attempt != 8; ++attempt) {
        if (current == (std::numeric_limits<std::uint64_t>::max)()) break;
        if (value.compare_exchange_weak(current, current + 1,
                                        std::memory_order_release,
                                        std::memory_order_relaxed)) return;
    }
    saturated.store(true, std::memory_order_release);
}

void ObserveThread(std::uint32_t thread) noexcept {
    const auto previous = observed_thread.exchange(thread, std::memory_order_relaxed);
    if (previous != 0 && previous != thread)
        cross_thread.store(true, std::memory_order_relaxed);
}

void InvalidateIdentityStorage(AdmissionIdentity& identity, std::uintptr_t storage) noexcept {
    if (identity.state.load(std::memory_order_acquire) != 2 ||
        identity.storage.load(std::memory_order_relaxed) != storage) return;
    std::uint32_t ready = 2;
    if (!identity.state.compare_exchange_strong(ready, 1, std::memory_order_acq_rel)) return;
    const bool same = identity.storage.load(std::memory_order_relaxed) == storage;
    identity.state.store(same ? 0 : 2, std::memory_order_release);
}

void InvalidateStorage(std::uintptr_t storage) noexcept {
    // A fresh construction at a reused allocation must not inherit a previous
    // invocation's admission/callback identity, even if its payload is equal.
    InvalidateIdentityStorage(latest_admission, storage);
    InvalidateIdentityStorage(latest_callback_identity, storage);
    for (auto& old : candidate_slots) {
        if (old.state.load(std::memory_order_acquire) != 2) continue;
        const auto selected_storage = old.storage.load(std::memory_order_relaxed);
        const auto selected_sequence = old.sequence.load(std::memory_order_relaxed);
        if (selected_storage != storage) continue;
        std::uint32_t ready = 2;
        if (!old.state.compare_exchange_strong(ready, 3, std::memory_order_acq_rel)) {
            if (ready == 3) saturated.store(true, std::memory_order_release);
            continue;
        }
        if (old.storage.load(std::memory_order_relaxed) != selected_storage ||
            old.sequence.load(std::memory_order_relaxed) != selected_sequence) {
            old.state.store(2, std::memory_order_release);
            continue;
        }
        old.state.store(0, std::memory_order_release);
        IncrementSaturating(dropped_candidates);
    }
}

bool SafeReadAction(std::uintptr_t entry, std::int32_t* entity,
                    std::uint8_t* stopped, std::uintptr_t* storage,
                    std::uint8_t* result) noexcept {
    if (entry < 0x10000 || entry > kMaximumUserPointer - 0x31) return false;
    __try {
        const auto command = *reinterpret_cast<const std::uintptr_t*>(entry);
        if (command < 0x10000 || command > kMaximumUserPointer - 0x9b9) return false;
        if (*reinterpret_cast<const std::uint8_t*>(command + 0x9b8) != 0x32) return false;
        std::array<std::uint8_t, 5> payload{};
        std::memcpy(payload.data(), reinterpret_cast<const void*>(command), payload.size());
        if (payload[4] > 1) return false;
        std::memcpy(entity, payload.data(), sizeof(*entity));
        *stopped = payload[4];
        *storage = command;
        *result = *reinterpret_cast<const std::uint8_t*>(entry + 0x30);
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

bool MatchesLatestAdmission(std::uintptr_t storage) noexcept {
    return MatchesIdentity(latest_admission, storage);
}

void RecordCallback(const CONTEXT* context) noexcept {
    std::int32_t entity = 0;
    std::uint8_t stopped = 0, result = 0;
    std::uintptr_t storage = 0;
    const bool valid = SafeReadAction(static_cast<std::uintptr_t>(context->Rdx), &entity, &stopped,
                                      &storage, &result);
    // This callback thunk is shared by unrelated commands. A raw breakpoint
    // count is not a vehicle receipt and must not taint vehicle thread data.
    if (!valid) return;
    const DWORD thread = GetCurrentThreadId();
    ObserveThread(thread);
    callback_thread.store(thread, std::memory_order_release);
    IncrementSaturating(callback_hits);
    // Callback implementations may be cloned by adapters, so the stable
    // correlation is the command-storage identity, never a borrowed pointer.
    const bool matches = valid && MatchesLatestAdmission(storage);
    PublishIdentity(latest_callback_identity, storage);
    const auto packed = static_cast<std::uint64_t>(static_cast<std::uint32_t>(entity)) |
        (static_cast<std::uint64_t>(stopped) << 32) |
        (static_cast<std::uint64_t>(result) << 33) | (static_cast<std::uint64_t>(valid) << 41) |
        (static_cast<std::uint64_t>(matches) << 42);
    latest_callback.store(packed, std::memory_order_release);
}

void InvalidateSendFrame(const CONTEXT* context, DWORD thread) noexcept {
    for (auto& slot : send_invocations) {
        if (slot.state.load(std::memory_order_acquire) != 2 ||
            slot.thread.load(std::memory_order_relaxed) != thread ||
            slot.stack.load(std::memory_order_relaxed) != context->Rsp) continue;
        std::uint32_t ready = 2;
        if (slot.state.compare_exchange_strong(ready, 1, std::memory_order_acq_rel)) {
            // An exception may have bypassed the old normal continuation.
            slot.state.store(0, std::memory_order_release);
            IncrementSaturating(dropped_candidates);
        }
    }
}

void RecordSendInvocation(const CONTEXT* context, DWORD thread, std::uintptr_t storage) noexcept {
    for (auto& slot : send_invocations) {
        std::uint32_t free = 0;
        if (!slot.state.compare_exchange_strong(free, 1, std::memory_order_acq_rel)) continue;
        slot.thread.store(thread, std::memory_order_relaxed);
        slot.stack.store(context->Rsp, std::memory_order_relaxed);
        slot.entry.store(context->Rbx, std::memory_order_relaxed);
        slot.storage.store(storage, std::memory_order_relaxed);
        slot.state.store(2, std::memory_order_release);
        return;
    }
    saturated.store(true, std::memory_order_release);
    IncrementSaturating(dropped_candidates);
}

void RecordSendReturn(const CONTEXT* context) noexcept {
    const DWORD thread = GetCurrentThreadId();
    for (auto& slot : send_invocations) {
        if (slot.state.load(std::memory_order_acquire) != 2 ||
            slot.thread.load(std::memory_order_relaxed) != thread ||
            slot.stack.load(std::memory_order_relaxed) != context->Rsp ||
            slot.entry.load(std::memory_order_relaxed) != context->Rbx) continue;
        std::uint32_t ready = 2;
        if (!slot.state.compare_exchange_strong(ready, 1, std::memory_order_acq_rel)) continue;
        // RBX is the caller-owned entry, possibly moved-from by the adapter.
        // Use identity captured at admission; never read freed/moved storage.
        const auto storage = slot.storage.load(std::memory_order_relaxed);
        slot.state.store(0, std::memory_order_release);
        ObserveThread(thread);
        send_return_thread.store(thread, std::memory_order_release);
        latest_send_return_matches_admission_storage.store(MatchesLatestAdmission(storage), std::memory_order_release);
        IncrementSaturating(send_return_hits);
        return;
    }
}

bool SafeReadMarshalerEntry(std::uintptr_t pack, std::uintptr_t* entry) noexcept {
    if (pack < 0x10000 || pack > kMaximumUserPointer - 2 * sizeof(std::uintptr_t)) return false;
    __try {
        *entry = *reinterpret_cast<const std::uintptr_t*>(pack + sizeof(std::uintptr_t));
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}

void RecordMarshalerReturn(const CONTEXT* context) noexcept {
    // e0d630 preserves the incoming pack in nonvolatile RBX. [pack+8] is
    // its caller's live entry, as used at e0d676 before CALL d8a820.
    std::uintptr_t entry = 0, storage = 0;
    std::int32_t entity = 0;
    std::uint8_t stopped = 0, result = 0;
    if (!SafeReadMarshalerEntry(context->Rbx, &entry) ||
        !SafeReadAction(entry, &entity, &stopped, &storage, &result)) return;
    const DWORD thread = GetCurrentThreadId();
    ObserveThread(thread);
    marshaler_return_thread.store(thread, std::memory_order_release);
    const auto packed = static_cast<std::uint64_t>(static_cast<std::uint32_t>(entity)) |
        (static_cast<std::uint64_t>(stopped) << 32) |
        (static_cast<std::uint64_t>(result) << 33) | (1ULL << 41) |
        (static_cast<std::uint64_t>(MatchesLatestAdmission(storage)) << 42) |
        (static_cast<std::uint64_t>(MatchesIdentity(latest_callback_identity, storage)) << 43);
    latest_marshaler.store(packed, std::memory_order_release);
    IncrementSaturating(marshaler_return_hits);
}

bool SafeReadCallbackShape(const CONTEXT* context) noexcept {
    const auto base = image_base.load(std::memory_order_relaxed);
    const auto value = static_cast<std::uintptr_t>(context->R8);
    if (base == 0 || value < 0x10000 || value > kMaximumUserPointer - 0x40) return false;
    __try {
        const auto implementation = *reinterpret_cast<const std::uintptr_t*>(value + 0x38);
        if (implementation < 0x10000 || implementation > kMaximumUserPointer - sizeof(std::uintptr_t)) return false;
        const auto vtable = *reinterpret_cast<const std::uintptr_t*>(implementation);
        return vtable == base + kCallbackVtableRva &&
            *reinterpret_cast<const std::uintptr_t*>(vtable + 0x10) == base + kCallbackInvokeRva;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

bool SafeReadStorage(std::uintptr_t entry, std::uintptr_t* storage) noexcept {
    if (entry < 0x10000 || entry > kMaximumUserPointer - sizeof(std::uintptr_t)) return false;
    __try {
        const auto value = *reinterpret_cast<const std::uintptr_t*>(entry);
        if (value < 0x10000 || value > kMaximumUserPointer - 0x9b9) return false;
        *storage = value;
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

bool SafeReadProgressEmpty(std::uintptr_t progress, bool* empty) noexcept {
    if (progress < 0x10000 || progress > kMaximumUserPointer - 2 * sizeof(std::uintptr_t)) return false;
    __try {
        const auto first = *reinterpret_cast<const std::uintptr_t*>(progress);
        const auto second = *reinterpret_cast<const std::uintptr_t*>(progress + sizeof(std::uintptr_t));
        *empty = first == 0 && second == 0;
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

void RecordFactory(const CONTEXT* context) noexcept {
    const DWORD thread = GetCurrentThreadId();
    ObserveThread(thread);
    IncrementSaturating(factory_hits);
    const auto stopped = static_cast<std::uint8_t>(context->R9 & 0xff);
    if (stopped > 1) {
        IncrementSaturating(dropped_candidates);
        saturated.store(true, std::memory_order_release);
        return;
    }
    const auto output_entry = static_cast<std::uintptr_t>(context->Rcx);
    // The exact factory moves RCX to RDI after this site. Reusing the
    // same output object on the same thread before its post boundary means an
    // earlier observation unwound or nested ambiguously; discard it and taint
    // the observer rather than pairing the later post with stale arguments.
    for (auto& slot : pending_slots) {
        if (slot.state.load(std::memory_order_acquire) != 2 ||
            slot.thread.load(std::memory_order_relaxed) != thread ||
            slot.output_entry.load(std::memory_order_relaxed) != output_entry) continue;
        std::uint32_t ready = 2;
        if (slot.state.compare_exchange_strong(ready, 3, std::memory_order_acq_rel)) {
            slot.state.store(0, std::memory_order_release);
            IncrementSaturating(dropped_candidates);
            saturated.store(true, std::memory_order_release);
        }
    }
    for (auto& slot : pending_slots) {
        std::uint32_t free = 0;
        if (!slot.state.compare_exchange_strong(free, 1, std::memory_order_acq_rel)) continue;
        slot.thread.store(thread, std::memory_order_relaxed);
        slot.output_entry.store(output_entry, std::memory_order_relaxed);
        slot.entity.store(static_cast<std::int32_t>(context->R8), std::memory_order_relaxed);
        slot.stopped.store(stopped, std::memory_order_relaxed);
        slot.state.store(2, std::memory_order_release);
        return;
    }
    saturated.store(true, std::memory_order_release);
    IncrementSaturating(dropped_candidates);
}

void RecordFactoryPost(const CONTEXT* context) noexcept {
    const DWORD thread = GetCurrentThreadId();
    ObserveThread(thread);
    PendingSlot* pending = nullptr;
    for (auto& slot : pending_slots) {
        if (slot.state.load(std::memory_order_acquire) == 2 &&
            slot.thread.load(std::memory_order_relaxed) == thread &&
            slot.output_entry.load(std::memory_order_relaxed) ==
                static_cast<std::uintptr_t>(context->Rdi)) {
            pending = &slot;
            break;
        }
    }
    if (!pending) {
        std::uintptr_t storage = 0;
        if (SafeReadStorage(static_cast<std::uintptr_t>(context->Rdi), &storage))
            InvalidateStorage(storage);
        IncrementSaturating(dropped_candidates);
        saturated.store(true, std::memory_order_release);
        return;
    }
    std::uint32_t published = 2;
    if (!pending->state.compare_exchange_strong(published, 3, std::memory_order_acq_rel)) {
        IncrementSaturating(dropped_candidates);
        saturated.store(true, std::memory_order_release);
        return;
    }
    std::uintptr_t storage = 0;
    if (!SafeReadStorage(static_cast<std::uintptr_t>(context->Rdi), &storage)) {
        IncrementSaturating(dropped_candidates);
        saturated.store(true, std::memory_order_release);
        pending->state.store(0, std::memory_order_release);
        return;
    }
    auto sequence = next_candidate_sequence.fetch_add(1, std::memory_order_relaxed) + 1;
    if (sequence == 0) {
        saturated.store(true, std::memory_order_release);
        IncrementSaturating(dropped_candidates);
        pending->state.store(0, std::memory_order_release);
        return;
    }
    // A new construction for the same allocation invalidates every older
    // ready identity before publication, closing allocation-address ABA and
    // ensuring one storage address cannot be consumed more than once.
    InvalidateStorage(storage);
    auto& candidate = candidate_slots[sequence % kCandidateSlotCount];
    auto prior = candidate.state.load(std::memory_order_acquire);
    bool owns_candidate = false;
    for (unsigned attempt = 0; attempt != 4; ++attempt) {
        if (prior == 1 || prior == 3) {
            prior = candidate.state.load(std::memory_order_acquire);
            continue;
        }
        if (candidate.state.compare_exchange_weak(prior, 1, std::memory_order_acq_rel)) {
            owns_candidate = true;
            break;
        }
    }
    if (!owns_candidate) {
        saturated.store(true, std::memory_order_release);
        IncrementSaturating(dropped_candidates);
        pending->state.store(0, std::memory_order_release);
        return;
    }
    if (prior == 2) IncrementSaturating(dropped_candidates);
    candidate.sequence.store(sequence, std::memory_order_relaxed);
    candidate.storage.store(storage, std::memory_order_relaxed);
    candidate.entity.store(pending->entity.load(std::memory_order_relaxed), std::memory_order_relaxed);
    candidate.stopped.store(pending->stopped.load(std::memory_order_relaxed), std::memory_order_relaxed);
    candidate.factory_thread.store(thread, std::memory_order_relaxed);
    candidate.state.store(2, std::memory_order_release);
    pending->state.store(0, std::memory_order_release);
}

void RecordAdmission(const CONTEXT* context) noexcept {
    const DWORD thread = GetCurrentThreadId();
    InvalidateSendFrame(context, thread);
    ObserveThread(thread);
    std::int32_t entity = 0;
    std::uint8_t stopped = 0;
    std::uintptr_t storage = 0;
    std::uint8_t result = 0;
    if (!SafeReadAction(static_cast<std::uintptr_t>(context->Rbx), &entity, &stopped, &storage,
                        &result)) return;
    const bool callback_shape_matches = SafeReadCallbackShape(context);
    bool progress_empty = false;
    const bool progress_known = SafeReadProgressEmpty(static_cast<std::uintptr_t>(context->R9), &progress_empty);
    IncrementSaturating(admission_hits);
    if (saturated.load(std::memory_order_acquire)) {
        IncrementSaturating(dropped_candidates);
        return;
    }
    CandidateSlot* matched = nullptr;
    std::uint64_t selected_sequence = 0;
    for (unsigned scan = 0; scan != 4 && !matched; ++scan) {
        CandidateSlot* selected = nullptr;
        selected_sequence = 0;
        for (auto& slot : candidate_slots) {
            if (slot.state.load(std::memory_order_acquire) != 2) continue;
            const auto candidate_storage = slot.storage.load(std::memory_order_relaxed);
            const auto candidate_sequence = slot.sequence.load(std::memory_order_relaxed);
            if (candidate_storage == storage && candidate_sequence > selected_sequence) {
                selected = &slot;
                selected_sequence = candidate_sequence;
            }
        }
        if (!selected) break;
        std::uint32_t ready = 2;
        if (!selected->state.compare_exchange_strong(ready, 3, std::memory_order_acq_rel)) continue;
        // A ring writer may have replaced the scanned record before our CAS
        // observed its newly-published ready state. Do not consume that record
        // until a fresh scan selected its exact generation and storage.
        if (selected->sequence.load(std::memory_order_relaxed) != selected_sequence ||
            selected->storage.load(std::memory_order_relaxed) != storage) {
            selected->state.store(2, std::memory_order_release);
            continue;
        }
        matched = selected;
    }
    if (!matched) {
        IncrementSaturating(dropped_candidates);
        return;
    }
    const auto same_payload = matched->entity.load(std::memory_order_relaxed) == entity &&
        matched->stopped.load(std::memory_order_relaxed) == stopped;
    if (matched->factory_thread.load(std::memory_order_relaxed) != thread)
        cross_thread.store(true, std::memory_order_relaxed);
    matched->state.store(0, std::memory_order_release);
    if (!same_payload) {
        IncrementSaturating(dropped_candidates);
        return;
    }
    const auto packed = static_cast<std::uint64_t>(static_cast<std::uint32_t>(entity)) |
        (static_cast<std::uint64_t>(stopped) << 32) | (1ULL << 33) |
        (static_cast<std::uint64_t>(result == 0) << 34) |
        (static_cast<std::uint64_t>(callback_shape_matches) << 35) |
        (static_cast<std::uint64_t>(progress_known) << 36) |
        (static_cast<std::uint64_t>(progress_empty) << 37);
    latest_action.store(packed, std::memory_order_release);
    std::uint32_t ready = latest_admission.state.load(std::memory_order_acquire);
    const bool claimed = (ready == 0 || ready == 2) &&
        latest_admission.state.compare_exchange_strong(ready, 1, std::memory_order_acq_rel);
    if (claimed) {
        latest_admission.storage.store(storage, std::memory_order_relaxed);
        latest_admission.state.store(2, std::memory_order_release);
    }
    latest_correlated_admission_thread.store(thread, std::memory_order_release);
    RecordSendInvocation(context, thread, storage);
    IncrementSaturating(correlated_hits);
}

LONG CALLBACK OnException(EXCEPTION_POINTERS* pointers) noexcept {
    if (!pointers || !pointers->ExceptionRecord || !pointers->ContextRecord ||
        pointers->ExceptionRecord->ExceptionCode != EXCEPTION_BREAKPOINT ||
        pointers->ExceptionRecord->ExceptionFlags != 0) return EXCEPTION_CONTINUE_SEARCH;
    const auto address = reinterpret_cast<std::uintptr_t>(pointers->ExceptionRecord->ExceptionAddress);
    const auto rip = static_cast<std::uintptr_t>(pointers->ContextRecord->Rip);
    const auto factory = sites[0].address.load(std::memory_order_acquire);
    const auto factory_post = sites[1].address.load(std::memory_order_acquire);
    const auto admission = sites[2].address.load(std::memory_order_acquire);
    const auto callback_tail = sites[3].address.load(std::memory_order_acquire);
    const auto send_return = sites[4].address.load(std::memory_order_acquire);
    const auto marshaler_return = sites[5].address.load(std::memory_order_acquire);
    if (address == factory && rip == factory) {
        // Preserve the replaced instruction exactly; MOV changes no flags.
        pointers->ContextRecord->Rbx = static_cast<std::uint32_t>(pointers->ContextRecord->R8);
        pointers->ContextRecord->Rip += kFactoryBytes.size();
        if (active.load(std::memory_order_acquire)) RecordFactory(pointers->ContextRecord);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    if (address == factory_post && rip == factory_post) {
        pointers->ContextRecord->Rip += kFactoryPostBytes.size(); // emulate NOP
        if (active.load(std::memory_order_acquire)) RecordFactoryPost(pointers->ContextRecord);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    if (address == admission && rip == admission) {
        pointers->ContextRecord->Rdx = pointers->ContextRecord->Rbx;
        pointers->ContextRecord->Rip += kAdmissionBytes.size();
        if (active.load(std::memory_order_acquire)) RecordAdmission(pointers->ContextRecord);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    if (address == callback_tail && rip == callback_tail) {
        // The replaced five-byte JMP changes neither registers nor flags.
        // Always emulate it, even after Stop, for a trap raised in the patch window.
        pointers->ContextRecord->Rip = callback_continuation.load(std::memory_order_acquire);
        if (active.load(std::memory_order_acquire)) RecordCallback(pointers->ContextRecord);
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    if ((address == send_return && rip == send_return) ||
        (address == marshaler_return && rip == marshaler_return)) {
        // Both exact sites are a one-byte NOP after a normal CALL return,
        // inside the primary function body, before native cleanup. Preserve
        // every register/flag and keep emulating traps raised during Stop.
        pointers->ContextRecord->Rip += kNormalReturnBytes.size();
        if (active.load(std::memory_order_acquire)) {
            if (address == send_return) RecordSendReturn(pointers->ContextRecord);
            else RecordMarshalerReturn(pointers->ContextRecord);
        }
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    return EXCEPTION_CONTINUE_SEARCH;
}

bool CompatibleMitigations() noexcept {
    PROCESS_MITIGATION_DYNAMIC_CODE_POLICY policy{};
    return !IsDebuggerPresent() &&
        GetProcessMitigationPolicy(GetCurrentProcess(), ProcessDynamicCodePolicy,
                                   &policy, sizeof(policy)) && !policy.ProhibitDynamicCode;
}

template<std::size_t N>
bool ValidSite(void* address, const std::array<unsigned char, N>& bytes,
               HMODULE allocation_base) noexcept {
    MEMORY_BASIC_INFORMATION memory{};
    const auto raw = reinterpret_cast<std::uintptr_t>(address);
    return VirtualQuery(address, &memory, sizeof(memory)) == sizeof(memory) &&
        memory.State == MEM_COMMIT && memory.Type == MEM_IMAGE &&
        memory.AllocationBase == allocation_base && memory.Protect == PAGE_EXECUTE_READ &&
        raw >= reinterpret_cast<std::uintptr_t>(memory.BaseAddress) &&
        raw - reinterpret_cast<std::uintptr_t>(memory.BaseAddress) <= memory.RegionSize &&
        bytes.size() <= memory.RegionSize -
            (raw - reinterpret_cast<std::uintptr_t>(memory.BaseAddress)) &&
        std::memcmp(address, bytes.data(), bytes.size()) == 0;
}

bool ValidOwnedCallbackTail(void* address, HMODULE allocation_base) noexcept {
    MEMORY_BASIC_INFORMATION memory{};
    const auto raw = reinterpret_cast<std::uintptr_t>(address);
    if (VirtualQuery(address, &memory, sizeof(memory)) != sizeof(memory) ||
        memory.State != MEM_COMMIT || memory.Type != MEM_IMAGE ||
        memory.AllocationBase != allocation_base || memory.Protect != PAGE_EXECUTE_READ ||
        raw < reinterpret_cast<std::uintptr_t>(memory.BaseAddress) ||
        kCallbackTailBytes.size() > memory.RegionSize - (raw - reinterpret_cast<std::uintptr_t>(memory.BaseAddress)) ||
        *static_cast<unsigned char*>(address) != 0xe9) return false;
    std::int32_t displacement = 0;
    std::memcpy(&displacement, static_cast<unsigned char*>(address) + 1, sizeof(displacement));
    const auto target = raw + kCallbackTailBytes.size() + displacement;
    MEMORY_BASIC_INFORMATION continuation{};
    return VirtualQuery(reinterpret_cast<const void*>(target), &continuation, sizeof(continuation)) == sizeof(continuation) &&
        continuation.State == MEM_COMMIT && continuation.Type == MEM_IMAGE &&
        continuation.AllocationBase == allocation_base && continuation.Protect == PAGE_EXECUTE_READ;
}

Status RestoreSite(SiteState& site) noexcept {
    if (!site.restoration_pending) return Status::stopped;
    auto* address = reinterpret_cast<unsigned char*>(site.address.load());
    DWORD old = 0;
    if (!VirtualProtect(address, 1, PAGE_EXECUTE_READWRITE, &old)) return Status::restore_failed;
    const char previous = site.owns_byte
        ? _InterlockedCompareExchange8(reinterpret_cast<volatile char*>(address),
              static_cast<char>(site.original), static_cast<char>(0xcc))
        : static_cast<char>(site.original);
    const bool ours = static_cast<unsigned char>(previous) == 0xcc ||
                      static_cast<unsigned char>(previous) == site.original;
    DWORD ignored = 0;
    const bool flushed = FlushInstructionCache(GetCurrentProcess(), address, 1) != FALSE;
    const bool protected_again = VirtualProtect(address, 1, site.protection, &ignored) != FALSE;
    if (ours && flushed && protected_again) site.restoration_pending = false;
    return !ours ? Status::foreign_patch :
        (flushed && protected_again ? Status::stopped : Status::restore_failed);
}

Status ArmSite(SiteState& site, void* address, unsigned char expected) noexcept {
    site.address.store(reinterpret_cast<std::uintptr_t>(address), std::memory_order_release);
    site.original = expected;
    DWORD old = 0;
    if (!VirtualProtect(address, 1, PAGE_EXECUTE_READWRITE, &old)) return Status::patch_failed;
    site.protection = old;
    site.restoration_pending = true;
    if (old != PAGE_EXECUTE_READ || *static_cast<unsigned char*>(address) != expected) {
        DWORD ignored = 0;
        if (!VirtualProtect(address, 1, old, &ignored)) return Status::restore_failed;
        site.restoration_pending = false;
        return Status::invalid_site;
    }
    const auto previous = _InterlockedCompareExchange8(static_cast<volatile char*>(address),
        static_cast<char>(0xcc), static_cast<char>(expected));
    if (static_cast<unsigned char>(previous) != expected) {
        DWORD ignored = 0;
        (void)VirtualProtect(address, 1, old, &ignored);
        site.restoration_pending = false;
        return Status::foreign_patch;
    }
    site.owns_byte = true;
    DWORD ignored = 0;
    if (!FlushInstructionCache(GetCurrentProcess(), address, 1) ||
        !VirtualProtect(address, 1, old, &ignored)) return Status::restore_failed;
    return Status::started;
}

Status StartSites(void* factory, void* factory_post, void* admission, void* callback_tail,
                  void* send_return, void* marshaler_return,
                  HMODULE allocation_base, std::uintptr_t continuation, bool owned_callback_tail) noexcept {
    if (active.load()) return Status::already_started;
    if (attempted) return Status::restart_disallowed;
    if (!CompatibleMitigations()) return Status::incompatible_mitigation;
    if (!ValidSite(factory, kFactoryBytes, allocation_base) ||
        !ValidSite(factory_post, kFactoryPostBytes, allocation_base) ||
        !ValidSite(admission, kAdmissionBytes, allocation_base) ||
        !(owned_callback_tail ? ValidSite(send_return, kNormalReturnBytes, allocation_base) :
            ValidSite(send_return, kSendReturnWindow, allocation_base)) ||
        !(owned_callback_tail ? ValidSite(marshaler_return, kNormalReturnBytes, allocation_base) :
            ValidSite(marshaler_return, kMarshalerReturnWindow, allocation_base)) ||
        !(owned_callback_tail ? ValidOwnedCallbackTail(callback_tail, allocation_base) :
            ValidSite(callback_tail, kCallbackTailBytes, allocation_base))) return Status::invalid_site;
    image_base.store(reinterpret_cast<std::uintptr_t>(allocation_base), std::memory_order_release);
    callback_continuation.store(continuation, std::memory_order_release);
    HMODULE pinned = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
            reinterpret_cast<LPCWSTR>(&OnException), &pinned)) return Status::pin_failed;
    attempted = true;
    handler = AddVectoredExceptionHandler(1, &OnException);
    if (!handler) return Status::handler_failed;
    auto result = ArmSite(sites[0], factory, kFactoryBytes[0]);
    if (result != Status::started) {
        const auto restored = RestoreSite(sites[0]);
        return restored == Status::stopped ? result : restored;
    }
    result = ArmSite(sites[1], factory_post, kFactoryPostBytes[0]);
    if (result != Status::started) {
        const auto second = RestoreSite(sites[1]);
        const auto first = RestoreSite(sites[0]);
        return first != Status::stopped ? first : second != Status::stopped ? second : result;
    }
    result = ArmSite(sites[2], admission, kAdmissionBytes[0]);
    if (result != Status::started) {
        const auto third = RestoreSite(sites[2]);
        const auto second = RestoreSite(sites[1]);
        const auto first = RestoreSite(sites[0]);
        return first != Status::stopped ? first : second != Status::stopped ? second :
            third != Status::stopped ? third : result;
    }
    result = ArmSite(sites[3], callback_tail, kCallbackTailBytes[0]);
    if (result != Status::started) {
        const auto fourth = RestoreSite(sites[3]);
        const auto third = RestoreSite(sites[2]);
        const auto second = RestoreSite(sites[1]);
        const auto first = RestoreSite(sites[0]);
        return first != Status::stopped ? first : second != Status::stopped ? second :
            third != Status::stopped ? third : fourth != Status::stopped ? fourth : result;
    }
    for (std::size_t index = 4; index != sites.size(); ++index) {
        result = ArmSite(sites[index], index == 4 ? send_return : marshaler_return, kNormalReturnBytes[0]);
        if (result != Status::started) {
            for (std::size_t restore = index + 1; restore != 0; --restore) {
                const auto restored = RestoreSite(sites[restore - 1]);
                if (restored != Status::stopped) result = restored;
            }
            return result;
        }
    }
    active.store(true, std::memory_order_release);
    return Status::started;
}

}  // namespace

Status Start() noexcept {
    AcquireSRWLockExclusive(&lifecycle_lock);
    Status result = Status::unsupported_image;
    void* qualified = nullptr;
    const auto exact = tf3postobserver::QualifyExactSite(&qualified);
    if (exact == tf3postobserver::Status::started) {
        auto* base = reinterpret_cast<unsigned char*>(GetModuleHandleW(nullptr));
        result = StartSites(base + kFactoryRva, base + kFactoryPostRva,
                            base + kAdmissionRva, base + kCallbackTailRva,
                            base + kSendReturnRva, base + kMarshalerReturnRva,
                            GetModuleHandleW(nullptr), reinterpret_cast<std::uintptr_t>(base) + kCallbackContinuationRva, false);
    }
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return result;
}

Status Stop() noexcept {
    AcquireSRWLockExclusive(&lifecycle_lock);
    active.store(false, std::memory_order_release);
    Status result = attempted ? Status::stopped : Status::never_started;
    for (std::size_t index = sites.size(); index != 0; --index) {
        const auto restored = RestoreSite(sites[index - 1]);
        if (restored != Status::stopped) result = restored;
    }
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return result;
}

Snapshot Read() noexcept {
    const auto packed = latest_action.load(std::memory_order_acquire);
    const auto callback = latest_callback.load(std::memory_order_acquire);
    const auto marshaler = latest_marshaler.load(std::memory_order_acquire);
    return {factory_hits.load(std::memory_order_acquire),
            admission_hits.load(std::memory_order_acquire),
            correlated_hits.load(std::memory_order_acquire),
            dropped_candidates.load(std::memory_order_acquire),
            observed_thread.load(), static_cast<std::int32_t>(packed & 0xffffffffULL),
            static_cast<std::uint8_t>((packed >> 32) & 1), ((packed >> 33) & 1) != 0,
            ((packed >> 34) & 1) != 0, ((packed >> 35) & 1) != 0,
            active.load(), cross_thread.load(), saturated.load(),
            callback_hits.load(std::memory_order_acquire), callback_thread.load(std::memory_order_acquire),
            static_cast<std::int32_t>(callback & 0xffffffffULL),
            static_cast<std::uint8_t>((callback >> 32) & 1),
            static_cast<std::uint8_t>((callback >> 33) & 0xff),
            ((callback >> 41) & 1) != 0, ((callback >> 42) & 1) != 0,
            ((packed >> 36) & 1) != 0, ((packed >> 37) & 1) != 0,
            latest_correlated_admission_thread.load(std::memory_order_acquire),
            send_return_hits.load(std::memory_order_acquire),
            send_return_thread.load(std::memory_order_acquire),
            latest_send_return_matches_admission_storage.load(std::memory_order_acquire),
            marshaler_return_hits.load(std::memory_order_acquire),
            marshaler_return_thread.load(std::memory_order_acquire),
            static_cast<std::int32_t>(marshaler & 0xffffffffULL),
            static_cast<std::uint8_t>((marshaler >> 32) & 1),
            static_cast<std::uint8_t>((marshaler >> 33) & 0xff),
            ((marshaler >> 41) & 1) != 0, ((marshaler >> 42) & 1) != 0,
            ((marshaler >> 43) & 1) != 0};
}

#ifdef TF3_VEHICLE_OBSERVER_OWNED_TEST
Status StartOwnedFixture(void* factory, void* factory_post, void* admission, void* callback_tail,
                         void* send_return, void* marshaler_return) noexcept {
    AcquireSRWLockExclusive(&lifecycle_lock);
    HMODULE base = nullptr;
    MEMORY_BASIC_INFORMATION memory{};
    if (VirtualQuery(factory, &memory, sizeof(memory)) == sizeof(memory))
        base = static_cast<HMODULE>(memory.AllocationBase);
    std::int32_t displacement = 0;
    std::memcpy(&displacement, static_cast<unsigned char*>(callback_tail) + 1, sizeof(displacement));
    const auto continuation = reinterpret_cast<std::uintptr_t>(callback_tail) + kCallbackTailBytes.size() + displacement;
    const auto result = StartSites(factory, factory_post, admission, callback_tail, send_return,
                                   marshaler_return, base, continuation, true);
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return result;
}
LONG DispatchOwnedException(EXCEPTION_POINTERS* pointers) noexcept {
    return OnException(pointers);
}
#endif

}  // namespace tf3vehicleobserver
