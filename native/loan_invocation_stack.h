#pragma once
#include <windows.h>
#include <cstdint>

namespace tf3loaninvocation {
inline constexpr unsigned kMaxWalkFrames = 128;
// Supplied only by an independently qualified image adapter, never by Lua.
struct Site { std::uint64_t image_base; std::uint32_t begin_rva, end_rva, return_rva; };
enum class Result { found, invalid_site, missing, wrong_return, invalid_stack, depth_limit, unwind_fault, missing_metadata };
// Detached diagnostics for the last frame examined, including the last
// budgeted frame on depth_limit. Metadata stays unavailable until lookup
// succeeds. These addresses never authorize a later read or invocation.
struct WalkReport {
    unsigned frames_examined = 0;
    std::uint64_t rip = 0, image_base = 0;
    std::uint32_t begin_rva = 0, end_rva = 0;
    bool has_function = false;
};
// Ordinary current-thread native callback only. Never use from VEH, a worker,
// or a saved CONTEXT. The nearest invocation must match; do not search past it.
// No authorization, target-memory writes or Lua API calls are performed here.
Result CaptureCurrent(const Site&, CONTEXT* output, unsigned max_frames = 64,
    WalkReport* report = nullptr) noexcept;
}
