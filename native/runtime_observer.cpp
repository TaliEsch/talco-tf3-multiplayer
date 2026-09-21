// Bounded TF3 qualification observer. This is a visible Windows debugger, not
// an injected hook. It never writes image/data pages or calls engine functions.
// Hardware breakpoints perturb timing; observations do not prove determinism.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <psapi.h>
#include <array>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

#pragma comment(lib, "bcrypt.lib")
namespace {
constexpr char kTf3Hash[] = "a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5";
std::atomic<bool> interrupted{false};
BOOL WINAPI Control(DWORD event) {
    if (event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT) {
        interrupted.store(true);
        return TRUE;
    }
    return FALSE;
}
void Require(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(std::string(message) + " (win32=" + std::to_string(GetLastError()) + ")");
}
struct Handle {
    HANDLE value = nullptr;
    explicit Handle(HANDLE v = nullptr) : value(v) {}
    ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
std::wstring ImagePath(HANDLE process) {
    std::wstring path(32768, L'\0');
    DWORD length = static_cast<DWORD>(path.size());
    Require(QueryFullProcessImageNameW(process, 0, path.data(), &length) != FALSE, "process path unavailable");
    path.resize(length);
    return path;
}
struct Image {
    Handle file;
    std::vector<BYTE> bytes;
    std::string hash;
    IMAGE_NT_HEADERS64 nt{};
    std::vector<IMAGE_SECTION_HEADER> sections;
    explicit Image(const std::wstring& path) : file(CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ,
            nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr)) {
        Require(file.value != INVALID_HANDLE_VALUE, "cannot lock image for reading");
        LARGE_INTEGER size{};
        Require(GetFileSizeEx(file.value, &size) && size.QuadPart > 0 && size.QuadPart <= 256 * 1024 * 1024,
                "image size out of bounds");
        bytes.resize(static_cast<size_t>(size.QuadPart));
        DWORD read = 0;
        Require(ReadFile(file.value, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr) && read == bytes.size(),
                "incomplete image read");
        BCRYPT_ALG_HANDLE algorithm = nullptr;
        Require(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) >= 0, "SHA256 unavailable");
        std::array<BYTE, 32> digest{};
        const NTSTATUS status = BCryptHash(algorithm, nullptr, 0, bytes.data(), static_cast<ULONG>(bytes.size()),
                                          digest.data(), static_cast<ULONG>(digest.size()));
        BCryptCloseAlgorithmProvider(algorithm, 0);
        Require(status >= 0, "SHA256 failed");
        constexpr char hex[] = "0123456789abcdef";
        for (BYTE b : digest) { hash += hex[b >> 4]; hash += hex[b & 15]; }
        const auto dos = Read<IMAGE_DOS_HEADER>(0);
        Require(dos.e_magic == IMAGE_DOS_SIGNATURE && dos.e_lfanew > 0, "invalid DOS header");
        nt = Read<IMAGE_NT_HEADERS64>(static_cast<size_t>(dos.e_lfanew));
        Require(nt.Signature == IMAGE_NT_SIGNATURE && nt.FileHeader.Machine == IMAGE_FILE_MACHINE_AMD64 &&
                nt.OptionalHeader.Magic == IMAGE_NT_OPTIONAL_HDR64_MAGIC &&
                nt.FileHeader.SizeOfOptionalHeader == sizeof(IMAGE_OPTIONAL_HEADER64) &&
                nt.FileHeader.NumberOfSections > 0 && nt.FileHeader.NumberOfSections < 97, "unsupported PE64 headers");
        for (WORD i = 0; i < nt.FileHeader.NumberOfSections; ++i) {
            sections.push_back(Read<IMAGE_SECTION_HEADER>(static_cast<size_t>(dos.e_lfanew) + sizeof(nt) + i * sizeof(IMAGE_SECTION_HEADER)));
        }
    }
    template<class T> T Read(size_t offset) const {
        Require(offset <= bytes.size() && sizeof(T) <= bytes.size() - offset, "image read outside file");
        T result{}; memcpy(&result, bytes.data() + offset, sizeof(result)); return result;
    }
    size_t Offset(DWORD rva, size_t length, bool executable) const {
        size_t result = 0; size_t matches = 0;
        for (const auto& section : sections) {
            if (executable && (section.Characteristics & IMAGE_SCN_MEM_EXECUTE) == 0) continue;
            if (rva < section.VirtualAddress) continue;
            const size_t delta = rva - section.VirtualAddress;
            if (delta > section.SizeOfRawData || length > section.SizeOfRawData - delta) continue;
            result = static_cast<size_t>(section.PointerToRawData) + delta;
            Require(result <= bytes.size() && length <= bytes.size() - result, "section exceeds file");
            ++matches;
        }
        Require(matches == 1, "RVA mapping ambiguous or not file backed");
        return result;
    }
};
bool ReadRemote(HANDLE process, ULONG64 address, void* data, size_t size) {
    SIZE_T read = 0;
    return ReadProcessMemory(process, reinterpret_cast<void*>(address), data, size, &read) && read == size;
}
bool IsSystemAttachBreakpoint(HANDLE process, const EXCEPTION_RECORD& exception) {
    if (exception.ExceptionCode != EXCEPTION_BREAKPOINT) return false;
    MEMORY_BASIC_INFORMATION page{};
    if (VirtualQueryEx(process, exception.ExceptionAddress, &page, sizeof(page)) != sizeof(page) || page.Type != MEM_IMAGE) return false;
    wchar_t mappedPath[32768]{};
    if (!GetMappedFileNameW(process, page.AllocationBase, mappedPath, 32768)) return false;
    const wchar_t* basename = wcsrchr(mappedPath, L'\\');
    if (!basename || _wcsicmp(basename + 1, L"ntdll.dll") != 0) return false;
    const auto localNtdll = GetModuleHandleW(L"ntdll.dll");
    const auto localBreak = GetProcAddress(localNtdll, "DbgBreakPoint");
    if (!localBreak) return false;
    const auto expected = reinterpret_cast<ULONG64>(page.AllocationBase) +
        reinterpret_cast<ULONG64>(localBreak) - reinterpret_cast<ULONG64>(localNtdll);
    return reinterpret_cast<ULONG64>(exception.ExceptionAddress) == expected;
}
struct Site { const char* name; DWORD rva; };
const std::array<Site, 4> tf3Sites{{
    {"step_batch_entry_candidate", 0x1593b0},
    {"step_iteration_pre_candidate", 0x1594c0},
    {"command_apply_entry_candidate", 0x9e2380},
    {"step_iteration_post_candidate", 0x159581}
}};
const std::array<Site, 4> tf3CommandSites{{
    {"vehicle_factory_entry_candidate", 0x9eee60},
    {"command_admission_entry_candidate", 0x9d3120},
    {"command_apply_entry_candidate", 0x9e2380},
    {"vehicle_handler_entry_candidate", 0x9e1710}
}};
// The live command profile is quarantined after the 21 September admission
// SINGLE_STEP escape. Owned fixtures remain available; passing them is not live
// requalification and must not silently re-enable this gate.
constexpr bool kLiveCommandProfileQualified = false;
const std::array<Site, 4> tf3ActionTraceSites{{
    {"vehicle_handler_entry_candidate", 0x9e1710},
    {"vehicle_handler_return_candidate", 0x9e18aa},
    {"command_apply_entry_candidate", 0x9e2380},
    {"command_apply_return_candidate", 0x9e26ed}
}};
// Separate from the quarantined admission profile. Exact-build static review
// and owned fixtures are not sufficient: a controlled WinDbg payload trace of
// these sites ended in a target access violation during/after detach. Keep the
// custom live profile fail-closed until clean detach is independently proven.
constexpr bool kLiveActionTraceQualified = false;

