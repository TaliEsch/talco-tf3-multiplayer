#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cstdint>

constexpr wchar_t TF3_NATIVE_SESSION_FILE[] = L"TalCo-TF3MP-native-session.bin";
constexpr std::uint32_t TF3_NATIVE_SESSION_VERSION = 1;
constexpr std::uint32_t TF3_NATIVE_SESSION_MAX_PIPE = 80;
constexpr std::uint32_t TF3_NATIVE_SESSION_MAX_TOKEN = 64;

#pragma pack(push, 1)
struct Tf3NativeSessionV1 {
    std::uint8_t magic[8];
    std::uint32_t version;
    std::uint32_t struct_size;
    FILETIME created;
    wchar_t pipe_name[TF3_NATIVE_SESSION_MAX_PIPE + 1];
    wchar_t session_token[TF3_NATIVE_SESSION_MAX_TOKEN + 1];
};
#pragma pack(pop)

static_assert(sizeof(Tf3NativeSessionV1) == 316, "native session ABI drift");
