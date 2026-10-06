#include "loan_invocation_stack.h"
#include <limits>

namespace tf3loaninvocation {
namespace {
Result Walk(const Site& site, CONTEXT* output, unsigned max_frames, WalkReport* report) {
    ULONG_PTR low = 0, high = 0;
    GetCurrentThreadStackLimits(&low, &high);
    if (!low || high <= low) return Result::invalid_stack;
    CONTEXT context{};
    RtlCaptureContext(&context);
    for (unsigned i = 0; i < max_frames; ++i) {
        if (report) {
            *report = {};
            report->frames_examined = i + 1;
            report->rip = context.Rip;
        }
        if (!context.Rip) return Result::missing;
        if (context.Rsp < low || context.Rsp > high - sizeof(DWORD64) || (context.Rsp & 7))
            return Result::invalid_stack;
        DWORD64 image_base = 0;
        auto* function = RtlLookupFunctionEntry(context.Rip, &image_base, nullptr);
        if (report && function) {
            report->has_function = true;
            report->image_base = image_base;
            report->begin_rva = function->BeginAddress;
            report->end_rva = function->EndAddress;
        }
        const bool inside = context.Rip >= site.image_base + site.begin_rva &&
            context.Rip < site.image_base + site.end_rva;
        if (inside) {
            // First invocation frame is authoritative for this observation;
            // another return site cannot be skipped to find an older frame.
            if (!function || image_base != site.image_base ||
                function->BeginAddress != site.begin_rva || function->EndAddress != site.end_rva ||
                context.Rip != site.image_base + site.return_rva) return Result::wrong_return;
            *output = context;
            return Result::found;
        }
        const DWORD64 old_rsp = context.Rsp;
        if (function) {
            void* handler_data = nullptr; DWORD64 establisher = 0;
            RtlVirtualUnwind(UNW_FLAG_NHANDLER, image_base, context.Rip, function,
                &context, &handler_data, &establisher, nullptr);
        } else {
            // An absent entry cannot distinguish a leaf from unregistered
            // nonleaf code. Never scan stack words for an older invocation.
            return Result::missing_metadata;
        }
        if (context.Rsp <= old_rsp || context.Rsp > high) return Result::invalid_stack;
    }
    return Result::depth_limit;
}
}
Result CaptureCurrent(const Site& site, CONTEXT* output, unsigned max_frames, WalkReport* report) noexcept {
    if (report) *report = {};
    if (!output || !site.image_base || site.begin_rva >= site.end_rva ||
        site.return_rva < site.begin_rva || site.return_rva >= site.end_rva ||
        site.image_base > (std::numeric_limits<std::uint64_t>::max)() - site.end_rva ||
        !max_frames || max_frames > 64) return Result::invalid_site;
    // No destructors or Lua longjmp across this scope. Faults publish no frame.
    __try { return Walk(site, output, max_frames, report); }
    __except ((GetExceptionCode() == EXCEPTION_ACCESS_VIOLATION ||
        GetExceptionCode() == EXCEPTION_IN_PAGE_ERROR)
        ? EXCEPTION_EXECUTE_HANDLER : EXCEPTION_CONTINUE_SEARCH) { return Result::unwind_fault; }
}
}
