#include "inprocess_post_observer.h"

#ifdef TF3_POST_OBSERVER_TEST_DLL
extern "C" __declspec(dllexport) tf3postobserver::Status TestStart(void* site) {
    return tf3postobserver::StartOwnedFixture(site);
}
extern "C" __declspec(dllexport) tf3postobserver::Status TestExactStart() { return tf3postobserver::Start(); }
extern "C" __declspec(dllexport) tf3postobserver::Status TestStop() { return tf3postobserver::Stop(); }
extern "C" __declspec(dllexport) tf3postobserver::Snapshot TestSnapshot() { return tf3postobserver::ReadSnapshot(); }
extern "C" __declspec(dllexport) LONG TestDispatch(EXCEPTION_POINTERS* p) {
    return tf3postobserver::DispatchOwnedException(p);
}
extern "C" __declspec(dllexport) void TestEmulate(CONTEXT* c) { tf3postobserver::EmulateOwnedIncrement(c); }
extern "C" __declspec(dllexport) void TestCounter(std::uint64_t value) { tf3postobserver::SetOwnedHitCounter(value); }
#else
#include <array>
#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cwchar>
#include <limits>
#include <thread>

extern "C" unsigned char OwnedPostSite;
extern "C" std::uint32_t OwnedPostExecute(std::uint64_t initial, std::uint32_t limit);
extern "C" void OwnedIncrementReference(std::uint64_t initial, std::uint64_t flags, std::uint64_t* result);
namespace {
void Require(bool value, const char* name) {
    if (!value) { std::fprintf(stderr, "FAIL: %s (win32=%lu)\n", name, GetLastError()); std::exit(1); }
}
template<class T> T Symbol(HMODULE library, const char* name) {
    const auto symbol = GetProcAddress(library, name);
    Require(symbol != nullptr, name);
    return reinterpret_cast<T>(symbol);
}
}
int wmain(int argc, wchar_t** argv) {
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    SetUnhandledExceptionFilter([](EXCEPTION_POINTERS* p) -> LONG {
        std::fprintf(stderr, "Unhandled owned exception code=%08lx address=%p rip=%llx site=%p\n",
            p->ExceptionRecord->ExceptionCode, p->ExceptionRecord->ExceptionAddress,
            p->ContextRecord->Rip, &OwnedPostSite);
        return EXCEPTION_EXECUTE_HANDLER;
    });
    Require(argc == 2 || argc == 3, "DLL argument");
    HMODULE library = LoadLibraryExW(argv[1], nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    Require(library != nullptr, "load test DLL");
    const auto start = Symbol<tf3postobserver::Status(*)(void*)>(library, "TestStart");
    const auto exact = Symbol<tf3postobserver::Status(*)()>(library, "TestExactStart");
    const auto stop = Symbol<tf3postobserver::Status(*)()>(library, "TestStop");
    const auto snapshot = Symbol<tf3postobserver::Snapshot(*)()>(library, "TestSnapshot");
    const auto dispatch = Symbol<LONG(*)(EXCEPTION_POINTERS*)>(library, "TestDispatch");
    const auto emulate = Symbol<void(*)(CONTEXT*)>(library, "TestEmulate");
    const auto counter = Symbol<void(*)(std::uint64_t)>(library, "TestCounter");
    using S = tf3postobserver::Status;
    if (argc == 3 && std::wcscmp(argv[2], L"--dynamic-code-block") == 0) {
        PROCESS_MITIGATION_DYNAMIC_CODE_POLICY policy{};
        policy.ProhibitDynamicCode = 1;
        Require(SetProcessMitigationPolicy(ProcessDynamicCodePolicy, &policy, sizeof(policy)) != FALSE,
            "set owned dynamic-code prohibition");
        Require(start(&OwnedPostSite) == S::incompatible_mitigation && OwnedPostSite == 0x41,
            "mitigation rejection leaves code untouched");
        std::puts("owned-post-observer PASS mitigation-rejection=1");
        return 0;
    }
    Require(exact() == S::image_hash_mismatch,
        "production gate rejects the owned host at the exact image hash");
    Require(stop() == S::never_started, "stop before start");
    Require(start(reinterpret_cast<void*>(1)) == S::invalid_site, "reject nonimage address");
    Require(start(&OwnedPostSite + 1) == S::invalid_site, "reject wrong instruction bytes");
    DWORD prior = 0;
    Require(VirtualProtect(&OwnedPostSite, 12, PAGE_EXECUTE_READWRITE, &prior) != FALSE, "fixture protection setup");
    Require(start(&OwnedPostSite) == S::invalid_site, "reject writable code page");
    DWORD ignored = 0;
    Require(VirtualProtect(&OwnedPostSite, 12, prior, &ignored) != FALSE, "fixture protection restore");
    constexpr DWORD affected = 0x800u | 0x80u | 0x40u | 0x10u | 0x4u;
    const std::array<std::uint64_t, 9> values{
        0, 1, 0xe, 0xf, 0xfe, 0xff, 0x7fffffff, 0xffffffff, 0x12345678ffffffff};
    unsigned arithmetic_cases = 0;
    for (const auto input : values) {
        for (DWORD flags = 0; flags < 4096; ++flags) {
            // Only user arithmetic flags are deliberately supplied to POPFQ.
            if ((flags & ~(affected | 1u)) != 0) continue;
            CONTEXT context{};
            context.R15 = input;
            context.EFlags = flags | 0x202u;
            context.Rip = 100;
            std::uint64_t hardware[2]{};
            OwnedIncrementReference(input, context.EFlags, hardware);
            emulate(&context);
            Require(context.R15 == hardware[0], "increment hardware result and zero extension");
            Require((context.EFlags & (affected | 1u)) == (hardware[1] & (affected | 1u)), "increment hardware flags");
            Require((context.EFlags & ~(affected | 1u)) == 0x202u, "unrelated flags preserved");
            Require(context.Rip == 103, "skip exact instruction");
            ++arithmetic_cases;
        }
    }
    const auto begin = start(&OwnedPostSite);
    Require(begin == S::started, "start fixture");
    Require(OwnedPostSite == 0xcc, "INT3 installed");
    Require(start(&OwnedPostSite) == S::already_started, "duplicate start");
    MEMORY_BASIC_INFORMATION memory{};
    Require(VirtualQuery(&OwnedPostSite, &memory, sizeof(memory)) == sizeof(memory) &&
        memory.Protect == PAGE_EXECUTE_READ, "page protection restored after arm");
    if (argc == 3 && std::wcscmp(argv[2], L"--foreign-patch") == 0) {
        Require(VirtualProtect(&OwnedPostSite, 1, PAGE_EXECUTE_READWRITE, &prior) != FALSE, "foreign patch setup");
        OwnedPostSite = 0x90;
        Require(VirtualProtect(&OwnedPostSite, 1, prior, &ignored) != FALSE, "foreign patch protection");
        Require(stop() == S::foreign_patch && OwnedPostSite == 0x90, "foreign byte not overwritten");
        Require(VirtualProtect(&OwnedPostSite, 1, PAGE_EXECUTE_READWRITE, &prior) != FALSE, "recover owned fixture");
        OwnedPostSite = 0xcc;
        Require(VirtualProtect(&OwnedPostSite, 1, prior, &ignored) != FALSE, "recover fixture protection");
        Require(stop() == S::stopped && OwnedPostSite == 0x41, "retry restoration after foreign byte removed");
        std::puts("owned-post-observer PASS foreign-byte-preserved=1 restored-after-retry=1");
        return 0;
    }
    CONTEXT context{};
    context.R15 = 0;
    context.Rip = reinterpret_cast<DWORD64>(&OwnedPostSite);
    EXCEPTION_RECORD record{};
    record.ExceptionCode = EXCEPTION_ACCESS_VIOLATION;
    record.ExceptionAddress = &OwnedPostSite;
    EXCEPTION_POINTERS pointers{&record, &context};
    Require(dispatch(nullptr) == EXCEPTION_CONTINUE_SEARCH, "null exception passes through");
    Require(dispatch(&pointers) == EXCEPTION_CONTINUE_SEARCH, "unrelated exception passes through");
    record.ExceptionCode = EXCEPTION_BREAKPOINT;
    record.ExceptionFlags = EXCEPTION_NONCONTINUABLE;
    Require(dispatch(&pointers) == EXCEPTION_CONTINUE_SEARCH, "noncontinuable exception passes through");
    record.ExceptionFlags = 0;
    record.ExceptionAddress = &OwnedPostSite + 1;
    Require(dispatch(&pointers) == EXCEPTION_CONTINUE_SEARCH, "unrelated breakpoint passes through");
    record.ExceptionAddress = &OwnedPostSite;
    context.Rip = reinterpret_cast<DWORD64>(&OwnedPostSite) + 1;
    Require(dispatch(&pointers) == EXCEPTION_CONTINUE_SEARCH, "wrong RIP passes through");
    std::puts("owned arithmetic and gates passed; executing fixture traps");
    std::fflush(stdout);
    for (unsigned i = 0; i < 100; ++i) Require(OwnedPostExecute(0, 10) == 10, "repeated actual trap execution");
    auto observed = snapshot();
    Require(observed.hits == 1000 && observed.owner_thread == GetCurrentThreadId() &&
        observed.minimum_stack_headroom > 0 && observed.cfg_known && observed.cet_known &&
        observed.active && !observed.cross_thread,
        "owner observation, stack headroom and hit count");
    const auto owner_stack_headroom = observed.minimum_stack_headroom;
    std::thread other([] { Require(OwnedPostExecute(0, 1) == 1, "cross thread actual trap"); });
    other.join();
    observed = snapshot();
    Require(observed.cross_thread && observed.hits == 1000 &&
        observed.minimum_stack_headroom == owner_stack_headroom,
        "cross thread latch excludes foreign count and stack sample");
    // Release the host's sole LoadLibrary reference while armed. Pinning must
    // keep the VEH code alive; actual traps must continue safely after release.
    Require(FreeLibrary(library) != FALSE, "release host library reference");
    Require(OwnedPostExecute(0, 1) == 1, "trap after FreeLibrary");
    counter((std::numeric_limits<std::uint64_t>::max)() - 1);
    Require(OwnedPostExecute(0, 2) == 2, "counter saturation traps");
    Require(snapshot().hits == (std::numeric_limits<std::uint64_t>::max)() && snapshot().saturated,
        "hit counter saturates without wrapping");
    std::atomic<bool> race_done{false};
    std::atomic<unsigned> race_iterations{0};
    std::thread racing([&] {
        while (!race_done.load()) {
            Require(OwnedPostExecute(0, 1) == 1, "concurrent stop execution");
            race_iterations.fetch_add(1);
        }
    });
    const auto deadline = GetTickCount64() + 5000;
    while (race_iterations.load() < 100) {
        Require(GetTickCount64() < deadline, "concurrent trap progress deadline");
        SwitchToThread();
    }
    Require(stop() == S::stopped, "stop fixture while another thread executes");
    const auto completed = race_iterations.load();
    while (race_iterations.load() - completed < 100) {
        Require(GetTickCount64() < deadline, "post-restore progress deadline");
        SwitchToThread();
    }
    race_done.store(true);
    racing.join();
    Require(OwnedPostSite == 0x41, "original byte restored");
    Require(VirtualQuery(&OwnedPostSite, &memory, sizeof(memory)) == sizeof(memory) &&
        memory.Protect == PAGE_EXECUTE_READ, "page protection restored after stop");
    const auto before = snapshot().hits;
    Require(OwnedPostExecute(0, 10) == 10 && snapshot().hits == before, "original code after stop");
    context.R15 = 0xffffffff;
    context.Rip = reinterpret_cast<DWORD64>(&OwnedPostSite);
    Require(dispatch(&pointers) == EXCEPTION_CONTINUE_EXECUTION && context.R15 == 0 &&
        context.Rip == reinterpret_cast<DWORD64>(&OwnedPostSite) + 3 && snapshot().hits == before,
        "late trap after restoration handled by retained inert VEH");
    Require(stop() == S::stopped, "idempotent stop");
    Require(start(&OwnedPostSite) == S::restart_disallowed, "single lifecycle enforced");
    std::printf("owned-post-observer PASS arithmetic=%u fixed-traps=1004 concurrent-stop=1 saturation=1 pinned-after-release=1 restored=1\n", arithmetic_cases);
    return 0;
}
#endif
