#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cwchar>

// Bounded startup evidence. Steam may relaunch TF3 without inherited optional
// environment, so use a process-specific local temp file in that case.
// CREATE_NEW never overwrites an existing file. No tokens or game data are
// recorded, and failures cannot change runtime admission behavior.
inline void TraceNativeStart(const wchar_t* suffix, const char* stage,
                             unsigned first = 0, unsigned second = 0) noexcept {
    wchar_t base[512]{};
    const DWORD length = GetEnvironmentVariableW(L"TF3_MP_NATIVE_TRACE_BASE", base, _countof(base));
    if (length < 4 || length > 440 ||
        !((base[0] >= L'A' && base[0] <= L'Z') || (base[0] >= L'a' && base[0] <= L'z')) ||
        base[1] != L':' || (base[2] != L'\\' && base[2] != L'/')) {
        const DWORD temp_length = GetTempPathW(_countof(base), base);
        if (temp_length < 4 || temp_length > 400) return;
        wchar_t name[64]{};
        if (swprintf_s(name, L"tf3mp-native-start-%lu", GetCurrentProcessId()) < 0 ||
            wcscat_s(base, name) != 0) return;
    }
    wchar_t path[512]{};
    if (wcscpy_s(path, base) != 0 || wcscat_s(path, suffix) != 0) return;
    HANDLE file = CreateFileW(path, GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                              FILE_ATTRIBUTE_TEMPORARY, nullptr);
    if (file == INVALID_HANDLE_VALUE) return;
    char body[128]{};
    const int count = sprintf_s(body, "%s %u %u\n", stage, first, second);
    DWORD written = 0;
    if (count > 0) (void)WriteFile(file, body, static_cast<DWORD>(count), &written, nullptr);
    CloseHandle(file);
}
