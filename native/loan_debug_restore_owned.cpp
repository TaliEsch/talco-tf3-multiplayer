#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <stdexcept>
#include <string>

// Owned process only. This fixture accepts no PID and never opens the game.
struct Shared { volatile LONG heartbeat; };
struct Handle {
    HANDLE h = nullptr;
    Handle() = default;
    explicit Handle(HANDLE value) : h(value) {}
    ~Handle() { if (h && h != INVALID_HANDLE_VALUE) CloseHandle(h); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
static void Need(bool okay, const char* why) { if (!okay) throw std::runtime_error(why); }
static uint64_t Address(const void* p) { return reinterpret_cast<uint64_t>(p); }
static int Child(uint64_t stopRaw, uint64_t mapRaw) {
    Handle stop(reinterpret_cast<HANDLE>(stopRaw)), map(reinterpret_cast<HANDLE>(mapRaw));
    auto* shared = static_cast<Shared*>(MapViewOfFile(map.h, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(Shared)));
    Need(shared != nullptr, "child shared map failed");
    const uint64_t deadline = GetTickCount64() + 20000;
    while (GetTickCount64() < deadline) {
        const DWORD state = WaitForSingleObject(stop.h, 0);
        if (state == WAIT_OBJECT_0) { UnmapViewOfFile(shared); return 0; }
        Need(state == WAIT_TIMEOUT, "child stop wait failed");
        InterlockedIncrement(&shared->heartbeat);
        Sleep(1);
    }
    UnmapViewOfFile(shared); return 2;
}
static std::wstring SelfPath() {
    std::wstring path(32768, L'\0');
    const DWORD n = GetModuleFileNameW(nullptr, &path[0], static_cast<DWORD>(path.size()));
    Need(n && n < path.size(), "own executable path unavailable"); path.resize(n); return path;
}
static bool NtdllImageBreak(HANDLE process, const EXCEPTION_RECORD& record, bool exact) {
    MEMORY_BASIC_INFORMATION page{};
    if (VirtualQueryEx(process, record.ExceptionAddress, &page, sizeof page) != sizeof page ||
        page.State != MEM_COMMIT || page.Type != MEM_IMAGE) return false;
    wchar_t path[32768]{};
    if (!GetMappedFileNameW(process, page.AllocationBase, path, 32768)) return false;
    const wchar_t* leaf = wcsrchr(path, L'\\');
    if (!leaf || _wcsicmp(leaf + 1, L"ntdll.dll") != 0) return false;
    if (!exact) return true;
    HMODULE local = GetModuleHandleW(L"ntdll.dll");
    const auto bp = local ? GetProcAddress(local, "DbgBreakPoint") : nullptr;
    return bp && Address(record.ExceptionAddress) == Address(page.AllocationBase) +
        Address(bp) - Address(local);
}
static bool NtdllBreak(HANDLE process, const EXCEPTION_RECORD& record) {
    return NtdllImageBreak(process, record, true);
}
static unsigned FrozenContexts(DWORD pid) {
    Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0));
    Need(snapshot.h != INVALID_HANDLE_VALUE, "thread snapshot failed");
    THREADENTRY32 entry{}; entry.dwSize = sizeof entry;
    Need(Thread32First(snapshot.h, &entry) != FALSE, "thread snapshot empty");
    unsigned count = 0;
    do {
        if (entry.th32OwnerProcessID != pid) continue;
        Handle thread(OpenThread(THREAD_GET_CONTEXT, FALSE, entry.th32ThreadID));
        Need(thread.h != nullptr, "frozen thread open failed");
        CONTEXT context{}; context.ContextFlags = CONTEXT_CONTROL;
        Need(GetThreadContext(thread.h, &context) != FALSE && context.Rip != 0,
            "frozen thread context failed");
        ++count;
    } while (Thread32Next(snapshot.h, &entry));
    Need(count >= 2, "remote break did not have child and break threads");
    return count;
}
struct BreakReceipt { DWORD threadId = 0; unsigned contexts = 0; LONG heartbeat = 0; };
static BreakReceipt DrainBreak(HANDLE child, DWORD pid, Shared* shared, bool remote,
    bool& pending, DEBUG_EVENT& event) {
    const uint64_t deadline = GetTickCount64() + 5000;
    DWORD createdThread = 0;
    BreakReceipt receipt{};
    while (GetTickCount64() < deadline) {
        if (!WaitForDebugEvent(&event, 100)) {
            Need(GetLastError() == ERROR_SEM_TIMEOUT, "debug event wait failed");
            continue;
        }
        pending = true;
        Need(event.dwProcessId == pid, "debug event from foreign process");
        DWORD disposition = DBG_CONTINUE;
        bool wanted = false;
        if (event.dwDebugEventCode == CREATE_PROCESS_DEBUG_EVENT && event.u.CreateProcessInfo.hFile)
            CloseHandle(event.u.CreateProcessInfo.hFile);
        if (event.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT && event.u.LoadDll.hFile)
            CloseHandle(event.u.LoadDll.hFile);
        if (event.dwDebugEventCode == CREATE_THREAD_DEBUG_EVENT && remote) {
            Need(createdThread == 0, "multiple remote break threads appeared");
            createdThread = event.dwThreadId;
        }
        if (event.dwDebugEventCode == EXIT_PROCESS_DEBUG_EVENT)
            throw std::runtime_error("owned child exited during debug break");
        if (event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT) {
            const auto& ex = event.u.Exception;
            disposition = DBG_EXCEPTION_NOT_HANDLED;
            wanted = ex.dwFirstChance && ex.ExceptionRecord.ExceptionCode == EXCEPTION_BREAKPOINT &&
                NtdllBreak(child, ex.ExceptionRecord) && (!remote || event.dwThreadId == createdThread);
            Need(wanted, "unexpected breakpoint or exception provenance");
            disposition = DBG_CONTINUE;
            if (remote) {
                receipt.threadId = event.dwThreadId;
                receipt.contexts = FrozenContexts(pid);
                const LONG before = InterlockedCompareExchange(&shared->heartbeat, 0, 0);
                Sleep(30);
                const LONG after = InterlockedCompareExchange(&shared->heartbeat, 0, 0);
                Need(before == after, "owned heartbeat changed during frozen breakpoint");
                receipt.heartbeat = after;
            }
        }
        Need(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, disposition) != FALSE,
            "debug event continuation failed");
        pending = false;
        if (wanted) return receipt;
    }
    throw std::runtime_error("owned debugger breakpoint timed out");
}
static void DrainRemoteThreadExit(DWORD pid, DWORD threadId, bool& pending, DEBUG_EVENT& event) {
    const uint64_t deadline = GetTickCount64() + 5000;
    while (GetTickCount64() < deadline) {
        if (!WaitForDebugEvent(&event, 100)) {
            Need(GetLastError() == ERROR_SEM_TIMEOUT, "remote thread exit wait failed"); continue;
        }
        pending = true;
        Need(event.dwProcessId == pid, "foreign debug event during remote exit");
        const bool exited = event.dwDebugEventCode == EXIT_THREAD_DEBUG_EVENT && event.dwThreadId == threadId;
        Need(event.dwDebugEventCode == EXIT_THREAD_DEBUG_EVENT, "unexpected event after remote break");
        Need(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, DBG_CONTINUE) != FALSE,
            "remote exit continuation failed");
        pending = false;
        if (exited) return;
    }
    throw std::runtime_error("remote break thread did not exit");
}
int wmain(int argc, wchar_t** argv) {
    try {
        if (argc == 4 && std::wcscmp(argv[1], L"--owned-child") == 0)
            return Child(_wcstoui64(argv[2], nullptr, 10), _wcstoui64(argv[3], nullptr, 10));
        Need(argc == 1, "fixture accepts no target PID or path");
        SECURITY_ATTRIBUTES attributes{sizeof attributes, nullptr, TRUE};
        Handle stop(CreateEventW(&attributes, TRUE, FALSE, nullptr));
        Handle map(CreateFileMappingW(INVALID_HANDLE_VALUE, &attributes, PAGE_READWRITE, 0, sizeof(Shared), nullptr));
        Need(stop.h && map.h, "owned stop/map creation failed");
        auto* shared = static_cast<Shared*>(MapViewOfFile(map.h, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(Shared)));
        Need(shared != nullptr, "parent shared map failed");
        shared->heartbeat = 0;
        const std::wstring executable = SelfPath();
        wchar_t command[33000]{};
        swprintf_s(command, L"\"%s\" --owned-child %llu %llu", executable.c_str(),
            static_cast<unsigned long long>(Address(stop.h)), static_cast<unsigned long long>(Address(map.h)));
        STARTUPINFOW startup{sizeof startup}; PROCESS_INFORMATION created{};
        Need(CreateProcessW(executable.c_str(), command, nullptr, nullptr, TRUE, 0, nullptr, nullptr,
            &startup, &created) != FALSE, "owned child spawn failed");
        Handle child(created.hProcess), mainThread(created.hThread);
        const DWORD pid = created.dwProcessId;
        bool attached = false, pending = false;
        DEBUG_EVENT event{};
        try {
            Need(DebugActiveProcess(pid) != FALSE, "owned debug attach failed"); attached = true;
            Need(DebugSetProcessKillOnExit(TRUE) != FALSE, "debug fail-stop policy failed");
            (void)DrainBreak(child.h, pid, shared, false, pending, event);
            const uint64_t warmDeadline = GetTickCount64() + 3000;
            unsigned extraStartupBreaks = 0;
            while (InterlockedCompareExchange(&shared->heartbeat, 0, 0) < 30 && GetTickCount64() < warmDeadline) {
                if (WaitForDebugEvent(&event, 20)) {
                    pending = true;
                    Need(event.dwProcessId == pid, "foreign warmup debug event");
                    if (event.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT && event.u.LoadDll.hFile)
                        CloseHandle(event.u.LoadDll.hFile);
                    if (event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT) {
                        const auto& ex = event.u.Exception;
                        Need(extraStartupBreaks++ == 0 && ex.dwFirstChance &&
                            ex.ExceptionRecord.ExceptionCode == EXCEPTION_BREAKPOINT &&
                            NtdllImageBreak(child.h, ex.ExceptionRecord, false),
                            "unexpected owned startup exception");
                    }
                    Need(event.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT ||
                        event.dwDebugEventCode == CREATE_THREAD_DEBUG_EVENT ||
                        event.dwDebugEventCode == EXIT_THREAD_DEBUG_EVENT ||
                        event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT ||
                        event.dwDebugEventCode == OUTPUT_DEBUG_STRING_EVENT,
                        "unexpected owned warmup debug event");
                    Need(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, DBG_CONTINUE) != FALSE,
                        "warmup debug continuation failed");
                    pending = false;
                } else Need(GetLastError() == ERROR_SEM_TIMEOUT, "warmup debug wait failed");
            }
            if (shared->heartbeat < 30) {
                DWORD code = 0;
                GetExitCodeProcess(child.h, &code);
                fprintf(stderr, "warm heartbeat=%ld childState=%lu exitCode=%lu\n",
                    shared->heartbeat, WaitForSingleObject(child.h, 0), code);
            }
            Need(shared->heartbeat >= 30, "owned heartbeat did not run before restore request");
            constexpr DWORD restricted = PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | PROCESS_VM_WRITE |
                PROCESS_VM_OPERATION | PROCESS_TERMINATE | SYNCHRONIZE;
            Handle current(OpenProcess(restricted, FALSE, pid));
            Need(current.h != nullptr, "current controller rights OpenProcess failed");
            SetLastError(ERROR_SUCCESS);
            const BOOL currentSuccess = DebugBreakProcess(current.h);
            const DWORD currentError = currentSuccess ? ERROR_SUCCESS : GetLastError();
            BreakReceipt currentReceipt{};
            if (currentSuccess) {
                currentReceipt = DrainBreak(child.h, pid, shared, true, pending, event);
                DrainRemoteThreadExit(pid, currentReceipt.threadId, pending, event);
            }
            Handle expanded(OpenProcess(restricted | PROCESS_CREATE_THREAD, FALSE, pid));
            Need(expanded.h != nullptr, "expanded controller rights OpenProcess failed");
            SetLastError(ERROR_SUCCESS);
            const BOOL expandedSuccess = DebugBreakProcess(expanded.h);
            const DWORD expandedError = expandedSuccess ? ERROR_SUCCESS : GetLastError();
            Need(expandedSuccess != FALSE, "DebugBreakProcess failed with PROCESS_CREATE_THREAD");
            const BreakReceipt expandedReceipt = DrainBreak(child.h, pid, shared, true, pending, event);
            DrainRemoteThreadExit(pid, expandedReceipt.threadId, pending, event);
            Need(DebugActiveProcessStop(pid) != FALSE, "owned debugger detach failed"); attached = false;
            Need(WaitForSingleObject(child.h, 0) == WAIT_TIMEOUT, "owned child died during restore request");
            Need(SetEvent(stop.h) != FALSE && WaitForSingleObject(child.h, 5000) == WAIT_OBJECT_0,
                "owned child shutdown failed");
            DWORD exitCode = 1;
            Need(GetExitCodeProcess(child.h, &exitCode) && exitCode == 0, "owned child exit invalid");
            UnmapViewOfFile(shared);
            printf("{\"scope\":\"owned-debug-restore-rights\",\"passed\":true,"
                "\"restrictedMask\":%lu,\"restrictedSuccess\":%s,\"restrictedError\":%lu,"
                "\"expandedMask\":%lu,\"expandedSuccess\":true,\"expandedError\":%lu,"
                "\"breakThread\":%lu,\"frozenContexts\":%u,\"heartbeatFrozen\":true,"
                "\"detachedChildAlive\":true,\"childExit\":%lu}\n",
                restricted, currentSuccess ? "true" : "false", currentError,
                restricted | PROCESS_CREATE_THREAD, expandedError,
                expandedReceipt.threadId, expandedReceipt.contexts, exitCode);
            return 0;
        } catch (...) {
            const DWORD state = WaitForSingleObject(child.h, 0);
            const bool liveKnown = state == WAIT_TIMEOUT;
            const bool exitedKnown = state == WAIT_OBJECT_0;
            const bool terminationRequested = liveKnown && TerminateProcess(child.h, 71) != FALSE;
            if (pending && (exitedKnown || terminationRequested))
                ContinueDebugEvent(event.dwProcessId, event.dwThreadId, DBG_CONTINUE);
            // If liveness or termination is uncertain, retain the pending event.
            // The attached debugger's kill-on-exit owns the exact child.
            if (liveKnown && terminationRequested) WaitForSingleObject(child.h, 5000);
            (void)attached;
            UnmapViewOfFile(shared);
            throw;
        }
    } catch (const std::exception& problem) {
        fprintf(stderr, "owned restore fixture: %s (Win32=%lu)\n", problem.what(), GetLastError());
        return 1;
    }
}
