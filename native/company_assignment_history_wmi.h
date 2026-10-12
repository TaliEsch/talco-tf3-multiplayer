#pragma once
// Bounded, read-only local WMI lifetime evidence for a present inaccessible PID.
#include <windows.h>
#include <wbemidl.h>
#include <oleauto.h>
#include <cstdint>
#include <string>

namespace tf3::company_assignment_history::wmi {
constexpr uint64_t kSecond = 10000000ULL;
constexpr long kQueryTimeoutMs = 3000;

struct LifetimeInterval {
    uint64_t lower = 0;
    uint64_t upper = 0;
};
inline bool ProvesLater(uint64_t recordedCreation, const LifetimeInterval& interval) {
    return interval.lower > recordedCreation;
}

inline bool Digits(const wchar_t* text, size_t count, unsigned& value) {
    value = 0;
    for (size_t i = 0; i < count; ++i) {
        if (text[i] < L'0' || text[i] > L'9') return false;
        value = value * 10 + unsigned(text[i] - L'0');
    }
    return true;
}

// A complete CIM_DATETIME has six fractional digits and a signed minute offset.
// WMI does not promise its rounding rule. Widen by a full second at each end.
inline bool ParseCreationDate(const std::wstring& text, LifetimeInterval& interval) {
    if (text.size() != 25 || text[14] != L'.' ||
        (text[21] != L'+' && text[21] != L'-')) return false;
    unsigned year, month, day, hour, minute, second, microsecond, offset;
    if (!Digits(text.data(), 4, year) || !Digits(text.data() + 4, 2, month) ||
        !Digits(text.data() + 6, 2, day) || !Digits(text.data() + 8, 2, hour) ||
        !Digits(text.data() + 10, 2, minute) || !Digits(text.data() + 12, 2, second) ||
        !Digits(text.data() + 15, 6, microsecond) || !Digits(text.data() + 22, 3, offset) ||
        year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 ||
        hour > 23 || minute > 59 || second > 59 || offset > 999) return false;
    SYSTEMTIME local{};
    local.wYear = WORD(year); local.wMonth = WORD(month); local.wDay = WORD(day);
    local.wHour = WORD(hour); local.wMinute = WORD(minute); local.wSecond = WORD(second);
    local.wMilliseconds = WORD(microsecond / 1000);
    FILETIME file{};
    if (!SystemTimeToFileTime(&local, &file)) return false;
    SYSTEMTIME roundTrip{};
    if (!FileTimeToSystemTime(&file, &roundTrip) ||
        roundTrip.wYear != local.wYear || roundTrip.wMonth != local.wMonth ||
        roundTrip.wDay != local.wDay || roundTrip.wHour != local.wHour ||
        roundTrip.wMinute != local.wMinute || roundTrip.wSecond != local.wSecond ||
        roundTrip.wMilliseconds != local.wMilliseconds) return false;
    uint64_t value = (uint64_t(file.dwHighDateTime) << 32) | file.dwLowDateTime;
    value += uint64_t(microsecond % 1000) * 10;
    const uint64_t displacement = uint64_t(offset) * 60 * kSecond;
    if (text[21] == L'+') {
        if (value < displacement + kSecond) return false;
        value -= displacement;
    } else {
        if (value > UINT64_MAX - displacement - kSecond) return false;
        value += displacement;
    }
    interval.lower = value - kSecond;
    interval.upper = value + kSecond;
    return true;
}

template<class T> struct ComPtr {
    T* value = nullptr;
    ~ComPtr() { if (value) value->Release(); }
    T** out() { return &value; }
    T* operator->() const { return value; }
    ComPtr(const ComPtr&) = delete;
    ComPtr& operator=(const ComPtr&) = delete;
    ComPtr() = default;
};
struct Bstr {
    BSTR value;
    explicit Bstr(const wchar_t* text) : value(SysAllocString(text)) {}
    ~Bstr() { SysFreeString(value); }
    Bstr(const Bstr&) = delete;
    Bstr& operator=(const Bstr&) = delete;
};
struct ComApartment {
    HRESULT result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    ~ComApartment() { if (SUCCEEDED(result)) CoUninitialize(); }
};

// Every failure is unknown, including a missing PID row. This never proves
// process absence; the caller already checked a complete unfiltered snapshot.
inline bool QueryCreation(DWORD pid, LifetimeInterval& interval, std::string* diagnostic = nullptr) {
    const auto fail = [&](const std::string& stage, HRESULT code) {
        if (diagnostic) *diagnostic = stage + " hresult=" + std::to_string(uint32_t(code));
        return false;
    };
    if (!pid) return fail("pid", E_INVALIDARG);
    ComApartment apartment;
    if (FAILED(apartment.result)) return fail("apartment", apartment.result);
    ComPtr<IWbemLocator> locator;
    HRESULT code = CoCreateInstance(CLSID_WbemLocator, nullptr, CLSCTX_INPROC_SERVER,
        IID_IWbemLocator, reinterpret_cast<void**>(locator.out()));
    if (FAILED(code)) return fail("locator", code);
    Bstr name(L"ROOT\\CIMV2");
    if (!name.value) return fail("namespace", E_OUTOFMEMORY);
    ComPtr<IWbemServices> services;
    code = locator->ConnectServer(name.value, nullptr, nullptr, nullptr, WBEM_FLAG_CONNECT_USE_MAX_WAIT,
        nullptr, nullptr, services.out());
    if (FAILED(code)) return fail("connect", code);
    code = CoSetProxyBlanket(services.value, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE,
        nullptr, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE,
        nullptr, EOAC_NONE);
    if (FAILED(code)) return fail("proxy", code);
    Bstr language(L"WQL");
    const std::wstring statement = L"SELECT ProcessId, CreationDate FROM Win32_Process WHERE ProcessId = " +
        std::to_wstring(pid);
    Bstr query(statement.c_str());
    if (!language.value || !query.value) return fail("query allocation", E_OUTOFMEMORY);
    ComPtr<IEnumWbemClassObject> rows;
    code = services->ExecQuery(language.value, query.value,
        WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, nullptr, rows.out());
    if (FAILED(code) || !rows.value) return fail("exec", code);
    IWbemClassObject* raw[2]{};
    ULONG count = 0;
    const HRESULT result = rows->Next(kQueryTimeoutMs, 2, raw, &count);
    ComPtr<IWbemClassObject> first;
    ComPtr<IWbemClassObject> second;
    first.value = raw[0]; second.value = raw[1];
    if (result != WBEM_S_FALSE || count != 1 || !first.value || second.value)
        return fail("enumerate count=" + std::to_string(count), result);
    VARIANT identity{};
    VariantInit(&identity);
    const HRESULT identityResult = first->Get(L"ProcessId", 0, &identity, nullptr, nullptr);
    const bool samePid = SUCCEEDED(identityResult) &&
        ((identity.vt == VT_I4 && identity.lVal >= 0 && DWORD(identity.lVal) == pid) ||
         (identity.vt == VT_UI4 && identity.ulVal == pid));
    VariantClear(&identity);
    if (!samePid) return fail("identity", identityResult);
    VARIANT creation{};
    VariantInit(&creation);
    const HRESULT creationResult = first->Get(L"CreationDate", 0, &creation, nullptr, nullptr);
    const bool valid = SUCCEEDED(creationResult) && creation.vt == VT_BSTR && creation.bstrVal &&
        ParseCreationDate(std::wstring(creation.bstrVal, SysStringLen(creation.bstrVal)), interval);
    VariantClear(&creation);
    if (!valid) return fail("creation", creationResult);
    return true;
}
} // namespace tf3::company_assignment_history::wmi
