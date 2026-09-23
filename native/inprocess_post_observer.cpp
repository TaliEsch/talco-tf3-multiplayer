#include "inprocess_post_observer.h"

#include <bcrypt.h>
#include <psapi.h>
#include <intrin.h>
#include <array>
#include <atomic>
#include <cstring>
#include <limits>
#include <vector>

namespace tf3postobserver {
namespace {
constexpr DWORD kSiteRva = 0x159571;
constexpr std::array<unsigned char, 12> kBytes{
    0x41, 0xff, 0xc7, 0x45, 0x3b, 0xfc, 0x0f, 0x8c, 0x33, 0xff, 0xff, 0xff};
constexpr std::array<unsigned char, 32> kHash{
    0xcb,0xd8,0x09,0x27,0x57,0xe5,0x39,0xa4,0x2f,0x56,0xc5,0x1e,0x00,0xee,0xb7,0x67,
    0x1d,0x96,0x7a,0x90,0x72,0x83,0x8d,0x7a,0x5f,0x47,0xd2,0xde,0x88,0x34,0x87,0x16};
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
static_assert(std::atomic<std::uint32_t>::is_always_lock_free);
static_assert(std::atomic<bool>::is_always_lock_free);
static_assert(std::atomic<std::uintptr_t>::is_always_lock_free);
SRWLOCK lifecycle_lock = SRWLOCK_INIT;
std::atomic<std::uintptr_t> target{0};
std::atomic<bool> active{false};
std::atomic<bool> cross_thread{false};
std::atomic<bool> saturated{false};
std::atomic<std::uint32_t> owner_thread{0};
std::atomic<std::uint64_t> hits{0};
std::atomic<std::uint64_t> minimum_stack_headroom{(std::numeric_limits<std::uint64_t>::max)()};
std::atomic<std::uint32_t> cfg_flags{0};
std::atomic<std::uint32_t> cet_flags{0};
std::atomic<bool> cfg_known{false};
std::atomic<bool> cet_known{false};
PVOID handler = nullptr;
DWORD original_protection = 0;
bool attempted = false;
bool restoration_pending = false;
bool owns_byte = false;

// INC r15d writes all 32 bits and zero-extends into R15. INC modifies OF, SF,
// ZF, AF and PF, but preserves CF and all unrelated flags. Reproduce these even
// though the following CMP normally replaces them. No instruction is replayed.
void EmulateIncrement(CONTEXT* context) noexcept {
    const std::uint32_t before = static_cast<std::uint32_t>(context->R15);
    const std::uint32_t after = before + 1u;
    constexpr DWORD mask = 0x800u | 0x80u | 0x40u | 0x10u | 0x4u;
    DWORD flags = context->EFlags & ~mask;
    if (before == 0x7fffffffu) flags |= 0x800u;
    if ((after & 0x80000000u) != 0) flags |= 0x80u;
    if (after == 0) flags |= 0x40u;
    if ((before & 0xfu) == 0xfu) flags |= 0x10u;
    std::uint32_t parity = after & 0xffu;
    parity ^= parity >> 4;
    parity ^= parity >> 2;
    parity ^= parity >> 1;
    if ((parity & 1u) == 0) flags |= 0x4u;
    context->R15 = after;
    context->EFlags = flags;
    context->Rip += 3;  // Windows VEH presents RIP at the INT3, as the owned trap verifies.
}

LONG CALLBACK OnException(EXCEPTION_POINTERS* pointers) noexcept {
    if (pointers == nullptr || pointers->ExceptionRecord == nullptr ||
        pointers->ContextRecord == nullptr) return EXCEPTION_CONTINUE_SEARCH;
    const auto site = target.load(std::memory_order_acquire);
    if (site == 0 || pointers->ExceptionRecord->ExceptionCode != EXCEPTION_BREAKPOINT ||
        pointers->ExceptionRecord->ExceptionFlags != 0 ||
        reinterpret_cast<std::uintptr_t>(pointers->ExceptionRecord->ExceptionAddress) != site ||
        pointers->ContextRecord->Rip != site) return EXCEPTION_CONTINUE_SEARCH;

    // This handler stays installed after Stop. A thread may have taken the trap
    // before byte restoration and reach VEH afterwards; it must still resume.
    EmulateIncrement(pointers->ContextRecord);
    if (active.load(std::memory_order_acquire)) {
        const DWORD current = GetCurrentThreadId();
        std::uint32_t expected = 0;
        owner_thread.compare_exchange_strong(expected, current, std::memory_order_relaxed);
        if (owner_thread.load(std::memory_order_relaxed) != current) {
            cross_thread.store(true, std::memory_order_relaxed);
        } else {
            const auto stack_limit = static_cast<std::uintptr_t>(
                __readgsqword(FIELD_OFFSET(NT_TIB, StackLimit)));
            const auto interrupted_rsp = static_cast<std::uintptr_t>(pointers->ContextRecord->Rsp);
            const std::uint64_t headroom = interrupted_rsp >= stack_limit
                ? static_cast<std::uint64_t>(interrupted_rsp - stack_limit) : 0;
            auto minimum = minimum_stack_headroom.load(std::memory_order_relaxed);
            if (headroom < minimum) {
                // Only the immutable owner reaches this branch. One strong CAS
                // keeps the VEH path bounded; a surprising contender may make
                // the diagnostic conservative but cannot affect execution.
                (void)minimum_stack_headroom.compare_exchange_strong(
                    minimum, headroom, std::memory_order_relaxed);
            }
            // Only the owner thread writes this counter. No allocation, locks,
            // IPC, logging, game-memory reads, or retry loops occur in VEH.
            const auto count = hits.load(std::memory_order_relaxed);
            if (count == (std::numeric_limits<std::uint64_t>::max)())
                saturated.store(true, std::memory_order_relaxed);
            else hits.store(count + 1, std::memory_order_release);
        }
    }
    return EXCEPTION_CONTINUE_EXECUTION;
}

bool CompatibleMitigations() noexcept {
    PROCESS_MITIGATION_DYNAMIC_CODE_POLICY dynamic{};
    PROCESS_MITIGATION_CONTROL_FLOW_GUARD_POLICY cfg{};
    PROCESS_MITIGATION_USER_SHADOW_STACK_POLICY cet{};
    // CFG does not constrain this design: no indirect branch target is created
    // or called. User shadow stacks track call/return pairs; the handler changes
    // neither and Windows resumes the supplied exception context itself. The
    // live target has CFG enabled, so treating it as incompatible would reject
    // a mitigation that is orthogonal to this exact-site INT3 observer.
    const bool cfg_queried = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessControlFlowGuardPolicy, &cfg, sizeof(cfg)) != FALSE;
    const bool cet_queried = GetProcessMitigationPolicy(GetCurrentProcess(),
        ProcessUserShadowStackPolicy, &cet, sizeof(cet)) != FALSE;
    cfg_known.store(cfg_queried, std::memory_order_relaxed);
    cet_known.store(cet_queried, std::memory_order_relaxed);
    if (cfg_queried) {
        cfg_flags.store(cfg.Flags, std::memory_order_relaxed);
    }
    if (cet_queried) {
        cet_flags.store(cet.Flags, std::memory_order_relaxed);
    }
    return !IsDebuggerPresent() &&
        GetProcessMitigationPolicy(GetCurrentProcess(), ProcessDynamicCodePolicy,
                                   &dynamic, sizeof(dynamic)) && !dynamic.ProhibitDynamicCode;
}

bool ValidSite(void* address) noexcept {
    MODULEINFO image{};
    const auto module = GetModuleHandleW(nullptr);
    if (!GetModuleInformation(GetCurrentProcess(), module, &image, sizeof(image))) return false;
    const auto base = reinterpret_cast<std::uintptr_t>(module);
    const auto site = reinterpret_cast<std::uintptr_t>(address);
    if (site < base || site - base > image.SizeOfImage ||
        kBytes.size() > image.SizeOfImage - (site - base)) return false;
    MEMORY_BASIC_INFORMATION memory{};
    if (VirtualQuery(address, &memory, sizeof(memory)) != sizeof(memory) ||
        memory.State != MEM_COMMIT || memory.Type != MEM_IMAGE ||
        memory.AllocationBase != module || memory.Protect != PAGE_EXECUTE_READ ||
        site - reinterpret_cast<std::uintptr_t>(memory.BaseAddress) > memory.RegionSize ||
        kBytes.size() > memory.RegionSize -
            (site - reinterpret_cast<std::uintptr_t>(memory.BaseAddress))) return false;
    return std::memcmp(address, kBytes.data(), kBytes.size()) == 0;
}

Status ExactImageStatus() {
    std::array<wchar_t, 32768> path{};
    const DWORD length = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
    if (length == 0 || length >= path.size()) return Status::image_file_failed;
    HANDLE file = CreateFileW(path.data(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                              OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return Status::image_file_failed;
    LARGE_INTEGER size{};
    if (!GetFileSizeEx(file, &size) || size.QuadPart < 4096 || size.QuadPart > 256 * 1024 * 1024) {
        CloseHandle(file); return Status::image_file_failed;
    }
    std::vector<unsigned char> bytes;
    try { bytes.resize(static_cast<std::size_t>(size.QuadPart)); }
    catch (...) { CloseHandle(file); return Status::image_file_failed; }
    DWORD read = 0;
    const bool read_ok = ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr)
        && read == bytes.size();
    CloseHandle(file);
    if (!read_ok) return Status::image_file_failed;
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return Status::image_file_failed;
    std::array<unsigned char, 32> digest{};
    const auto status = BCryptHash(algorithm, nullptr, 0, bytes.data(), static_cast<ULONG>(bytes.size()),
                                  digest.data(), static_cast<ULONG>(digest.size()));
    BCryptCloseAlgorithmProvider(algorithm, 0);
    if (status < 0) return Status::image_file_failed;
    if (digest != kHash) return Status::image_hash_mismatch;

    // The exact disk hash qualifies the headers. Compare the mapped header and
    // require the site to lie inside its audited executable, non-writable section.
    const auto* disk_dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(bytes.data());
    if (disk_dos->e_magic != IMAGE_DOS_SIGNATURE || disk_dos->e_lfanew < 0 ||
        static_cast<std::size_t>(disk_dos->e_lfanew) > bytes.size() - sizeof(IMAGE_NT_HEADERS64)) return Status::mapped_header_mismatch;
    const auto* disk_nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(bytes.data() + disk_dos->e_lfanew);
    MODULEINFO image{};
    HMODULE module = GetModuleHandleW(nullptr);
    if (!GetModuleInformation(GetCurrentProcess(), module, &image, sizeof(image)) ||
        disk_nt->Signature != IMAGE_NT_SIGNATURE || disk_nt->FileHeader.Machine != IMAGE_FILE_MACHINE_AMD64 ||
        disk_nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC ||
        image.SizeOfImage != disk_nt->OptionalHeader.SizeOfImage) return Status::mapped_header_mismatch;
    const auto* mapped = reinterpret_cast<const unsigned char*>(module);
    const auto* mapped_dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(mapped);
    const auto* mapped_nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(mapped + disk_dos->e_lfanew);
    MEMORY_BASIC_INFORMATION header{};
    if (VirtualQuery(module, &header, sizeof(header)) != sizeof(header) ||
        header.State != MEM_COMMIT || header.Type != MEM_IMAGE ||
        (header.Protect != PAGE_READONLY && header.Protect != PAGE_EXECUTE_READ) ||
        static_cast<std::size_t>(disk_dos->e_lfanew) + sizeof(IMAGE_NT_HEADERS64) > header.RegionSize)
        return Status::mapped_memory_mismatch;
    if (mapped_dos->e_magic != disk_dos->e_magic || mapped_dos->e_lfanew != disk_dos->e_lfanew)
        return Status::mapped_dos_mismatch;
    if (mapped_nt->Signature != disk_nt->Signature ||
        mapped_nt->FileHeader.Machine != disk_nt->FileHeader.Machine ||
        mapped_nt->OptionalHeader.Magic != disk_nt->OptionalHeader.Magic ||
        mapped_nt->OptionalHeader.SizeOfImage != disk_nt->OptionalHeader.SizeOfImage)
        return Status::mapped_nt_core_mismatch;
    if (mapped_nt->FileHeader.NumberOfSections != disk_nt->FileHeader.NumberOfSections ||
        mapped_nt->FileHeader.TimeDateStamp != disk_nt->FileHeader.TimeDateStamp ||
        mapped_nt->FileHeader.SizeOfOptionalHeader != disk_nt->FileHeader.SizeOfOptionalHeader ||
        mapped_nt->FileHeader.Characteristics != disk_nt->FileHeader.Characteristics)
        return Status::mapped_file_header_mismatch;
    if (mapped_nt->OptionalHeader.AddressOfEntryPoint != disk_nt->OptionalHeader.AddressOfEntryPoint ||
        (mapped_nt->OptionalHeader.ImageBase != disk_nt->OptionalHeader.ImageBase &&
         mapped_nt->OptionalHeader.ImageBase != reinterpret_cast<ULONGLONG>(module)) ||
        mapped_nt->OptionalHeader.SectionAlignment != disk_nt->OptionalHeader.SectionAlignment ||
        mapped_nt->OptionalHeader.FileAlignment != disk_nt->OptionalHeader.FileAlignment ||
        mapped_nt->OptionalHeader.CheckSum != disk_nt->OptionalHeader.CheckSum)
        return Status::mapped_optional_header_mismatch;
    const auto offset = static_cast<std::size_t>(disk_dos->e_lfanew) + sizeof(IMAGE_NT_HEADERS64);
    const auto section_bytes = static_cast<std::size_t>(disk_nt->FileHeader.NumberOfSections) * sizeof(IMAGE_SECTION_HEADER);
    if (offset > bytes.size() || section_bytes > bytes.size() - offset ||
        offset + section_bytes > header.RegionSize ||
        std::memcmp(mapped + offset, bytes.data() + offset, section_bytes) != 0)
        return Status::mapped_section_table_mismatch;
    const auto* sections = reinterpret_cast<const IMAGE_SECTION_HEADER*>(bytes.data() + offset);
    for (WORD i = 0; i < disk_nt->FileHeader.NumberOfSections; ++i) {
        const auto& section = sections[i];
        if (kSiteRva < section.VirtualAddress) continue;
        const DWORD relative = kSiteRva - section.VirtualAddress;
        if (relative > section.SizeOfRawData || kBytes.size() > section.SizeOfRawData - relative) continue;
        const auto raw = static_cast<std::size_t>(section.PointerToRawData) + relative;
        return (section.Characteristics & IMAGE_SCN_MEM_EXECUTE) != 0 &&
            (section.Characteristics & IMAGE_SCN_MEM_WRITE) == 0 &&
            raw <= bytes.size() && kBytes.size() <= bytes.size() - raw &&
            std::memcmp(bytes.data() + raw, kBytes.data(), kBytes.size()) == 0
            ? Status::started : Status::site_section_mismatch;
    }
    return Status::site_section_mismatch;
}

Status StartSite(void* site) noexcept {
    if (active.load()) return Status::already_started;
    if (attempted) return Status::restart_disallowed;
    if (!CompatibleMitigations()) return Status::incompatible_mitigation;
    if (!ValidSite(site)) return Status::invalid_site;
    HMODULE pinned = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
            reinterpret_cast<LPCWSTR>(&OnException), &pinned)) return Status::pin_failed;
    // From this point even a failed activation retains the module for process lifetime.
    attempted = true;
    target.store(reinterpret_cast<std::uintptr_t>(site), std::memory_order_release);
    handler = AddVectoredExceptionHandler(1, &OnException);
    if (handler == nullptr) return Status::handler_failed;
    DWORD old = 0;
    if (!VirtualProtect(site, 1, PAGE_EXECUTE_READWRITE, &old)) return Status::patch_failed;
    original_protection = old;
    restoration_pending = true;
    if (old != PAGE_EXECUTE_READ || std::memcmp(site, kBytes.data(), kBytes.size()) != 0) {
        DWORD ignored = 0;
        if (!VirtualProtect(site, 1, old, &ignored)) return Status::restore_failed;
        restoration_pending = false;
        return Status::invalid_site;
    }
    active.store(true, std::memory_order_release);
    const auto previous = _InterlockedCompareExchange8(static_cast<volatile char*>(site),
        static_cast<char>(0xcc), static_cast<char>(kBytes[0]));
    if (static_cast<unsigned char>(previous) != kBytes[0]) {
        active.store(false, std::memory_order_release);
        DWORD ignored = 0;
        if (!VirtualProtect(site, 1, old, &ignored)) return Status::restore_failed;
        restoration_pending = false;
        return Status::foreign_patch;
    }
    owns_byte = true;
    DWORD ignored = 0;
    const bool flushed = FlushInstructionCache(GetCurrentProcess(), site, 1) != FALSE;
    const bool restored = VirtualProtect(site, 1, old, &ignored) != FALSE;
    if (flushed && restored) return Status::started;
    // Caller must call Stop after any patch/restore error. Never unload this module.
    return Status::restore_failed;
}
}  // namespace

