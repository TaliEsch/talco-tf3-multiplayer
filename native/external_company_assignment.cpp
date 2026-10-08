// One-use, exact-build, disposable-save company assignment qualification.
// This is deliberately separate from the observation-only probe.
#ifdef TF3_STEAM25754343_LOAD_OBSERVATION
#error Read-only current-build load qualification cannot enable company assignment
#endif
#define wmain ReadOnlyProbeMain
#include "external_hardware_load_probe.cpp"
#undef wmain
#include "company_load_gate.h"

namespace {
constexpr int32_t kOldPlayer = 3141;
constexpr int32_t kSelectedPlayer = 55652;
constexpr uint64_t kPlayerOffset = 0x20c;

struct AssignmentArgs {
    DWORD pid = 0;
    std::wstring profile;
    std::wstring save;
};

bool WritablePrivateDword(HANDLE process, uint64_t address) {
    if (!address || address > UINT64_MAX - sizeof(int32_t) || (address & 3)) return false;
    MEMORY_BASIC_INFORMATION page{};
    if (VirtualQueryEx(process, reinterpret_cast<void*>(address), &page, sizeof page) != sizeof page ||
        page.State != MEM_COMMIT || page.Type != MEM_PRIVATE ||
        page.Protect != PAGE_READWRITE) return false;
    const uint64_t start = reinterpret_cast<uint64_t>(page.BaseAddress);
    return start <= address && page.RegionSize >= sizeof(int32_t) &&
        address - start <= page.RegionSize - sizeof(int32_t);
}

struct AttemptJournal {
    Handle file;
    explicit AttemptJournal(const std::wstring& path) {
        file.h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH, nullptr);
        Check(file.h != INVALID_HANDLE_VALUE, "attempt journal already exists or cannot be created");
    }
    void Append(const char* record) {
        const DWORD length = static_cast<DWORD>(strlen(record));
        DWORD written = 0;
        Check(WriteFile(file.h, record, length, &written, nullptr) && written == length,
            "attempt journal write failed");
        Check(FlushFileBuffers(file.h), "attempt journal flush failed");
    }
};

AssignmentArgs ParseArgs(int argc, wchar_t** argv) {
    if (argc != 9 || wcscmp(argv[1], L"--pid") || wcscmp(argv[3], L"--profile-dir") ||
        wcscmp(argv[5], L"--save") || wcscmp(argv[7], L"--confirm-main-menu") ||
        wcscmp(argv[8], L"yes"))
        throw Error("usage: ExternalCompanyAssignment.exe --pid N --profile-dir ABS --save ABS --confirm-main-menu yes");
    AssignmentArgs args{};
    args.pid = ParsePid(argv[2]);
    args.profile = argv[4]; args.save = argv[6];
    if (args.profile.empty() || args.save.empty()) throw Error("missing path");
    for (const auto& path : {args.profile, args.save}) {
        if (path.size() < 4 || path[1] != L':' || (path[2] != L'\\' && path[2] != L'/'))
            throw Error("absolute drive paths required");
    }
    return args;
}

std::wstring FixedAttemptPath(const std::wstring& profile) {
    const std::wstring bridge = profile + (profile.back() == L'\\' ? L"tf3mp_status_1" : L"\\tf3mp_status_1");
    const DWORD attributes = GetFileAttributesW(bridge.c_str());
    Check(attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) &&
        !(attributes & FILE_ATTRIBUTE_REPARSE_POINT), "bridge userdata directory missing or redirected");
    return bridge + L"\\company_bind_ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5_55652.attempt";
}

bool StopUnknownWrite(HANDLE process) noexcept {
    if (WaitForSingleObject(process, 0) == WAIT_OBJECT_0) return true;
    return TerminateProcess(process, 90) != FALSE;
}

