#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <psapi.h>

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <type_traits>

#include "probe_api.h"

#pragma comment(lib, "bcrypt.lib")

namespace {

constexpr std::array<std::uint8_t, 32> kKnownTf3ExecutableSha256 = {
    0x29, 0x7e, 0xf0, 0x5b, 0x74, 0x0d, 0xe1, 0xa3,
    0xc4, 0xb3, 0x75, 0xfd, 0x53, 0xca, 0x69, 0xf3,
    0x71, 0x34, 0x7a, 0x4b, 0x15, 0x46, 0xa3, 0x75,
    0x25, 0xf0, 0x4a, 0xab, 0x6b, 0xc8, 0xe6, 0xe6,
};

bool HashCurrentExecutable(std::array<std::uint8_t, 32>* digest) {
    wchar_t path[MAX_PATH]{};
    const DWORD path_length = GetModuleFileNameW(nullptr, path, MAX_PATH);
    if (path_length == 0 || path_length >= MAX_PATH) {
        return false;
    }

    HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, nullptr,
                              OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        return false;
    }

    BCRYPT_ALG_HANDLE algorithm = nullptr;
    BCRYPT_HASH_HANDLE hash = nullptr;
    PUCHAR hash_object = nullptr;
    bool success = false;
    ULONG hash_object_length = 0;
    ULONG bytes_returned = 0;
    std::array<std::uint8_t, 64 * 1024> buffer{};

    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0 ||
        BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH,
                          reinterpret_cast<PUCHAR>(&hash_object_length),
                          sizeof(hash_object_length), &bytes_returned, 0) < 0 ||
        bytes_returned != sizeof(hash_object_length)) {
        goto cleanup;
    }

    hash_object = static_cast<PUCHAR>(HeapAlloc(GetProcessHeap(), 0, hash_object_length));
    if (hash_object == nullptr ||
        BCryptCreateHash(algorithm, &hash, hash_object, hash_object_length, nullptr, 0, 0) < 0) {
        goto cleanup;
    }

    for (;;) {
        DWORD bytes_read = 0;
        if (!ReadFile(file, buffer.data(), static_cast<DWORD>(buffer.size()), &bytes_read, nullptr)) {
            goto cleanup;
        }
        if (bytes_read == 0) {
            break;
        }
        if (BCryptHashData(hash, buffer.data(), bytes_read, 0) < 0) {
            goto cleanup;
        }
    }

    success = BCryptFinishHash(hash, digest->data(), static_cast<ULONG>(digest->size()), 0) >= 0;

cleanup:
    if (hash != nullptr) {
        BCryptDestroyHash(hash);
    }
    if (hash_object != nullptr) {
        HeapFree(GetProcessHeap(), 0, hash_object);
    }
    if (algorithm != nullptr) {
        BCryptCloseAlgorithmProvider(algorithm, 0);
    }
    CloseHandle(file);
    return success;
}

// This is deliberately a structural consistency check, not a claim that every
// byte in a live image is immutable. Relocations, loader fixups, and legitimate
// runtime state mean a raw on-disk SHA-256 cannot be compared directly against
// all mapped bytes. Any future control feature needs a separately reviewed,
// build-specific memory-integrity design; V1 exposes no such feature.
bool IsCurrentLoadedImageConsistent() {
    HMODULE module = GetModuleHandleW(nullptr);
    MODULEINFO module_info{};
    if (module == nullptr ||
        !GetModuleInformation(GetCurrentProcess(), module, &module_info, sizeof(module_info)) ||
        module_info.lpBaseOfDll != module ||
        module_info.SizeOfImage < sizeof(IMAGE_DOS_HEADER)) {
        return false;
    }

    const auto* base = static_cast<const std::uint8_t*>(module_info.lpBaseOfDll);
    const auto* dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew < 0 ||
        static_cast<DWORD>(dos->e_lfanew) > module_info.SizeOfImage - sizeof(DWORD)) {
        return false;
    }

    const std::size_t minimum_nt_size =
        offsetof(IMAGE_NT_HEADERS64, OptionalHeader) + sizeof(IMAGE_OPTIONAL_HEADER64);
    if (module_info.SizeOfImage < minimum_nt_size ||
        static_cast<DWORD>(dos->e_lfanew) > module_info.SizeOfImage - minimum_nt_size) {
        return false;
    }

    const auto* nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (
        nt->Signature != IMAGE_NT_SIGNATURE || nt->FileHeader.Machine != IMAGE_FILE_MACHINE_AMD64 ||
        nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC ||
        nt->OptionalHeader.SizeOfImage != module_info.SizeOfImage) {
        return false;
    }
    return true;
}

}  // namespace

extern "C" Tf3NativeProbeResult __stdcall Tf3NativeProbeV1(
    const Tf3NativeProbeRequest* request) {
    Tf3NativeProbeResult result{};
    result.struct_size = sizeof(result);
    result.abi_version = TF3_NATIVE_PROBE_ABI_VERSION;
    result.pointer_width_bits = sizeof(void*) * 8;
    result.capability_flags = TF3_NATIVE_PROBE_CAPABILITY_NONE;

    if (request == nullptr || request->struct_size != sizeof(*request) ||
        request->abi_version != TF3_NATIVE_PROBE_ABI_VERSION) {
        result.status = TF3_NATIVE_PROBE_STATUS_INVALID_REQUEST;
        return result;
    }

    std::array<std::uint8_t, 32> digest{};
    if (!HashCurrentExecutable(&digest)) {
        result.status = TF3_NATIVE_PROBE_STATUS_FINGERPRINT_UNAVAILABLE;
        return result;
    }

    std::memcpy(result.executable_sha256, digest.data(), digest.size());
    if (!IsCurrentLoadedImageConsistent()) {
        result.status = TF3_NATIVE_PROBE_STATUS_LOADED_IMAGE_MISMATCH;
    } else if (digest != kKnownTf3ExecutableSha256) {
        result.status = TF3_NATIVE_PROBE_STATUS_UNSUPPORTED_EXECUTABLE;
    } else {
        result.status = TF3_NATIVE_PROBE_STATUS_OBSERVATION_ONLY_MATCH;
    }
    return result;
}

BOOL WINAPI DllMain(HINSTANCE, DWORD, LPVOID) {
    // Deliberately inert: no threads, I/O, networking, or game interaction.
    return TRUE;
}

static_assert(std::is_trivially_copyable<Tf3NativeProbeResult>::value,
              "Probe result must stay POD-like for the ABI");
