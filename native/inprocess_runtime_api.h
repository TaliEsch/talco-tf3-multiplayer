#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdint>

constexpr std::uint32_t TF3_INPROCESS_RUNTIME_ABI_VERSION = 1;

enum Tf3InProcessRuntimeStatus : std::uint32_t {
    TF3_INPROCESS_RUNTIME_STOPPED = 0,
    TF3_INPROCESS_RUNTIME_INVALID_REQUEST = 2,
    TF3_INPROCESS_RUNTIME_INVALID_CREDENTIALS = 3,
    TF3_INPROCESS_RUNTIME_PROBE_LOAD_FAILED = 4,
    TF3_INPROCESS_RUNTIME_PROBE_ABI_FAILED = 5,
    TF3_INPROCESS_RUNTIME_UNSUPPORTED_EXECUTABLE = 6,
    TF3_INPROCESS_RUNTIME_SERVER_FAILED = 7,
    TF3_INPROCESS_RUNTIME_OBSERVER_START_FAILED = 8,
    TF3_INPROCESS_RUNTIME_OBSERVER_STOP_FAILED = 9,
    TF3_INPROCESS_RUNTIME_DIAGNOSTIC_MATCH = 10,
    TF3_INPROCESS_RUNTIME_INVALID_DIAGNOSTIC = 11,
};

struct Tf3InProcessRuntimeRequestV1 {
    std::uint32_t struct_size;
    std::uint32_t abi_version;
    const wchar_t* pipe_name;
    const wchar_t* session_token;
};

static_assert(sizeof(void*) != 8 || sizeof(Tf3InProcessRuntimeRequestV1) == 24,
              "x64 in-process runtime ABI changed");

using Tf3InProcessRuntimeFunctionV1 = DWORD(WINAPI*)(const Tf3InProcessRuntimeRequestV1*);

#if defined(TF3_INPROCESS_RUNTIME_EXPORTS)
#define TF3_INPROCESS_RUNTIME_API __declspec(dllexport)
#else
#define TF3_INPROCESS_RUNTIME_API __declspec(dllimport)
#endif

extern "C" TF3_INPROCESS_RUNTIME_API DWORD WINAPI Tf3InProcessRuntimeV1(
    const Tf3InProcessRuntimeRequestV1* request);
