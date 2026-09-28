// Owned-child exercise of one selected-company dword assignment. Never accepts a PID.
#define wmain ReadOnlyProbeMain
#include "external_hardware_load_probe.cpp"
#undef wmain
#include <cstddef>

extern "C" int FixtureLoadReturn(void*);
extern "C" char FixtureTrapSite;

namespace {
constexpr int32_t kOld = 3141;
constexpr int32_t kSelected = 55652;
constexpr uint64_t kFirstCanary = 0x1397acde5402b867ULL;
constexpr uint64_t kLastCanary = 0x867b2054deac9713ULL;
struct FixtureState {
    uint64_t first = kFirstCanary;
    int32_t walletOld = 820001;
    int32_t walletSelected = 730002;
    int32_t ownerOld = kOld;
    int32_t ownerSelected = kSelected;
    BYTE padding[0x20c - 24]{};
    int32_t player = kOld;
    uint64_t last = kLastCanary;
};
static_assert(offsetof(FixtureState, player) == 0x20c, "fixture company offset changed");
static_assert(sizeof(FixtureState) == 0x218, "fixture shape changed");

enum class Fault { None, WriteFail, ShortWrite, UnknownWrite, ReadbackMismatch, JournalPre, JournalPost };
enum class Stage { Complete, Preconditions, IntentFlush, WriteResult, Readback, CommitFlush };
const char* Name(Fault fault) {
    switch (fault) {
    case Fault::None: return "normal";
    case Fault::WriteFail: return "write-fail";
    case Fault::ShortWrite: return "short-write";
    case Fault::UnknownWrite: return "unknown-write";
    case Fault::ReadbackMismatch: return "readback-mismatch";
    case Fault::JournalPre: return "journal-pre";
    case Fault::JournalPost: return "journal-post";
    }
    return "invalid";
}
Fault ParseFault(const wchar_t* value) {
    if (!wcscmp(value, L"normal")) return Fault::None;
    if (!wcscmp(value, L"write-fail")) return Fault::WriteFail;
    if (!wcscmp(value, L"short-write")) return Fault::ShortWrite;
    if (!wcscmp(value, L"unknown-write")) return Fault::UnknownWrite;
    if (!wcscmp(value, L"readback-mismatch")) return Fault::ReadbackMismatch;
    if (!wcscmp(value, L"journal-pre")) return Fault::JournalPre;
    if (!wcscmp(value, L"journal-post")) return Fault::JournalPost;
    throw Error("unknown fixture fault");
}
bool Untouched(const FixtureState& state) {
    const FixtureState expected{};
    constexpr size_t offset = offsetof(FixtureState, player);
    return memcmp(&state, &expected, offset) == 0 &&
        memcmp(reinterpret_cast<const BYTE*>(&state) + offset + sizeof state.player,
               reinterpret_cast<const BYTE*>(&expected) + offset + sizeof state.player,
               sizeof state - offset - sizeof state.player) == 0;
}
bool ReadState(HANDLE process, uint64_t address, FixtureState& state) {
    return address && address <= UINT64_MAX - sizeof state &&
        Read(process, address, &state, sizeof state);
}
struct Journal {
    Handle file;
    std::wstring path;
    unsigned flushes = 0;
    Journal(Fault fault) {
        wchar_t directory[MAX_PATH]{};
        const DWORD length = GetTempPathW(MAX_PATH, directory);
        Check(length && length < MAX_PATH, "journal temp path unavailable");
        path = std::wstring(directory) + L"TF3OwnedCompanyAssignment-" +
            std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()) + L".log";
        file.h = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, CREATE_NEW,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH, nullptr);
        Check(file.h != INVALID_HANDLE_VALUE, "journal create failed");
        (void)fault;
    }
    bool Append(const char* record, bool injectFailure, bool& injected) {
        DWORD written = 0;
        const DWORD length = static_cast<DWORD>(strlen(record));
        if (!WriteFile(file.h, record, length, &written, nullptr) || written != length) return false;
        if (injectFailure) { injected = true; return false; }
        if (!FlushFileBuffers(file.h)) return false;
        ++flushes;
        return true;
    }
    bool Verify(Fault fault) {
        const std::string intent = "intent old=3141 selected=55652 bytes=4\n";
        // Readback is not a release receipt. A crash or failed flush after this
        // line still leaves the one-use attempt consumed and its outcome unknown.
        const std::string verified = "memory_readback selected=55652 bytes=4\n";
        const std::string expected = intent +
            ((fault == Fault::None || fault == Fault::JournalPost) ? verified : "");
        const unsigned expectedFlushes = fault == Fault::JournalPre ? 0 :
            (fault == Fault::None ? 2 : 1);
        LARGE_INTEGER start{};
        if (flushes != expectedFlushes ||
            !SetFilePointerEx(file.h, start, nullptr, FILE_BEGIN)) return false;
        LARGE_INTEGER size{};
        if (!GetFileSizeEx(file.h, &size) || size.QuadPart != static_cast<LONGLONG>(expected.size())) return false;
        std::string actual(expected.size(), '\0');
        DWORD read = 0;
        return ReadFile(file.h, actual.data(), static_cast<DWORD>(actual.size()), &read, nullptr) &&
            read == actual.size() && actual == expected;
    }
};

