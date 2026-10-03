// External TF3 40408 diagnostic. No target memory writes; hardware debug
// registers are temporarily set, verified and restored before detach.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <psapi.h>
#include <array>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
#include "loan_event_resource_readback.h"
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "psapi.lib")

namespace {
constexpr DWORD kRva = 0x32de88;
constexpr std::array<BYTE, 3> kBytes{0x45, 0x33, 0xf6};
constexpr DWORD kLoanResourceRva = 0xf410a7;
constexpr std::array<BYTE, 3> kLoanResourceBytes{0x90, 0x48, 0x8b};
constexpr char kHash[] = "de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2";
constexpr DWORD kLoadTimeoutMs = 120000;
struct Error : std::runtime_error { using runtime_error::runtime_error; };
void Check(bool condition, const char* description) {
    if (!condition) throw Error(std::string(description) + " (win32=" + std::to_string(GetLastError()) + ")");
}
struct Handle {
    HANDLE h = nullptr;
    explicit Handle(HANDLE value = nullptr) : h(value) {}
    ~Handle() { if (h && h != INVALID_HANDLE_VALUE) CloseHandle(h); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
std::wstring ProcessPath(HANDLE process) {
    std::wstring path(32768, L'\0');
    DWORD length = static_cast<DWORD>(path.size());
    Check(QueryFullProcessImageNameW(process, 0, path.data(), &length) != FALSE, "process image path unavailable");
    path.resize(length);
    return path;
}
std::vector<BYTE> FileBytes(const std::wstring& path) {
    Handle file(CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
    Check(file.h != INVALID_HANDLE_VALUE, "cannot open target image");
    LARGE_INTEGER length{};
    Check(GetFileSizeEx(file.h, &length) && length.QuadPart > 0 && length.QuadPart <= 256LL * 1024 * 1024, "image size invalid");
    std::vector<BYTE> bytes(static_cast<size_t>(length.QuadPart));
    DWORD read = 0;
    Check(ReadFile(file.h, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr) && read == bytes.size(), "image read incomplete");
    return bytes;
}
std::string Sha256(const std::vector<BYTE>& bytes) {
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    Check(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) >= 0, "SHA256 unavailable");
    std::array<BYTE, 32> digest{};
    const NTSTATUS result = BCryptHash(algorithm, nullptr, 0, const_cast<BYTE*>(bytes.data()),
        static_cast<ULONG>(bytes.size()), digest.data(), static_cast<ULONG>(digest.size()));
    BCryptCloseAlgorithmProvider(algorithm, 0);
    Check(result >= 0, "SHA256 failed");
    std::string hex;
    constexpr char digits[] = "0123456789abcdef";
    for (BYTE value : digest) { hex += digits[value >> 4]; hex += digits[value & 15]; }
    return hex;
}
template<class T> T At(const std::vector<BYTE>& bytes, size_t offset) {
    Check(offset <= bytes.size() && sizeof(T) <= bytes.size() - offset, "invalid PE offset");
    T value{}; memcpy(&value, bytes.data() + offset, sizeof value); return value;
}
void ValidateFileSite(const std::vector<BYTE>& bytes, DWORD rva = kRva, const std::array<BYTE, 3>& expected = kBytes) {
    const auto dos = At<IMAGE_DOS_HEADER>(bytes, 0);
    Check(dos.e_magic == IMAGE_DOS_SIGNATURE && dos.e_lfanew > 0, "invalid DOS header");
    const size_t ntOffset = static_cast<size_t>(dos.e_lfanew);
    const auto nt = At<IMAGE_NT_HEADERS64>(bytes, ntOffset);
    Check(nt.Signature == IMAGE_NT_SIGNATURE && nt.FileHeader.Machine == IMAGE_FILE_MACHINE_AMD64 &&
        nt.OptionalHeader.Magic == IMAGE_NT_OPTIONAL_HDR64_MAGIC && nt.FileHeader.NumberOfSections > 0 &&
        nt.FileHeader.NumberOfSections < 97 && nt.FileHeader.SizeOfOptionalHeader == sizeof(IMAGE_OPTIONAL_HEADER64),
        "unsupported PE image");
    unsigned matches = 0;
    for (WORD i = 0; i < nt.FileHeader.NumberOfSections; ++i) {
        const auto section = At<IMAGE_SECTION_HEADER>(bytes, ntOffset + sizeof nt + i * sizeof(IMAGE_SECTION_HEADER));
        if (!(section.Characteristics & IMAGE_SCN_MEM_EXECUTE) || rva < section.VirtualAddress) continue;
        const size_t delta = rva - section.VirtualAddress;
        if (delta > section.SizeOfRawData || expected.size() > section.SizeOfRawData - delta) continue;
        const size_t offset = static_cast<size_t>(section.PointerToRawData) + delta;
        Check(offset <= bytes.size() && expected.size() <= bytes.size() - offset, "PE section outside file");
        Check(memcmp(bytes.data() + offset, expected.data(), expected.size()) == 0, "file instruction mismatch");
        ++matches;
    }
    Check(matches == 1, "site is not uniquely file-backed executable code");
}
bool Read(HANDLE process, uint64_t address, void* output, SIZE_T size) {
    SIZE_T count = 0;
    return ReadProcessMemory(process, reinterpret_cast<const void*>(address), output, size, &count) && count == size;
}
bool MappedInstructionMatches(HANDLE process, uint64_t address, const std::array<BYTE, 3>& expected,
                              uint64_t imageBase = 0) {
    MEMORY_BASIC_INFORMATION page{};
    if (VirtualQueryEx(process, reinterpret_cast<void*>(address), &page, sizeof page) != sizeof page ||
        page.State != MEM_COMMIT || page.Type != MEM_IMAGE || (page.Protect & (PAGE_GUARD | PAGE_NOACCESS)) ||
        (imageBase && reinterpret_cast<uint64_t>(page.AllocationBase) != imageBase)) return false;
    const DWORD access = page.Protect & 0xff;
    if (access != PAGE_EXECUTE_READ) return false;
    std::array<BYTE, 3> mapped{};
    return Read(process, address, mapped.data(), mapped.size()) && mapped == expected;
}
bool SafeReadSpan(HANDLE process, uint64_t address, void* output, SIZE_T size) {
    if (!output || !size || size > 512 || !address || address > UINT64_MAX - size) return false;
    const uint64_t end = address + size;
    for (uint64_t cursor = address; cursor < end;) {
        MEMORY_BASIC_INFORMATION page{};
        if (VirtualQueryEx(process, reinterpret_cast<void*>(cursor), &page, sizeof page) != sizeof page ||
            page.State != MEM_COMMIT || (page.Protect & (PAGE_GUARD | PAGE_NOACCESS))) return false;
        const DWORD access = page.Protect & 0xff;
        if (access != PAGE_READONLY && access != PAGE_READWRITE && access != PAGE_WRITECOPY &&
            access != PAGE_EXECUTE_READ && access != PAGE_EXECUTE_READWRITE && access != PAGE_EXECUTE_WRITECOPY) return false;
        const uint64_t start = reinterpret_cast<uint64_t>(page.BaseAddress);
        if (start > UINT64_MAX - page.RegionSize || start + page.RegionSize <= cursor) return false;
        cursor = start + page.RegionSize;
    }
    return Read(process, address, output, size);
}
bool SafeReadInt(HANDLE process, uint64_t address, int32_t& value) {
    return SafeReadSpan(process, address, &value, sizeof value);
}
bool AttachBreak(HANDLE process, const EXCEPTION_RECORD& exception) {
    if (exception.ExceptionCode != EXCEPTION_BREAKPOINT) return false;
    MEMORY_BASIC_INFORMATION page{};
    if (VirtualQueryEx(process, exception.ExceptionAddress, &page, sizeof page) != sizeof page || page.Type != MEM_IMAGE) return false;
    wchar_t path[32768]{};
    if (!GetMappedFileNameW(process, page.AllocationBase, path, 32768)) return false;
    const wchar_t* name = wcsrchr(path, L'\\');
    if (!name || _wcsicmp(name + 1, L"ntdll.dll")) return false;
    const HMODULE local = GetModuleHandleW(L"ntdll.dll");
    const auto routine = GetProcAddress(local, "DbgBreakPoint");
    return routine && reinterpret_cast<uint64_t>(exception.ExceptionAddress) ==
        reinterpret_cast<uint64_t>(page.AllocationBase) + reinterpret_cast<uint64_t>(routine) - reinterpret_cast<uint64_t>(local);
}
bool OwnedStep(const DEBUG_EVENT& event, const CONTEXT& context, uint64_t address) {
    const auto& exception = event.u.Exception;
    return event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT && exception.dwFirstChance &&
        exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP &&
        reinterpret_cast<uint64_t>(exception.ExceptionRecord.ExceptionAddress) == address && context.Rip == address &&
        context.Dr0 == address && context.Dr1 == 0 && context.Dr2 == 0 && context.Dr3 == 0 &&
        (context.Dr7 & ~0x400ULL) == 1 &&
        !(context.EFlags & 0x100) && (context.Dr6 & 0xf) == 1 &&
        !(context.Dr6 & ((1ULL << 13) | (1ULL << 14) | (1ULL << 15)));
}
struct Thread {
    HANDLE contextHandle = nullptr;
    HANDLE exitHandle = nullptr;
    CONTEXT original{};
    CONTEXT cleanupTrap{};
    bool armed = false;
    bool suspended = false;
    bool mayHaveQueuedTrap = false;
    bool exited = false;
    void Close() { if (contextHandle) CloseHandle(contextHandle); if (exitHandle) CloseHandle(exitHandle); contextHandle = exitHandle = nullptr; }
};
struct Session {
    DWORD pid;
    HANDLE process;
    uint64_t site = 0;
    bool attached = false, exited = false, pending = false, attachBreakSeen = false, pendingOwnedStep = false;
    DEBUG_EVENT event{};
    DWORD disposition = DBG_CONTINUE;
    std::map<DWORD, Thread> threads;
    std::map<DWORD, HANDLE> debugThreads;
    HANDLE debugProcess = nullptr;
    bool cleanupVerified = false, drained = false, detached = false, survived = false;
    bool forwardedLaterBreak = false;
    unsigned ownedPendingClassifications = 0;
#ifdef TF3_OWNED_RETRY_TEST
    bool injectRestoreFailureOnce = false;
    bool injectPendingContextFailureOnce = false;
    bool delayBeforeDrain = false;
#endif
    Session(DWORD p, HANDLE h) : pid(p), process(h) {}
    ~Session() {
        for (auto& item : threads) item.second.Close();
        for (auto& item : debugThreads) if (item.second) CloseHandle(item.second);
        if (debugProcess) CloseHandle(debugProcess);
    }
    void AddThread(DWORD id, HANDLE source) {
        Check(site != 0 && !threads.count(id), "thread arrived before validation or duplicate thread");
        debugThreads[id] = source;
        auto& thread = threads[id];
        Check(DuplicateHandle(GetCurrentProcess(), source, GetCurrentProcess(), &thread.contextHandle, 0, FALSE,
            DUPLICATE_SAME_ACCESS) != FALSE, "thread handle duplication failed");
        thread.exitHandle = OpenThread(SYNCHRONIZE | THREAD_QUERY_LIMITED_INFORMATION, FALSE, id);
        Check(thread.exitHandle != nullptr, "thread exit handle unavailable");
        thread.original.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        Check(GetThreadContext(thread.contextHandle, &thread.original) != FALSE, "thread debug registers unavailable");
        Check(thread.original.Dr0 == 0 && thread.original.Dr1 == 0 && thread.original.Dr2 == 0 &&
            thread.original.Dr3 == 0 && thread.original.Dr7 == 0, "preexisting debug register state");
        CONTEXT armed = thread.original;
        armed.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        armed.Dr0 = site; armed.Dr6 = 0; armed.Dr7 = 1;
        Check(SetThreadContext(thread.contextHandle, &armed) != FALSE, "cannot arm DR0");
        thread.armed = true;
        CONTEXT verified{}; verified.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        Check(GetThreadContext(thread.contextHandle, &verified) && verified.Dr0 == site &&
            verified.Dr1 == 0 && verified.Dr2 == 0 && verified.Dr3 == 0 && verified.Dr7 == 1,
            "DR0 arming readback failed");
    }
    bool PreparePendingStep() noexcept {
        if (!pending || event.dwDebugEventCode != EXCEPTION_DEBUG_EVENT ||
            event.u.Exception.ExceptionRecord.ExceptionCode != EXCEPTION_SINGLE_STEP) return true;
        auto found = threads.find(event.dwThreadId);
        if (found == threads.end()) return false; // ownership cannot be resolved
#ifdef TF3_OWNED_RETRY_TEST
        if (injectPendingContextFailureOnce) { injectPendingContextFailureOnce = false; return false; }
#endif
        Thread& thread = found->second;
        CONTEXT context{}; context.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
        if (!GetThreadContext(thread.contextHandle, &context)) return false;
        const bool currentOwned = OwnedStep(event, context, site);
        CONTEXT proof = context;
        proof.Dr0 = thread.cleanupTrap.Dr0; proof.Dr7 = thread.cleanupTrap.Dr7;
        const bool queuedOwned = thread.mayHaveQueuedTrap &&
            OwnedStep(event, proof, site) && context.Rip == thread.cleanupTrap.Rip &&
            context.Dr0 == thread.original.Dr0 && context.Dr7 == thread.original.Dr7;
        const bool owned = event.u.Exception.dwFirstChance &&
            (pendingOwnedStep || currentOwned || queuedOwned);
        if (!owned) return disposition == DBG_EXCEPTION_NOT_HANDLED;
        context.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
        context.Dr0 = thread.original.Dr0; context.Dr1 = thread.original.Dr1;
        context.Dr2 = thread.original.Dr2; context.Dr3 = thread.original.Dr3;
        context.Dr6 = thread.original.Dr6; context.Dr7 = thread.original.Dr7;
        context.EFlags |= 0x10000;
        if (!SetThreadContext(thread.contextHandle, &context)) return false;
        if (!pendingOwnedStep) ++ownedPendingClassifications;
        pendingOwnedStep = true;
        disposition = DBG_CONTINUE;
        return true;
    }
    bool ContinuePending() noexcept {
        if (!pending) return true;
        if (!PreparePendingStep()) return false;
        if (!ContinueDebugEvent(event.dwProcessId, event.dwThreadId, disposition)) return false;
        auto found = threads.find(event.dwThreadId);
        if (found != threads.end()) found->second.mayHaveQueuedTrap = false;
        pending = false; pendingOwnedStep = false;
        return true;
    }
    bool Clean() noexcept {
        // The pending event can be an owned trap whose active-context read
        // failed. Classify it while DR0 is still intact. If that read fails
        // again, keep the target stopped; restoration would erase the proof.
        if (pending && event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT &&
            event.u.Exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP &&
            !PreparePendingStep()) return false;
        bool ok = true;
        for (auto& [id, thread] : threads) {
            if (!thread.armed || exited) continue;
            const DWORD state = WaitForSingleObject(thread.exitHandle, 0);
            if (state == WAIT_OBJECT_0) { thread.exited = true; thread.armed = false; continue; }
            if (state != WAIT_TIMEOUT) { ok = false; continue; }
            if (!thread.suspended) {
                if (SuspendThread(thread.contextHandle) == DWORD(-1)) {
                    if (WaitForSingleObject(thread.exitHandle, 0) == WAIT_OBJECT_0) { thread.exited = true; thread.armed = false; continue; }
                    ok = false; continue;
                }
                thread.suspended = true;
            }
#ifdef TF3_OWNED_RETRY_TEST
            if (injectRestoreFailureOnce) { injectRestoreFailureOnce = false; ok = false; continue; }
#endif
            CONTEXT current{}; current.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
            if (!GetThreadContext(thread.contextHandle, &current)) { ok = false; continue; }
            if (!pending || event.dwThreadId != id) {
                thread.mayHaveQueuedTrap = true;
                thread.cleanupTrap = current;
            }
            current.ContextFlags = CONTEXT_DEBUG_REGISTERS;
            current.Dr0 = thread.original.Dr0; current.Dr1 = thread.original.Dr1;
            current.Dr2 = thread.original.Dr2; current.Dr3 = thread.original.Dr3;
            current.Dr6 = thread.original.Dr6; current.Dr7 = thread.original.Dr7;
            if (!SetThreadContext(thread.contextHandle, &current)) { ok = false; continue; }
            CONTEXT readback{}; readback.ContextFlags = CONTEXT_DEBUG_REGISTERS;
            if (!GetThreadContext(thread.contextHandle, &readback) ||
                readback.Dr0 != thread.original.Dr0 || readback.Dr1 != thread.original.Dr1 ||
                readback.Dr2 != thread.original.Dr2 || readback.Dr3 != thread.original.Dr3 ||
                readback.Dr6 != thread.original.Dr6 || readback.Dr7 != thread.original.Dr7) { ok = false; continue; }
            thread.armed = false;
        }
        cleanupVerified = ok;
        // If restoration failed, leave the debuggee fail-stopped; kill-on-exit remains set.
        if (!ok) return false;
        for (auto& [id, thread] : threads) {
            if (!thread.suspended) continue;
            if (WaitForSingleObject(thread.exitHandle, 0) == WAIT_OBJECT_0) { thread.suspended = false; continue; }
            if (ResumeThread(thread.contextHandle) == DWORD(-1)) ok = false;
            else thread.suspended = false;
        }
        if (!ok) return false;
        if (!ContinuePending()) return false;
#ifdef TF3_OWNED_RETRY_TEST
        if (delayBeforeDrain) Sleep(200);
#endif
        if (!exited) {
            unsigned quiet = 0;
            for (unsigned i = 0; i < 120; ++i) {
                DEBUG_EVENT next{};
                if (!WaitForDebugEvent(&next, 25)) {
                    if (GetLastError() != ERROR_SEM_TIMEOUT) return false;
                    if (++quiet < 4) continue;
                    drained = true;
                    if (DebugActiveProcessStop(pid)) { detached = true; attached = false; break; }
                    continue;
                }
                quiet = 0;
                event = next; pending = true;
                disposition = next.dwDebugEventCode == EXCEPTION_DEBUG_EVENT ? DBG_EXCEPTION_NOT_HANDLED : DBG_CONTINUE;
                if (next.dwDebugEventCode == EXCEPTION_DEBUG_EVENT) {
                    const auto& exception = next.u.Exception;
                    if (exception.dwFirstChance && exception.ExceptionRecord.ExceptionCode == EXCEPTION_BREAKPOINT && attachBreakSeen)
                        forwardedLaterBreak = true;
                    if (exception.dwFirstChance && AttachBreak(process, exception.ExceptionRecord)) {
                        if (!attachBreakSeen) {
                            attachBreakSeen = true;
                            disposition = DBG_CONTINUE;
                        }
                    }
                } else if (next.dwDebugEventCode == CREATE_THREAD_DEBUG_EVENT) {
                    // Breakpoints are gone; a newly created thread is never armed.
                    debugThreads[next.dwThreadId] = next.u.CreateThread.hThread;
                } else if (next.dwDebugEventCode == EXIT_THREAD_DEBUG_EVENT) {
                    auto found = debugThreads.find(next.dwThreadId);
                    if (found != debugThreads.end()) { CloseHandle(found->second); debugThreads.erase(found); }
                } else if (next.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT) {
                    if (next.u.LoadDll.hFile) CloseHandle(next.u.LoadDll.hFile);
                } else if (next.dwDebugEventCode == EXIT_PROCESS_DEBUG_EVENT) { exited = true; attached = false; }
                if (!ContinuePending()) return false;
                if (exited) break;
            }
            if (!detached && !exited) return false;
        }
        if (detached) survived = WaitForSingleObject(process, 250) == WAIT_TIMEOUT;
        if (!detached || !survived || exited) return false;
        if (!DebugSetProcessKillOnExit(FALSE)) return false;
        return true;
    }
};
DWORD ParsePid(const wchar_t* value) {
    if (!value || !*value) throw Error("PID required");
    uint64_t number = 0;
    for (const wchar_t* p = value; *p; ++p) {
        if (*p < L'0' || *p > L'9') throw Error("PID must be decimal");
        if (number > (UINT32_MAX - static_cast<uint64_t>(*p - L'0')) / 10) throw Error("PID out of range");
        number = number * 10 + (*p - L'0');
    }
    if (!number) throw Error("PID zero is invalid");
    return static_cast<DWORD>(number);
}
void RequireSeparateDiagnosticProcess(HANDLE process) {
    std::array<HMODULE, 1024> modules{}; DWORD bytes = 0;
    Check(EnumProcessModulesEx(process, modules.data(), static_cast<DWORD>(sizeof modules), &bytes, LIST_MODULES_ALL) &&
        bytes <= sizeof modules, "diagnostic module inventory unavailable");
    for (size_t i = 0; i < bytes / sizeof(HMODULE); ++i) {
        wchar_t name[MAX_PATH]{};
        Check(GetModuleBaseNameW(process, modules[i], name, MAX_PATH) != 0, "diagnostic module identity unavailable");
        Check(_wcsicmp(name, L"TF3InProcessRuntime.dll") && _wcsicmp(name, L"TF3NativeProbe.dll"),
            "loan resource diagnostic cannot accompany multiplayer native runtime");
    }
}
std::string HexBytes(const unsigned char* bytes, size_t count) {
    std::string result; result.reserve(count * 2);
    constexpr char hex[] = "0123456789abcdef";
    for (size_t i = 0; i < count; ++i) { result += hex[bytes[i] >> 4]; result += hex[bytes[i] & 15]; }
    return result;
}
bool EmitLoanResource(HANDLE process, DWORD pid, DWORD thread, const CONTEXT& context, unsigned ordinal) {
    tf3loanresourceobservation::Snapshot snapshot{};
    const bool readable = tf3loanresourceobservation::Capture(process, context, &SafeReadSpan, &snapshot);
    bool candidate = false;
    if (readable) {
        // Observed exact 40408 ResName pair. This selects a diagnostic sample,
        // never authorization; the live pair has no leading slash.
        const std::string scope(reinterpret_cast<const char*>(snapshot.strings[0].data()), snapshot.string_bytes[0] - 1);
        const std::string resource(reinterpret_cast<const char*>(snapshot.strings[1].data()), snapshot.string_bytes[1] - 1);
        candidate = scope.empty() && resource == "game_mechanics/finance/loan.gs";
    }
    printf("{\"event\":\"loan-event-resource-hit\",\"diagnosticOnly\":true,\"activationPermitted\":false,"
        "\"pid\":%lu,\"threadId\":%lu,\"ordinal\":%u,\"readable\":%s,\"loanCandidate\":%s",
        pid, thread, ordinal, readable ? "true" : "false", candidate ? "true" : "false");
    if (readable) {
        const auto header = HexBytes(snapshot.header.data(), snapshot.header.size());
        const auto first = HexBytes(snapshot.strings[0].data(), snapshot.string_bytes[0]);
        const auto second = HexBytes(snapshot.strings[1].data(), snapshot.string_bytes[1]);
        printf(",\"scriptRep\":\"%llx\",\"scriptRef\":\"%llx\",\"resource\":\"%llx\",\"wrapper\":\"%llx\","
            "\"rawState\":\"%llx\",\"engine\":\"%llx\",\"entity\":%ld,\"entityValid\":%s,\"headerHex\":\"%s\",\"stringsHex\":[\"%s\",\"%s\"]",
            snapshot.script_rep, snapshot.script_ref, snapshot.resource, snapshot.wrapper,
            snapshot.raw_state, snapshot.engine, snapshot.entity, snapshot.entity > 0 ? "true" : "false", header.c_str(), first.c_str(), second.c_str());
    }
    printf("}\n"); fflush(stdout); return candidate;
}
int Observe(DWORD pid, bool loanResource = false) {
    const DWORD rva = loanResource ? kLoanResourceRva : kRva;
    const auto& expected = loanResource ? kLoanResourceBytes : kBytes;
    Handle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | SYNCHRONIZE, FALSE, pid));
    Check(process.h != nullptr, "cannot open explicit PID");
    const std::wstring path = ProcessPath(process.h);
    const size_t slash = path.find_last_of(L"\\/");
    Check(_wcsicmp(path.c_str() + (slash == std::wstring::npos ? 0 : slash + 1), L"TransportFever3.exe") == 0,
        "target executable name mismatch");
    const auto bytes = FileBytes(path);
    Check(Sha256(bytes) == kHash, "target executable hash mismatch");
    ValidateFileSite(bytes, rva, expected);
    if (loanResource) RequireSeparateDiagnosticProcess(process.h);
    FILETIME before{}, exit{}, kernel{}, user{};
    Check(GetProcessTimes(process.h, &before, &exit, &kernel, &user), "target creation time unavailable");
    Check(WaitForSingleObject(process.h, 0) == WAIT_TIMEOUT, "target already exited");
    Session session(pid, process.h);
    Check(DebugActiveProcess(pid) != FALSE, "debug attach failed");
    session.attached = true;
    // Failed restoration cannot silently release an armed target.
    try {
        Check(DebugSetProcessKillOnExit(TRUE) != FALSE, "cannot set fail-stop debugger policy");
        const uint64_t start = GetTickCount64();
        bool hit = false; unsigned samples = 0;
        while (GetTickCount64() - start < kLoadTimeoutMs && !session.exited && !hit) {
            if (!WaitForDebugEvent(&session.event, 100)) {
                Check(GetLastError() == ERROR_SEM_TIMEOUT, "debug event wait failed");
                continue;
            }
            session.pending = true;
            session.disposition = DBG_CONTINUE;
            const auto& event = session.event;
            Check(event.dwProcessId == pid, "unexpected debug child");
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
                Check(base && base <= UINT64_MAX - rva, "invalid mapped image base");
                session.site = base + rva;
                Check(MappedInstructionMatches(process.h, session.site, expected, base), "mapped instruction mismatch or unsafe mapping");
                session.AddThread(event.dwThreadId, created.hThread);
                break;
            }
            case CREATE_THREAD_DEBUG_EVENT: session.AddThread(event.dwThreadId, event.u.CreateThread.hThread); break;
            case EXIT_THREAD_DEBUG_EVENT: {
                auto thread = session.threads.find(event.dwThreadId);
                if (thread != session.threads.end()) { thread->second.exited = true; thread->second.armed = false; thread->second.Close(); session.threads.erase(thread); }
                auto handle = session.debugThreads.find(event.dwThreadId);
                if (handle != session.debugThreads.end()) { CloseHandle(handle->second); session.debugThreads.erase(handle); }
                break;
            }
            case LOAD_DLL_DEBUG_EVENT:
                if (event.u.LoadDll.hFile) CloseHandle(event.u.LoadDll.hFile);
                if (loanResource) RequireSeparateDiagnosticProcess(process.h);
                break;
            case EXCEPTION_DEBUG_EVENT: {
                const auto& exception = event.u.Exception;
                session.disposition = DBG_EXCEPTION_NOT_HANDLED;
                if (!session.attachBreakSeen && exception.dwFirstChance && AttachBreak(process.h, exception.ExceptionRecord)) {
                    session.attachBreakSeen = true;
                    Check(!session.threads.empty(), "no initial thread armed");
                    for (const auto& [id, thread] : session.threads) Check(thread.armed, "initial thread not armed");
                    printf("{\"event\":\"ready\",\"pid\":%lu,\"sha256\":\"%s\",\"rva\":\"%lx\",\"armedThreads\":%zu}\n",
                        pid, kHash, rva, session.threads.size()); fflush(stdout);
                    session.disposition = DBG_CONTINUE;
                } else if (exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP) {
                    auto found = session.threads.find(event.dwThreadId);
                    Check(found != session.threads.end() && found->second.armed, "single step on unarmed thread");
                    CONTEXT context{}; context.ContextFlags = CONTEXT_FULL | CONTEXT_DEBUG_REGISTERS;
                    Check(GetThreadContext(found->second.contextHandle, &context), "cannot inspect stopped hit");
                    if (OwnedStep(event, context, session.site)) {
                        session.disposition = DBG_CONTINUE;
                        session.pendingOwnedStep = true;
                        // The only SetThreadContext at a hit sets x64 RF so the original instruction runs once.
                        CONTEXT resume = context;
                        resume.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                        resume.EFlags |= 0x10000; resume.Dr6 = 0;
                        Check(SetThreadContext(found->second.contextHandle, &resume), "cannot set resume flag");
                        Check(session.attachBreakSeen, "owned hit arrived before all initial threads were armed");
                        if (loanResource) {
                            hit = EmitLoanResource(process.h, pid, event.dwThreadId, context, ++samples);
                            Check(samples <= 32 && (samples < 32 || hit), "loan resource observation limit reached");
                            break;
                        }
                        int32_t player = 0;
                        const bool readable = context.R14 <= UINT64_MAX - 0x20c &&
                            SafeReadInt(process.h, context.R14 + 0x20c, player);
                        printf("{\"event\":\"loaded-game-return-hit\",\"pid\":%lu,\"threadId\":%lu,"
                            "\"rip\":\"%llx\",\"r14\":\"%llx\",\"dr0\":\"%llx\",\"dr6\":\"%llx\",\"dr7\":\"%llx\","
                            "\"playerReadable\":%s,\"player\":%ld}\n", pid, event.dwThreadId, context.Rip,
                            context.R14, context.Dr0, context.Dr6, context.Dr7, readable ? "true" : "false", player);
                        fflush(stdout);
                        hit = true;
                    } else {
                        fprintf(stderr, "unowned_single_step thread=%lu rip=%llx dr6=%llx dr7=%llx\n",
                            event.dwThreadId, context.Rip, context.Dr6, context.Dr7);
                    }
                } else if (!exception.dwFirstChance) throw Error("target second-chance exception");
                break;
            }
            case EXIT_PROCESS_DEBUG_EVENT: session.exited = true; break;
            default: break;
            }
            if (hit) break;
            Check(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, session.disposition), "cannot continue debug event");
            session.pending = false; session.pendingOwnedStep = false;
        }
        Check(session.Clean(), "restoration, drain, detach, or survival verification failed");
        printf("{\"event\":\"teardown\",\"restorationVerified\":%s,\"drained\":%s,\"detached\":%s,\"targetAlive\":%s}\n",
            session.cleanupVerified ? "true" : "false", session.drained ? "true" : "false",
            session.detached ? "true" : "false", session.survived ? "true" : "false"); fflush(stdout);
        if (!hit) throw Error(session.exited ? "target exited before qualified diagnostic hit" : "diagnostic timeout");
        return 0;
    } catch (...) {
        if (session.attached) {
            const bool clean = session.Clean();
            fprintf(stderr, "cleanup_restored_and_detached=%s restoration_readback=%s drained=%s detached=%s target_alive=%s\n",
                clean ? "true" : "false", session.cleanupVerified ? "true" : "false",
                session.drained ? "true" : "false", session.detached ? "true" : "false", session.survived ? "true" : "false");
        }
        throw;
    }
}
}
int wmain(int argc, wchar_t** argv) {
    try {
        if ((argc != 3 && argc != 4) || wcscmp(argv[1], L"--pid") ||
            (argc == 4 && wcscmp(argv[3], L"--loan-resource")))
            throw Error("usage: ExternalHardwareLoadProbe.exe --pid <explicit-PID> [--loan-resource]");
        return Observe(ParsePid(argv[2]), argc == 4);
    } catch (const std::exception& error) { fprintf(stderr, "probe_failed: %s\n", error.what()); return 1; }
}
