#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <cstdint>
#include <cstring>

#include "common_exit_image_unwind.h"

#pragma comment(lib, "bcrypt.lib")

namespace tf3boundary {
namespace {
constexpr DWORD kCandidate = 0x159582;
constexpr DWORD kMaxImageBytes = 512u * 1024u * 1024u;
constexpr BYTE kHash[32] = {
    0xde,0x1d,0xaa,0xd3,0xa1,0x3f,0x3b,0x7e,0x9f,0x79,0x90,0x33,0x61,0xbb,0x43,0x76,
    0x9c,0xf4,0xf1,0x5e,0x59,0x27,0x1a,0x26,0x3a,0xef,0xe1,0xf0,0x75,0xf2,0x3e,0xf2
};

bool HashMatches(HANDLE file) noexcept {
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    BCRYPT_HASH_HANDLE hash = nullptr;
    BYTE object[4096]{};
    BYTE buffer[64 * 1024]{};
    BYTE digest[32]{};
    ULONG objectBytes = 0, returned = 0;
    LARGE_INTEGER fileSize{};
    bool passed = false;
    // Bound both memory and work. Hash this held handle, never reopen the path.
    do {
        if (GetFileType(file) != FILE_TYPE_DISK || !GetFileSizeEx(file, &fileSize) ||
            fileSize.QuadPart <= 0 || fileSize.QuadPart > kMaxImageBytes) break;
        if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0 ||
            BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH,
                reinterpret_cast<PUCHAR>(&objectBytes), sizeof(objectBytes), &returned, 0) < 0 ||
            returned != sizeof(objectBytes) || objectBytes == 0 || objectBytes > sizeof(object) ||
            BCryptCreateHash(algorithm, &hash, object, objectBytes, nullptr, 0, 0) < 0) break;
        LONGLONG remaining = fileSize.QuadPart;
        while (remaining > 0) {
            const DWORD requested = remaining < static_cast<LONGLONG>(sizeof(buffer)) ?
                static_cast<DWORD>(remaining) : static_cast<DWORD>(sizeof(buffer));
            DWORD read = 0;
            if (!ReadFile(file, buffer, requested, &read, nullptr) || read != requested ||
                BCryptHashData(hash, buffer, read, 0) < 0) break;
            remaining -= read;
        }
        if (remaining != 0) break;
        DWORD extra = 0;
        if (!ReadFile(file, buffer, 1, &extra, nullptr) || extra != 0 ||
            BCryptFinishHash(hash, digest, sizeof(digest), 0) < 0) break;
        passed = std::memcmp(digest, kHash, sizeof(kHash)) == 0;
    } while (false);
    if (hash && BCryptDestroyHash(hash) < 0) passed = false;
    if (algorithm && BCryptCloseAlgorithmProvider(algorithm, 0) < 0) passed = false;
    return passed;
}

bool Contains(DWORD size, DWORD rva, SIZE_T bytes) noexcept {
    return rva < size && bytes <= static_cast<SIZE_T>(size - rva);
}

// Verify the mapping actually has no writable or executable committed pages.
// Holes may be reserved/no-access; all bytes consumed below also receive bounds
// checks and the enclosing SEH guard rejects inaccessible image data.
bool ReadOnlyImage(const BYTE* base, DWORD size) noexcept {
    SIZE_T offset = 0;
    for (unsigned region = 0; offset < size && region < 4096; ++region) {
        MEMORY_BASIC_INFORMATION info{};
        if (VirtualQuery(base + offset, &info, sizeof(info)) != sizeof(info) ||
            info.AllocationBase != base || info.Type != MEM_IMAGE ||
            info.BaseAddress != base + offset || info.RegionSize == 0 ||
            (info.State != MEM_COMMIT && info.State != MEM_RESERVE)) return false;
        if (info.State == MEM_COMMIT && info.Protect != PAGE_READONLY &&
            info.Protect != PAGE_NOACCESS) return false;
        if (info.RegionSize >= size - offset) return true;
        offset += info.RegionSize;
    }
    return false;
}

bool ExactBytes(const BYTE* base, DWORD size, DWORD rva,
                const BYTE* expected, SIZE_T bytes) noexcept {
    return Contains(size, rva, bytes) && std::memcmp(base + rva, expected, bytes) == 0;
}