int Child(const wchar_t* key) {
    const std::wstring stem = std::wstring(L"Local\\TF3CompanyAssignment") + key;
    Handle ready(OpenEventW(EVENT_MODIFY_STATE, FALSE, (stem + L"Ready").c_str()));
    Handle go(OpenEventW(SYNCHRONIZE, FALSE, (stem + L"Go").c_str()));
    Handle release(OpenEventW(SYNCHRONIZE, FALSE, (stem + L"Release").c_str()));
    Check(ready.h && go.h && release.h, "child events unavailable");
    FixtureState state;
    Check(SetEvent(ready.h), "child ready signal failed");
    Check(WaitForSingleObject(go.h, 20000) == WAIT_OBJECT_0, "child trigger timeout");
    // Both consumers use the same state; the second call must not cause a second write.
    if (FixtureLoadReturn(&state) != kSelected || !Untouched(state) || state.player != kSelected) return 71;
    if (FixtureLoadReturn(&state) != kSelected || !Untouched(state) || state.player != kSelected) return 72;
    Check(WaitForSingleObject(release.h, 20000) == WAIT_OBJECT_0, "child release timeout");
    return 0;
}

// The only write path. Any false or ambiguous outcome is terminal for this owned child.
bool AssignOnce(HANDLE process, uint64_t stateAddress, Fault fault, Journal& journal,
                unsigned& writes, Stage& stage, bool& injected) {
    FixtureState before{};
    if (!ReadState(process, stateAddress, before) || !Untouched(before) || before.player != kOld) {
        stage = Stage::Preconditions; return false;
    }
    if (!journal.Append("intent old=3141 selected=55652 bytes=4\n", fault == Fault::JournalPre, injected)) {
        stage = Stage::IntentFlush; return false;
    }
    const uint64_t address = stateAddress + offsetof(FixtureState, player);
    SIZE_T written = 0;
    BOOL success = FALSE;
    if (fault == Fault::WriteFail) {
        injected = true;
        SetLastError(ERROR_ACCESS_DENIED);
    } else if (fault == Fault::ShortWrite) {
        success = WriteProcessMemory(process, reinterpret_cast<void*>(address), &kSelected, 1, &written);
        ++writes;
        if (success && written == 1) {
            int32_t partial = 0;
            injected = SafeReadInt(process, address, partial) && partial != kSelected && partial != kOld;
        }
    } else {
        success = WriteProcessMemory(process, reinterpret_cast<void*>(address), &kSelected, sizeof kSelected, &written);
        ++writes;
        if (fault == Fault::UnknownWrite && success && written == sizeof kSelected) {
            injected = true; success = FALSE; written = 0;
        }
    }
    if (!success || written != sizeof kSelected) { stage = Stage::WriteResult; return false; }
    FixtureState after{};
    if (!ReadState(process, stateAddress, after) || !Untouched(after)) { stage = Stage::Readback; return false; }
    int32_t observed = after.player;
    if (fault == Fault::ReadbackMismatch && after.player == kSelected) { injected = true; observed = kOld; }
    if (observed != kSelected) { stage = Stage::Readback; return false; }
    if (!journal.Append("memory_readback selected=55652 bytes=4\n", fault == Fault::JournalPost, injected)) {
        stage = Stage::CommitFlush; return false;
    }
    return true;
}
Stage ExpectedStage(Fault fault) {
    switch (fault) {
    case Fault::None: return Stage::Complete;
    case Fault::WriteFail: case Fault::ShortWrite: case Fault::UnknownWrite: return Stage::WriteResult;
    case Fault::ReadbackMismatch: return Stage::Readback;
    case Fault::JournalPre: return Stage::IntentFlush;
    case Fault::JournalPost: return Stage::CommitFlush;
    }
    throw Error("invalid expected stage");
}
unsigned ExpectedWrites(Fault fault) {
    return fault == Fault::WriteFail || fault == Fault::JournalPre ? 0 : 1;
}