int ConfiguredTrapSite(const EXCEPTION_RECORD& exception, const CONTEXT& context,
                       ULONG64 base, const std::array<Site, 4>& sites) {
    if (exception.ExceptionCode != EXCEPTION_SINGLE_STEP || (context.EFlags & 0x100) ||
        (context.Dr6 & ((1ULL << 13) | (1ULL << 14) | (1ULL << 15)))) return -1;
    const std::array<ULONG64, 4> registers{{context.Dr0, context.Dr1, context.Dr2, context.Dr3}};
    for (size_t i = 0; i < sites.size(); ++i) {
        const ULONG64 address = base + sites[i].rva;
        if (reinterpret_cast<ULONG64>(exception.ExceptionAddress) == address && context.Rip == address &&
            registers[i] == address && (context.Dr7 & (1ULL << (2 * i))) &&
            (context.Dr7 & (0xfULL << (16 + 4 * i))) == 0) return static_cast<int>(i);
    }
    return -1;
}
int OwnedFirstChanceTrapSite(const DEBUG_EVENT& event, const CONTEXT& context,
                             ULONG64 base, const std::array<Site, 4>& sites) {
    if (event.dwDebugEventCode != EXCEPTION_DEBUG_EVENT || !event.u.Exception.dwFirstChance) return -1;
    return ConfiguredTrapSite(event.u.Exception.ExceptionRecord, context, base, sites);
}
void EmitTrapDiagnostic(const char* reason, const DEBUG_EVENT& event, const CONTEXT& context) {
    printf("{\"event\":\"trap-diagnostic\",\"reason\":\"%s\",\"threadId\":%lu,\"firstChance\":%lu,"
           "\"exceptionAddress\":\"%llx\",\"rip\":\"%llx\",\"dr0\":\"%llx\",\"dr1\":\"%llx\","
           "\"dr2\":\"%llx\",\"dr3\":\"%llx\",\"dr6\":\"%llx\",\"dr7\":\"%llx\",\"eflags\":%lu}\n",
           reason, event.dwThreadId, event.u.Exception.dwFirstChance,
           reinterpret_cast<ULONG64>(event.u.Exception.ExceptionRecord.ExceptionAddress), context.Rip,
           context.Dr0, context.Dr1, context.Dr2, context.Dr3, context.Dr6, context.Dr7, context.EFlags);
    fflush(stdout);
}
// Optional diagnostic reads never touch guard/no-access pages. Every event has
// a fixed 128-byte remote-read budget; no address survives the stopped event.
struct DiagnosticReader {
    HANDLE process;
    size_t attempted = 0;
    bool Read(ULONG64 address, void* output, size_t length) {
        if (!address || !length || length > 128 - attempted || address > UINT64_MAX - length) return false;
        attempted += length;
        const ULONG64 end = address + length;
        for (ULONG64 cursor = address; cursor < end;) {
            MEMORY_BASIC_INFORMATION page{};
            if (VirtualQueryEx(process, reinterpret_cast<void*>(cursor), &page, sizeof(page)) != sizeof(page) ||
                page.State != MEM_COMMIT || (page.Protect & (PAGE_GUARD | PAGE_NOACCESS))) return false;
            const DWORD protection = page.Protect & 0xff;
            if (protection != PAGE_READONLY && protection != PAGE_READWRITE && protection != PAGE_WRITECOPY &&
                protection != PAGE_EXECUTE_READ && protection != PAGE_EXECUTE_READWRITE && protection != PAGE_EXECUTE_WRITECOPY) return false;
            const ULONG64 pageStart = reinterpret_cast<ULONG64>(page.BaseAddress);
            if (pageStart > UINT64_MAX - page.RegionSize || pageStart + page.RegionSize <= cursor) return false;
            cursor = pageStart + page.RegionSize;
        }
        return ReadRemote(process, address, output, length);
    }
    bool Offset(ULONG64 address, ULONG64 offset, void* output, size_t length) {
        return address && address <= UINT64_MAX - offset && Read(address + offset, output, length);
    }
};
struct CommandEvidence {
    ULONG64 entry = 0;
    std::array<ULONG64, 7> fields{};
    BYTE tag = 0;
    std::array<BYTE, 5> payload{};
    bool entryRead = false, tagRead = false, payloadRead = false, dependencyShape = false;
    const char* status = "entry-read-failed";
};
struct ActionFrame {
    size_t kind = 0;
    ULONG64 rsp = 0, returnAddress = 0;
    unsigned ordinal = 0;
    bool readable = false;
};
struct ActionPairing {
    const char* status = "orphan-return";
    unsigned entryOrdinal = 0;
    size_t depth = 0;
    bool paired = false;
};
struct ActionTrace {
    static constexpr size_t kMaxDepth = 32, kMaxFrames = 256;
    std::map<DWORD, std::vector<ActionFrame>> frames;
    size_t pending = 0;
    unsigned paired = 0, orphan = 0, mismatched = 0, incomplete = 0;
    void Flush(DWORD thread, const char* reason) {
        const auto found = frames.find(thread);
        if (found == frames.end()) return;
        for (const auto& frame : found->second) {
            ++incomplete;
            printf("{\"event\":\"action-trace-incomplete\",\"threadId\":%lu,\"entryOrdinal\":%u,"
                   "\"kind\":\"%s\",\"reason\":\"%s\",\"commandControlQualified\":false}\n",
                   thread, frame.ordinal, frame.kind == 0 ? "handler" : "apply", reason);
        }
        pending -= found->second.size(); frames.erase(found); fflush(stdout);
    }
    void FlushAll(const char* reason) { while (!frames.empty()) Flush(frames.begin()->first, reason); }
    ActionPairing Record(DWORD thread, size_t site, ULONG64 rsp, ULONG64 address, bool readable, unsigned ordinal) {
        const size_t kind = site / 2;
        if ((site % 2) == 0) {
            auto& stack = frames[thread];
            if (stack.size() >= kMaxDepth || pending >= kMaxFrames) {
                // A cap ends the trace; never discard an entry and later pair
                // its return with an older call at a coincidentally reused RSP.
                printf("{\"event\":\"action-trace-incomplete\",\"threadId\":%lu,\"entryOrdinal\":%u,"
                       "\"reason\":\"nesting-cap\",\"commandControlQualified\":false}\n", thread, ordinal);
                ++incomplete;
                throw std::runtime_error("action trace nesting cap reached");
            }
            stack.push_back({kind, rsp, address, ordinal, readable}); ++pending;
            return {readable ? "entry" : "entry-return-unreadable", ordinal, stack.size(), false};
        }
        const auto found = frames.find(thread);
        if (found == frames.end() || found->second.empty()) { ++orphan; return {}; }
        const auto frame = found->second.back();
        const auto depth = found->second.size();
        if (!readable || !frame.readable || frame.kind != kind || frame.rsp != rsp || frame.returnAddress != address) {
            ++mismatched;
            const char* reason = !readable || !frame.readable ? "return-unreadable" : "lifo-mismatch";
            Flush(thread, reason);
            return {reason, frame.ordinal, depth, false};
        }
        found->second.pop_back(); --pending; ++paired;
        if (found->second.empty()) frames.erase(found);
        return {"paired-return", frame.ordinal, depth, true};
    }
};
void EmitActionTraceHit(HANDLE process, ULONG64 base, DWORD imageSize, const Site& site, size_t siteIndex,
                        DWORD thread, const CONTEXT& context, unsigned ordinal, ULONGLONG start,
                        ULONG64 creation, const std::string& hash, ActionTrace& trace) {
    DiagnosticReader reader{process};
    ULONG64 returnAddress = 0;
    const bool readable = reader.Read(context.Rsp, &returnAddress, sizeof(returnAddress));
    const bool inImage = readable && returnAddress >= base && returnAddress - base < imageSize;
    const auto pairing = trace.Record(thread, siteIndex, context.Rsp, returnAddress, readable, ordinal);
    printf("{\"event\":\"action-trace-observation\",\"schemaVersion\":1,\"profile\":\"action-trace\","
           "\"sha256\":\"%s\",\"processCreationTime\":\"%llu\",\"runId\":\"%lu-%llu\","
           "\"ordinal\":%u,\"elapsedMs\":%llu,\"threadId\":%lu,\"site\":\"%s\",\"rva\":%lu,"
           "\"kind\":\"%s\",\"phase\":\"%s\",\"mappedSiteVerified\":true,\"rcx\":\"%llx\","
           "\"rdx\":\"%llx\",\"r8\":\"%llx\",\"r9\":\"%llx\",\"rax\":\"%llx\",\"rsp\":\"%llx\","
           "\"firstChance\":true,\"rip\":\"%llx\",\"dr0\":\"%llx\",\"dr1\":\"%llx\",\"dr2\":\"%llx\","
           "\"dr3\":\"%llx\",\"dr6\":\"%llx\",\"dr7\":\"%llx\",\"eflags\":%lu,"
           "\"returnAddressReadable\":%s,\"returnAddress\":\"%llx\",\"returnAddressClass\":\"%s\",\"returnAddressRva\":%llu,"
           "\"pairStatus\":\"%s\",\"entryOrdinal\":%u,\"nestingDepth\":%zu,\"paired\":%s,"
           "\"remoteBytesAttempted\":%zu,\"raxIsCompletion\":false,\"captureComplete\":false,\"commandControlQualified\":false}\n",
           hash.c_str(), creation, GetCurrentProcessId(), start, ordinal, GetTickCount64() - start, thread, site.name, site.rva,
           siteIndex < 2 ? "handler" : "apply", siteIndex % 2 ? "return" : "entry", context.Rcx,
           context.Rdx, context.R8, context.R9, context.Rax, context.Rsp,
           context.Rip, context.Dr0, context.Dr1, context.Dr2, context.Dr3, context.Dr6, context.Dr7, context.EFlags,
           readable ? "true" : "false", returnAddress,
           !readable ? "unreadable" : inImage ? "main-image" : "outside-main-image", inImage ? returnAddress - base : 0,
           pairing.status, pairing.entryOrdinal, pairing.depth, pairing.paired ? "true" : "false", reader.attempted);
    fflush(stdout);
}
CommandEvidence ReadCommand(DiagnosticReader& reader, ULONG64 entry, ULONG64 directCommand = 0) {
    CommandEvidence result{}; result.entry = entry;
    if (entry) {
        result.entryRead = reader.Read(entry, result.fields.data(), 0x31);
        if (!result.entryRead) return result;
        const auto begin = result.fields[1], end = result.fields[2], capacity = result.fields[3];
        result.dependencyShape = begin <= end && end <= capacity && (end - begin) % 16 == 0 &&
            (capacity - begin) % 16 == 0 && ((begin == 0 && end == 0 && capacity == 0) || begin != 0);
    } else result.fields[0] = directCommand;
    result.tagRead = reader.Offset(result.fields[0], 0x9b8, &result.tag, 1);
    if (!result.tagRead) { result.status = "tag-read-failed"; return result; }
    if (result.tag != 0x32) { result.status = "unsupported-tag"; return result; }
    result.payloadRead = reader.Read(result.fields[0], result.payload.data(), result.payload.size());
    if (!result.payloadRead) { result.status = "payload-read-failed"; return result; }
    if (result.payload[4] > 1) { result.status = "invalid-stopped-byte"; return result; }
    result.status = "decoded-local-action";
    return result;
}
void EmitCommandHit(HANDLE process, ULONG64 base, DWORD imageSize, const Site& site, size_t siteIndex,
                    DWORD thread, const CONTEXT& context, unsigned ordinal, ULONGLONG start,
                    ULONG64 creation, const std::string& hash) {
    DiagnosticReader reader{process};
    ULONG64 returnAddress = 0;
    const bool stackRead = reader.Read(context.Rsp, &returnAddress, sizeof(returnAddress));
    const bool inImage = stackRead && returnAddress >= base && returnAddress - base < imageSize;
    printf("{\"event\":\"command-observation\",\"schemaVersion\":2,\"profile\":\"command\","
           "\"sha256\":\"%s\",\"processCreationTime\":\"%llu\",\"runId\":\"%lu-%llu\","
           "\"ordinal\":%u,\"elapsedMs\":%llu,\"threadId\":%lu,\"site\":\"%s\",\"rva\":%lu,"
           "\"mappedSiteVerified\":true,\"rcx\":\"%llx\",\"rdx\":\"%llx\",\"r8\":\"%llx\",\"r9\":\"%llx\",\"rsp\":\"%llx\","
           "\"returnAddressReadable\":%s,\"returnAddress\":\"%llx\",\"returnAddressClass\":\"%s\",\"returnAddressRva\":%llu,",
           hash.c_str(), creation, GetCurrentProcessId(), start, ordinal, GetTickCount64() - start, thread, site.name, site.rva,
           context.Rcx, context.Rdx, context.R8, context.R9, context.Rsp, stackRead ? "true" : "false", returnAddress,
           !stackRead ? "unreadable" : inImage ? "main-image" : "outside-main-image", inImage ? returnAddress - base : 0);
    if (siteIndex == 0) {
        printf("\"factory\":{\"entity\":%d,\"stoppedByte\":%u,\"booleanValid\":%s,\"outputConstructed\":false},",
               static_cast<std::int32_t>(context.R8), static_cast<unsigned>(context.R9 & 0xff), (context.R9 & 0xff) <= 1 ? "true" : "false");
    } else {
        const auto evidence = ReadCommand(reader, siteIndex == 1 ? context.R8 : siteIndex == 2 ? context.Rdx : 0,
                                          siteIndex == 3 ? context.Rdx : 0);
        std::int32_t entity = 0; memcpy(&entity, evidence.payload.data(), sizeof(entity));
        printf("\"command\":{\"status\":\"%s\",\"entry\":\"%llx\",\"entryReadable\":%s,\"storage\":\"%llx\","
               "\"tagReadable\":%s,\"tag\":%u,\"payloadReadable\":%s,\"entity\":%d,\"stoppedByte\":%u,"
               "\"dependencyShapeValid\":%s,\"dependencyBegin\":\"%llx\",\"dependencyEnd\":\"%llx\",\"dependencyCapacity\":\"%llx\","
               "\"dependencyCount\":%llu,\"dependencyRecordsCaptured\":false,\"progressObjectPresent\":%s,\"progressControlPresent\":%s,"
               "\"entryResultByte\":%u,\"resultIsCompletion\":false},",
               evidence.status, evidence.entry, evidence.entryRead ? "true" : "false", evidence.fields[0],
               evidence.tagRead ? "true" : "false", evidence.tag, evidence.payloadRead ? "true" : "false", entity, evidence.payload[4],
               evidence.dependencyShape ? "true" : "false", evidence.fields[1], evidence.fields[2], evidence.fields[3],
               evidence.dependencyShape ? (evidence.fields[2] - evidence.fields[1]) / 16 : 0,
               evidence.fields[4] ? "true" : "false", evidence.fields[5] ? "true" : "false", static_cast<unsigned>(evidence.fields[6] & 0xff));
        if (siteIndex == 1) {
            ULONG64 fifthArgument = 0;
            const bool fifthRead = reader.Offset(context.Rsp, 0x28, &fifthArgument, sizeof(fifthArgument));
            printf("\"fifthArgumentReadable\":%s,\"fifthArgument\":\"%llx\",", fifthRead ? "true" : "false", fifthArgument);
        }
    }
    printf("\"remoteBytesAttempted\":%zu,\"completeCommandPayload\":false,\"commandControlQualified\":false}\n", reader.attempted);
    fflush(stdout);
}
// The intermediate sites are instruction boundaries confirmed by exact-build
// dumpbin disassembly. They are observation points only: no trampoline, ABI
// substitution, mutation or world-update semantics is claimed here.
void ValidateMapped(HANDLE process, ULONG64 base, const Image& image, const std::array<Site, 4>& sites, bool mismatch) {
    IMAGE_DOS_HEADER dos{}; IMAGE_NT_HEADERS64 nt{};
    Require(ReadRemote(process, base, &dos, sizeof(dos)) && dos.e_magic == IMAGE_DOS_SIGNATURE && dos.e_lfanew > 0,
            "mapped DOS header mismatch");
    Require(ReadRemote(process, base + dos.e_lfanew, &nt, sizeof(nt)) &&
            nt.Signature == image.nt.Signature &&
            memcmp(&nt.FileHeader, &image.nt.FileHeader, sizeof(nt.FileHeader)) == 0 &&
            nt.OptionalHeader.Magic == image.nt.OptionalHeader.Magic &&
            nt.OptionalHeader.SizeOfImage == image.nt.OptionalHeader.SizeOfImage &&
            nt.OptionalHeader.AddressOfEntryPoint == image.nt.OptionalHeader.AddressOfEntryPoint &&
            nt.OptionalHeader.SizeOfHeaders == image.nt.OptionalHeader.SizeOfHeaders &&
            nt.OptionalHeader.DllCharacteristics == image.nt.OptionalHeader.DllCharacteristics &&
            memcmp(nt.OptionalHeader.DataDirectory, image.nt.OptionalHeader.DataDirectory, sizeof(nt.OptionalHeader.DataDirectory)) == 0,
            "mapped PE header mismatch");
    for (const auto& site : sites) {
        constexpr size_t length = 32;
        const size_t offset = image.Offset(site.rva, length, true);
        MEMORY_BASIC_INFORMATION page{};
        Require(VirtualQueryEx(process, reinterpret_cast<void*>(base + site.rva), &page, sizeof(page)) == sizeof(page) &&
                page.State == MEM_COMMIT && page.Type == MEM_IMAGE && page.AllocationBase == reinterpret_cast<void*>(base) &&
                (page.Protect == PAGE_EXECUTE_READ || page.Protect == PAGE_EXECUTE) &&
                base + site.rva + length <= reinterpret_cast<ULONG64>(page.BaseAddress) + page.RegionSize,
                "observation code page is not immutable executable image memory");
        std::array<BYTE, length> actual{};
        Require(ReadRemote(process, base + site.rva, actual.data(), actual.size()), "cannot read observation code");
        Require(!mismatch && memcmp(actual.data(), image.bytes.data() + offset, length) == 0, "mapped observation bytes mismatch");
    }
}
struct SavedThread {
    HANDLE handle = nullptr;
    CONTEXT original{};
    bool armed = false;
    bool cleanupSuspended = false;
    // One queued execution trap can be hidden behind another thread's event.
    // Capture its ownership before restoring the debug registers, never infer
    // ownership from an exception address after restoration.
    CONTEXT cleanupTrap{};
    int cleanupTrapSite = -1;
    bool cleanupMayHaveQueuedTrap = false;
    // A successful SetThreadContext is not proof that the target retained our
    // original values.  Keep this separate from `armed`: teardown is only
    // allowed to detach after an independent debug-register readback.
    bool restorationReadbackVerified = false;
};
enum class TeardownState {
    NotStarted,
    Restoring,
    RestorationReadbackFailed,
    Draining,
    DrainTimedOut,
    DetachFailed,
    Detached,
    TargetExited,
    TargetSurvivalFailed,
};
const char* TeardownStateName(TeardownState state) {
    switch (state) {
    case TeardownState::NotStarted: return "not-started";
    case TeardownState::Restoring: return "restoring";
    case TeardownState::RestorationReadbackFailed: return "restoration-readback-failed";
    case TeardownState::Draining: return "draining";
    case TeardownState::DrainTimedOut: return "drain-timed-out";
    case TeardownState::DetachFailed: return "detach-failed";
    case TeardownState::Detached: return "detached";
    case TeardownState::TargetExited: return "target-exited";
    case TeardownState::TargetSurvivalFailed: return "target-survival-failed";
    }
    return "invalid";
}
struct Session {
    DWORD pid = 0;
    bool attached = false;
    // Controllers that must never leave a held target running set these after
    // the debugger relationship exists.  The observer leaves both false.
    bool killOnExit = false;
    bool failStop = false;
    bool pending = false;
    bool exited = false;
    DEBUG_EVENT event{};
    DWORD disposition = DBG_CONTINUE;
    HANDLE process = nullptr; // independently owned observation handle
    HANDLE debugProcess = nullptr;
    std::map<DWORD, HANDLE> debugThreads; // OS closes these on EXIT debug events
    ULONG64 base = 0;
    std::array<Site, 4> sites{};
    std::map<DWORD, SavedThread> threads;
    TeardownState teardownState = TeardownState::NotStarted;
    bool restorationReadbackVerified = false;
    bool drainCompleted = false;
    bool detachAttempted = false;
    bool targetAliveAfterDetach = false;
    DWORD teardownError = ERROR_SUCCESS;
    bool ReportCleanup(bool ok) const noexcept {
        fprintf(stderr, "teardown_state=%s restoration_readback=%s drain_completed=%s detach_attempted=%s target_alive_after_detach=%s error=%lu\n",
            TeardownStateName(teardownState), restorationReadbackVerified ? "true" : "false",
            drainCompleted ? "true" : "false", detachAttempted ? "true" : "false",
            targetAliveAfterDetach ? "true" : "false", teardownError);
        return ok;
    }
    bool Clean() noexcept {
        bool ok = true;
        teardownState = TeardownState::Restoring;
        restorationReadbackVerified = false;
        drainCompleted = false;
        targetAliveAfterDetach = false;
        teardownError = ERROR_SUCCESS;
        for (auto& pair : threads) {
            auto& thread = pair.second;
            if (thread.armed && !exited) {
                DWORD code = 0;
                if (GetExitCodeThread(thread.handle, &code) && code != STILL_ACTIVE) { thread.armed = false; continue; }
                if (!thread.cleanupSuspended) {
                    const DWORD suspended = SuspendThread(thread.handle);
                    if (suspended == static_cast<DWORD>(-1)) { fprintf(stderr, "restore_suspend_failed thread=%lu error=%lu\n", pair.first, GetLastError()); ok = false; continue; }
                    thread.cleanupSuspended = true;
                }
                CONTEXT context{}; context.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                if (!GetThreadContext(thread.handle, &context)) { fprintf(stderr, "restore_get_context_failed thread=%lu error=%lu\n", pair.first, GetLastError()); ok = false; }
                else {
                    if (!pending || event.dwThreadId != pair.first) {
                        thread.cleanupMayHaveQueuedTrap = true;
                        EXCEPTION_RECORD candidate{}; candidate.ExceptionCode = EXCEPTION_SINGLE_STEP;
                        candidate.ExceptionAddress = reinterpret_cast<void*>(context.Rip);
                        thread.cleanupTrapSite = ConfiguredTrapSite(candidate, context, base, sites);
                        thread.cleanupTrap = context;
                    }
                    context.ContextFlags = CONTEXT_DEBUG_REGISTERS;
                    context.Dr0 = thread.original.Dr0; context.Dr1 = thread.original.Dr1;
                    context.Dr2 = thread.original.Dr2; context.Dr3 = thread.original.Dr3;
                    context.Dr6 = thread.original.Dr6; context.Dr7 = thread.original.Dr7;
                    if (!SetThreadContext(thread.handle, &context)) { fprintf(stderr, "restore_set_context_failed thread=%lu error=%lu\n", pair.first, GetLastError()); ok = false; }
                    else {
                        CONTEXT verified{}; verified.ContextFlags = CONTEXT_DEBUG_REGISTERS;
                        const bool readback = GetThreadContext(thread.handle, &verified) != FALSE &&
                            verified.Dr0 == thread.original.Dr0 && verified.Dr1 == thread.original.Dr1 &&
                            verified.Dr2 == thread.original.Dr2 && verified.Dr3 == thread.original.Dr3 &&
                            verified.Dr6 == thread.original.Dr6 && verified.Dr7 == thread.original.Dr7;
                        if (!readback) {
                            teardownState = TeardownState::RestorationReadbackFailed;
                            teardownError = GetLastError();
                            fprintf(stderr, "restore_readback_failed thread=%lu error=%lu\n", pair.first, teardownError);
                            ok = false;
                        } else {
                            thread.armed = false;
                            thread.restorationReadbackVerified = true;
                        }
                    }
                }
            }
        }
        // Do not continue the stopped target after a failed restoration. Keep
        // our explicit suspension counts for a later cleanup retry as well.
        if (!ok) return ReportCleanup(false);
        restorationReadbackVerified = true;
        for (const auto& pair : threads) {
            if (!pair.second.restorationReadbackVerified && !exited) {
                restorationReadbackVerified = false;
                teardownState = TeardownState::RestorationReadbackFailed;
                return ReportCleanup(false);
            }
        }
        // A trap already raised by another thread may not reach the debug port
        // until that thread resumes. Remove our suspend counts while the
        // debugger is still attached, so the following drain can handle it.
        for (auto& pair : threads) {
            auto& thread = pair.second;
            if (!thread.cleanupSuspended) continue;
            DWORD code = 0;
            if (exited || (GetExitCodeThread(thread.handle, &code) && code != STILL_ACTIVE)) {
                thread.cleanupSuspended = false;
            } else if (ResumeThread(thread.handle) == static_cast<DWORD>(-1)) {
                fprintf(stderr, "restore_resume_failed thread=%lu error=%lu\n", pair.first, GetLastError()); ok = false;
            } else thread.cleanupSuspended = false;
        }
        if (!ok) return ReportCleanup(false);
        if (pending) {
            if (!ContinueDebugEvent(event.dwProcessId, event.dwThreadId, disposition)) ok = false;
            else pending = false;
        }
        if (attached && !exited) {
            // Do not deliberately detach on restoration failure. This is not a
            // crash guarantee: Windows detaches if the debugger thread exits.
            if (ok) {
                // Other threads can already have trapped when the final sampled
                // event is delivered. A successful detach can discard such a
                // first-chance event, leaving an unhandled trap in the target.
                // Drain BEFORE detach after lifting explicit suspensions. All
                // owned debug registers have already been restored.
                teardownState = TeardownState::Draining;
                bool detached = false;
                unsigned quietWindows = 0;
                for (unsigned attempt = 0; attempt < 100 && !detached; ++attempt) {
                    DEBUG_EVENT queued{};
                    if (!WaitForDebugEvent(&queued, 25)) {
                        if (GetLastError() != ERROR_SEM_TIMEOUT) { teardownError = GetLastError(); ok = false; break; }
                        // Require multiple quiet waits after every drained
                        // event. This remains bounded (at most 2.5 seconds)
                        // but avoids treating one scheduler gap as a drained
                        // debug port.
                        if (++quietWindows < 3) continue;
                        drainCompleted = true;
                        detachAttempted = true;
                        if (DebugActiveProcessStop(pid)) { detached = true; break; }
                        teardownError = GetLastError();
                        continue;
                    }
                    quietWindows = 0;
                    event = queued; pending = true;
                    disposition = queued.dwDebugEventCode == EXCEPTION_DEBUG_EVENT ? DBG_EXCEPTION_NOT_HANDLED : DBG_CONTINUE;
                    DWORD action = DBG_CONTINUE;
                    if (queued.dwDebugEventCode == EXCEPTION_DEBUG_EVENT) {
                        action = DBG_EXCEPTION_NOT_HANDLED;
                        // Only the documented first-chance attach breakpoint
                        // belongs to the debugger. A second-chance breakpoint
                        // is the target's failure and must be forwarded.
                        if (queued.u.Exception.dwFirstChance &&
                            IsSystemAttachBreakpoint(process, queued.u.Exception.ExceptionRecord)) action = DBG_CONTINUE;
                        if (queued.u.Exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP) {
                            const auto found = threads.find(queued.dwThreadId);
                            if (found != threads.end()) {
                                CONTEXT context{}; context.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                                if (!GetThreadContext(found->second.handle, &context)) { ok = false; break; }
                                auto& thread = found->second;
                                // The pending rejected event is never a saved
                                // cleanup candidate. Second chance is always the
                                // target's exception, even at one of our sites.
                                CONTEXT proof = context;
                                proof.Dr0 = thread.cleanupTrap.Dr0; proof.Dr1 = thread.cleanupTrap.Dr1;
                                proof.Dr2 = thread.cleanupTrap.Dr2; proof.Dr3 = thread.cleanupTrap.Dr3;
                                proof.Dr7 = thread.cleanupTrap.Dr7;
                                const int index = ConfiguredTrapSite(queued.u.Exception.ExceptionRecord, proof, base, sites);
                                const auto& original = thread.original;
                                const bool restoredRegisters = context.Dr0 == original.Dr0 && context.Dr1 == original.Dr1 &&
                                    context.Dr2 == original.Dr2 && context.Dr3 == original.Dr3 && context.Dr7 == original.Dr7;
                                // A concurrently trapped thread may expose its
                                // actual exception context only at delivery.
                                const bool ownedRegisters = ConfiguredTrapSite(queued.u.Exception.ExceptionRecord, context, base, sites) >= 0;
                                const bool savedTrap = thread.cleanupTrapSite >= 0 && index == thread.cleanupTrapSite &&
                                    context.Rip == thread.cleanupTrap.Rip && restoredRegisters;
                                if (queued.u.Exception.dwFirstChance && thread.cleanupMayHaveQueuedTrap &&
                                    (ownedRegisters || savedTrap)) {
                                    action = DBG_CONTINUE;
                                    context.Dr0 = original.Dr0; context.Dr1 = original.Dr1;
                                    context.Dr2 = original.Dr2; context.Dr3 = original.Dr3;
                                    context.Dr6 = original.Dr6; context.Dr7 = original.Dr7;
                                    context.EFlags |= 0x10000;
                                    if (!SetThreadContext(thread.handle, &context)) { ok = false; break; }
                                } else EmitTrapDiagnostic("cleanup-forwarded-unowned-single-step", queued, context);
                                thread.cleanupTrapSite = -1;
                                thread.cleanupMayHaveQueuedTrap = false;
                            }
                        }
                    } else if (queued.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT && queued.u.LoadDll.hFile) CloseHandle(queued.u.LoadDll.hFile);
                    else if (queued.dwDebugEventCode == CREATE_THREAD_DEBUG_EVENT) debugThreads[queued.dwThreadId] = queued.u.CreateThread.hThread;
                    else if (queued.dwDebugEventCode == EXIT_THREAD_DEBUG_EVENT) debugThreads.erase(queued.dwThreadId);
                    else if (queued.dwDebugEventCode == EXIT_PROCESS_DEBUG_EVENT) {
                        exited = true; detached = true; debugProcess = nullptr; debugThreads.clear();
                    }
                    event = queued; disposition = action; pending = true;
                    if (!ContinueDebugEvent(queued.dwProcessId, queued.dwThreadId, action)) { ok = false; break; }
                    pending = false;
                }
                if (detached) {
                    attached = false;
                    teardownState = exited ? TeardownState::TargetExited : TeardownState::Detached;
                    if (!exited) {
                        // Verify survival only through our independently-owned
                        // synchronization handle and for a fixed window. This
                        // is deliberately not a liveness claim beyond teardown.
                        const DWORD survival = WaitForSingleObject(process, 250);
                        targetAliveAfterDetach = survival == WAIT_TIMEOUT;
                        if (!targetAliveAfterDetach) {
                            teardownError = survival == WAIT_FAILED ? GetLastError() : ERROR_PROCESS_ABORTED;
                            teardownState = TeardownState::TargetSurvivalFailed;
                            ok = false;
                        }
                    }
                } else {
                    teardownState = drainCompleted ? TeardownState::DetachFailed : TeardownState::DrainTimedOut;
                    if (teardownError == ERROR_SUCCESS) teardownError = GetLastError();
                    fprintf(stderr, "detach_failed state=%s error=%lu\n", TeardownStateName(teardownState), teardownError);
                    ok = false;
                }
            }
        } else {
            attached = false;
            if (exited) teardownState = TeardownState::TargetExited;
        }
        // This flag is process-wide, not per debuggee.  Crucially, clear it
        // only after DebugActiveProcessStop has detached the target.  Clearing
        // it before a failed detach would make an abrupt debugger death resume
        // a target that the controller had promised to fail-stop.
        if (ok && killOnExit && !attached) {
            if (!DebugSetProcessKillOnExit(FALSE)) {
                fprintf(stderr, "kill_on_exit_clear_failed error=%lu\n", GetLastError());
                ok = false;
            } else killOnExit = false;
        }
        return ReportCleanup(ok);
    }
    ~Session() {
        // A controller in fail-stop mode deliberately relies on the OS to end
        // an attached target if this process exits unexpectedly.  Only its
        // explicit shutdown path may call Clean and turn this back off.
        if (!failStop) Clean();
        for (auto& pair : threads) if (pair.second.handle) CloseHandle(pair.second.handle);
        for (auto& pair : debugThreads) if (pair.second) CloseHandle(pair.second);
        if (debugProcess) CloseHandle(debugProcess);
        if (process) CloseHandle(process);
    }
    void AddThread(DWORD id, HANDLE source, ULONG64 imageBase, const std::array<Site, 4>& observationSites) {
        Require(threads.count(id) == 0, "duplicate live thread id");
        debugThreads[id] = source;
        auto& saved = threads[id];
        Require(DuplicateHandle(GetCurrentProcess(), source, GetCurrentProcess(), &saved.handle, 0, FALSE,
                                DUPLICATE_SAME_ACCESS) != FALSE, "cannot retain thread handle");
        saved.original.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        Require(GetThreadContext(saved.handle, &saved.original) != FALSE, "cannot read suspended thread debug registers");
        // Refuse to interfere with another hardware debugger, including disabled
        // nonzero breakpoint addresses whose owner may enable them later.
        Require(saved.original.Dr0 == 0 && saved.original.Dr1 == 0 && saved.original.Dr2 == 0 && saved.original.Dr3 == 0 &&
                (saved.original.Dr7 & 0xff) == 0, "thread already has hardware breakpoints");
        CONTEXT context = saved.original;
        context.Dr0 = imageBase + observationSites[0].rva; context.Dr1 = imageBase + observationSites[1].rva;
        context.Dr2 = imageBase + observationSites[2].rva; context.Dr3 = imageBase + observationSites[3].rva;
        context.Dr6 = 0; context.Dr7 = 0x55; // four local execution, length-one breakpoints
        Require(SetThreadContext(saved.handle, &context) != FALSE, "cannot set suspended thread hardware breakpoints");
        saved.armed = true;
        CONTEXT verified{}; verified.ContextFlags = CONTEXT_DEBUG_REGISTERS;
        Require(GetThreadContext(saved.handle, &verified) && verified.Dr0 == context.Dr0 && verified.Dr1 == context.Dr1 &&
            verified.Dr2 == context.Dr2 && verified.Dr3 == context.Dr3 &&
            (verified.Dr7 & 0xffff00ffULL) == 0x55, "armed debug-register readback mismatch");
    }
};
volatile ULONG64 fixtureSink = 0;
}

extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixtureBatch(ULONG64 a, ULONG64 b) { fixtureSink = a + b; }
extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixturePre(ULONG64 a, ULONG64 b) { fixtureSink = a ^ b; }
extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixtureCommand(ULONG64 a, ULONG64 b) { fixtureSink = a - b; }
extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixturePost(ULONG64 a, ULONG64 b) { fixtureSink = a * b; }
extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixtureFactory(ULONG64 a, ULONG64 b, ULONG64 entity, ULONG64 stopped) {
    fixtureSink = a + b + entity + stopped;
}
extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixtureAdmission(ULONG64 a, ULONG64 b, ULONG64 entry, ULONG64 callback, ULONG64 progress) {
    fixtureSink = a ^ b ^ entry ^ callback ^ progress;
}
extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixtureApply(ULONG64 a, ULONG64 entry) { fixtureSink = a + entry + 17; }
extern "C" __declspec(dllexport) __declspec(noinline) void ObserverFixtureHandler(ULONG64 a, ULONG64 command) { fixtureSink = a + command + 31; }

// Only our fixture functions disable optimization: one compiler-described
// epilogue each, recursive mixed kinds, and no tail-call elimination. TF3's
// sites are independently pinned above and never discovered with this helper.
#pragma optimize("", off)
extern "C" __declspec(dllexport) __declspec(noinline) ULONG64 ObserverActionFixtureApply(ULONG64 depth);
extern "C" __declspec(dllexport) __declspec(noinline) ULONG64 ObserverActionFixtureHandler(ULONG64 depth) {
    ULONG64 result = depth;
    if (depth) result += ObserverActionFixtureApply(depth - 1);
    else Sleep(1);
    return result + 1;
}
extern "C" __declspec(dllexport) __declspec(noinline) ULONG64 ObserverActionFixtureApply(ULONG64 depth) {
    ULONG64 result = depth;
    if (depth) result += ObserverActionFixtureHandler(depth - 1);
    else Sleep(1);
    return result + 1;
}
#pragma optimize("", on)

