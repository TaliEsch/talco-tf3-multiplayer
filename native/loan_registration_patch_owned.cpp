#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <bcrypt.h>
#include <psapi.h>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include <memory>
#pragma comment(lib, "bcrypt.lib")

// Entirely owned executable fixture. No PID input, game path, DLL injection, or
// production hook is accepted. The executable image pins the direct wrapper.
extern "C" unsigned char LoanPatchOwnedCallsite;
extern "C" bool LoanPatchOwnedTestCall(void*, void*, const char*);
extern "C" void LoanPatchOwnedBreak();
extern "C" bool LoanPatchOwnedWrapper(void*, void*, const char*);
extern "C" void* __guard_dispatch_icall_fptr;
struct Shared {
    volatile LONG phase;
    volatile LONG breakpointEntered;
    volatile LONG wrapperThreadId;
    volatile LONG originalCalls;
    volatile LONG wrapperCalls;
    volatile LONG badArgs;
    volatile LONG badResult;
    volatile LONG exceptionCase;
    volatile LONG exceptionCaught;
    volatile LONG negativeGuard;
    volatile LONG suppressedCalls;
};
static Shared* g_shared = nullptr;
static int g_token = 7;
static constexpr char kName[] = "owned-loan";
extern "C" __declspec(noinline) bool LoanPatchOwnedOriginal(void* state, void* fn, const char* name) {
    if (state != g_shared || fn != &g_token || name != kName) InterlockedIncrement(&g_shared->badArgs);
    InterlockedIncrement(&g_shared->originalCalls);
    if (g_shared->phase == 4) throw std::runtime_error("owned relay unwind");
    return true;
}
extern "C" __declspec(noinline) bool LoanPatchOwnedWrapperBody(void* state, void* fn, const char* name) {
    InterlockedIncrement(&g_shared->wrapperCalls);
    if (InterlockedCompareExchange(&g_shared->phase, 0, 0) == 2 &&
        InterlockedCompareExchange(&g_shared->breakpointEntered, 1, 0) == 0) {
        InterlockedExchange(&g_shared->wrapperThreadId, static_cast<LONG>(GetCurrentThreadId()));
        LoanPatchOwnedBreak();
    }
    const bool result = LoanPatchOwnedOriginal(state, fn, name);
    volatile LONG keepFrame = InterlockedCompareExchange(&g_shared->phase, 0, 0);
    (void)keepFrame;
    return result;
}
extern "C" __declspec(noinline) __declspec(guard(suppress)) bool LoanPatchOwnedSuppressed(
    void*, void*, const char*) {
    InterlockedIncrement(&g_shared->suppressedCalls);
    return true;
}

struct Ready { DWORD magic; DWORD siteRva; DWORD originalRva; DWORD wrapperRva; DWORD breakRva;
    DWORD suppressedRva; DWORD dispatchSlotRva; DWORD imageSize; };
