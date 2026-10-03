#pragma once
#include "loan_invocation_stack.h"
#include <cstddef>

namespace tf3loansimulation {
// Diagnostic prerequisite only. The adapter must qualify Site and these
// exact-build offsets before using this decoder. No permission is granted.
using ReadSpan = bool (*)(std::uint64_t, void*, std::size_t) noexcept;
struct Snapshot {
    std::uint64_t game = 0, manager = 0;
    DWORD thread_id = 0;
};
inline bool Field(std::uint64_t base, std::uint64_t offset,
    std::size_t bytes, std::uint64_t* address) noexcept {
    constexpr std::uint64_t limit = 0x00007fffffffffffULL;
    if (!base || !bytes || !address || base > limit || offset > limit - base ||
        bytes - 1 > limit - base - offset) return false;
    *address = base + offset;
    return true;
}
// The reader must reject unreadable, uncommitted and guard pages without
// dereferencing them. It must not call Lua or retain addresses after return.
// A readable pointer alone cannot establish engine object lifetime.
inline bool CaptureCurrent(const tf3loaninvocation::Site& site, ReadSpan read, Snapshot* output) noexcept {
    if (!read || !output) return false;
    CONTEXT context{};
    if (tf3loaninvocation::CaptureCurrent(site, &context) !=
        tf3loaninvocation::Result::found) return false;
    std::uint64_t manager_field = 0, manager = 0, thread_field = 0;
    if (!Field(context.R13, 0x1f0, sizeof manager, &manager_field) ||
        !read(manager_field, &manager, sizeof manager) ||
        !Field(manager, 0xa8, sizeof(DWORD), &thread_field)) return false;
    DWORD thread_id = 0;
    if (!read(thread_field, &thread_id, sizeof thread_id) ||
        !thread_id || thread_id != GetCurrentThreadId()) return false;
    std::uint64_t fresh_manager = 0;
    DWORD fresh_thread = 0;
    const bool valid = read(manager_field, &fresh_manager, sizeof fresh_manager) &&
        fresh_manager == manager && read(thread_field, &fresh_thread, sizeof fresh_thread) &&
        fresh_thread == thread_id;
    if (!valid) return false;
    *output = {context.R13, manager, thread_id};
    return true;
}
inline bool MatchesCurrent(const tf3loaninvocation::Site& site, ReadSpan read) noexcept {
    Snapshot snapshot{};
    return CaptureCurrent(site, read, &snapshot);
}
}
