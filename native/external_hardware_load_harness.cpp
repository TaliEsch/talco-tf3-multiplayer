// Owned process-only debugger exercise. Reuses the exact Session and trap classifier.
#define TF3_OWNED_RETRY_TEST
#define wmain ProductionProbeMain
#include "external_hardware_load_probe.cpp"
#undef wmain
#include <atomic>
#include <thread>

extern "C" int FixtureLoadReturn(void*);
extern "C" char FixtureTrapSite;
namespace {
constexpr int32_t kPlayer = 73021;
struct FixtureState { BYTE leading[0x20c]{}; int32_t player = kPlayer; };
bool UserBreakpointHandled() {
    bool handled = false;
    __try { DebugBreak(); }
    __except (GetExceptionCode() == EXCEPTION_BREAKPOINT ? EXCEPTION_EXECUTE_HANDLER : EXCEPTION_CONTINUE_SEARCH) {
        handled = true;
    }
    return handled;
}
int FixtureChild(const wchar_t* key, bool lateBreak) {
    const std::wstring stem = std::wstring(L"Local\\TF3ExternalHW") + key;
    Handle ready(OpenEventW(EVENT_MODIFY_STATE, FALSE, (stem + L"Ready").c_str()));
    Handle spawn(OpenEventW(SYNCHRONIZE, FALSE, (stem + L"Spawn").c_str()));
    Handle go(OpenEventW(SYNCHRONIZE, FALSE, (stem + L"Go").c_str()));
    Handle release(OpenEventW(SYNCHRONIZE, FALSE, (stem + L"Release").c_str()));
    Handle breakGo(OpenEventW(SYNCHRONIZE, FALSE, (stem + L"BreakGo").c_str()));
    Handle breakEntered(OpenEventW(EVENT_MODIFY_STATE, FALSE, (stem + L"BreakEntered").c_str()));
    if (!ready.h || !spawn.h || !go.h || !release.h || !breakGo.h || !breakEntered.h) return 71;
    FixtureState state;
    std::atomic<int> result{0};
    std::thread first([&] {
        if (WaitForSingleObject(go.h, 20000) != WAIT_OBJECT_0 || FixtureLoadReturn(&state) != kPlayer) result.store(72);
    });
    SetEvent(ready.h);
    if (WaitForSingleObject(spawn.h, 20000) != WAIT_OBJECT_0) result.store(73);
    std::thread second([&] {
        if (WaitForSingleObject(go.h, 20000) != WAIT_OBJECT_0 || FixtureLoadReturn(&state) != kPlayer) result.store(74);
    });
    std::thread breaker;
    if (lateBreak) breaker = std::thread([&] {
        if (WaitForSingleObject(breakGo.h, 20000) != WAIT_OBJECT_0) result.store(76);
        else { SetEvent(breakEntered.h); if (!UserBreakpointHandled()) result.store(76); }
    });
    first.join(); second.join();
    if (breaker.joinable()) breaker.join();
    if (WaitForSingleObject(release.h, 20000) != WAIT_OBJECT_0) return 75;
    return result.load();
}
int Harness(bool timeoutCase, bool retryCase = false, bool exitDuringDrain = false,
            bool lateBreak = false, bool pendingContextRetry = false, bool activeContextFailure = false) {
    const std::wstring key = std::to_wstring(GetCurrentProcessId());
    const std::wstring stem = std::wstring(L"Local\\TF3ExternalHW") + key;
    Handle ready(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Ready").c_str()));
    Handle spawn(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Spawn").c_str()));
    Handle go(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Go").c_str()));
    Handle release(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Release").c_str()));
    Handle breakGo(CreateEventW(nullptr, TRUE, FALSE, (stem + L"BreakGo").c_str()));
    Handle breakEntered(CreateEventW(nullptr, TRUE, FALSE, (stem + L"BreakEntered").c_str()));
    Check(ready.h && spawn.h && go.h && release.h && breakGo.h && breakEntered.h, "fixture events unavailable");
    const std::wstring path = ProcessPath(GetCurrentProcess());
    std::wstring command = L"\"" + path + L"\" --fixture " + key + (lateBreak ? L" --late-break" : L"");
    STARTUPINFOW startup{}; startup.cb = sizeof startup;
    PROCESS_INFORMATION child{};
    Check(CreateProcessW(path.c_str(), command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
        nullptr, nullptr, &startup, &child), "owned fixture launch failed");
    Handle process(child.hProcess), mainThread(child.hThread);
    Check(WaitForSingleObject(ready.h, 10000) == WAIT_OBJECT_0, "owned fixture did not become ready");
    Session session(child.dwProcessId, process.h);
    Check(DebugActiveProcess(child.dwProcessId), "owned fixture attach failed");
    session.attached = true;
    Check(DebugSetProcessKillOnExit(TRUE), "owned fixture fail-stop policy failed");
    bool observed = false, readySent = false, lateThread = false;
    try {
        const ULONGLONG start = GetTickCount64();
        while (GetTickCount64() - start < (timeoutCase ? 1500ULL : 15000ULL) && !observed) {
            if (!WaitForDebugEvent(&session.event, 100)) { Check(GetLastError() == ERROR_SEM_TIMEOUT, "fixture wait failed"); continue; }
            session.pending = true; session.disposition = DBG_CONTINUE;
            const auto& event = session.event;
            switch (event.dwDebugEventCode) {
            case CREATE_PROCESS_DEBUG_EVENT:
                if (event.u.CreateProcessInfo.hFile) CloseHandle(event.u.CreateProcessInfo.hFile);
                session.debugProcess = event.u.CreateProcessInfo.hProcess;
                session.site = reinterpret_cast<uint64_t>(event.u.CreateProcessInfo.lpBaseOfImage) +
                    (reinterpret_cast<uint64_t>(&FixtureTrapSite) - reinterpret_cast<uint64_t>(GetModuleHandleW(nullptr)));
                Check(MappedInstructionMatches(process.h, session.site, kBytes), "fixture mapped instruction mismatch");
                std::array<BYTE, 3> wrong = kBytes; wrong[0] ^= 0xff;
                Check(!MappedInstructionMatches(process.h, session.site, wrong), "wrong mapped bytes were accepted");
                Check(!MappedInstructionMatches(process.h, 1, kBytes), "unmapped address was accepted");
                session.AddThread(event.dwThreadId, event.u.CreateProcessInfo.hThread);
                break;
            case CREATE_THREAD_DEBUG_EVENT:
                session.AddThread(event.dwThreadId, event.u.CreateThread.hThread);
                if (readySent) lateThread = true;
                break;
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
                if (exception.dwFirstChance && AttachBreak(process.h, exception.ExceptionRecord) && !readySent) {
                    Check(session.threads.size() >= 2, "initial fixture threads not enumerated");
                    for (const auto& [id, thread] : session.threads) Check(thread.armed, "fixture thread not armed");
                    readySent = true; session.attachBreakSeen = true;
                    session.disposition = DBG_CONTINUE;
                    SetEvent(spawn.h);
                } else if (exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP) {
                    auto found = session.threads.find(event.dwThreadId);
                    Check(found != session.threads.end(), "fixture single step unknown thread");
                    if (activeContextFailure) {
                        // Owned-only fault injection: leave the active event
                        // unclassified exactly as a failed GetThreadContext would.
                        Check(!observed, "active failure injected after another hit");
                        observed = true;
                        break;
                    }
                    CONTEXT context{}; context.ContextFlags = CONTEXT_FULL | CONTEXT_DEBUG_REGISTERS;
                    Check(GetThreadContext(found->second.contextHandle, &context), "fixture context unavailable");
                    Check(OwnedStep(event, context, session.site), "fixture trap was not owned");
                    CONTEXT wrongSlot = context;
                    wrongSlot.Dr6 = (wrongSlot.Dr6 & ~0xfULL) | 2;
                    Check(!OwnedStep(event, wrongSlot, session.site), "different hardware slot was accepted");
                    CONTEXT mixedSlots = context;
                    mixedSlots.Dr6 |= 2;
                    Check(!OwnedStep(event, mixedSlots, session.site), "mixed hardware slots were accepted");
                    CONTEXT foreignAddress = context;
                    foreignAddress.Dr1 = session.site + 8;
                    Check(!OwnedStep(event, foreignAddress, session.site), "foreign debug address was accepted");
                    CONTEXT foreignEnable = context;
                    foreignEnable.Dr7 |= 4;
                    Check(!OwnedStep(event, foreignEnable, session.site), "foreign debug enable was accepted");
                    int32_t value = 0;
                    Check(SafeReadInt(process.h, context.R14 + 0x20c, value) && value == kPlayer,
                        "fixture R14+20c capture mismatch");
                    Check(lateThread, "late thread was not armed before first hit");
                    CONTEXT resume = context; resume.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                    resume.EFlags |= 0x10000; resume.Dr6 = 0;
                    Check(SetThreadContext(found->second.contextHandle, &resume), "fixture RF failed");
                    session.disposition = DBG_CONTINUE;
                    session.pendingOwnedStep = true;
                    observed = true;
                }
                break;
            }
            default: break;
            }
            if (!timeoutCase && readySent && lateThread) SetEvent(go.h);
            if (observed) break;
            Check(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, session.disposition), "fixture continue failed");
            session.pending = false;
        }
        Check(timeoutCase ? !observed && readySent && lateThread : observed,
            "fixture observation or timeout condition failed");
        if (lateBreak) SetEvent(breakGo.h);
        if (lateBreak) session.delayBeforeDrain = true;
        if (retryCase) {
            session.injectRestoreFailureOnce = true;
            Check(!session.Clean(), "injected restoration failure was not detected");
            bool retainedSuspension = false;
            for (const auto& [id, thread] : session.threads) retainedSuspension |= thread.suspended;
            Check(retainedSuspension, "failed cleanup did not retain its suspension state");
        }
        if (pendingContextRetry) {
            Check(activeContextFailure && !session.pendingOwnedStep, "pending retry setup did not preserve unknown ownership");
            session.injectPendingContextFailureOnce = true;
            Check(!session.Clean(), "injected pending context failure was not detected");
            Check(session.pending && session.event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT &&
                session.event.u.Exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP &&
                session.disposition == DBG_EXCEPTION_NOT_HANDLED,
                "failed read did not retain a fail-closed pending single-step");
        }
        if (exitDuringDrain) {
            SetEvent(release.h);
            const bool clean = session.Clean();
            Check(!clean && session.exited && !session.detached && !session.survived,
                "target exit during drain was accepted as clean detach");
            puts("owned_exit_drain_pass: target exit during drain refused");
            return 0;
        }
        Check(session.Clean(), "fixture clean detach or retry failed");
        Check(session.detached && session.survived && !session.exited,
            "fixture clean success lacked live detached target");
        if (activeContextFailure) Check(session.ownedPendingClassifications >= 1,
            "active read failure did not classify pending owned trap before restoration");
        if (lateBreak) {
            Check(WaitForSingleObject(breakEntered.h, 0) == WAIT_OBJECT_0, "later breakpoint did not execute while attached");
            Check(session.forwardedLaterBreak, "later target DebugBreak was not forwarded during drain");
        }
        if (timeoutCase) SetEvent(go.h);
        SetEvent(release.h);
        DWORD code = 999;
        Check(WaitForSingleObject(process.h, 10000) == WAIT_OBJECT_0 && GetExitCodeProcess(process.h, &code) && code == 0,
            "fixture did not continue naturally after detach");
        puts(pendingContextRetry ? "owned_pending_retry_pass: two context read failures retained trap, retry classified it" :
            activeContextFailure ? "owned_active_context_failure_pass: pending trap classified before restoration" :
            lateBreak ? "owned_late_break_pass: later target DebugBreak forwarded to target handler" :
            timeoutCase ? "owned_timeout_pass: bounded no-hit wait, clean detach, natural continuation" :
            retryCase ? "owned_retry_pass: failed restoration retained suspension, retry detached, natural continuation" :
            "owned_fixture_pass: initial threads, late thread, mapped-byte refusal, R14 read, natural continuation, clean detach");
        return 0;
    } catch (...) {
        if (session.attached) session.Clean();
        SetEvent(spawn.h); SetEvent(go.h); SetEvent(release.h); SetEvent(breakGo.h);
        throw;
    }
}
int PreexistingRegisterRefusal() {
    const std::wstring key = std::to_wstring(GetCurrentProcessId());
    const std::wstring stem = std::wstring(L"Local\\TF3ExternalHW") + key;
    Handle ready(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Ready").c_str()));
    Handle spawn(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Spawn").c_str()));
    Handle go(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Go").c_str()));
    Handle release(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Release").c_str()));
    Handle breakGo(CreateEventW(nullptr, TRUE, FALSE, (stem + L"BreakGo").c_str()));
    Handle breakEntered(CreateEventW(nullptr, TRUE, FALSE, (stem + L"BreakEntered").c_str()));
    Check(ready.h && spawn.h && go.h && release.h && breakGo.h && breakEntered.h, "refusal fixture events unavailable");
    const std::wstring path = ProcessPath(GetCurrentProcess());
    std::wstring command = L"\"" + path + L"\" --fixture " + key;
    STARTUPINFOW startup{}; startup.cb = sizeof startup;
    PROCESS_INFORMATION child{};
    Check(CreateProcessW(path.c_str(), command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
        nullptr, nullptr, &startup, &child), "refusal fixture launch failed");
    Handle process(child.hProcess), mainThread(child.hThread);
    Check(WaitForSingleObject(ready.h, 10000) == WAIT_OBJECT_0, "refusal fixture not ready");
    Session session(child.dwProcessId, process.h);
    Check(DebugActiveProcess(child.dwProcessId), "refusal fixture attach failed");
    session.attached = true;
    Check(DebugSetProcessKillOnExit(TRUE), "refusal fixture fail-stop policy failed");
    bool refused = false;
    try {
        Check(WaitForDebugEvent(&session.event, 10000), "refusal create-process event missing");
        session.pending = true;
        Check(session.event.dwDebugEventCode == CREATE_PROCESS_DEBUG_EVENT, "refusal first event mismatch");
        const auto& created = session.event.u.CreateProcessInfo;
        if (created.hFile) CloseHandle(created.hFile);
        session.debugProcess = created.hProcess;
        session.site = reinterpret_cast<uint64_t>(created.lpBaseOfImage) +
            (reinterpret_cast<uint64_t>(&FixtureTrapSite) - reinterpret_cast<uint64_t>(GetModuleHandleW(nullptr)));
        CONTEXT artificial{}; artificial.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        Check(GetThreadContext(created.hThread, &artificial), "fixture debug context unavailable");
        artificial.Dr1 = 0x1234; artificial.Dr7 = 4; // owned fixture only: foreign local slot
        Check(SetThreadContext(created.hThread, &artificial), "cannot seed owned fixture debug register");
        try { session.AddThread(session.event.dwThreadId, created.hThread); }
        catch (const Error& error) { refused = std::string(error.what()).find("preexisting debug register") != std::string::npos; }
        Check(refused, "preexisting debug register was not refused");
        Check(session.Clean(), "preexisting refusal did not cleanly detach");
        Check(session.detached && session.survived && !session.exited,
            "preexisting refusal lacked live detached target");
        SetEvent(spawn.h); SetEvent(go.h); SetEvent(release.h); SetEvent(breakGo.h);
        DWORD code = 999;
        Check(WaitForSingleObject(process.h, 10000) == WAIT_OBJECT_0 && GetExitCodeProcess(process.h, &code) && code == 0,
            "refused fixture did not continue naturally");
        puts("owned_preexisting_register_pass: foreign slot refused, clean detach, natural continuation");
        return 0;
    } catch (...) {
        if (session.attached) session.Clean();
        SetEvent(spawn.h); SetEvent(go.h); SetEvent(release.h); SetEvent(breakGo.h);
        throw;
    }
}
}
int wmain(int argc, wchar_t** argv) {
    try {
        if ((argc == 3 || argc == 4) && wcscmp(argv[1], L"--fixture") == 0)
            return FixtureChild(argv[2], argc == 4 && wcscmp(argv[3], L"--late-break") == 0);
        if (argc == 2 && wcscmp(argv[1], L"--timeout") == 0) return Harness(true);
        if (argc == 2 && wcscmp(argv[1], L"--retry") == 0) return Harness(false, true);
        if (argc == 2 && wcscmp(argv[1], L"--exit-drain") == 0) return Harness(false, false, true);
        if (argc == 2 && wcscmp(argv[1], L"--late-break") == 0) return Harness(false, false, false, true);
        if (argc == 2 && wcscmp(argv[1], L"--pending-context-retry") == 0) return Harness(false, false, false, false, true, true);
        if (argc == 2 && wcscmp(argv[1], L"--active-context-fail") == 0) return Harness(false, false, false, false, false, true);
        if (argc == 2 && wcscmp(argv[1], L"--preexisting") == 0) return PreexistingRegisterRefusal();
        if (argc != 1) throw Error("usage: ExternalHardwareLoadHarness.exe [--timeout]");
        return Harness(false);
    } catch (const std::exception& error) { fprintf(stderr, "owned_fixture_failed: %s\n", error.what()); return 1; }
}