static constexpr DWORD kMagic = 0x504c4f41;
static void Require(bool okay, const char* why) { if (!okay) throw std::runtime_error(why); }
struct Handle {
    HANDLE h = nullptr;
    Handle() = default;
    explicit Handle(HANDLE value) : h(value) {}
    ~Handle() { if (h && h != INVALID_HANDLE_VALUE) CloseHandle(h); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
static uint64_t Ptr(const void* p) { return reinterpret_cast<uint64_t>(p); }
static std::wstring SelfPath() {
    std::wstring path(32768, L'\0');
    const DWORD count = GetModuleFileNameW(nullptr, &path[0], static_cast<DWORD>(path.size()));
    Require(count && count < path.size(), "own executable path unavailable"); path.resize(count); return path;
}
static std::array<BYTE, 32> FileHash(const std::wstring& path) {
    Handle file(CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_DELETE, nullptr,
        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
    Require(file.h != INVALID_HANDLE_VALUE, "executable cannot be hashed");
    BCRYPT_ALG_HANDLE alg = nullptr; BCRYPT_HASH_HANDLE hash = nullptr;
    Require(BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) == 0, "SHA256 open failed");
    try {
        Require(BCryptCreateHash(alg, &hash, nullptr, 0, nullptr, 0, 0) == 0, "SHA256 create failed");
        std::array<BYTE, 16384> block{}; DWORD got = 0;
        BOOL readOkay = FALSE;
        while ((readOkay = ReadFile(file.h, block.data(), static_cast<DWORD>(block.size()), &got, nullptr)) && got) {
            Require(BCryptHashData(hash, block.data(), got, 0) == 0, "SHA256 update failed");
        }
        Require(readOkay != FALSE, "executable hash read failed");
        std::array<BYTE, 32> output{};
        Require(BCryptFinishHash(hash, output.data(), static_cast<ULONG>(output.size()), 0) == 0, "SHA256 finish failed");
        BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(alg, 0); return output;
    } catch (...) { if (hash) BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(alg, 0); throw; }
}
static DWORD WINAPI Worker(void*) {
    for (unsigned i = 0; i < 20; ++i)
        if (!LoanPatchOwnedTestCall(g_shared, &g_token, kName)) InterlockedIncrement(&g_shared->badResult);
    return 0;
}
static void RunWorkers() {
    std::array<HANDLE, 4> threads{};
    for (auto& h : threads) { h = CreateThread(nullptr, 0, Worker, nullptr, 0, nullptr); Require(h != nullptr, "owned thread create failed"); }
    Require(WaitForMultipleObjects(static_cast<DWORD>(threads.size()), threads.data(), TRUE, 10000) == WAIT_OBJECT_0,
        "owned workers timed out");
    for (auto h : threads) CloseHandle(h);
}
static int Child(uint64_t writeHandle, uint64_t gateHandle, uint64_t mapHandle) {
    g_shared = static_cast<Shared*>(MapViewOfFile(reinterpret_cast<HANDLE>(mapHandle), FILE_MAP_ALL_ACCESS, 0, 0, sizeof(Shared)));
    Require(g_shared != nullptr, "owned shared map failed");
    const uint64_t base = Ptr(GetModuleHandleW(nullptr));
    Ready ready{kMagic, static_cast<DWORD>(Ptr(&LoanPatchOwnedCallsite) - base),
        static_cast<DWORD>(Ptr(&LoanPatchOwnedOriginal) - base),
        static_cast<DWORD>(Ptr(&LoanPatchOwnedWrapper) - base),
        static_cast<DWORD>(Ptr(&LoanPatchOwnedBreak) - base),
        static_cast<DWORD>(Ptr(&LoanPatchOwnedSuppressed) - base),
        static_cast<DWORD>(Ptr(&__guard_dispatch_icall_fptr) - base), 0};
    auto dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    auto nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    ready.imageSize = nt->OptionalHeader.SizeOfImage;
    DWORD written = 0;
    Require(WriteFile(reinterpret_cast<HANDLE>(writeHandle), &ready, sizeof ready, &written, nullptr) && written == sizeof ready,
        "owned ready metadata write failed");
    CloseHandle(reinterpret_cast<HANDLE>(writeHandle));
    Require(WaitForSingleObject(reinterpret_cast<HANDLE>(gateHandle), 15000) == WAIT_OBJECT_0, "owned start gate timed out");
    if (g_shared->negativeGuard) {
        (void)LoanPatchOwnedTestCall(g_shared, &g_token, kName);
        return 12; // A functioning CFG dispatcher must fast-fail first.
    }
    InterlockedExchange(&g_shared->phase, 1);
    RunWorkers();
    if (g_shared->exceptionCase) {
        InterlockedExchange(&g_shared->phase, 4);
        try { (void)LoanPatchOwnedTestCall(g_shared, &g_token, kName); }
        catch (const std::runtime_error& error) {
            if (std::strcmp(error.what(), "owned relay unwind") == 0)
                InterlockedExchange(&g_shared->exceptionCaught, 1);
        }
        Require(g_shared->exceptionCaught == 1, "owned relay C++ unwind not caught");
    }
    InterlockedExchange(&g_shared->phase, 2);
    if (!LoanPatchOwnedTestCall(g_shared, &g_token, kName)) InterlockedIncrement(&g_shared->badResult);
    InterlockedExchange(&g_shared->phase, 3);
    RunWorkers();
    const LONG expectedOriginal = g_shared->exceptionCase ? 162 : 161;
    const LONG expectedWrapper = g_shared->exceptionCase ? 82 : 81;
    return g_shared->originalCalls == expectedOriginal && g_shared->wrapperCalls == expectedWrapper &&
        g_shared->breakpointEntered == 1 && !g_shared->badArgs && !g_shared->badResult ? 0 : 9;
}
static bool ReadExact(HANDLE process, uint64_t address, void* data, SIZE_T size) {
    SIZE_T got = 0; return ReadProcessMemory(process, reinterpret_cast<void*>(address), data, size, &got) && got == size;
}
static void ValidateOwnedGfids(HANDLE process, uint64_t base, const Ready& ready) {
    IMAGE_DOS_HEADER dos{};
    Require(ReadExact(process, base, &dos, sizeof dos) && dos.e_magic == IMAGE_DOS_SIGNATURE &&
        dos.e_lfanew > 0 && dos.e_lfanew < 0x1000, "owned CFG DOS invalid");
    IMAGE_NT_HEADERS64 nt{};
    Require(ReadExact(process, base + dos.e_lfanew, &nt, sizeof nt) &&
        nt.Signature == IMAGE_NT_SIGNATURE && nt.OptionalHeader.Magic == IMAGE_NT_OPTIONAL_HDR64_MAGIC,
        "owned CFG NT invalid");
    const auto dir = nt.OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_LOAD_CONFIG];
    Require(dir.VirtualAddress && dir.Size >= offsetof(IMAGE_LOAD_CONFIG_DIRECTORY64, GuardFlags) + sizeof(DWORD) &&
        dir.VirtualAddress < ready.imageSize && dir.Size <= ready.imageSize - dir.VirtualAddress,
        "owned CFG load directory invalid");
    IMAGE_LOAD_CONFIG_DIRECTORY64 config{};
    const SIZE_T bytes = (std::min)(static_cast<SIZE_T>(dir.Size), sizeof config);
    Require(ReadExact(process, base + dir.VirtualAddress, &config, bytes) &&
        config.Size >= offsetof(IMAGE_LOAD_CONFIG_DIRECTORY64, GuardFlags) + sizeof(DWORD) &&
        (config.GuardFlags & IMAGE_GUARD_CF_INSTRUMENTED) &&
        (config.GuardFlags & IMAGE_GUARD_CF_FUNCTION_TABLE_PRESENT) &&
        !(config.GuardFlags & IMAGE_GUARD_XFG_ENABLED) &&
        config.GuardCFDispatchFunctionPointer == base + ready.dispatchSlotRva &&
        config.GuardCFFunctionCount > 0 && config.GuardCFFunctionCount <= 4096,
        "owned CFG metadata invalid");
    const unsigned extra = (config.GuardFlags & IMAGE_GUARD_CF_FUNCTION_TABLE_SIZE_MASK) >>
        IMAGE_GUARD_CF_FUNCTION_TABLE_SIZE_SHIFT;
    Require(extra <= 1, "owned GFID stride unsupported");
    const SIZE_T stride = sizeof(DWORD) + extra;
    const SIZE_T span = static_cast<SIZE_T>(config.GuardCFFunctionCount) * stride;
    const uint64_t table = config.GuardCFFunctionTable;
    Require(table >= base && table - base < ready.imageSize && span <= ready.imageSize - (table - base),
        "owned GFID table outside image");
    std::vector<BYTE> entries(span);
    Require(ReadExact(process, table, entries.data(), entries.size()), "owned GFID table read failed");
    bool wrapperFound = false, suppressedFound = false;
    DWORD previous = 0;
    for (SIZE_T i = 0; i < config.GuardCFFunctionCount; ++i) {
        DWORD rva = 0; std::memcpy(&rva, entries.data() + i * stride, sizeof rva);
        Require(i == 0 || rva > previous, "owned GFID table unsorted"); previous = rva;
        const BYTE flags = extra ? entries[i * stride + sizeof(DWORD)] : 0;
        if (rva == ready.wrapperRva) {
            Require(!(flags & (IMAGE_GUARD_FLAG_FID_SUPPRESSED | IMAGE_GUARD_FLAG_EXPORT_SUPPRESSED)),
                "owned wrapper GFID suppressed"); wrapperFound = true;
        }
        if (rva == ready.suppressedRva) {
            Require(flags & IMAGE_GUARD_FLAG_FID_SUPPRESSED, "owned negative GFID not suppressed");
            suppressedFound = true;
        }
    }
    Require(wrapperFound && suppressedFound, "owned wrapper/suppressed GFID absent");
}
static std::array<BYTE, 5> ReadSite(HANDLE process, uint64_t site) {
    std::array<BYTE, 5> bytes{}; Require(ReadExact(process, site, bytes.data(), bytes.size()), "callsite read failed"); return bytes;
}
static void SafeThreads(DWORD pid, uint64_t site) {
    Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0));
    Require(snapshot.h != INVALID_HANDLE_VALUE, "thread snapshot failed");
    THREADENTRY32 entry{}; entry.dwSize = sizeof entry;
    Require(Thread32First(snapshot.h, &entry) != FALSE, "thread snapshot empty");
    unsigned found = 0;
    do {
        if (entry.th32OwnerProcessID != pid) continue;
        Handle thread(OpenThread(THREAD_GET_CONTEXT | SYNCHRONIZE, FALSE, entry.th32ThreadID));
        Require(thread.h != nullptr, "owned thread context handle failed");
        CONTEXT context{}; context.ContextFlags = CONTEXT_CONTROL;
        Require(GetThreadContext(thread.h, &context) != FALSE, "owned thread context failed");
        Require(context.Rip < site || context.Rip >= site + 5, "thread RIP inside five-byte call");
        ++found;
    } while (Thread32Next(snapshot.h, &entry));
    Require(found != 0, "no owned thread contexts checked");
}
static DWORD SiteProtection(HANDLE process, uint64_t site, uint64_t base) {
    MEMORY_BASIC_INFORMATION info{};
    Require(VirtualQueryEx(process, reinterpret_cast<void*>(site), &info, sizeof info) == sizeof info &&
        info.State == MEM_COMMIT && info.Type == MEM_IMAGE && Ptr(info.AllocationBase) == base &&
        !(info.Protect & (PAGE_GUARD | PAGE_NOACCESS)) && (info.Protect & 0xff) == PAGE_EXECUTE_READ,
        "callsite mapping/protection mismatch");
    Require(Ptr(info.BaseAddress) <= site && site + 5 <= Ptr(info.BaseAddress) + info.RegionSize,
        "callsite crosses page region"); return info.Protect;
}
static uint64_t AllocateNear(HANDLE process, uint64_t site) {
    SYSTEM_INFO system{}; GetSystemInfo(&system);
    const uint64_t unit = system.dwAllocationGranularity;
    Require(unit && (unit & (unit - 1)) == 0, "allocation granularity invalid");
    const uint64_t anchor = site & ~(unit - 1);
    for (uint64_t step = 1; step <= static_cast<uint64_t>(INT32_MAX) / unit; ++step) {
        for (int direction : {1, -1}) {
            if (direction == 1 && anchor > UINT64_MAX - step * unit) continue;
            if (direction == -1 && anchor < step * unit) continue;
            const uint64_t candidate = direction == 1 ? anchor + step * unit : anchor - step * unit;
            const int64_t delta = static_cast<int64_t>(candidate) - static_cast<int64_t>(site + 5);
            if (delta < INT32_MIN || delta > INT32_MAX) continue;
            void* allocated = VirtualAllocEx(process, reinterpret_cast<void*>(candidate), 4096,
                MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
            if (allocated == reinterpret_cast<void*>(candidate)) return candidate;
        }
    }
    throw std::runtime_error("no reachable owned relay page");
}
static uint64_t WriteRelay(HANDLE process, uint64_t site, uint64_t wrapper, uint64_t dispatchSlot) {
    PROCESS_MITIGATION_CONTROL_FLOW_GUARD_POLICY cfg{};
    Require(GetProcessMitigationPolicy(process, ProcessControlFlowGuardPolicy, &cfg, sizeof cfg) &&
        cfg.EnableControlFlowGuard, "owned CFG policy not enabled");
    MEMORY_BASIC_INFORMATION slotPage{};
    Require(VirtualQueryEx(process, reinterpret_cast<void*>(dispatchSlot), &slotPage, sizeof slotPage) == sizeof slotPage &&
        slotPage.State == MEM_COMMIT && slotPage.Type == MEM_IMAGE &&
        (slotPage.Protect & 0xff) == PAGE_READONLY, "owned dispatch slot not read-only image data");
    uint64_t dispatcher = 0;
    Require(ReadExact(process, dispatchSlot, &dispatcher, sizeof dispatcher) && dispatcher,
        "owned dispatch pointer unavailable");
    MEMORY_BASIC_INFORMATION dispatcherPage{};
    Require(VirtualQueryEx(process, reinterpret_cast<void*>(dispatcher), &dispatcherPage,
        sizeof dispatcherPage) == sizeof dispatcherPage && dispatcherPage.State == MEM_COMMIT &&
        dispatcherPage.Type == MEM_IMAGE && (dispatcherPage.Protect & 0xff) == PAGE_EXECUTE_READ,
        "owned CFG dispatcher mapping invalid");
    wchar_t dispatcherPath[32768]{};
    Require(GetMappedFileNameW(process, dispatcherPage.AllocationBase, dispatcherPath, 32768) != 0,
        "owned CFG dispatcher path unavailable");
    const wchar_t* dispatcherLeaf = wcsrchr(dispatcherPath, L'\\');
    Require(dispatcherLeaf && _wcsicmp(dispatcherLeaf + 1, L"ntdll.dll") == 0,
        "owned CFG dispatch slot not OS-resolved");
    const uint64_t relay = AllocateNear(process, site);
    std::array<BYTE, 24> bytes{0x48, 0xb8};
    std::memcpy(bytes.data() + 2, &wrapper, sizeof wrapper);
    bytes[10] = 0xff; bytes[11] = 0x25; // jmp qword ptr [rip+0]
    std::memcpy(bytes.data() + 16, &dispatcher, sizeof dispatcher);
    SIZE_T written = 0;
    Require(WriteProcessMemory(process, reinterpret_cast<void*>(relay), bytes.data(), bytes.size(), &written) &&
        written == bytes.size(), "relay exact write failed");
    std::array<BYTE, 24> readback{};
    Require(ReadExact(process, relay, readback.data(), readback.size()) && readback == bytes,
        "relay RW readback failed");
    DWORD old = 0;
    Require(VirtualProtectEx(process, reinterpret_cast<void*>(relay), 4096, PAGE_EXECUTE_READ, &old) &&
        old == PAGE_READWRITE, "relay RX protection failed");
    Require(FlushInstructionCache(process, reinterpret_cast<void*>(relay), bytes.size()), "relay flush failed");
    MEMORY_BASIC_INFORMATION page{};
    Require(VirtualQueryEx(process, reinterpret_cast<void*>(relay), &page, sizeof page) == sizeof page &&
        page.State == MEM_COMMIT && page.Type == MEM_PRIVATE && (page.Protect & 0xff) == PAGE_EXECUTE_READ &&
        ReadExact(process, relay, readback.data(), readback.size()) && readback == bytes,
        "relay RX readback failed");
    return relay; // Remains pinned by the child process until its exit.
}
static void WriteFive(HANDLE process, uint64_t site, uint64_t base,
    const std::array<BYTE, 5>& expected, const std::array<BYTE, 5>& replacement, const char* fault) {
    Require(ReadSite(process, site) == expected, "foreign callsite bytes");
    const DWORD prior = SiteProtection(process, site, base);
    if (std::strcmp(fault, "protect") == 0) {
        DWORD unused = 0;
        Require(!VirtualProtectEx(nullptr, reinterpret_cast<void*>(site), 5, PAGE_EXECUTE_READWRITE, &unused),
            "injected protection failure did not fail");
        throw std::runtime_error("injected protection failure");
    }
    DWORD old = 0;
    Require(VirtualProtectEx(process, reinterpret_cast<void*>(site), 5, PAGE_EXECUTE_READWRITE, &old) && old == prior,
        "callsite writable protection failed");
    bool restored = false;
    try {
        SIZE_T written = 0;
        SIZE_T length = replacement.size();
        auto partial = expected;
        if (std::strcmp(fault, "shortwrite") == 0) {
            SIZE_T firstDifference = 0;
            while (firstDifference < expected.size() && expected[firstDifference] == replacement[firstDifference])
                ++firstDifference;
            Require(firstDifference + 1 < expected.size(), "no strict torn-CALL prefix available");
            length = firstDifference + 1;
            std::memcpy(partial.data(), replacement.data(), length);
            Require(partial != expected && partial != replacement, "no torn-CALL intermediate bytes available");
        }
        Require(WriteProcessMemory(process, reinterpret_cast<void*>(site), replacement.data(), length, &written) &&
            written == length, "callsite write count mismatch");
        if (length < replacement.size()) {
            Require(ReadSite(process, site) == partial,
                "torn-CALL readback mismatch");
            throw std::runtime_error("injected strict-prefix short write");
        }
        Require(ReadSite(process, site) == replacement, "callsite readback mismatch");
        if (std::strcmp(fault, "flush") == 0) {
            // Deterministic fixture fault: refuse the required flush after the
            // full write and readback, while all target threads remain stopped.
            throw std::runtime_error("injected flush failure");
        }
        Require(FlushInstructionCache(process, reinterpret_cast<void*>(site), 5), "instruction cache flush failed");
        DWORD replaced = 0;
        Require(VirtualProtectEx(process, reinterpret_cast<void*>(site), 5, old, &replaced) &&
            replaced == PAGE_EXECUTE_READWRITE, "callsite protection restore failed");
        restored = true;
        Require(SiteProtection(process, site, base) == prior && ReadSite(process, site) == replacement,
            "final callsite verification failed");
    } catch (...) {
        if (!restored) { DWORD ignored = 0; VirtualProtectEx(process, reinterpret_cast<void*>(site), 5, old, &ignored); }
        throw;
    }
}
static std::wstring ProcessPath(HANDLE process) {
    std::wstring path(32768, L'\0'); DWORD size = static_cast<DWORD>(path.size());
    Require(QueryFullProcessImageNameW(process, 0, &path[0], &size) != FALSE, "child path unavailable");
    path.resize(size); return path;
}
static bool IsAttachBreakpoint(HANDLE process, const EXCEPTION_RECORD& record) {
    MEMORY_BASIC_INFORMATION page{};
    if (VirtualQueryEx(process, record.ExceptionAddress, &page, sizeof page) != sizeof page ||
        page.Type != MEM_IMAGE) return false;
    wchar_t path[32768]{};
    if (!GetMappedFileNameW(process, page.AllocationBase, path, 32768)) return false;
    const wchar_t* leaf = wcsrchr(path, L'\\');
    if (!leaf || _wcsicmp(leaf + 1, L"ntdll.dll") != 0) return false;
    HMODULE local = GetModuleHandleW(L"ntdll.dll");
    const auto breakpoint = local ? GetProcAddress(local, "DbgBreakPoint") : nullptr;
    return breakpoint && Ptr(record.ExceptionAddress) == Ptr(page.AllocationBase) +
        Ptr(breakpoint) - Ptr(local);
}
static Ready ReadReady(HANDLE pipe, HANDLE child) {
    Ready ready{}; DWORD available = 0;
    const uint64_t deadline = GetTickCount64() + 5000;
    while (GetTickCount64() < deadline) {
        Require(WaitForSingleObject(child, 0) == WAIT_TIMEOUT, "child exited before ready");
        Require(PeekNamedPipe(pipe, nullptr, 0, nullptr, &available, nullptr), "ready pipe failed");
        if (available >= sizeof ready) break;
        Sleep(10);
    }
    Require(available >= sizeof ready, "owned child ready timed out");
    DWORD got = 0; Require(ReadFile(pipe, &ready, sizeof ready, &got, nullptr) && got == sizeof ready &&
        ready.magic == kMagic, "owned child ready invalid"); return ready;
}
static void DrainTerminated(DWORD pid, bool terminationRequested) {
    Require(terminationRequested, "debug drain without termination request");
    const uint64_t deadline = GetTickCount64() + 5000;
    while (GetTickCount64() < deadline) {
        DEBUG_EVENT event{};
        if (!WaitForDebugEvent(&event, 100)) continue;
        if (event.dwDebugEventCode == CREATE_PROCESS_DEBUG_EVENT && event.u.CreateProcessInfo.hFile)
            CloseHandle(event.u.CreateProcessInfo.hFile);
        if (event.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT && event.u.LoadDll.hFile)
            CloseHandle(event.u.LoadDll.hFile);
        const bool exited = event.dwDebugEventCode == EXIT_PROCESS_DEBUG_EVENT && event.dwProcessId == pid;
        Require(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, DBG_CONTINUE) != FALSE,
            "debug drain continuation failed");
        if (exited) return;
    }
    throw std::runtime_error("owned child debug exit missing");
}
static int OneCase(const wchar_t* executable, const std::array<BYTE, 32>& ownHash, const char* fault) {
    SECURITY_ATTRIBUTES attributes{sizeof attributes, nullptr, TRUE};
    HANDLE readRaw = nullptr, writeRaw = nullptr;
    Require(CreatePipe(&readRaw, &writeRaw, &attributes, 0) != FALSE, "ready pipe create failed");
    Handle readPipe(readRaw), writePipe(writeRaw);
    Require(SetHandleInformation(readPipe.h, HANDLE_FLAG_INHERIT, 0) != FALSE, "ready pipe inherit failed");
    Handle gate(CreateEventW(&attributes, TRUE, FALSE, nullptr));
    Handle map(CreateFileMappingW(INVALID_HANDLE_VALUE, &attributes, PAGE_READWRITE, 0, sizeof(Shared), nullptr));
    Require(gate.h && map.h, "owned gate/map create failed");
    Shared* shared = static_cast<Shared*>(MapViewOfFile(map.h, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(Shared)));
    Require(shared != nullptr, "owned parent map failed");
    std::memset(shared, 0, sizeof(Shared));
    if (std::strcmp(fault, "relay-exception") == 0) shared->exceptionCase = 1;
    if (std::strcmp(fault, "relay-suppressed") == 0) shared->negativeGuard = 1;
    wchar_t command[33000]{};
    swprintf_s(command, L"\"%s\" --owned-child %llu %llu %llu", executable,
        static_cast<unsigned long long>(Ptr(writePipe.h)), static_cast<unsigned long long>(Ptr(gate.h)),
        static_cast<unsigned long long>(Ptr(map.h)));
    STARTUPINFOW startup{sizeof startup}; PROCESS_INFORMATION info{};
    Require(CreateProcessW(executable, command, nullptr, nullptr, TRUE, 0, nullptr, nullptr, &startup, &info) != FALSE,
        "owned child spawn failed");
    Handle child(info.hProcess), initialThread(info.hThread);
    bool attached = false, pending = false, exited = false, continuedUncertain = false;
    DEBUG_EVENT event{}; uint64_t site = 0, base = 0;
    auto ContinueChecked = [&](DWORD disposition, bool uncertain, bool terminationRequested) {
        if (uncertain && !terminationRequested) { continuedUncertain = true; return false; }
        return ContinueDebugEvent(event.dwProcessId, event.dwThreadId, disposition) != FALSE;
    };
    try {
        CloseHandle(writePipe.h); writePipe.h = nullptr;
        const Ready ready = ReadReady(readPipe.h, child.h);
        Require(ProcessPath(child.h) == executable && FileHash(ProcessPath(child.h)) == ownHash,
            "owned child executable identity/hash changed");
        FILETIME creation{}, exit{}, kernel{}, user{};
        Require(GetProcessTimes(child.h, &creation, &exit, &kernel, &user), "owned child lifetime unavailable");
        const uint64_t localBase = Ptr(GetModuleHandleW(nullptr));
        const auto localDos = reinterpret_cast<const IMAGE_DOS_HEADER*>(localBase);
        const auto localNt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(localBase + localDos->e_lfanew);
        Require(ready.siteRva == Ptr(&LoanPatchOwnedCallsite) - localBase &&
            ready.originalRva == Ptr(&LoanPatchOwnedOriginal) - localBase &&
            ready.wrapperRva == Ptr(&LoanPatchOwnedWrapper) - localBase &&
            ready.breakRva == Ptr(&LoanPatchOwnedBreak) - localBase &&
            ready.suppressedRva == Ptr(&LoanPatchOwnedSuppressed) - localBase &&
            ready.dispatchSlotRva == Ptr(&__guard_dispatch_icall_fptr) - localBase &&
            ready.imageSize == localNt->OptionalHeader.SizeOfImage &&
            ready.siteRva + 5 <= ready.imageSize && ready.wrapperRva < ready.imageSize &&
            ready.originalRva < ready.imageSize && ready.breakRva < ready.imageSize &&
            ready.suppressedRva < ready.imageSize &&
            ready.dispatchSlotRva + sizeof(uint64_t) <= ready.imageSize,
            "owned child RVA metadata mismatch");
        Require(DebugActiveProcess(info.dwProcessId) != FALSE, "owned child debug attach failed"); attached = true;
        Require(DebugSetProcessKillOnExit(TRUE) != FALSE, "debug fail-stop policy failed");
        std::array<BYTE, 5> original{}; std::array<BYTE, 5> installed{0xe8, 0, 0, 0, 0};
        bool patched = false, restored = false, gateOpened = false;
        const uint64_t deadline = GetTickCount64() + 15000;
        while (!exited && GetTickCount64() < deadline) {
            if (!WaitForDebugEvent(&event, 100)) { Require(GetLastError() == ERROR_SEM_TIMEOUT, "debug event wait failed"); continue; }
            pending = true;
            Require(event.dwProcessId == info.dwProcessId, "unexpected debug process");
            DWORD disposition = DBG_CONTINUE;
            if (event.dwDebugEventCode == CREATE_PROCESS_DEBUG_EVENT) {
                if (event.u.CreateProcessInfo.hFile) CloseHandle(event.u.CreateProcessInfo.hFile);
                base = Ptr(event.u.CreateProcessInfo.lpBaseOfImage);
                Require(base && base <= UINT64_MAX - ready.siteRva, "child image base invalid");
                site = base + ready.siteRva;
                FILETIME observed{}, a{}, b{}, c{};
                Require(GetProcessTimes(event.u.CreateProcessInfo.hProcess, &observed, &a, &b, &c) &&
                    CompareFileTime(&creation, &observed) == 0, "debug event child identity mismatch");
                original = ReadSite(child.h, site);
                Require(original == ReadSite(GetCurrentProcess(), Ptr(&LoanPatchOwnedCallsite)),
                    "child original bytes differ from verified own image");
                Require(original[0] == 0xe8, "original site is not direct CALL");
                int32_t oldDelta = 0; std::memcpy(&oldDelta, original.data() + 1, sizeof oldDelta);
                Require(static_cast<int64_t>(ready.siteRva) + 5 + oldDelta == ready.originalRva,
                    "original CALL target mismatch");
            } else if (event.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT) {
                if (event.u.LoadDll.hFile) CloseHandle(event.u.LoadDll.hFile);
            } else if (event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT) {
                disposition = DBG_EXCEPTION_NOT_HANDLED;
                const auto& ex = event.u.Exception;
                // Windows reports this noncontinuable fast-fail as second chance.
                if (std::strcmp(fault, "relay-suppressed") == 0 && gateOpened && !ex.dwFirstChance &&
                    ex.ExceptionRecord.ExceptionCode == STATUS_STACK_BUFFER_OVERRUN &&
                    ex.ExceptionRecord.NumberParameters > 0 &&
                    ex.ExceptionRecord.ExceptionInformation[0] == FAST_FAIL_GUARD_ICALL_CHECK_FAILURE &&
                    shared->suppressedCalls == 0)
                    throw std::runtime_error("CFG suppressed target rejected");
                if (ex.dwFirstChance && ex.ExceptionRecord.ExceptionCode == EXCEPTION_BREAKPOINT) {
                    if (!gateOpened && site && IsAttachBreakpoint(child.h, ex.ExceptionRecord)) {
                        SafeThreads(info.dwProcessId, site);
                        ValidateOwnedGfids(child.h, base, ready);
                        const bool relayCase = std::strcmp(fault, "relay") == 0 ||
                            std::strcmp(fault, "relay-exception") == 0 ||
                            std::strcmp(fault, "relay-suppressed") == 0;
                        const uint64_t relayTarget = std::strcmp(fault, "relay-suppressed") == 0 ?
                            base + ready.suppressedRva : base + ready.wrapperRva;
                        const uint64_t destination = relayCase ?
                            WriteRelay(child.h, site, relayTarget,
                                base + ready.dispatchSlotRva) : base + ready.wrapperRva;
                        const int64_t delta = static_cast<int64_t>(destination) - static_cast<int64_t>(site + 5);
                        Require(delta >= INT32_MIN && delta <= INT32_MAX, "wrapper/relay outside rel32 reach");
                        const int32_t displacement = static_cast<int32_t>(delta);
                        std::memcpy(installed.data() + 1, &displacement, sizeof displacement);
                        if (std::strcmp(fault, "foreign") == 0) {
                            auto foreign = original; foreign[0] = 0x90;
                            WriteFive(child.h, site, base, original, foreign, "none");
                        }
                        WriteFive(child.h, site, base, original, installed, fault);
                        patched = true; disposition = DBG_CONTINUE;
                    } else if (gateOpened && shared->phase == 2 && shared->breakpointEntered == 1 &&
                        static_cast<DWORD>(shared->wrapperThreadId) == event.dwThreadId &&
                        Ptr(ex.ExceptionRecord.ExceptionAddress) == base + ready.breakRva && !restored) {
                        SafeThreads(info.dwProcessId, site);
                        WriteFive(child.h, site, base, installed, original, "none");
                        restored = true; disposition = DBG_CONTINUE;
                    }
                }
                Require(ex.dwFirstChance || disposition == DBG_CONTINUE, "child second-chance exception");
            } else if (event.dwDebugEventCode == EXIT_PROCESS_DEBUG_EVENT) {
                exited = true;
            }
            Require(ContinueChecked(disposition, false, false),
                "debug event continuation failed"); pending = false;
            if (patched && !gateOpened) { Require(SetEvent(gate.h) != FALSE, "owned start gate failed"); gateOpened = true; }
        }
        Require(exited && patched && restored, "owned patch/restore lifecycle incomplete");
        Require(WaitForSingleObject(child.h, 1000) == WAIT_OBJECT_0, "owned child did not exit");
        DWORD exitCode = 0;
        Require(GetExitCodeProcess(child.h, &exitCode) != FALSE, "owned child exit query failed");
        if (exitCode != 0)
            fprintf(stderr, "child counts: original=%ld wrapper=%ld breakpoint=%ld badArgs=%ld badResult=%ld\n",
                shared->originalCalls, shared->wrapperCalls, shared->breakpointEntered, shared->badArgs, shared->badResult);
        Require(exitCode == 0,
            "owned child verification failed");
        const LONG expectedOriginal = shared->exceptionCase ? 162 : 161;
        const LONG expectedWrapper = shared->exceptionCase ? 82 : 81;
        Require(shared->originalCalls == expectedOriginal && shared->wrapperCalls == expectedWrapper &&
            shared->badArgs == 0 && shared->badResult == 0 && shared->breakpointEntered == 1 &&
            (!shared->exceptionCase || shared->exceptionCaught == 1), "owned call counts invalid");
        Require(!continuedUncertain, "uncertain child continued");
        const bool exceptionCaught = shared->exceptionCaught != 0;
        UnmapViewOfFile(shared);
        printf("{\"case\":\"%s\",\"passed\":true,\"originalCalls\":%ld,\"wrapperCalls\":%ld,\"threadsPerPhase\":4,\"restoreWithWrapperOutstanding\":true,\"exceptionCaught\":%s}\n",
            fault, expectedOriginal, expectedWrapper, exceptionCaught ? "true" : "false");
        return 0;
    } catch (const std::exception& problem) {
        // Every fault is handled while the event is pending. Kill this exact
        // spawned child before any event continuation can execute torn bytes.
        const char* marker = nullptr;
        if (std::strcmp(fault, "shortwrite") == 0) marker = "injected strict-prefix short write";
        else if (std::strcmp(fault, "protect") == 0) marker = "injected protection failure";
        else if (std::strcmp(fault, "flush") == 0) marker = "injected flush failure";
        else if (std::strcmp(fault, "foreign") == 0) marker = "foreign callsite bytes";
        else if (std::strcmp(fault, "relay-suppressed") == 0) marker = "CFG suppressed target rejected";
        const bool expectedFault = marker && std::strcmp(problem.what(), marker) == 0;
        const DWORD state = WaitForSingleObject(child.h, 0);
        if (state != WAIT_TIMEOUT && state != WAIT_OBJECT_0) {
            fprintf(stderr, "%s: owned child liveness query failed; pending event retained\n", fault);
            UnmapViewOfFile(shared);
            return 1;
        }
        const bool alive = state == WAIT_TIMEOUT;
        const bool stopped = pending && alive;
        const bool terminationRequested = alive && TerminateProcess(child.h, 71) != FALSE;
        if (alive && !terminationRequested) {
            // Do not release a possibly torn CALL. Kill-on-debugger-exit remains
            // active; returning from wmain exits this debugger and its child.
            fprintf(stderr, "%s: exact child termination request failed while debug-owned\n", fault);
            UnmapViewOfFile(shared);
            return 1;
        }
        if (pending) {
            if (!ContinueChecked(DBG_CONTINUE, true, terminationRequested || !alive)) {
                fprintf(stderr, "%s: uncertain debug continuation refused or failed\n", fault);
                UnmapViewOfFile(shared);
                return 1;
            }
            pending = false;
        }
        bool drained = true;
        if (attached && terminationRequested) {
            try { DrainTerminated(info.dwProcessId, terminationRequested); }
            catch (const std::exception& drainFailure) {
                fprintf(stderr, "%s: debug drain failed: %s\n", fault, drainFailure.what());
                drained = false;
            }
        }
        const bool suppressedNotRun = shared->suppressedCalls == 0;
        const bool exitedAfterKill = WaitForSingleObject(child.h, 5000) == WAIT_OBJECT_0;
        DWORD code = 0;
        const bool exitQueried = exitedAfterKill && GetExitCodeProcess(child.h, &code) != FALSE;
        UnmapViewOfFile(shared);
        if (expectedFault && stopped && terminationRequested && drained && exitQueried &&
            code == 71 && !continuedUncertain && suppressedNotRun) {
            printf("{\"case\":\"%s\",\"passed\":true,\"terminatedWhilePending\":true,\"continuedUncertain\":false,\"reason\":\"%s\"}\n",
                fault, problem.what()); return 0;
        }
        fprintf(stderr, "%s: %s (pending=%d, childExit=%lu)\n", fault, problem.what(), stopped ? 1 : 0, code);
        return 1;
    }
}
int wmain(int argc, wchar_t** argv) {
    try {
        if (argc == 5 && std::wcscmp(argv[1], L"--owned-child") == 0)
            return Child(_wcstoui64(argv[2], nullptr, 10), _wcstoui64(argv[3], nullptr, 10),
                _wcstoui64(argv[4], nullptr, 10));
        Require(argc == 1, "fixture accepts no target PID or path");
        const std::wstring path = SelfPath(); const auto hash = FileHash(path);
        const char* cases[] = {"none", "relay", "relay-exception", "relay-suppressed",
            "shortwrite", "protect", "flush", "foreign"};
        unsigned passed = 0;
        for (const auto* name : cases) { if (OneCase(path.c_str(), hash, name) == 0) ++passed; else return 1; }
        printf("{\"scope\":\"owned-child-rel32-call-pending-debug-event\",\"passed\":true,\"cases\":%u}\n", passed);
        return 0;
    } catch (const std::exception& problem) { fprintf(stderr, "fixture: %s\n", problem.what()); return 1; }
}
