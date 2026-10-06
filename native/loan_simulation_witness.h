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
enum class CaptureFailure : DWORD {
    none = 0, arguments = 1, invocation = 2, manager_field = 3,
    manager_read = 4, thread_field = 5, thread_read = 6, thread_owner = 7,
    manager_reread = 8, manager_changed = 9, thread_reread = 10, thread_changed = 11
};
// Detached diagnostics only. A failed capture never publishes a Snapshot.
// Facts are copied only after their existing read succeeds; unavailable facts
// remain zero. No report address can be used as a retained lifetime witness.
struct CaptureReport {
    CaptureFailure failure = CaptureFailure::none;
    bool invocation_checked = false;
    tf3loaninvocation::Result invocation_result = tf3loaninvocation::Result::invalid_site;
    tf3loaninvocation::WalkReport walk{};
    std::uint64_t game = 0, manager = 0, manager_after = 0;
    DWORD thread_id = 0, thread_after = 0;
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
inline bool CaptureCurrent(const tf3loaninvocation::Site& site, ReadSpan read, Snapshot* output,
    CaptureReport* report = nullptr) noexcept {
    if (report) *report = {};
    const auto reject = [&](CaptureFailure failure) noexcept {
        if (report) report->failure = failure;
        return false;
    };
    if (!read || !output) return reject(CaptureFailure::arguments);
    CONTEXT context{};
    const auto invocation = tf3loaninvocation::CaptureCurrent(
        site, &context, tf3loaninvocation::kMaxWalkFrames, report ? &report->walk : nullptr);
    if (report) {
        report->invocation_checked = true;
        report->invocation_result = invocation;
    }
    if (invocation != tf3loaninvocation::Result::found) return reject(CaptureFailure::invocation);
    if (report) report->game = context.R13;
    std::uint64_t manager_field = 0, manager = 0, thread_field = 0;
    if (!Field(context.R13, 0x1f0, sizeof manager, &manager_field))
        return reject(CaptureFailure::manager_field);
    if (!read(manager_field, &manager, sizeof manager)) return reject(CaptureFailure::manager_read);
    if (report) report->manager = manager;
    if (!Field(manager, 0xa8, sizeof(DWORD), &thread_field)) return reject(CaptureFailure::thread_field);
    DWORD thread_id = 0;
    if (!read(thread_field, &thread_id, sizeof thread_id)) return reject(CaptureFailure::thread_read);
    if (report) report->thread_id = thread_id;
    if (!thread_id || thread_id != GetCurrentThreadId()) return reject(CaptureFailure::thread_owner);
    std::uint64_t fresh_manager = 0;
    DWORD fresh_thread = 0;
    if (!read(manager_field, &fresh_manager, sizeof fresh_manager))
        return reject(CaptureFailure::manager_reread);
    if (report) report->manager_after = fresh_manager;
    if (fresh_manager != manager) return reject(CaptureFailure::manager_changed);
    if (!read(thread_field, &fresh_thread, sizeof fresh_thread)) return reject(CaptureFailure::thread_reread);
    if (report) report->thread_after = fresh_thread;
    if (fresh_thread != thread_id) return reject(CaptureFailure::thread_changed);
    *output = {context.R13, manager, thread_id};
    return true;
}
inline bool MatchesCurrent(const tf3loaninvocation::Site& site, ReadSpan read) noexcept {
    Snapshot snapshot{};
    return CaptureCurrent(site, read, &snapshot);
}
struct SelectedState {
    std::int32_t index = 0;
    std::uint64_t state = 0, engine = 0;
};
// Exact 40408: constructor 0x118d96 constructs two inline pointer slots at
// manager+0x78; 0x118de1 initializes index+0x98 to zero, and 0x11f85c flips
// it to 1-index. Dispatcher 0x1204ba reads that slot directly (not a vector).
// GameState+0x18 is the Engine used by command application at 0x9e1c74.
// Caller must qualify these spans and bracket this read with its original
// current Loan invocation/world witness. Readability and matching rereads do
// not establish lifetime, prevent ABA, hold a lock, or authorize execution.
// Output is detached evidence only; never dereference its addresses later.
inline bool CaptureSelectedState(const Snapshot& observed, std::uint64_t expected_engine,
    ReadSpan read, SelectedState* output) noexcept {
    if (!read || !output || !expected_engine || !observed.thread_id ||
        observed.thread_id != GetCurrentThreadId()) return false;
    std::uint64_t manager_field = 0, thread_field = 0, index_field = 0;
    if (!Field(observed.game, 0x1f0, sizeof(std::uint64_t), &manager_field) ||
        !Field(observed.manager, 0xa8, sizeof(DWORD), &thread_field) ||
        !Field(observed.manager, 0x98, sizeof(std::int32_t), &index_field)) return false;
    std::uint64_t manager = 0;
    DWORD thread = 0;
    SelectedState result{};
    if (!read(manager_field, &manager, sizeof manager) || manager != observed.manager ||
        !read(thread_field, &thread, sizeof thread) || thread != observed.thread_id ||
        !read(index_field, &result.index, sizeof result.index) ||
        (result.index != 0 && result.index != 1)) return false;
    std::uint64_t slot = 0, engine_field = 0;
    if (!Field(manager, 0x78 + static_cast<std::uint64_t>(result.index) * 8,
            sizeof result.state, &slot) ||
        !read(slot, &result.state, sizeof result.state) ||
        !Field(result.state, 0x18, sizeof result.engine, &engine_field) ||
        !read(engine_field, &result.engine, sizeof result.engine) ||
        result.engine != expected_engine) return false;
    std::uint64_t fresh_engine = 0, fresh_state = 0, fresh_manager = 0;
    std::int32_t fresh_index = -1;
    DWORD fresh_thread = 0;
    if (!read(engine_field, &fresh_engine, sizeof fresh_engine) || fresh_engine != result.engine ||
        !read(slot, &fresh_state, sizeof fresh_state) || fresh_state != result.state ||
        !read(index_field, &fresh_index, sizeof fresh_index) || fresh_index != result.index ||
        !read(thread_field, &fresh_thread, sizeof fresh_thread) || fresh_thread != observed.thread_id ||
        !read(manager_field, &fresh_manager, sizeof fresh_manager) || fresh_manager != observed.manager)
        return false;
    *output = result;
    return true;
}
}