Status Start() noexcept {
    AcquireSRWLockExclusive(&lifecycle_lock);
    Status result = Status::unsupported_image;
    try {
        const auto image_status = ExactImageStatus();
        result = image_status == Status::started
            ? StartSite(reinterpret_cast<unsigned char*>(GetModuleHandleW(nullptr)) + kSiteRva)
            : image_status;
    } catch (...) { result = Status::unsupported_image; }
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return result;
}

Status QualifyExactSite(void** site) noexcept {
    if (site == nullptr) return Status::invalid_site;
    *site = nullptr;
    try {
        const auto image_status = ExactImageStatus();
        if (image_status != Status::started) return image_status;
        if (!CompatibleMitigations()) return Status::incompatible_mitigation;
        auto* exact = reinterpret_cast<unsigned char*>(GetModuleHandleW(nullptr)) + kSiteRva;
        if (!ValidSite(exact)) return Status::invalid_site;
        *site = exact;
        return Status::started;
    } catch (...) { return Status::unsupported_image; }
}

Status Stop() noexcept {
    AcquireSRWLockExclusive(&lifecycle_lock);
    Status result = Status::never_started;
    if (restoration_pending) {
        // Stop publication before touching the site. A foreign byte or a
        // protection failure must not leave an apparently active observer.
        // The retained VEH still emulates an already-raised exact-site trap.
        active.store(false, std::memory_order_release);
        auto* site = reinterpret_cast<unsigned char*>(target.load());
        DWORD old = 0;
        if (!VirtualProtect(site, 1, PAGE_EXECUTE_READWRITE, &old)) result = Status::restore_failed;
        else {
            const char previous = owns_byte ?
                _InterlockedCompareExchange8(reinterpret_cast<volatile char*>(site),
                    static_cast<char>(kBytes[0]), static_cast<char>(0xcc)) : static_cast<char>(kBytes[0]);
            const bool ours = static_cast<unsigned char>(previous) == 0xcc ||
                static_cast<unsigned char>(previous) == kBytes[0];
            DWORD ignored = 0;
            const bool flushed = FlushInstructionCache(GetCurrentProcess(), site, 1) != FALSE;
            const bool restored = VirtualProtect(site, 1, original_protection, &ignored) != FALSE;
            if (ours && flushed && restored) restoration_pending = false;
            result = !ours ? Status::foreign_patch :
                (flushed && restored ? Status::stopped : Status::restore_failed);
        }
    } else if (attempted) result = Status::stopped;
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return result;
}

Snapshot ReadSnapshot() noexcept {
    // Independent atomic fields: observational snapshot, not a world-state transaction.
    const auto observed_hits = hits.load(std::memory_order_acquire);
    const auto headroom = minimum_stack_headroom.load(std::memory_order_acquire);
    return {observed_hits, headroom == (std::numeric_limits<std::uint64_t>::max)() ? 0 : headroom,
            owner_thread.load(), cfg_flags.load(), cet_flags.load(), cfg_known.load(),
            cet_known.load(), active.load(),
            cross_thread.load(), saturated.load()};
}
#ifdef TF3_POST_OBSERVER_OWNED_TEST
Status StartOwnedFixture(void* site) noexcept {
    AcquireSRWLockExclusive(&lifecycle_lock);
    const auto result = StartSite(site);
    ReleaseSRWLockExclusive(&lifecycle_lock);
    return result;
}
LONG DispatchOwnedException(EXCEPTION_POINTERS* pointers) noexcept { return OnException(pointers); }
void EmulateOwnedIncrement(CONTEXT* context) noexcept { EmulateIncrement(context); }
void SetOwnedHitCounter(std::uint64_t value) noexcept { hits.store(value); }
#endif
}  // namespace tf3postobserver