namespace {
ULONG64 ActionFixtureEntry(const char* name) {
    ULONG64 entry = reinterpret_cast<ULONG64>(GetProcAddress(GetModuleHandleW(nullptr), name));
    std::array<BYTE, 5> code{};
    Require(entry && ReadRemote(GetCurrentProcess(), entry, code.data(), code.size()), "owned fixture export unavailable");
    // MSVC incremental links export an ILT rel32 jump. Resolve exactly one
    // such jump, in our own executable only; never use this for game sites.
    if (code[0] == 0xe9) {
        std::int32_t displacement = 0; memcpy(&displacement, code.data() + 1, sizeof(displacement));
        entry = static_cast<ULONG64>(static_cast<std::int64_t>(entry) + 5 + displacement);
    }
    MEMORY_BASIC_INFORMATION page{};
    Require(VirtualQuery(reinterpret_cast<void*>(entry), &page, sizeof(page)) == sizeof(page) &&
        page.Type == MEM_IMAGE && page.AllocationBase == GetModuleHandleW(nullptr), "owned fixture entry outside image");
    return entry;
}
ULONG64 ActionFixtureReturn(ULONG64 entry) {
    DWORD64 base = 0;
    const auto function = RtlLookupFunctionEntry(entry, &base, nullptr);
    Require(function && base + function->BeginAddress == entry && function->EndAddress > function->BeginAddress &&
        function->EndAddress - function->BeginAddress < 4096, "owned action fixture function extent unavailable");
    const ULONG64 ret = base + function->EndAddress - 1;
    BYTE opcode = 0;
    Require(ReadRemote(GetCurrentProcess(), ret, &opcode, 1) && opcode == 0xc3,
        "owned action fixture does not end with expected RET");
    return ret;
}
int ActionPairingFixture() {
    ActionTrace trace;
    Require(trace.Record(1, 0, 0x1000, 0x2000, true, 1).depth == 1, "first action entry failed");
    Require(trace.Record(2, 2, 0x1000, 0x2000, true, 2).depth == 1, "concurrent action entry failed");
    Require(trace.Record(1, 2, 0x900, 0x2100, true, 3).depth == 2, "nested action entry failed");
    Require(trace.Record(1, 3, 0x900, 0x2100, true, 4).entryOrdinal == 3, "nested action return mismatch");
    Require(trace.Record(2, 3, 0x1000, 0x2000, true, 5).paired, "concurrent action return mismatch");
    Require(trace.Record(1, 1, 0x1000, 0x2000, true, 6).paired, "outer action return mismatch");
    Require(!trace.Record(3, 1, 0x1000, 0x2000, true, 7).paired && trace.orphan == 1, "orphan return accepted");
    // Each identity component must match, and a mismatch must invalidate the
    // whole nesting stack so the next return cannot inherit a stale pairing.
    for (unsigned fault = 0; fault < 5; ++fault) {
        trace.Record(1, 0, 0x1000, 0x2000, fault != 3, 8 + fault * 3);
        const auto result = trace.Record(1, fault == 0 ? 3 : 1, fault == 1 ? 0x1008 : 0x1000,
            fault == 2 ? 0x2008 : 0x2000, fault != 4, 9 + fault * 3);
        Require(!result.paired && trace.pending == 0, "mismatched action return accepted");
    }
    for (unsigned i = 0; i < 32; ++i) trace.Record(1, 0, 0x1000 - i * 16, 0x2000, true, 30 + i);
    bool refused = false;
    try { trace.Record(1, 0, 0x100, 0x2000, true, 62); }
    catch (const std::runtime_error&) { refused = true; }
    Require(refused && trace.pending == 32, "action depth cap not enforced");
    trace.FlushAll("fixture-end");
    Require(trace.pending == 0 && trace.paired == 3 && trace.mismatched == 5 && trace.incomplete == 38,
        "action incomplete accounting mismatch");
    printf("{\"event\":\"action-pairing-test-passed\",\"paired\":3,\"orphan\":1,\"mismatched\":5,\"incomplete\":38}\n");
    return 0;
}
int TrapClassifierFixture() {
    const ULONG64 base = 0x140000000;
    for (size_t i = 0; i < tf3CommandSites.size(); ++i) {
        CONTEXT context{};
        context.Dr0 = base + tf3CommandSites[0].rva; context.Dr1 = base + tf3CommandSites[1].rva;
        context.Dr2 = base + tf3CommandSites[2].rva; context.Dr3 = base + tf3CommandSites[3].rva;
        context.Dr7 = 0x55; context.Rip = base + tf3CommandSites[i].rva;
        EXCEPTION_RECORD exception{}; exception.ExceptionCode = EXCEPTION_SINGLE_STEP;
        exception.ExceptionAddress = reinterpret_cast<void*>(context.Rip);
        DEBUG_EVENT event{}; event.dwDebugEventCode = EXCEPTION_DEBUG_EVENT;
        event.u.Exception.dwFirstChance = 1; event.u.Exception.ExceptionRecord = exception;
        Require(ConfiguredTrapSite(exception, context, base, tf3CommandSites) == static_cast<int>(i), "missing DR6 classification failed");
        Require(OwnedFirstChanceTrapSite(event, context, base, tf3CommandSites) == static_cast<int>(i), "owned first-chance classification failed");
        event.u.Exception.dwFirstChance = 0;
        Require(OwnedFirstChanceTrapSite(event, context, base, tf3CommandSites) == -1, "second-chance exception accepted");
        event.u.Exception.dwFirstChance = 1;
        context.Dr6 = 1ULL << i;
        Require(ConfiguredTrapSite(exception, context, base, tf3CommandSites) == static_cast<int>(i), "normal trap classification failed");
        auto reject = [&](const CONTEXT& candidate, const EXCEPTION_RECORD& record) {
            Require(ConfiguredTrapSite(record, candidate, base, tf3CommandSites) == -1, "unowned exception accepted");
        };
        auto changed = context; changed.Rip++; reject(changed, exception);
        changed = context; changed.EFlags |= 0x100; reject(changed, exception);
        changed = context; changed.Dr6 |= 1ULL << 13; reject(changed, exception);
        changed = context; changed.Dr6 |= 1ULL << 14; reject(changed, exception);
        changed = context; changed.Dr6 |= 1ULL << 15; reject(changed, exception);
        changed = context; changed.Dr7 &= ~(1ULL << (2 * i)); reject(changed, exception);
        changed = context; changed.Dr7 |= 1ULL << (16 + 4 * i); reject(changed, exception);
        changed = context; changed.Dr0++; changed.Dr1++; changed.Dr2++; changed.Dr3++; reject(changed, exception);
        auto other = exception; other.ExceptionAddress = reinterpret_cast<void*>(context.Rip + 1); reject(context, other);
        other = exception; other.ExceptionCode = EXCEPTION_BREAKPOINT; reject(context, other);
    }
    printf("{\"event\":\"trap-classifier-test-passed\",\"sites\":4,\"unrelatedExceptionsRejected\":true}\n");
    return 0;
}
LONG CALLBACK RejectLeakedSingleStep(PEXCEPTION_POINTERS exception) {
    if (exception->ExceptionRecord->ExceptionCode == EXCEPTION_SINGLE_STEP) ExitProcess(96);
    return EXCEPTION_CONTINUE_SEARCH;
}
unsigned actionFixtureDepth = 3;
DWORD WINAPI ActionFixtureWorker(void* startEvent) {
    if (WaitForSingleObject(startEvent, 5000) != WAIT_OBJECT_0) return 97;
    const ULONG64 expected = (actionFixtureDepth + 1ULL) * (actionFixtureDepth + 2ULL) / 2;
    for (unsigned i = 0; i < 8; ++i) if (ObserverActionFixtureApply(actionFixtureDepth) != expected) return 98;
    return 0;
}
int ActionFixture(bool depthCap = false) {
    actionFixtureDepth = depthCap ? 40 : 3;
    if (!AddVectoredExceptionHandler(1, RejectLeakedSingleStep)) return 98;
    Handle startEvent(CreateEventW(nullptr, TRUE, FALSE, nullptr));
    if (!startEvent.value) return 99;
    std::array<HANDLE, 4> workers{};
    for (auto& worker : workers) {
        worker = CreateThread(nullptr, 0, ActionFixtureWorker, startEvent.value, 0, nullptr);
        if (!worker) return 91;
    }
    Sleep(500);
    if (!SetEvent(startEvent.value)) return 92;
    if (WaitForMultipleObjects(static_cast<DWORD>(workers.size()), workers.data(), TRUE, 10000) != WAIT_OBJECT_0) return 93;
    bool passed = true;
    for (HANDLE worker : workers) { DWORD code = 999; passed = GetExitCodeThread(worker, &code) && code == 0 && passed; CloseHandle(worker); }
    Sleep(300);
    return passed ? 0 : 94;
}
DWORD WINAPI CommandStressWorker(void* startEvent) {
    if (WaitForSingleObject(startEvent, 5000) != WAIT_OBJECT_0) return 97;
    std::array<BYTE, 0x9c0> command{}; command[0x9b8] = 0x32;
    std::array<ULONG64, 7> entry{}; entry[0] = reinterpret_cast<ULONG64>(command.data());
    for (unsigned i = 0; i < 20; ++i) {
        ObserverFixtureFactory(reinterpret_cast<ULONG64>(entry.data()), 0x1234, 12345, 0);
        ObserverFixtureAdmission(0x5678, 0x9abc, reinterpret_cast<ULONG64>(entry.data()), 0, 0xdef0);
        ObserverFixtureApply(0x1234, reinterpret_cast<ULONG64>(entry.data()));
        ObserverFixtureHandler(0x5678, entry[0]);
    }
    return 0;
}
int CommandStressFixture() {
    if (!AddVectoredExceptionHandler(1, RejectLeakedSingleStep)) return 98;
    Handle startEvent(CreateEventW(nullptr, TRUE, FALSE, nullptr));
    if (!startEvent.value) return 99;
    std::array<HANDLE, 16> workers{};
    for (auto& worker : workers) {
        worker = CreateThread(nullptr, 0, CommandStressWorker, startEvent.value, 0, nullptr);
        if (!worker) return 91;
    }
    // Gives attach tests sixteen pre-existing, non-current worker threads.
    Sleep(500);
    if (!SetEvent(startEvent.value)) return 92;
    if (WaitForMultipleObjects(static_cast<DWORD>(workers.size()), workers.data(), TRUE, 10000) != WAIT_OBJECT_0) return 93;
    bool passed = true;
    for (HANDLE worker : workers) { DWORD code = 999; passed = GetExitCodeThread(worker, &code) && code == 0 && passed; CloseHandle(worker); }
    // Cutoff runs must finish draining and detach while the owned target is
    // still alive; natural process exit is a different outcome.
    Sleep(300);
    return passed ? 0 : 94;
}
DWORD WINAPI CommandFixtureWorker(void*) {
    std::array<BYTE, 0x9c0> command{};
    std::array<ULONG64, 7> entry{};
    std::array<BYTE, 32> dependencies{};
    void* guard = VirtualAlloc(nullptr, 4096, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    if (!guard) return 93;
    DWORD original = 0;
    if (!VirtualProtect(guard, 4096, PAGE_READWRITE | PAGE_GUARD, &original)) { VirtualFree(guard, 0, MEM_RELEASE); return 94; }
    for (unsigned i = 0; i < 80; ++i) {
        const std::int32_t entity = 12345;
        memcpy(command.data(), &entity, sizeof(entity)); command[4] = static_cast<BYTE>(i % 2); command[0x9b8] = 0x32;
        entry[0] = reinterpret_cast<ULONG64>(command.data());
        entry[1] = reinterpret_cast<ULONG64>(dependencies.data()); entry[2] = entry[1] + 32; entry[3] = entry[2];
        entry[4] = 0; entry[5] = 0; entry[6] = 0;
        ULONG64 source = reinterpret_cast<ULONG64>(entry.data());
        switch (i % 8) {
        case 1: source = 1; break;
        case 2: command[0x9b8] = 0x31; break;
        case 3: command[4] = 2; break;
        case 4: entry[2] = entry[1] - 16; break;
        case 5: source = reinterpret_cast<ULONG64>(guard); break;
        case 6: entry[0] = UINT64_MAX - 4; break;
        case 7: entry[0] = 0; break;
        default: break;
        }
        ObserverFixtureFactory(source, 0x1234, entity, i % 2);
        ObserverFixtureAdmission(0x5678, 0x9abc, source, 0, 0xdef0);
        ObserverFixtureApply(0x1234, source);
        ObserverFixtureHandler(0x5678, entry[0]);
        Sleep(10);
    }
    MEMORY_BASIC_INFORMATION page{};
    const bool guardUntouched = VirtualQuery(guard, &page, sizeof(page)) == sizeof(page) && (page.Protect & PAGE_GUARD);
    VirtualFree(guard, 0, MEM_RELEASE);
    return guardUntouched ? 0 : 95;
}
int CommandFixture() {
    Sleep(200);
    Handle worker(CreateThread(nullptr, 0, CommandFixtureWorker, nullptr, 0, nullptr));
    if (!worker.value) return 91;
    const DWORD result = CommandFixtureWorker(nullptr);
    DWORD workerResult = 99;
    return result == 0 && WaitForSingleObject(worker.value, 5000) == WAIT_OBJECT_0 &&
        GetExitCodeThread(worker.value, &workerResult) && workerResult == 0 ? 0 : 92;
}
DWORD WINAPI FixtureWorker(void*) {
    for (unsigned i = 0; i < 80; ++i) {
        ObserverFixtureBatch(0x12345678, 200000);
        ObserverFixturePre(0x87654321, i);
        ObserverFixtureCommand(0xabcde, i);
        ObserverFixturePost(0x13579, i);
        Sleep(10);
    }
    return 0;
}
int Fixture(bool idle) {
    // The fixture remains alive beyond observer detach and exercises both the
    // original thread and CREATE_THREAD propagation. Unhandled trap = failure.
    Sleep(200);
    if (idle) { Sleep(1600); return 0; }
    Handle worker(CreateThread(nullptr, 0, FixtureWorker, nullptr, 0, nullptr));
    if (!worker.value) return 91;
    FixtureWorker(nullptr);
    return WaitForSingleObject(worker.value, 5000) == WAIT_OBJECT_0 ? 0 : 92;
}
unsigned Number(const wchar_t* input, unsigned minimum, unsigned maximum) {
    if (!input || !*input) throw std::runtime_error("empty integer");
    for (const wchar_t* c = input; *c; ++c) if (*c < L'0' || *c > L'9') throw std::runtime_error("integer must be decimal digits");
    wchar_t* end = nullptr;
    const auto number = wcstoull(input, &end, 10);
    if (*end || number < minimum || number > maximum) throw std::runtime_error("integer outside permitted range");
    return static_cast<unsigned>(number);
}
void EmitHit(HANDLE process, ULONG64 base, const Site& site, DWORD thread, const CONTEXT& context, unsigned ordinal) {
    ULONG64 returnAddress = 0;
    const bool readable = ReadRemote(process, context.Rsp, &returnAddress, sizeof(returnAddress));
    const bool returnInImage = returnAddress >= base && returnAddress - base < 0x10000000;
    // Register values are local diagnostic pointers, never entity identities or
    // command serialization. The stack word is a return address only at entry.
    printf("{\"event\":\"observation\",\"ordinal\":%u,\"site\":\"%s\",\"threadId\":%lu,"
           "\"rva\":%lu,\"rcx\":\"%llx\",\"rdx\":\"%llx\",\"r8\":\"%llx\",\"r9\":\"%llx\","
           "\"rbp\":\"%llx\",\"r12\":\"%llx\",\"r15\":\"%llx\",\"rsp\":\"%llx\","
           "\"stackWordReadable\":%s,\"stackWord\":\"%llx\",\"stackWordImageRva\":%llu}\n",
           ordinal, site.name, thread, site.rva, context.Rcx, context.Rdx, context.R8, context.R9,
           context.Rbp, context.R12, context.R15, context.Rsp, readable ? "true" : "false", returnAddress,
           returnInImage ? returnAddress - base : 0);
    fflush(stdout);
}
int Observe(DWORD pid, bool selftest, bool mismatch, unsigned seconds, unsigned maxHits, bool idle = false, bool attachFixture = false,
            bool failAfterHit = false, bool commandProfile = false, bool stressFixture = false, bool missingDr6Fixture = false,
            bool actionTraceProfile = false, bool actionCapFixture = false) {
    Require(selftest || !commandProfile || kLiveCommandProfileQualified,
            "live command profile disabled: admission SINGLE_STEP escape requires owned-fixture and live requalification");
    Require(selftest || !actionTraceProfile || kLiveActionTraceQualified,
            "live action-trace profile disabled: clean live detach remains unqualified");
    PROCESS_INFORMATION fixture{};
    std::wstring path;
    if (selftest) path = ImagePath(GetCurrentProcess());
    Handle initial(selftest ? nullptr : OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ | SYNCHRONIZE, FALSE, pid));
    if (!selftest) { Require(initial.value != nullptr, "cannot open explicit target PID"); path = ImagePath(initial.value); }
    Image image(path);
    Require(selftest || image.hash == kTf3Hash, "unsupported target executable SHA256");
    if (!selftest) {
        const size_t slash = path.find_last_of(L"\\/");
        Require(_wcsicmp(path.c_str() + (slash == std::wstring::npos ? 0 : slash + 1), L"TransportFever3.exe") == 0,
                "target executable name mismatch");
        Require(WaitForSingleObject(initial.value, 0) == WAIT_TIMEOUT, "target already exited");
    }
    auto sites = actionTraceProfile ? tf3ActionTraceSites : commandProfile ? tf3CommandSites : tf3Sites;
    if (selftest) {
        const ULONG64 selfBase = reinterpret_cast<ULONG64>(GetModuleHandleW(nullptr));
        const std::array<ULONG64, 4> simulationAddresses{{reinterpret_cast<ULONG64>(&ObserverFixtureBatch),
            reinterpret_cast<ULONG64>(&ObserverFixturePre), reinterpret_cast<ULONG64>(&ObserverFixtureCommand),
            reinterpret_cast<ULONG64>(&ObserverFixturePost)}};
        const std::array<ULONG64, 4> commandAddresses{{reinterpret_cast<ULONG64>(&ObserverFixtureFactory),
            reinterpret_cast<ULONG64>(&ObserverFixtureAdmission), reinterpret_cast<ULONG64>(&ObserverFixtureApply),
            reinterpret_cast<ULONG64>(&ObserverFixtureHandler)}};
        const auto& addresses = commandProfile ? commandAddresses : simulationAddresses;
        for (size_t i = 0; i < sites.size(); ++i) sites[i].rva = static_cast<DWORD>(addresses[i] - selfBase);
        if (actionTraceProfile) {
            const ULONG64 handler = ActionFixtureEntry("ObserverActionFixtureHandler");
            const ULONG64 apply = ActionFixtureEntry("ObserverActionFixtureApply");
            const std::array<ULONG64, 4> actionAddresses{{handler, ActionFixtureReturn(handler), apply, ActionFixtureReturn(apply)}};
            for (size_t i = 0; i < sites.size(); ++i) sites[i].rva = static_cast<DWORD>(actionAddresses[i] - selfBase);
        }
    }
    Session session;
    if (selftest) {
        std::wstring command = L"\"" + path + (idle ? L"\" --fixture-idle" : actionCapFixture ? L"\" --fixture-action-trace-cap" : actionTraceProfile ? L"\" --fixture-action-trace" : stressFixture ? L"\" --fixture-command-stress" : commandProfile ? L"\" --fixture-command" : L"\" --fixture");
        STARTUPINFOW startup{}; startup.cb = sizeof(startup);
        const DWORD creationFlags = CREATE_NO_WINDOW | (attachFixture ? 0 : DEBUG_ONLY_THIS_PROCESS);
        Require(CreateProcessW(path.c_str(), command.data(), nullptr, nullptr, FALSE, creationFlags,
                nullptr, nullptr, &startup, &fixture) != FALSE, "cannot launch owned fixture");
        pid = fixture.dwProcessId;
        if (attachFixture) {
            // Both fixture threads are running before attachment. This tests
            // the same attach API/event enumeration used for explicit TF3 PIDs.
            Sleep(300);
            Require(DebugActiveProcess(pid) != FALSE, "cannot attach running owned fixture");
        }
    } else Require(DebugActiveProcess(pid) != FALSE, "cannot attach explicit exact-build target");
    Handle fixtureProcess(fixture.hProcess); Handle fixtureThread(fixture.hThread);
    session.pid = pid; session.attached = true;
    Require(DebugSetProcessKillOnExit(FALSE) != FALSE, "cannot disable debugger kill-on-exit");
    Handle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | SYNCHRONIZE, FALSE, pid));
    Require(process.value != nullptr, "cannot open attached process for observation");
    Require(DuplicateHandle(GetCurrentProcess(), process.value, GetCurrentProcess(), &session.process, 0, FALSE,
                            DUPLICATE_SAME_ACCESS) != FALSE, "cannot retain observation process handle");
    ULONG64 base = 0;
    ULONG64 creation = 0;
    unsigned hits = 0;
    unsigned missingDr6Hits = 0;
    DWORD targetExitCode = STILL_ACTIVE;
    bool initialBreakpointSeen = false;
    std::array<unsigned, 4> siteHits{};
    std::map<DWORD, unsigned> hitThreads;
    ActionTrace actionTrace;
    const ULONGLONG start = GetTickCount64();
    try {
        while (!interrupted.load() && GetTickCount64() - start < seconds * 1000ULL && hits < maxHits && !session.exited) {
            if (!WaitForDebugEvent(&session.event, 100)) {
                Require(GetLastError() == ERROR_SEM_TIMEOUT, "debug event wait failed");
                continue;
            }
            session.pending = true; session.disposition = DBG_CONTINUE;
            auto& event = session.event;
            Require(event.dwProcessId == pid, "unexpected debug child process");
            switch (event.dwDebugEventCode) {
            case CREATE_PROCESS_DEBUG_EVENT: {
                const auto& created = event.u.CreateProcessInfo;
                Handle file(created.hFile);
                session.debugProcess = created.hProcess;
                session.debugThreads[event.dwThreadId] = created.hThread;
                Require(base == 0 && ImagePath(created.hProcess) == path, "debug process identity mismatch");
                FILETIME expectedCreate{}, expectedExit{}, expectedKernel{}, expectedUser{};
                FILETIME actualCreate{}, actualExit{}, actualKernel{}, actualUser{};
                HANDLE expectedProcess = selftest ? fixtureProcess.value : initial.value;
                Require(GetProcessTimes(expectedProcess, &expectedCreate, &expectedExit, &expectedKernel, &expectedUser) &&
                        GetProcessTimes(created.hProcess, &actualCreate, &actualExit, &actualKernel, &actualUser) &&
                        CompareFileTime(&expectedCreate, &actualCreate) == 0, "PID was reused");
                base = reinterpret_cast<ULONG64>(created.lpBaseOfImage);
                creation = (static_cast<ULONG64>(actualCreate.dwHighDateTime) << 32) | actualCreate.dwLowDateTime;
                session.base = base; session.sites = sites;
                ValidateMapped(process.value, base, image, sites, mismatch);
                printf("{\"event\":\"validated\",\"pid\":%lu,\"sha256\":\"%s\",\"imageBase\":\"%llx\","
                       "\"instructionWrites\":0,\"gameDataWrites\":0,\"breakpointKind\":\"hardware-execute\"}\n", pid, image.hash.c_str(), base);
                fflush(stdout);
                session.AddThread(event.dwThreadId, created.hThread, base, sites);
                break;
            }
            case CREATE_THREAD_DEBUG_EVENT: {
                session.debugThreads[event.dwThreadId] = event.u.CreateThread.hThread;
                Require(base != 0, "thread arrived before image validation");
                session.AddThread(event.dwThreadId, event.u.CreateThread.hThread, base, sites);
                break;
            }
            case EXIT_THREAD_DEBUG_EVENT: {
                if (actionTraceProfile) actionTrace.Flush(event.dwThreadId, "thread-exited");
                session.debugThreads.erase(event.dwThreadId);
                auto found = session.threads.find(event.dwThreadId);
                if (found != session.threads.end()) { CloseHandle(found->second.handle); session.threads.erase(found); }
                break;
            }
            case LOAD_DLL_DEBUG_EVENT: if (event.u.LoadDll.hFile) CloseHandle(event.u.LoadDll.hFile); break;
            case EXCEPTION_DEBUG_EVENT: {
                const auto& exception = event.u.Exception;
                session.disposition = DBG_EXCEPTION_NOT_HANDLED;
                if (!initialBreakpointSeen && exception.dwFirstChance &&
                    IsSystemAttachBreakpoint(process.value, exception.ExceptionRecord)) {
                    initialBreakpointSeen = true; session.disposition = DBG_CONTINUE;
                } else if (exception.ExceptionRecord.ExceptionCode == EXCEPTION_SINGLE_STEP) {
                    auto found = session.threads.find(event.dwThreadId);
                    Require(found != session.threads.end() && found->second.armed, "single-step from unarmed thread");
                    CONTEXT context{}; context.ContextFlags = CONTEXT_FULL | CONTEXT_DEBUG_REGISTERS;
                    Require(GetThreadContext(found->second.handle, &context) != FALSE, "cannot inspect observed thread");
                    // Owned-only fault injection changes the local copy used by
                    // the classifier, never the target's context or memory.
                    if (missingDr6Fixture) context.Dr6 &= ~0xfULL;
                    const int ownedIndex = OwnedFirstChanceTrapSite(event, context, base, sites);
                    if (ownedIndex >= 0) {
                        // Consume the classified first-chance trap before any
                        // diagnostic can allocate or throw (including nesting
                        // caps). Cleanup must never forward our own exception.
                        session.disposition = DBG_CONTINUE;
                        CONTEXT resume = context;
                        resume.EFlags |= 0x10000; resume.Dr6 = 0;
                        resume.ContextFlags = CONTEXT_CONTROL | CONTEXT_DEBUG_REGISTERS;
                        Require(SetThreadContext(found->second.handle, &resume) != FALSE, "cannot resume observed instruction");
                        const size_t i = static_cast<size_t>(ownedIndex);
                        if ((context.Dr6 & (1ULL << i)) == 0) {
                            ++missingDr6Hits;
                            EmitTrapDiagnostic("owned-slot-without-dr6-status", event, context);
                        }
                        ++hits; ++siteHits[i]; ++hitThreads[event.dwThreadId];
                        if (actionTraceProfile) EmitActionTraceHit(process.value, base, image.nt.OptionalHeader.SizeOfImage, sites[i], i,
                            event.dwThreadId, context, hits, start, creation, image.hash, actionTrace);
                        else if (commandProfile) EmitCommandHit(process.value, base, image.nt.OptionalHeader.SizeOfImage, sites[i], i,
                            event.dwThreadId, context, hits, start, creation, image.hash);
                        else EmitHit(process.value, base, sites[i], event.dwThreadId, context, hits);
                        if (failAfterHit) throw std::runtime_error("owned fixture forced failure after armed observation");
                    } else EmitTrapDiagnostic("forwarded-unrecognized-single-step", event, context);
                }
                if (actionTraceProfile && session.disposition == DBG_EXCEPTION_NOT_HANDLED)
                    actionTrace.Flush(event.dwThreadId, "target-exception");
                if (session.disposition == DBG_EXCEPTION_NOT_HANDLED && !exception.dwFirstChance) {
                    printf("{\"event\":\"unhandled-target-exception\",\"code\":%lu}\n", exception.ExceptionRecord.ExceptionCode);
                    throw std::runtime_error("target has an unhandled exception; observer does not suppress it");
                }
                break;
            }
            case EXIT_PROCESS_DEBUG_EVENT:
                targetExitCode = event.u.ExitProcess.dwExitCode;
                session.exited = true; session.debugProcess = nullptr; session.debugThreads.clear(); break;
            default: break;
            }
            if (hits >= maxHits || interrupted.load()) break;
            Require(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, session.disposition) != FALSE, "cannot continue debug event");
            session.pending = false;
        }
        if (actionTraceProfile) actionTrace.FlushAll(hits >= maxHits ? "event-cap" : session.exited ? "target-exited" :
            interrupted.load() ? "interrupted" : "duration-cap");
        Require(session.Clean(), "hardware-register restoration or detach failed");
    } catch (...) {
        if (actionTraceProfile) actionTrace.FlushAll("observation-failure");
        const bool clean = session.Clean();
        fprintf(stderr, "cleanup_restored_and_detached=%s\n", clean ? "true" : "false");
        if (selftest) {
            DWORD code = 999;
            const DWORD waited = WaitForSingleObject(fixtureProcess.value, 10000);
            const bool gotCode = GetExitCodeProcess(fixtureProcess.value, &code) != FALSE;
            if (waited != WAIT_OBJECT_0 || !gotCode || code != 0)
                fprintf(stderr, "fixture_rejection_exit wait=%lu code=%lu got_code=%s\n", waited, code, gotCode ? "true" : "false");
            Require(waited == WAIT_OBJECT_0 && gotCode && code == 0, "fixture did not exit normally after rejection");
        }
        throw;
    }
    bool fixturePassed = true;
    if (selftest) {
        DWORD exitCode = 999;
        fixturePassed = WaitForSingleObject(fixtureProcess.value, 10000) == WAIT_OBJECT_0 &&
            GetExitCodeProcess(fixtureProcess.value, &exitCode) && exitCode == 0;
        if (actionTraceProfile && !idle) fixturePassed = fixturePassed && hits == maxHits &&
            (maxHits < 256 || (hitThreads.size() == 4 && actionTrace.paired == 128 && actionTrace.incomplete == 0 &&
                              actionTrace.orphan == 0 && actionTrace.mismatched == 0));
        else if (stressFixture) fixturePassed = fixturePassed && hits == (maxHits < 1280 ? maxHits : 1280) &&
            (maxHits < 1280 || hitThreads.size() == 16) && (!missingDr6Fixture || missingDr6Hits == hits);
        else if (idle) fixturePassed = fixturePassed && hits == 0;
        else {
            fixturePassed = fixturePassed && hits >= maxHits && hitThreads.size() >= 2;
            for (unsigned count : siteHits) fixturePassed = fixturePassed && count > 0;
        }
    }
    if (actionTraceProfile) printf("{\"event\":\"action-trace-summary\",\"paired\":%u,\"orphan\":%u,\"mismatched\":%u,"
        "\"incomplete\":%u,\"commandControlQualified\":false}\n",
        actionTrace.paired, actionTrace.orphan, actionTrace.mismatched, actionTrace.incomplete);
    printf("{\"event\":\"complete\",\"hits\":%u,\"observedThreadCount\":%zu,\"siteHits\":[%u,%u,%u,%u],"
           "\"restoredAndDetached\":%s,\"restorationReadbackVerified\":%s,\"teardownState\":\"%s\",\"drainCompleted\":%s,\"detachAttempted\":%s,\"targetAliveAfterDetach\":%s,\"teardownError\":%lu,"
           "\"targetExited\":%s,\"targetExitCode\":%lu,\"missingDr6Hits\":%u,\"fixturePassed\":%s,\"simulationControlQualified\":false,"
           "\"commandControlQualified\":false,\"captureComplete\":false,\"stopReason\":\"%s\"}\n",
           hits, hitThreads.size(), siteHits[0], siteHits[1], siteHits[2], siteHits[3],
           session.exited ? "false" : "true", session.restorationReadbackVerified ? "true" : "false",
           TeardownStateName(session.teardownState), session.drainCompleted ? "true" : "false",
           session.detachAttempted ? "true" : "false", session.targetAliveAfterDetach ? "true" : "false", session.teardownError,
           session.exited ? "true" : "false", targetExitCode, missingDr6Hits,
           selftest ? (fixturePassed ? "true" : "false") : "null",
           interrupted.load() ? "interrupted" : hits >= maxHits ? "event-cap" : session.exited ? "target-exited" : "duration-cap");
    return fixturePassed && (selftest || !session.exited) ? 0 : 3;
}
}
#ifndef TF3_RUNTIME_OBSERVER_LIBRARY
int wmain(int argc, wchar_t** argv) {
    SetConsoleCtrlHandler(Control, TRUE);
    try {
        if (argc == 2 && wcscmp(argv[1], L"--fixture") == 0) return Fixture(false);
        if (argc == 2 && wcscmp(argv[1], L"--fixture-idle") == 0) return Fixture(true);
        if (argc == 2 && wcscmp(argv[1], L"--fixture-command") == 0) return CommandFixture();
        if (argc == 2 && wcscmp(argv[1], L"--fixture-command-stress") == 0) return CommandStressFixture();
        if (argc == 2 && wcscmp(argv[1], L"--fixture-action-trace") == 0) return ActionFixture();
        if (argc == 2 && wcscmp(argv[1], L"--fixture-action-trace-cap") == 0) return ActionFixture(true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-action-pairing") == 0) return ActionPairingFixture();
        if (argc == 2) {
            const std::wstring mode = argv[1];
            const bool action = mode == L"--self-test-action-trace" || mode == L"--self-test-action-trace-attach" ||
                mode == L"--self-test-action-trace-cutoff" || mode == L"--self-test-action-trace-timeout" ||
                mode == L"--self-test-action-trace-mismatch" || mode == L"--self-test-action-trace-armed-failure" ||
                mode == L"--self-test-action-trace-cap";
            if (action) {
                const bool mismatch = mode == L"--self-test-action-trace-mismatch";
                const bool armedFailure = mode == L"--self-test-action-trace-armed-failure";
                const bool idle = mode == L"--self-test-action-trace-timeout";
                const bool depthCap = mode == L"--self-test-action-trace-cap";
                try {
                    const int result = Observe(0, true, mismatch, idle ? 1 : 5,
                        mode == L"--self-test-action-trace-cutoff" ? 5 : 256, idle,
                        mode == L"--self-test-action-trace-attach", armedFailure, false, false, false, true, depthCap);
                    Require(!mismatch && !armedFailure && !depthCap, "action trace rejection fixture unexpectedly accepted");
                    return result;
                } catch (const std::exception& error) {
                    const std::string message = error.what();
                    if (depthCap && message.find("action trace nesting cap reached") != std::string::npos) {
                        printf("{\"event\":\"nesting-cap-test-passed\",\"fixtureExitedNormally\":true}\n"); return 0;
                    }
                    if (mismatch && message.find("mapped observation bytes mismatch") != std::string::npos) {
                        printf("{\"event\":\"mismatch-test-passed\",\"hardwareBreakpointsArmed\":0}\n"); return 0;
                    }
                    if (armedFailure && message.find("owned fixture forced failure after armed observation") != std::string::npos) {
                        printf("{\"event\":\"armed-failure-test-passed\",\"fixtureExitedNormally\":true}\n"); return 0;
                    }
                    throw;
                }
            }
        }
        if (argc == 2 && wcscmp(argv[1], L"--self-test-trap-classifier") == 0) return TrapClassifierFixture();
        if (argc == 2 && wcscmp(argv[1], L"--self-test-command-stress") == 0) return Observe(0, true, false, 10, 2048, false, false, false, true, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-command-stress-attach") == 0) return Observe(0, true, false, 10, 2048, false, true, false, true, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-command-stress-cutoff") == 0) return Observe(0, true, false, 10, 256, false, true, false, true, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-command-dr6") == 0) return Observe(0, true, false, 10, 2048, false, true, false, true, true, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-command") == 0) return Observe(0, true, false, 5, 64, false, false, false, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-command-attach") == 0) return Observe(0, true, false, 5, 64, false, true, false, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-command-timeout") == 0) return Observe(0, true, false, 1, 64, true, false, false, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test") == 0) return Observe(0, true, false, 5, 32);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-attach") == 0) return Observe(0, true, false, 5, 32, false, true);
        if (argc == 2 && wcscmp(argv[1], L"--self-test-timeout") == 0) return Observe(0, true, false, 1, 32, true);
        if (argc == 2 && (wcscmp(argv[1], L"--self-test-armed-failure") == 0 || wcscmp(argv[1], L"--self-test-command-armed-failure") == 0)) {
            try { Observe(0, true, false, 5, 32, false, false, true, wcscmp(argv[1], L"--self-test-command-armed-failure") == 0); }
            catch (const std::exception& error) {
                if (std::string(error.what()).find("owned fixture forced failure after armed observation") != std::string::npos) {
                    printf("{\"event\":\"armed-failure-test-passed\",\"fixtureExitedNormally\":true}\n"); return 0;
                }
                throw;
            }
            throw std::runtime_error("armed fixture failure was not exercised");
        }
        if (argc == 2 && (wcscmp(argv[1], L"--self-test-mismatch") == 0 || wcscmp(argv[1], L"--self-test-command-mismatch") == 0)) {
            try { Observe(0, true, true, 5, 32, false, false, false, wcscmp(argv[1], L"--self-test-command-mismatch") == 0); }
            catch (const std::exception& error) {
                if (std::string(error.what()).find("mapped observation bytes mismatch") != std::string::npos) {
                    printf("{\"event\":\"mismatch-test-passed\",\"hardwareBreakpointsArmed\":0}\n"); return 0;
                }
                throw;
            }
            throw std::runtime_error("mismatch fixture was unexpectedly accepted");
        }
        bool commandProfile = false, actionTraceProfile = false;
        if (argc == 9) {
            Require(wcscmp(argv[7], L"--profile") == 0 &&
                (wcscmp(argv[8], L"command") == 0 || wcscmp(argv[8], L"simulation") == 0 ||
                 wcscmp(argv[8], L"action-trace") == 0), "unknown observation profile");
            commandProfile = wcscmp(argv[8], L"command") == 0;
            actionTraceProfile = wcscmp(argv[8], L"action-trace") == 0;
        }
        if ((argc != 7 && argc != 9) || wcscmp(argv[1], L"--pid") != 0 || wcscmp(argv[3], L"--seconds") != 0 || wcscmp(argv[5], L"--hits") != 0)
            throw std::runtime_error("usage: TF3RuntimeObserver --pid <explicit PID> --seconds <1..30> --hits <1..256> [--profile simulation|command|action-trace]; or --self-test[-command|-action-trace]");
        return Observe(Number(argv[2], 1, MAXDWORD), false, false, Number(argv[4], 1, 30), Number(argv[6], 1, 256),
            false, false, false, commandProfile, false, false, actionTraceProfile);
    } catch (const std::exception& error) {
        fprintf(stderr, "observer_error: %s\n", error.what()); return 2;
    }
}
#endif