int Parent(Fault fault) {
    const std::wstring key = std::to_wstring(GetCurrentProcessId());
    const std::wstring stem = std::wstring(L"Local\\TF3CompanyAssignment") + key;
    Handle ready(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Ready").c_str()));
    Handle go(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Go").c_str()));
    Handle release(CreateEventW(nullptr, TRUE, FALSE, (stem + L"Release").c_str()));
    Check(ready.h && go.h && release.h, "parent events unavailable");
    const std::wstring path = ProcessPath(GetCurrentProcess());
    std::wstring command = L"\"" + path + L"\" --child " + key;
    STARTUPINFOW startup{}; startup.cb = sizeof startup;
    PROCESS_INFORMATION created{};
    Check(CreateProcessW(path.c_str(), command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
        nullptr, nullptr, &startup, &created), "owned child launch failed");
    Handle process(created.hProcess), initialThread(created.hThread);
    printf("owned_child_pid=%lu\n", created.dwProcessId); fflush(stdout);
    Check(WaitForSingleObject(ready.h, 10000) == WAIT_OBJECT_0, "owned child not ready");
    Session session(created.dwProcessId, process.h);
    Check(DebugActiveProcess(created.dwProcessId), "owned child attach failed");
    session.attached = true;
    // Debugger exit must kill a stopped child if any failure escapes.
    Check(DebugSetProcessKillOnExit(TRUE), "kill-on-debugger-exit unavailable");
    Journal journal(fault);
    bool firstHit = false, secondHit = false, aborted = false;
    unsigned writes = 0;
    Stage stage = Stage::Complete;
    bool injected = false;
    uint64_t stateAddress = 0;
    const ULONGLONG start = GetTickCount64();
    while (GetTickCount64() - start < 15000 && !secondHit && !aborted) {
        if (!WaitForDebugEvent(&session.event, 100)) {
            Check(GetLastError() == ERROR_SEM_TIMEOUT, "debug wait failed");
            continue;
        }
        session.pending = true;
        session.disposition = DBG_CONTINUE;
        const auto& event = session.event;
        Check(event.dwProcessId == created.dwProcessId, "unexpected debug child");
        switch (event.dwDebugEventCode) {
        case CREATE_PROCESS_DEBUG_EVENT: {
            const auto& data = event.u.CreateProcessInfo;
            if (data.hFile) CloseHandle(data.hFile);
            session.debugProcess = data.hProcess;
            const uint64_t base = reinterpret_cast<uint64_t>(data.lpBaseOfImage);
            session.site = base + (reinterpret_cast<uint64_t>(&FixtureTrapSite) -
                reinterpret_cast<uint64_t>(GetModuleHandleW(nullptr)));
            Check(MappedInstructionMatches(process.h, session.site, kBytes, base), "owned mapped instruction mismatch");
            session.AddThread(event.dwThreadId, data.hThread);
            break;
        }
        case CREATE_THREAD_DEBUG_EVENT: session.AddThread(event.dwThreadId, event.u.CreateThread.hThread); break;
        case EXIT_THREAD_DEBUG_EVENT: {
            auto thread = session.threads.find(event.dwThreadId);
            if (thread != session.threads.end()) { thread->second.Close(); session.threads.erase(thread); }
            auto handle = session.debugThreads.find(event.dwThreadId);
            if (handle != session.debugThreads.end()) { CloseHandle(handle->second); session.debugThreads.erase(handle); }
            break;
        }
        case LOAD_DLL_DEBUG_EVENT: if (event.u.LoadDll.hFile) CloseHandle(event.u.LoadDll.hFile); break;
        case EXCEPTION_DEBUG_EVENT: {
            const auto& exception = event.u.Exception;
            session.disposition = DBG_EXCEPTION_NOT_HANDLED;
            if (!session.attachBreakSeen && exception.dwFirstChance && AttachBreak(process.h, exception.ExceptionRecord)) {
                session.attachBreakSeen = true;
                session.disposition = DBG_CONTINUE;
                SetEvent(go.h);
            } else if (exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP) {
                auto thread = session.threads.find(event.dwThreadId);
                Check(thread != session.threads.end() && thread->second.armed, "unarmed single step");
                CONTEXT context{}; context.ContextFlags = CONTEXT_FULL | CONTEXT_DEBUG_REGISTERS;
                Check(GetThreadContext(thread->second.contextHandle, &context), "unreadable trap context");
                if (!OwnedStep(event, context, session.site) || context.Dr1 != 0 ||
                    context.Dr2 != 0 || context.Dr3 != 0 || (context.Dr7 & ~0x400ULL) != 1)
                    fprintf(stderr, "trap_registers dr0=%llx dr1=%llx dr2=%llx dr3=%llx dr6=%llx dr7=%llx\n",
                        context.Dr0, context.Dr1, context.Dr2, context.Dr3, context.Dr6, context.Dr7);
                Check(OwnedStep(event, context, session.site) && context.Dr1 == 0 &&
                    context.Dr2 == 0 && context.Dr3 == 0 && (context.Dr7 & ~0x400ULL) == 1,
                    "unowned or unreadable trap or foreign debug register");
                if (!firstHit) {
                    firstHit = true;
                    stateAddress = context.R14;
                    if (!AssignOnce(process.h, stateAddress, fault, journal, writes,
                                    stage, injected)) { aborted = true; break; }
                } else {
                    FixtureState state{};
                    Check(context.R14 == stateAddress && ReadState(process.h, stateAddress, state) &&
                        Untouched(state) && state.player == kSelected && writes == 1,
                        "second hit dedupe or state invariant failed");
                    secondHit = true;
                }
                CONTEXT resume = context;
                resume.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                resume.EFlags |= 0x10000; resume.Dr6 = 0;
                Check(SetThreadContext(thread->second.contextHandle, &resume), "resume flag failed");
                session.disposition = DBG_CONTINUE;
                session.pendingOwnedStep = true;
            } else if (!exception.dwFirstChance) throw Error("second-chance exception");
            break;
        }
        case EXIT_PROCESS_DEBUG_EVENT: throw Error("child exited before two hits");
        default: break;
        }
        if (secondHit || aborted) break;
        Check(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, session.disposition), "debug continuation failed");
        session.pending = false; session.pendingOwnedStep = false;
    }
    if (aborted) {
        // Crucial: no Clean(), ContinueDebugEvent(), or pending-event release after an uncertain write.
        // Even an unexpected result stays stopped; never clean it up as success.
        const bool expected = fault != Fault::None && injected && stage == ExpectedStage(fault) &&
            writes == ExpectedWrites(fault) && session.pending && firstHit && !session.detached;
        Check(TerminateProcess(process.h, 90), "cannot terminate uncertain owned child");
        Check(expected, "fault failed at wrong stage or without its injection");
        Check(journal.Verify(fault), "fault journal bytes or flush count mismatch");
        // Windows does not signal a debuggee exit until its pending event is released;
        // let debugger exit with kill-on-exit set, without releasing that event.
        printf("owned_assignment_fault_pass: %s writes=%u pending=1 clean=0 continue=0 terminate_requested=1 journal=%ls\n",
            Name(fault), writes, journal.path.c_str());
        return 0;
    }
    Check(fault == Fault::None && secondHit && writes == 1 && !injected && stage == Stage::Complete &&
        journal.Verify(fault),
        "unexpected success or two-hit assignment did not complete");
    Check(session.Clean() && session.detached && session.survived, "owned clean detach failed");
    Check(SetEvent(release.h), "child release failed");
    DWORD code = 999;
    Check(WaitForSingleObject(process.h, 10000) == WAIT_OBJECT_0 &&
        GetExitCodeProcess(process.h, &code) && code == 0, "after-trap child consumer failed");
    printf("owned_assignment_pass: old=%ld selected=%ld writes=%u hits=2 consumer=2 canaries_wallets_owners=unchanged\n",
        kOld, kSelected, writes);
    return 0;
}
}

int wmain(int argc, wchar_t** argv) {
    try {
        if (argc == 3 && !wcscmp(argv[1], L"--child")) return Child(argv[2]);
        if (argc == 2) return Parent(ParseFault(argv[1]));
        throw Error("usage: ExternalCompanyAssignmentFixture.exe <normal|write-fail|short-write|unknown-write|readback-mismatch|journal-pre|journal-post>");
    } catch (const std::exception& error) {
        fprintf(stderr, "owned_assignment_failed: %s\n", error.what());
        return 1;
    }
}
