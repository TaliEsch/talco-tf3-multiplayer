#include "common_exit_passive_observer.h"

#include <atomic>
#include <intrin.h>
#include <limits>

namespace tf3commonexitpassive {
namespace {
constexpr std::uintptr_t kSavedR12Offset = 0x40;
constexpr std::uintptr_t kReturnOffset = 0x58;
constexpr std::uintptr_t kSlotSize = sizeof(std::uint64_t);
constexpr std::uintptr_t kMinimumObservedHeadroom = 0x2000;
constexpr std::uint32_t kReturnA = 0x11e32b;
constexpr std::uint32_t kReturnB = 0x11ecd9;
constexpr auto kNoMinimum = (std::numeric_limits<std::uint64_t>::max)();

static_assert(sizeof(std::uintptr_t) == sizeof(std::uint64_t), "x64 only");
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
static_assert(std::atomic<std::uint32_t>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);

std::atomic<std::uint64_t> attempts{0}, valid_samples{0};
std::atomic<std::uint64_t> owner_unestablished{0}, owner_match{0}, owner_mismatch{0};
std::atomic<std::uint64_t> rejected_stack{0}, rejected_read_fault{0};
std::atomic<std::uint64_t> zero_r12d{0}, nonzero_r12d{0};
std::atomic<std::uint64_t> return_a{0}, return_b{0}, unknown_return_rva{0};
std::atomic<std::uint64_t> unaligned_rsp{0}, headroom_below_8k{0};
std::atomic<std::uint64_t> minimum_stack_headroom{kNoMinimum};
std::atomic<std::uint32_t> latest_original_r12d{0}, latest_return_rva{0};
std::atomic<std::uint32_t> latest_thread{0}, latest_expected_owner{0};
std::atomic<bool> latest_return_rva_known{false};
std::atomic<bool> latest_return_unknown{false};
std::atomic<bool> counter_saturated{false}, counter_contention{false};

// One CAS keeps exception-path work bounded. If two unexpected callers race,
// explicitly flag the lost diagnostic count rather than retry in a VEH.
void Increment(std::atomic<std::uint64_t>& count) noexcept {
    auto previous = count.load(std::memory_order_relaxed);
    if (previous == kNoMinimum) {
        counter_saturated.store(true, std::memory_order_relaxed);
    } else if (!count.compare_exchange_strong(previous, previous + 1,
                                              std::memory_order_relaxed)) {
        counter_contention.store(true, std::memory_order_relaxed);
    }
}

// This function has only scalar locals so MSVC SEH can reject an inaccessible
// stack page despite previously validated NT_TIB bounds.
bool ReadInterruptedSlots(std::uintptr_t rsp, std::uint64_t* savedR12,
                          std::uintptr_t* returnAddress) noexcept {
    __try {
        *savedR12 = *reinterpret_cast<const std::uint64_t*>(rsp + kSavedR12Offset);
        *returnAddress = *reinterpret_cast<const std::uintptr_t*>(rsp + kReturnOffset);
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}
}

std::optional<std::uint64_t> Observe(const CONTEXT& context,
                                     std::uint32_t ownerThread,
                                     std::uintptr_t imageBase,
                                     std::uint32_t imageSize) noexcept {
    Increment(attempts);
    const auto currentThread = GetCurrentThreadId();
    if (ownerThread == 0) Increment(owner_unestablished);
    else if (currentThread == ownerThread) Increment(owner_match);
    else Increment(owner_mismatch);

    const auto rsp = static_cast<std::uintptr_t>(context.Rsp);
    const auto stackLimit = static_cast<std::uintptr_t>(
        __readgsqword(FIELD_OFFSET(NT_TIB, StackLimit)));
    const auto stackBase = static_cast<std::uintptr_t>(
        __readgsqword(FIELD_OFFSET(NT_TIB, StackBase)));
    // Subtraction after ordered comparisons avoids overflow from RSP+58h+8.
    if (stackLimit == 0 || stackBase <= stackLimit || rsp < stackLimit ||
        rsp > stackBase || stackBase - rsp < kReturnOffset + kSlotSize) {
        Increment(rejected_stack);
        return std::nullopt;
    }

    std::uint64_t savedR12 = 0;
    std::uintptr_t returnAddress = 0;
    if (!ReadInterruptedSlots(rsp, &savedR12, &returnAddress)) {
        Increment(rejected_read_fault);
        return std::nullopt;
    }
    // The caller supplies a previously qualified image extent. Never retain a
    // raw return address or turn an out-of-range address into a fabricated RVA.
    const bool returnRvaKnown = imageBase != 0 && imageSize != 0 &&
        returnAddress >= imageBase && returnAddress - imageBase < imageSize;
    const auto returnRva = returnRvaKnown
        ? static_cast<std::uint32_t>(returnAddress - imageBase) : 0u;
    const auto originalR12d = static_cast<std::uint32_t>(context.R12);
    const auto headroom = static_cast<std::uint64_t>(rsp - stackLimit);
    if ((rsp & 15u) != 0) Increment(unaligned_rsp);
    if (headroom < kMinimumObservedHeadroom) Increment(headroom_below_8k);
    auto minimum = minimum_stack_headroom.load(std::memory_order_relaxed);
    if (headroom < minimum && !minimum_stack_headroom.compare_exchange_strong(
            minimum, headroom, std::memory_order_relaxed))
        counter_contention.store(true, std::memory_order_relaxed);
    Increment(originalR12d == 0 ? zero_r12d : nonzero_r12d);
    if (returnRvaKnown && returnRva == kReturnA) Increment(return_a);
    else if (returnRvaKnown && returnRva == kReturnB) Increment(return_b);
    else Increment(unknown_return_rva);
    latest_original_r12d.store(originalR12d, std::memory_order_relaxed);
    latest_return_rva.store(returnRva, std::memory_order_relaxed);
    latest_thread.store(currentThread, std::memory_order_relaxed);
    latest_expected_owner.store(ownerThread, std::memory_order_relaxed);
    latest_return_unknown.store(!returnRvaKnown ||
        (returnRva != kReturnA && returnRva != kReturnB), std::memory_order_relaxed);
    latest_return_rva_known.store(returnRvaKnown, std::memory_order_release);
    Increment(valid_samples);
    return savedR12;
}

Snapshot Read() noexcept {
    const auto minimum = minimum_stack_headroom.load(std::memory_order_relaxed);
    return {
        attempts.load(std::memory_order_relaxed), valid_samples.load(std::memory_order_relaxed),
        owner_unestablished.load(std::memory_order_relaxed),
        owner_match.load(std::memory_order_relaxed),
        owner_mismatch.load(std::memory_order_relaxed),
        rejected_stack.load(std::memory_order_relaxed),
        rejected_read_fault.load(std::memory_order_relaxed),
        zero_r12d.load(std::memory_order_relaxed),
        nonzero_r12d.load(std::memory_order_relaxed),
        return_a.load(std::memory_order_relaxed), return_b.load(std::memory_order_relaxed),
        unknown_return_rva.load(std::memory_order_relaxed),
        unaligned_rsp.load(std::memory_order_relaxed),
        headroom_below_8k.load(std::memory_order_relaxed),
        minimum == kNoMinimum ? 0 : minimum,
        latest_original_r12d.load(std::memory_order_relaxed),
        latest_return_rva.load(std::memory_order_relaxed),
        latest_thread.load(std::memory_order_relaxed),
        latest_expected_owner.load(std::memory_order_relaxed),
        minimum != kNoMinimum, latest_return_rva_known.load(std::memory_order_acquire),
        latest_return_unknown.load(std::memory_order_relaxed),
        counter_saturated.load(std::memory_order_relaxed),
        counter_contention.load(std::memory_order_relaxed)
    };
}
}