bool UnwindOwnedFrame(const BYTE* base, PRUNTIME_FUNCTION function, bool positive) noexcept {
    // The common body RSP is 16-byte aligned. The positive path has already
    // restored loop registers; zero never saved them. Model both independently.
    alignas(16) DWORD64 stack[32]{};
    for (SIZE_T i = 0; i < 32; ++i) stack[i] = 0xa5a5000000000000ULL + i;
    const DWORD64 body = reinterpret_cast<DWORD64>(stack);
    const DWORD64 salt = positive ? 0x100000000000ULL : 0;
    stack[0x38 / 8] = 0x1313131313131313ULL + salt;
    stack[0x40 / 8] = 0x1212121212121212ULL + salt;
    stack[0x48 / 8] = 0x1414141414141414ULL + salt;
    stack[0x50 / 8] = 0x0b0b0b0b0b0b0b0bULL + salt;
    // RtlVirtualUnwind only reads this synthetic return address; never executes it.
    stack[0x58 / 8] = reinterpret_cast<DWORD64>(base) + 0x159610;
    stack[0x60 / 8] = 0x0babababababababULL + salt;

    CONTEXT context{};
    context.ContextFlags = CONTEXT_FULL;
    context.Rip = reinterpret_cast<DWORD64>(base) + kCandidate;
    context.Rsp = body;
    context.Rbx = 0xbad01; context.Rbp = 0xbad02;
    context.R12 = positive ? 3 : 0; context.R13 = 0; context.R14 = 0xbad03;
    context.Rsi = 0x5151515151515151ULL + salt;
    context.Rdi = 0x6161616161616161ULL + salt;
    context.R15 = 0x7575757575757575ULL + salt;
    context.Xmm6.Low = 0x123456789abcdef0ULL + salt;
    context.Xmm6.High = static_cast<LONGLONG>(0x2233445566778899ULL + salt);
    if (positive) {
        stack[0x20 / 8] = context.Xmm6.Low;
        stack[0x28 / 8] = static_cast<DWORD64>(context.Xmm6.High);
        stack[0x30 / 8] = context.R15;
        stack[0x68 / 8] = context.Rsi;
        stack[0x70 / 8] = context.Rdi;
    }
    const CONTEXT before = context;
    KNONVOLATILE_CONTEXT_POINTERS pointers{};
    PVOID handlerData = nullptr;
    DWORD64 establisher = 0;
    const auto handler = RtlVirtualUnwind(UNW_FLAG_NHANDLER,
        reinterpret_cast<DWORD64>(base), context.Rip, function, &context,
        &handlerData, &establisher, &pointers);
    return handler == nullptr && establisher == body &&
        context.Rip == stack[0x58 / 8] && context.Rsp == body + 0x60 &&
        context.R13 == stack[0x38 / 8] && context.R12 == stack[0x40 / 8] &&
        context.R14 == stack[0x48 / 8] && context.Rbp == stack[0x50 / 8] &&
        context.Rbx == stack[0x60 / 8] &&
        context.Rsi == before.Rsi && context.Rdi == before.Rdi && context.R15 == before.R15 &&
        context.Xmm6.Low == before.Xmm6.Low && context.Xmm6.High == before.Xmm6.High &&
        pointers.R13 == &stack[0x38 / 8] && pointers.R12 == &stack[0x40 / 8] &&
        pointers.R14 == &stack[0x48 / 8] && pointers.Rbp == &stack[0x50 / 8] &&
        pointers.Rbx == &stack[0x60 / 8] &&
        pointers.Rsi == nullptr && pointers.Rdi == nullptr &&
        pointers.R15 == nullptr && pointers.Xmm6 == nullptr;
}

