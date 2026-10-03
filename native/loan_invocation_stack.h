#pragma once
#include <windows.h>
#include <cstdint>

namespace tf3loaninvocation {
// Supplied only by an independently qualified image adapter, never by Lua.
struct Site { std::uint64_t image_base; std::uint32_t begin_rva, end_rva, return_rva; };
enum class Result { found, invalid_site, missing, wrong_return, invalid_stack, depth_limit, unwind_fault, missing_metadata };
// Ordinary current-thread native callback only. Never use from VEH, a worker,
// or a saved CONTEXT. The nearest invocation must match; do not search past it.
// No authorization, target-memory writes or Lua API calls are performed here.
Result CaptureCurrent(const Site&, CONTEXT* output, unsigned max_frames = 64) noexcept;
}