int Assign(const AssignmentArgs& args) {
    Handle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | PROCESS_VM_WRITE |
        PROCESS_VM_OPERATION | PROCESS_TERMINATE | SYNCHRONIZE, FALSE, args.pid));
    Check(process.h != nullptr, "cannot open explicit PID");
    const std::wstring path = ProcessPath(process.h);
    const size_t slash = path.find_last_of(L"\\/");
    Check(_wcsicmp(path.c_str() + (slash == std::wstring::npos ? 0 : slash + 1),
        L"TransportFever3.exe") == 0, "target executable name mismatch");
    const auto image = FileBytes(path);
    Check(Sha256(image) == kHash, "target executable hash mismatch");
    ValidateFileSite(image);
    FILETIME before{}, exit{}, kernel{}, user{};
    Check(GetProcessTimes(process.h, &before, &exit, &kernel, &user),
        "target creation time unavailable");
    Check(WaitForSingleObject(process.h, 0) == WAIT_TIMEOUT, "target already exited");

    tf3::company_load_gate::Gate loadGate;
    std::wstring gateError;
    if (!loadGate.AttachProduction(args.profile, args.save, true, &gateError)) {
        fwprintf(stderr, L"save_gate_attach_failed: %ls\n", gateError.c_str());
        throw Error("save/log attach qualification failed");
    }
    Session session(args.pid, process.h);
    bool writeAttempted = false;
    Check(DebugActiveProcess(args.pid), "debug attach failed");
    session.attached = true;
    try {
        Check(DebugSetProcessKillOnExit(TRUE), "cannot set fail-stop debugger policy");
        const uint64_t started = GetTickCount64();
        bool hit = false;
        while (GetTickCount64() - started < kLoadTimeoutMs && !session.exited && !hit) {
            if (!WaitForDebugEvent(&session.event, 100)) {
                Check(GetLastError() == ERROR_SEM_TIMEOUT, "debug event wait failed");
                continue;
            }
            session.pending = true;
            session.disposition = DBG_CONTINUE;
            const auto& event = session.event;
            Check(event.dwProcessId == args.pid, "unexpected debug child");
            switch (event.dwDebugEventCode) {
            case CREATE_PROCESS_DEBUG_EVENT: {
                const auto& created = event.u.CreateProcessInfo;
                if (created.hFile) CloseHandle(created.hFile);
                session.debugProcess = created.hProcess;
                FILETIME actual{}, a{}, b{}, c{};
                Check(GetProcessTimes(created.hProcess, &actual, &a, &b, &c) &&
                    CompareFileTime(&before, &actual) == 0 && ProcessPath(created.hProcess) == path,
                    "debugged process identity mismatch");
                const uint64_t base = reinterpret_cast<uint64_t>(created.lpBaseOfImage);
                Check(base && base <= UINT64_MAX - kRva, "invalid mapped image base");
                session.site = base + kRva;
                Check(MappedInstructionMatches(process.h, session.site, kBytes, base),
                    "mapped instruction mismatch");
                session.AddThread(event.dwThreadId, created.hThread);
                break;
            }
            case CREATE_THREAD_DEBUG_EVENT: session.AddThread(event.dwThreadId, event.u.CreateThread.hThread); break;
            case EXIT_THREAD_DEBUG_EVENT: {
                auto thread = session.threads.find(event.dwThreadId);
                if (thread != session.threads.end()) {
                    thread->second.exited = true; thread->second.armed = false;
                    thread->second.Close(); session.threads.erase(thread);
                }
                auto handle = session.debugThreads.find(event.dwThreadId);
                if (handle != session.debugThreads.end()) {
                    CloseHandle(handle->second); session.debugThreads.erase(handle);
                }
                break;
            }
            case LOAD_DLL_DEBUG_EVENT: if (event.u.LoadDll.hFile) CloseHandle(event.u.LoadDll.hFile); break;
            case EXCEPTION_DEBUG_EVENT: {
                const auto& exception = event.u.Exception;
                session.disposition = DBG_EXCEPTION_NOT_HANDLED;
                if (!session.attachBreakSeen && exception.dwFirstChance &&
                    AttachBreak(process.h, exception.ExceptionRecord)) {
                    session.attachBreakSeen = true;
                    Check(!session.threads.empty(), "no initial thread armed");
                    for (const auto& [id, thread] : session.threads)
                        Check(thread.armed, "initial thread not armed");
                    printf("{\"event\":\"ready\",\"pid\":%lu,\"armedThreads\":%zu}\n",
                        args.pid, session.threads.size()); fflush(stdout);
                    session.disposition = DBG_CONTINUE;
                } else if (exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP) {
                    auto found = session.threads.find(event.dwThreadId);
                    Check(found != session.threads.end() && found->second.armed,
                        "single step on unarmed thread");
                    CONTEXT context{}; context.ContextFlags = CONTEXT_FULL | CONTEXT_DEBUG_REGISTERS;
                    Check(GetThreadContext(found->second.contextHandle, &context),
                        "cannot inspect stopped hit");
                    if (OwnedStep(event, context, session.site)) {
                        Check(session.attachBreakSeen, "hit before ready");
                        Check(MappedInstructionMatches(process.h, session.site, kBytes),
                            "mapped instruction changed before hit");
                        FILETIME actual{}, a{}, b{}, c{};
                        Check(GetProcessTimes(process.h, &actual, &a, &b, &c) &&
                            CompareFileTime(&before, &actual) == 0,
                            "target process identity changed");
                        if (!loadGate.VerifyAtStoppedLoadReturn(&gateError)) {
                            fwprintf(stderr, L"save_gate_load_failed: %ls\n", gateError.c_str());
                            throw Error("loaded save identity not qualified");
                        }
                        Check(context.R14 && !(context.R14 & 7) &&
                            context.R14 <= UINT64_MAX - kPlayerOffset,
                            "loaded state pointer invalid");
                        const uint64_t playerAddress = context.R14 + kPlayerOffset;
                        Check(WritablePrivateDword(process.h, playerAddress),
                            "loaded player field not writable private memory");
                        int32_t oldPlayer = 0;
                        Check(SafeReadInt(process.h, playerAddress, oldPlayer) &&
                            oldPlayer == kOldPlayer, "loaded player differs from expected host");
                        AttemptJournal journal(FixedAttemptPath(args.profile));
                        const uint64_t creation = (static_cast<uint64_t>(before.dwHighDateTime) << 32) |
                            before.dwLowDateTime;
                        char intent[1024]{};
                        const int length = snprintf(intent, sizeof intent,
                            "attempt pid=%lu creation=%llu build=40408 exeSha256=%s "
                            "saveSha256=ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5 "
                            "site=%llx state=%llx field=%llx old=%ld selected=%ld bytes=4\n",
                            args.pid, creation, kHash, session.site, context.R14, playerAddress,
                            kOldPlayer, kSelectedPlayer);
                        Check(length > 0 && length < static_cast<int>(sizeof intent), "attempt record too long");
                        journal.Append(intent);
                        SIZE_T written = 0;
                        writeAttempted = true;
                        const BOOL wrote = WriteProcessMemory(process.h,
                            reinterpret_cast<void*>(playerAddress), &kSelectedPlayer,
                            sizeof kSelectedPlayer, &written);
                        Check(wrote && written == sizeof kSelectedPlayer,
                            "company write failed or partial; outcome unknown");
                        int32_t readback = 0;
                        Check(SafeReadInt(process.h, playerAddress, readback) &&
                            readback == kSelectedPlayer,
                            "company write readback differs; outcome unknown");
                        journal.Append("memory_readback selected=55652 bytes=4\n");
                        CONTEXT resume = context;
                        resume.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                        resume.EFlags |= 0x10000; resume.Dr6 = 0;
                        Check(SetThreadContext(found->second.contextHandle, &resume),
                            "cannot set resume flag after company write");
                        session.disposition = DBG_CONTINUE;
                        session.pendingOwnedStep = true;
                        hit = true;
                    }
                } else if (!exception.dwFirstChance) throw Error("target second-chance exception");
                break;
            }
            case EXIT_PROCESS_DEBUG_EVENT: session.exited = true; break;
            default: break;
            }
            if (hit) break;
            Check(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, session.disposition),
                "cannot continue debug event");
            session.pending = false; session.pendingOwnedStep = false;
        }
        Check(hit, session.exited ? "target exited before loaded-game hit" : "loaded-game timeout");
        Check(session.Clean(), "post-write restoration/detach failed; outcome unknown");
        printf("{\"event\":\"memory_assigned\",\"pid\":%lu,\"oldPlayer\":%ld,"
            "\"selectedPlayer\":%ld,\"restorationVerified\":true,"
            "\"detached\":true,\"targetAlive\":true}\n",
            args.pid, kOldPlayer, kSelectedPlayer); fflush(stdout);
        return 0;
    } catch (...) {
        if (writeAttempted) {
            // Clean() may have detached before its final survival check failed.
            // An unknown post-write outcome must stop the disposable target even then.
            const bool terminationRequested = StopUnknownWrite(process.h);
            fprintf(stderr, "company_assignment_unknown: write attempted; termination_requested=%s win32=%lu\n",
                terminationRequested ? "true" : "false", terminationRequested ? 0 : GetLastError());
        } else if (session.attached) {
            const bool clean = session.Clean();
            fprintf(stderr, "company_assignment_prewrite_refusal: clean_detach=%s\n",
                clean ? "true" : "false");
        }
        throw;
    }
}
}

int wmain(int argc, wchar_t** argv) {
    try { return Assign(ParseArgs(argc, argv)); }
    catch (const std::exception& error) {
        fprintf(stderr, "assignment_failed: %s\n", error.what());
        return 1;
    }
}
