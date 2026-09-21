#pragma once

#include <cstdint>

// This API is deliberately an observation-only compatibility probe.  It does
// not expose a game handle, a scripting surface, or any capability to modify a
// process.
constexpr std::uint32_t TF3_NATIVE_PROBE_ABI_VERSION = 1;

enum Tf3NativeProbeStatus : std::uint32_t {
    TF3_NATIVE_PROBE_STATUS_OBSERVATION_ONLY_MATCH = 0,
    TF3_NATIVE_PROBE_STATUS_INVALID_REQUEST = 1,
    TF3_NATIVE_PROBE_STATUS_UNSUPPORTED_EXECUTABLE = 2,
    TF3_NATIVE_PROBE_STATUS_FINGERPRINT_UNAVAILABLE = 3,
    // The on-disk fingerprint matched, but the current process's main-module
    // mapping did not have a compatible PE64 header or image extent.
    TF3_NATIVE_PROBE_STATUS_LOADED_IMAGE_MISMATCH = 4,
};

enum Tf3NativeProbeCapability : std::uint32_t {
    // Kept explicit so a future bridge must opt in to every capability through
    // a separately reviewed ABI version. V1 always returns zero.
    TF3_NATIVE_PROBE_CAPABILITY_NONE = 0,
    TF3_NATIVE_PROBE_CAPABILITY_GAMEPLAY = 0,
    TF3_NATIVE_PROBE_CAPABILITY_HOOKS = 0,
};

struct Tf3NativeProbeRequest {
    std::uint32_t struct_size;
    std::uint32_t abi_version;
};

struct Tf3NativeProbeResult {
    std::uint32_t struct_size;
    std::uint32_t abi_version;
    std::uint32_t status;
    std::uint32_t pointer_width_bits;
    std::uint32_t capability_flags;
    std::uint8_t executable_sha256[32];
};

static_assert(sizeof(Tf3NativeProbeRequest) == 8, "Probe request ABI changed");
static_assert(sizeof(Tf3NativeProbeResult) == 52, "Probe result ABI changed");

#if defined(TF3_NATIVE_PROBE_EXPORTS)
#define TF3_NATIVE_PROBE_API __declspec(dllexport)
#else
#define TF3_NATIVE_PROBE_API __declspec(dllimport)
#endif

extern "C" TF3_NATIVE_PROBE_API Tf3NativeProbeResult __stdcall Tf3NativeProbeV1(
    const Tf3NativeProbeRequest* request);
