// Owned-process fixture: only attaches to the child created here, never a supplied PID.
#define wmain ProductionExternalHardwareProbeMain
#include "external_hardware_load_probe.cpp"
#undef wmain
#include <cstdlib>

namespace {
struct Shared {
    DWORD pid, thread;
    uint64_t code, site, descriptor, wrapper, raw, engine;
    volatile LONG completed;
};
struct View {
    void* p;
    explicit View(HANDLE mapping) : p(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(Shared))) {
        Check(p != nullptr, "map fixture state");
    }
    ~View() { UnmapViewOfFile(p); }
    Shared& Get() { return *static_cast<Shared*>(p); }
};
constexpr BYTE fixtureCode[] = {
    0x55, 0x41, 0x55,                         // preserve rbp, r13
    0x48, 0x81, 0xec, 0x88, 0, 0, 0,
    0x48, 0x8d, 0xac, 0x24, 0x80, 0, 0, 0, // rbp = rsp+80h
    0x49, 0x89, 0xcd,                         // r13 = descriptor
    0x48, 0x89, 0x14, 0x24,                   // [rbp-80h] = wrapper
    0x90,                                     // hardware execution breakpoint
    0x48, 0x81, 0xc4, 0x88, 0, 0, 0,
    0x41, 0x5d, 0x5d, 0xc3
};
constexpr size_t fixtureSiteOffset = 25;
HANDLE ArgHandle(const wchar_t* text) {
    wchar_t* end = nullptr;
    const uint64_t value = _wcstoui64(text, &end, 10);
    Check(value && end && !*end, "invalid inherited handle");
    return reinterpret_cast<HANDLE>(value);
}
void Resource(std::array<unsigned char, 64>& header, const char* path) {
    header.fill(0);
    const uint64_t shortLength = 0, shortCapacity = 15;
    memcpy(header.data() + 16, &shortLength, 8);
    memcpy(header.data() + 24, &shortCapacity, 8);
    const uint64_t pointer = reinterpret_cast<uint64_t>(path), length = strlen(path);
    memcpy(header.data() + 32, &pointer, 8);
    memcpy(header.data() + 48, &length, 8);
    memcpy(header.data() + 56, &length, 8);
}
int Child(int argc, wchar_t** argv) {
    Check(argc == 8, "child arguments");
    Handle mapping(ArgHandle(argv[2])), ready(ArgHandle(argv[3])), go(ArgHandle(argv[4]));
    Handle done(ArgHandle(argv[5])), finish(ArgHandle(argv[6]));
    const bool limit = wcscmp(argv[7], L"limit") == 0;
    View view(mapping.h); auto& shared = view.Get();
    void* code = VirtualAlloc(nullptr, sizeof fixtureCode, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    Check(code != nullptr, "allocate owned code");
    memcpy(code, fixtureCode, sizeof fixtureCode);
    DWORD prior = 0;
    Check(VirtualProtect(code, sizeof fixtureCode, PAGE_EXECUTE_READ, &prior), "protect owned code");
    Check(FlushInstructionCache(GetCurrentProcess(), code, sizeof fixtureCode), "flush owned code");
    uint64_t rep = 1, ref = 2, raw = 3, engine = 4;
    uint64_t wrapper = reinterpret_cast<uint64_t>(&raw);
    std::array<uint64_t, 3> helper{reinterpret_cast<uint64_t>(&engine), 0, 123};
    uint64_t helperSlot = reinterpret_cast<uint64_t>(helper.data());
    std::array<unsigned char, 64> other{}, loan{};
    Resource(other, "game_mechanics/finance/unrelated.gs");
    Resource(loan, "game_mechanics/finance/loan.gs");
    std::array<uint64_t, 7> descriptor{reinterpret_cast<uint64_t>(&rep), reinterpret_cast<uint64_t>(&ref),
        reinterpret_cast<uint64_t>(other.data()), 0, 0, 0, reinterpret_cast<uint64_t>(&helperSlot)};
    shared.pid = GetCurrentProcessId(); shared.thread = GetCurrentThreadId();
    shared.code = reinterpret_cast<uint64_t>(code); shared.site = shared.code + fixtureSiteOffset;
    shared.descriptor = reinterpret_cast<uint64_t>(descriptor.data()); shared.wrapper = reinterpret_cast<uint64_t>(&wrapper);
    shared.raw = reinterpret_cast<uint64_t>(&raw); shared.engine = reinterpret_cast<uint64_t>(&engine);
    Check(SetEvent(ready.h), "publish child ready");
    Check(WaitForSingleObject(go.h, 30000) == WAIT_OBJECT_0, "child go timeout");
    const unsigned calls = limit ? 32 : 2;
    const auto invoke = reinterpret_cast<void(*)(uint64_t*, uint64_t*)>(code);
    for (unsigned i = 0; i < calls; ++i) {
        descriptor[2] = reinterpret_cast<uint64_t>((!limit && i == 1 ? loan : other).data());
        invoke(descriptor.data(), &wrapper);
        InterlockedIncrement(&shared.completed);
    }
    Check(SetEvent(done.h), "publish child done");
    Check(WaitForSingleObject(finish.h, 30000) == WAIT_OBJECT_0, "child finish timeout");
    Check(VirtualFree(code, 0, MEM_RELEASE), "free owned code");
    return 0;
}
void VerifyRestored(Session& session) {
    for (auto& [id, thread] : session.threads) {
        (void)id;
        Check(!thread.armed && !thread.suspended, "cleanup bookkeeping incomplete");
        if (WaitForSingleObject(thread.exitHandle, 0) == WAIT_OBJECT_0) continue;
        Check(SuspendThread(thread.contextHandle) != DWORD(-1), "post-detach suspend failed");
        CONTEXT actual{}; actual.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        const bool read = GetThreadContext(thread.contextHandle, &actual) != FALSE;
        const bool resumed = ResumeThread(thread.contextHandle) != DWORD(-1);
        Check(read && resumed && actual.Dr0 == thread.original.Dr0 && actual.Dr1 == thread.original.Dr1 &&
            actual.Dr2 == thread.original.Dr2 && actual.Dr3 == thread.original.Dr3 &&
            actual.Dr6 == thread.original.Dr6 && actual.Dr7 == thread.original.Dr7, "post-detach debug register mismatch");
    }
}
void Scenario(bool limit) {
    SECURITY_ATTRIBUTES attributes{sizeof attributes, nullptr, TRUE};
    Handle mapping(CreateFileMappingW(INVALID_HANDLE_VALUE, &attributes, PAGE_READWRITE, 0, sizeof(Shared), nullptr));
    Handle ready(CreateEventW(&attributes, TRUE, FALSE, nullptr)), go(CreateEventW(&attributes, TRUE, FALSE, nullptr));
    Handle done(CreateEventW(&attributes, TRUE, FALSE, nullptr)), finish(CreateEventW(&attributes, TRUE, FALSE, nullptr));
    Check(mapping.h && ready.h && go.h && done.h && finish.h, "create fixture IPC");
    View view(mapping.h); auto& shared = view.Get(); ZeroMemory(&shared, sizeof shared);
    const auto path = ProcessPath(GetCurrentProcess());
    std::wstring command = L"\"" + path + L"\" --owned-child";
    for (HANDLE handle : {mapping.h, ready.h, go.h, done.h, finish.h})
        command += L" " + std::to_wstring(reinterpret_cast<uint64_t>(handle));
    command += limit ? L" limit" : L" repeated";
    STARTUPINFOW startup{}; startup.cb = sizeof startup;
    PROCESS_INFORMATION created{};
    Check(CreateProcessW(path.c_str(), command.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW,
        nullptr, nullptr, &startup, &created), "create owned child");
    Handle process(created.hProcess), primary(created.hThread);
    Session session(created.dwProcessId, process.h);
    try {
        FILETIME before{}, a{}, b{}, c{};
        Check(GetProcessTimes(process.h, &before, &a, &b, &c), "owned creation time");
        Check(WaitForSingleObject(ready.h, 10000) == WAIT_OBJECT_0, "owned child ready timeout");
        Check(shared.pid == created.dwProcessId && shared.thread == created.dwThreadId &&
            shared.site == shared.code + fixtureSiteOffset, "owned identity mismatch");
        MEMORY_BASIC_INFORMATION page{};
        Check(VirtualQueryEx(process.h, reinterpret_cast<void*>(shared.code), &page, sizeof page) == sizeof page &&
            page.State == MEM_COMMIT && page.Type == MEM_PRIVATE && page.Protect == PAGE_EXECUTE_READ,
            "owned code mapping mismatch");
        std::array<BYTE, sizeof fixtureCode> code{};
        Check(SafeReadSpan(process.h, shared.code, code.data(), code.size()) &&
            memcmp(code.data(), fixtureCode, sizeof fixtureCode) == 0, "owned instruction mismatch");
        session.site = shared.site;
        Check(DebugActiveProcess(created.dwProcessId), "owned attach"); session.attached = true;
        Check(DebugSetProcessKillOnExit(TRUE), "owned debugger fail-stop");
        bool stop = false, limitRejected = false;
        unsigned hits = 0, normalContinues = 0, resumeVerified = 0;
        const auto start = GetTickCount64();
        while (!stop && GetTickCount64() - start < 15000) {
            if (!WaitForDebugEvent(&session.event, 100)) {
                Check(GetLastError() == ERROR_SEM_TIMEOUT, "owned debug wait"); continue;
            }
            session.pending = true; session.disposition = DBG_CONTINUE;
            const auto& event = session.event;
            Check(event.dwProcessId == created.dwProcessId, "foreign debug event");
            switch (event.dwDebugEventCode) {
            case CREATE_PROCESS_DEBUG_EVENT: {
                const auto& info = event.u.CreateProcessInfo;
                if (info.hFile) CloseHandle(info.hFile);
                session.debugProcess = info.hProcess;
                FILETIME actual{};
                Check(GetProcessId(info.hProcess) == created.dwProcessId &&
                    GetProcessTimes(info.hProcess, &actual, &a, &b, &c) &&
                    CompareFileTime(&before, &actual) == 0 && ProcessPath(info.hProcess) == path, "attached identity mismatch");
                session.AddThread(event.dwThreadId, info.hThread); break;
            }
            case CREATE_THREAD_DEBUG_EVENT: session.AddThread(event.dwThreadId, event.u.CreateThread.hThread); break;
            case EXIT_THREAD_DEBUG_EVENT: {
                auto found = session.threads.find(event.dwThreadId);
                if (found != session.threads.end()) { found->second.Close(); session.threads.erase(found); }
                auto handle = session.debugThreads.find(event.dwThreadId);
                if (handle != session.debugThreads.end()) { CloseHandle(handle->second); session.debugThreads.erase(handle); }
                break;
            }
            case LOAD_DLL_DEBUG_EVENT: if (event.u.LoadDll.hFile) CloseHandle(event.u.LoadDll.hFile); break;
            case EXCEPTION_DEBUG_EVENT: {
                const auto& exception = event.u.Exception;
                session.disposition = DBG_EXCEPTION_NOT_HANDLED;
                if (!session.attachBreakSeen && exception.dwFirstChance && AttachBreak(process.h, exception.ExceptionRecord)) {
                    session.attachBreakSeen = true; session.disposition = DBG_CONTINUE;
                    Check(SetEvent(go.h), "release owned child"); break;
                }
                auto found = session.threads.find(event.dwThreadId);
                Check(found != session.threads.end(), "exception on unknown thread");
                CONTEXT context{}; context.ContextFlags = CONTEXT_FULL | CONTEXT_DEBUG_REGISTERS;
                Check(GetThreadContext(found->second.contextHandle, &context), "read owned context");
                Check(session.attachBreakSeen && event.dwThreadId == shared.thread &&
                    OwnedStep(event, context, session.site), "unexpected owned exception");
                session.pendingOwnedStep = true; session.disposition = DBG_CONTINUE;
                tf3loanresourceobservation::Snapshot snapshot{};
                Check(context.R13 == shared.descriptor && tf3loanresourceobservation::Capture(process.h, context, &SafeReadSpan, &snapshot) &&
                    snapshot.wrapper == shared.wrapper && snapshot.raw_state == shared.raw && snapshot.engine == shared.engine &&
                    snapshot.entity == 123 && snapshot.string_bytes[0] == 1, "pending-frame capture mismatch");
                CONTEXT resume = context; resume.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                resume.EFlags |= 0x10000; resume.Dr6 = 0;
                Check(SetThreadContext(found->second.contextHandle, &resume), "owned RF write");
                CONTEXT verify{}; verify.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                Check(GetThreadContext(found->second.contextHandle, &verify) && verify.Dr0 == session.site &&
                    (verify.Dr7 & ~0x400ULL) == 1 && (verify.EFlags & 0x10000) && !(verify.Dr6 & 0xf) &&
                    verify.Rip == session.site, "RF write disarmed breakpoint");
                ++resumeVerified;
                const bool candidate = EmitLoanResource(process.h, created.dwProcessId, event.dwThreadId, context, ++hits);
                Check(candidate == (!limit && hits == 2), "unexpected Loan classification");
                try { Check(hits <= 32 && (hits < 32 || candidate), "loan resource observation limit reached"); }
                catch (const Error&) { Check(limit && hits == 32 && !candidate, "unexpected limit failure"); limitRejected = true; }
                stop = candidate || limitRejected;
                if (!stop) ++normalContinues;
                break;
            }
            case EXIT_PROCESS_DEBUG_EVENT: session.exited = true; throw Error("owned child exited during observation");
            default: break;
            }
            if (stop) break;
            // Deliberately matches Observe: ContinuePending is reserved for cleanup.
            Check(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, session.disposition), "normal owned continuation");
            session.pending = false; session.pendingOwnedStep = false;
        }
        Check(stop && hits == (limit ? 32U : 2U) && normalContinues == hits - 1 && resumeVerified == hits &&
            session.pending && session.pendingOwnedStep && limitRejected == limit, "observation outcome mismatch");
        Check(session.Clean() && session.cleanupVerified && session.drained && session.detached && session.survived,
            "owned restore/drain/detach/survival failed");
        Check(WaitForSingleObject(done.h, 3000) == WAIT_OBJECT_0 && shared.completed == static_cast<LONG>(hits), "child did not finish original instructions");
        VerifyRestored(session);
        Check(WaitForSingleObject(process.h, 0) == WAIT_TIMEOUT, "owned child did not survive verification");
        Check(SetEvent(finish.h) && WaitForSingleObject(process.h, 3000) == WAIT_OBJECT_0, "owned child final exit timeout");
        DWORD exitCode = 1;
        Check(GetExitCodeProcess(process.h, &exitCode) && exitCode == 0, "owned child final exit code");
        printf("{\"fixture\":\"%s\",\"passed\":true,\"sameThreadHits\":%u,\"normalContinues\":%u,\"armedRfReadbacks\":%u,"
            "\"limitRejected\":%s,\"restoredAfterDetach\":true,\"drained\":true,\"detached\":true,\"targetSurvived\":true,\"childExitCode\":0}\n",
            limit ? "sampling-limit" : "nonloan-then-loan", hits, normalContinues, resumeVerified, limit ? "true" : "false");
    } catch (...) {
        if (session.attached) fprintf(stderr, "owned_failure_cleanup=%s\n", session.Clean() ? "true" : "false");
        SetEvent(go.h); SetEvent(finish.h);
        if (WaitForSingleObject(process.h, 1000) != WAIT_OBJECT_0) { TerminateProcess(process.h, 91); WaitForSingleObject(process.h, 3000); }
        throw;
    }
}
}
int wmain(int argc, wchar_t** argv) {
    try {
        if (argc > 1 && wcscmp(argv[1], L"--owned-child") == 0) return Child(argc, argv);
        Check(argc == 1, "fixture takes no external target arguments");
        Scenario(false); Scenario(true);
        printf("owned_debug_fixture_passed=2\n"); return 0;
    } catch (const std::exception& error) { fprintf(stderr, "owned_debug_fixture_failed: %s\n", error.what()); return 1; }
}
