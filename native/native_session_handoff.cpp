#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <sddl.h>

#include <array>
#include <cstring>
#include <cwctype>
#include <cwchar>
#include <iostream>
#include <string>

#include "native_session_handoff.h"

namespace {
constexpr wchar_t kPipeEnv[] = L"TF3_MP_NATIVE_PIPE";
constexpr wchar_t kTokenEnv[] = L"TF3_MP_NATIVE_TOKEN";
constexpr std::uint8_t kMagic[8] = {'T','C','T','F','3','S','1',0};

bool ReadEnv(const wchar_t* name, wchar_t* output, DWORD capacity) {
    const DWORD length = GetEnvironmentVariableW(name, output, capacity);
    return length != 0 && length < capacity;
}
bool AbsoluteDirectory(const wchar_t* value) {
    return value != nullptr && ((value[0] >= L'A' && value[0] <= L'Z') ||
        (value[0] >= L'a' && value[0] <= L'z')) && value[1] == L':' &&
        (value[2] == L'\\' || value[2] == L'/');
}
bool ValidPipe(const wchar_t* value) {
    const size_t length = wcsnlen_s(value, TF3_NATIVE_SESSION_MAX_PIPE + 1);
    if (length == 0 || length > TF3_NATIVE_SESSION_MAX_PIPE) return false;
    for (size_t i = 0; i < length; ++i) {
        if (!(std::iswalnum(value[i]) || value[i] == L'_' || value[i] == L'-')) return false;
    }
    return true;
}
bool ValidToken(const wchar_t* value) {
    if (wcsnlen_s(value, TF3_NATIVE_SESSION_MAX_TOKEN + 1) != TF3_NATIVE_SESSION_MAX_TOKEN) return false;
    for (size_t i = 0; i < TF3_NATIVE_SESSION_MAX_TOKEN; ++i) {
        if (!((value[i] >= L'0' && value[i] <= L'9') || (value[i] >= L'a' && value[i] <= L'f'))) return false;
    }
    return true;
}
}

int wmain(int argc, wchar_t* argv[]) {
    if (argc != 3 || std::wcscmp(argv[1], L"--directory") != 0 || !AbsoluteDirectory(argv[2])) {
        std::wcerr << L"usage: TF3NativeSessionHandoff.exe --directory <absolute-deployment-directory>\n";
        return 2;
    }
    const DWORD attributes = GetFileAttributesW(argv[2]);
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
        (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) return 3;
    Tf3NativeSessionV1 record{};
    std::memcpy(record.magic, kMagic, sizeof(kMagic));
    record.version = TF3_NATIVE_SESSION_VERSION;
    record.struct_size = sizeof(record);
    GetSystemTimeAsFileTime(&record.created);
    if (!ReadEnv(kPipeEnv, record.pipe_name, _countof(record.pipe_name)) ||
        !ReadEnv(kTokenEnv, record.session_token, _countof(record.session_token)) ||
        !ValidPipe(record.pipe_name) || !ValidToken(record.session_token)) return 4;
    std::wstring path(argv[2]);
    if (path.back() != L'\\' && path.back() != L'/') path.push_back(L'\\');
    path.append(TF3_NATIVE_SESSION_FILE);
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;FA;;;OW)", SDDL_REVISION_1, &descriptor, nullptr)) return 5;
    SECURITY_ATTRIBUTES security{sizeof(security), descriptor, FALSE};
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, &security, CREATE_NEW,
                              FILE_ATTRIBUTE_TEMPORARY, nullptr);
    LocalFree(descriptor);
    if (file == INVALID_HANDLE_VALUE) return 6; // collision is deliberately fail-closed
    DWORD written = 0;
    const BOOL complete = WriteFile(file, &record, sizeof(record), &written, nullptr) && written == sizeof(record) && FlushFileBuffers(file);
    CloseHandle(file);
    return complete ? 0 : 7;
}