bool InspectAndUnwind(const BYTE* base) noexcept {
    // Windows has accepted this exact-hash file as an image, but still bound
    // every PE lookup before supplying original mapped metadata to the OS.
    if (!ReadOnlyImage(base, 4096)) return false;
    const auto dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew < 0 ||
        static_cast<DWORD>(dos->e_lfanew) > 4096 - sizeof(IMAGE_NT_HEADERS64)) return false;
    const auto nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE || nt->FileHeader.Machine != IMAGE_FILE_MACHINE_AMD64 ||
        nt->FileHeader.SizeOfOptionalHeader != sizeof(IMAGE_OPTIONAL_HEADER64) ||
        nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC ||
        nt->OptionalHeader.NumberOfRvaAndSizes <= IMAGE_DIRECTORY_ENTRY_EXCEPTION) return false;
    const DWORD size = nt->OptionalHeader.SizeOfImage;
    if (size < 4096 || size > kMaxImageBytes || !ReadOnlyImage(base, size)) return false;
    const auto& directory = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXCEPTION];
    if (directory.VirtualAddress != 0x4109000 || directory.Size == 0 ||
        directory.Size % sizeof(RUNTIME_FUNCTION) != 0 ||
        directory.Size / sizeof(RUNTIME_FUNCTION) > 1024 * 1024 ||
        !Contains(size, directory.VirtualAddress, directory.Size)) return false;
    const auto entries = reinterpret_cast<const RUNTIME_FUNCTION*>(base + directory.VirtualAddress);
    const RUNTIME_FUNCTION* found = nullptr;
    const SIZE_T count = directory.Size / sizeof(RUNTIME_FUNCTION);
    for (SIZE_T i = 0; i < count; ++i) {
        if (entries[i].BeginAddress <= kCandidate && kCandidate < entries[i].EndAddress) {
            if (found) return false;
            found = &entries[i];
        }
    }
    if (!found || found->BeginAddress != kCandidate || found->EndAddress != 0x159599 ||
        found->UnwindData != 0x39deb9c) return false;
    const BYTE instruction[] = {0x4c,0x8b,0x64,0x24,0x40};
    // Version/flags, prologue, code count, frame register; then the exact unwind
    // slots and embedded RUNTIME_FUNCTION chain records (little endian).
    const BYTE leaf[] = {0x21,0,0,0, 0xaf,0x93,0x15,0, 0x42,0x94,0x15,0, 0x40,0xeb,0x9d,3};
    const BYTE middle[] = {0x21,0x0f,6,0, 0x0f,0xd4,7,0,0x0a,0xc4,8,0,5,0x34,0x0c,0,
        0x90,0x93,0x15,0, 0xaf,0x93,0x15,0, 0x34,0xeb,0x9d,3};
    const BYTE root[] = {1,8,3,0, 8,0x82,4,0xe0,2,0x50};
    if (!ExactBytes(base, size, kCandidate, instruction, sizeof(instruction)) ||
        !ExactBytes(base, size, 0x39deb9c, leaf, sizeof(leaf)) ||
        !ExactBytes(base, size, 0x39deb40, middle, sizeof(middle)) ||
        !ExactBytes(base, size, 0x39deb34, root, sizeof(root))) return false;
    // No copied, flattened, registered, or fabricated unwind metadata.
    const bool zero = UnwindOwnedFrame(base, const_cast<PRUNTIME_FUNCTION>(found), false);
    const bool positive = UnwindOwnedFrame(base, const_cast<PRUNTIME_FUNCTION>(found), true);
    return zero && positive;
}

bool GuardedInspect(const BYTE* base) noexcept {
    // Keep SEH in a function without C++ objects requiring unwinding. An image
    // read fault or OS unwind failure must reject qualification, not escape.
    __try {
        return InspectAndUnwind(base);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}
}

bool Qualify40408CommonExitUnwind(const wchar_t* imagePath) noexcept {
    if (!imagePath || !*imagePath) return false;
    HANDLE file = CreateFileW(imagePath, GENERIC_READ, FILE_SHARE_READ, nullptr,
        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    HANDLE mapping = nullptr;
    const BYTE* view = nullptr;
    bool passed = false;
    if (HashMatches(file)) {
        // No loader, imports, TLS, entry point, game DLL initialization, process
        // attachment, or executable protection. Preserve the locked file handle
        // until all mapping inspection and OS unwinding have finished.
        mapping = CreateFileMappingW(file, nullptr, PAGE_READONLY | SEC_IMAGE_NO_EXECUTE, 0, 0, nullptr);
        if (mapping) {
            view = static_cast<const BYTE*>(MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, 0));
            if (view) passed = GuardedInspect(view);
        }
    }
    if (view && !UnmapViewOfFile(view)) passed = false;
    if (mapping && !CloseHandle(mapping)) passed = false;
    if (!CloseHandle(file)) passed = false;
    return passed;
}
}
