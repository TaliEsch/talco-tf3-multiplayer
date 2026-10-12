// Owned processes and disposable fixture files only. No TF3 launch or memory write.
#define WIN32_LEAN_AND_MEAN
#include "company_assignment_history.h"
#include <aclapi.h>
#include <cstdio>
#include <functional>

namespace h = tf3::company_assignment_history;
namespace {
void Refuses(const std::function<void()>& action, const char* label) {
    bool refused = false;
    try { action(); } catch (const std::exception&) { refused = true; }
    h::Require(refused, label);
}
uint64_t Creation(HANDLE process) {
    FILETIME creation{}, exit{}, kernel{}, user{};
    h::Require(GetProcessTimes(process, &creation, &exit, &kernel, &user) != FALSE, "fixture creation query");
    return (uint64_t(creation.dwHighDateTime) << 32) | creation.dwLowDateTime;
}
struct Child {
    PROCESS_INFORMATION info{};
    explicit Child(const wchar_t* mode) {
        wchar_t image[32768]{};
        h::Require(GetModuleFileNameW(nullptr, image, 32768) != 0, "fixture image path");
        std::wstring command = L"\"" + std::wstring(image) + L"\" " + mode;
        STARTUPINFOW startup{}; startup.cb = sizeof startup;
        h::Require(CreateProcessW(image, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
            nullptr, nullptr, &startup, &info) != FALSE, "fixture child creation");
    }
    void Retire() {
        h::Require(TerminateProcess(info.hProcess, 0) && WaitForSingleObject(info.hProcess, 5000) == WAIT_OBJECT_0,
            "fixture child retirement");
    }
    ~Child() {
        if (WaitForSingleObject(info.hProcess, 0) == WAIT_TIMEOUT) {
            TerminateProcess(info.hProcess, 91); WaitForSingleObject(info.hProcess, 5000);
        }
        CloseHandle(info.hThread); CloseHandle(info.hProcess);
    }
};
std::string Intent(DWORD pid, uint64_t creation, bool legacy = false,
    const char* build = "40408", const char* executable = h::kExecutableDigest) {
    return "attempt pid=" + std::to_string(pid) + " creation=" + std::to_string(creation) +
        " build=" + build + " exeSha256=" + executable + " saveSha256=" + h::kDiagnosticDigest +
        (legacy ? "" : " saveBytes=12 grantId=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") +
        " site=1234 state=1000 field=120c old=3141 selected=55652 bytes=4\n";
}
std::wstring LegacyName() {
    const std::string name = std::string("company_bind_") + h::kDiagnosticDigest + "_55652.attempt";
    return std::wstring(name.begin(), name.end());
}
std::wstring LifetimeName(DWORD pid, uint64_t creation) {
    return L"company_bind_process_" + std::to_wstring(pid) + L"_" + std::to_wstring(creation) + L".attempt";
}
void WriteNew(const std::wstring& path, const std::string& bytes) {
    h::File file(CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH, nullptr));
    h::Require(file.handle != INVALID_HANDLE_VALUE, "fixture CREATE_NEW");
    DWORD written = 0;
    h::Require(WriteFile(file.handle, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) &&
        written == bytes.size() && FlushFileBuffers(file.handle), "fixture durable intent");
}
struct Directory {
    std::wstring profile, bridge;
    Directory() {
        static unsigned sequence = 0;
        wchar_t temp[32768]{};
        h::Require(GetTempPathW(32768, temp) != 0, "fixture temp directory");
        profile = std::wstring(temp) + L"TF3HistoryFixture-" + std::to_wstring(GetCurrentProcessId()) +
            L"-" + std::to_wstring(GetTickCount64()) + L"-" + std::to_wstring(++sequence);
        bridge = profile + L"\\tf3mp_status_1";
        h::Require(CreateDirectoryW(profile.c_str(), nullptr) && CreateDirectoryW(bridge.c_str(), nullptr),
            "fixture directory creation");
    }
};
void Run() {
    Child old(L"--child");
    const uint64_t creation = Creation(old.info.hProcess);
    const auto intent = Intent(old.info.dwProcessId, creation);
    const auto newBuildIntent = Intent(old.info.dwProcessId, creation, false,
        "25754343", h::kExecutableDigest25754343);
    const auto legacy = Intent(old.info.dwProcessId, creation, true);
    const auto name = LegacyName();
    const auto lifetime = LifetimeName(old.info.dwProcessId, creation);
    const std::string readback = "memory_readback selected=55652 bytes=4\n";
    h::Require(!h::Parse(name, legacy).released && !h::Parse(name, intent + readback).released,
        "legacy unknown must remain unknown");
    h::Require(h::Parse(lifetime, intent + readback + h::kTerminal).released, "terminal receipt parse");
    h::Require(h::Parse(lifetime, newBuildIntent + readback + h::kTerminal).released,
        "new recognized build/hash pair rejected");
    Refuses([&] { h::Parse(name, Intent(old.info.dwProcessId, creation, false,
        "40408", h::kExecutableDigest25754343)); }, "crossed old-build/new-hash pair accepted");
    Refuses([&] { h::Parse(name, Intent(old.info.dwProcessId, creation, false,
        "25754343", h::kExecutableDigest)); }, "crossed new-build/old-hash pair accepted");
    Refuses([&] { h::Parse(name, Intent(old.info.dwProcessId, creation, false,
        "25754344", h::kExecutableDigest25754343)); }, "unknown build/hash pair accepted");
    Refuses([&] { h::Parse(name, ""); }, "empty journal accepted");
    Refuses([&] { h::Parse(name, intent.substr(0, intent.size() - 1)); }, "truncated journal accepted");
    Refuses([&] { h::Parse(name, intent + "garbage\n"); }, "unknown outcome accepted");
    Refuses([&] { h::Parse(name, intent + readback + h::kTerminal); }, "legacy terminal accepted");
    Refuses([&] { h::Parse(lifetime, intent + h::kTerminal); }, "terminal before readback accepted");
    Refuses([&] { h::Parse(lifetime, intent + readback + readback); }, "duplicate readback accepted");
    Refuses([&] { h::Parse(lifetime, std::string(4097, 'x')); }, "oversized journal accepted");
    Refuses([&] { h::Parse(L"company_bind_process_1_2.attempt", intent); }, "filename mismatch accepted");
    Refuses([&] { h::Parse(name, intent.substr(0, intent.size() - 1) + " pid=1\n"); }, "duplicate key accepted");
    auto overflowing = intent;
    const size_t begin = overflowing.find("creation=") + 9;
    overflowing.replace(begin, overflowing.find(' ', begin) - begin, "18446744073709551616");
    Refuses([&] { h::Parse(name, overflowing); }, "overflow accepted");
    const auto record = h::Parse(name, intent);
    if (GetModuleHandleW(L"SbieDll.dll") == nullptr) {
        h::Require(!h::AbsentFromHostSnapshot(GetCurrentProcessId()), "snapshot omitted its current process");
        h::Require(!h::AbsentFromHostSnapshot(old.info.dwProcessId), "snapshot omitted live owned child");
        h::Require(h::AbsentFromHostSnapshot(MAXDWORD), "snapshot accepted impossible process identity");
    } else {
        Refuses([&] { h::AbsentFromHostSnapshot(MAXDWORD); }, "boxed snapshot accepted as host-wide");
    }
    Refuses([&] { h::RequireRetired(record); }, "alive historical process accepted");
    auto reused = record; --reused.creation;
    h::RequireRetired(reused); // Full FILETIME, including sub-millisecond bits.
    {
        // A recycled PID may belong to a process that permits identity queries
        // but not waits. Exercise that exact access boundary on our own child.
        BYTE everyone[SECURITY_MAX_SID_SIZE]{};
        DWORD everyoneBytes = sizeof everyone;
        h::Require(CreateWellKnownSid(WinWorldSid, nullptr, everyone, &everyoneBytes) != FALSE,
            "fixture world SID");
        alignas(ACL) BYTE queryAclBytes[sizeof(ACL) +
            2 * (sizeof(ACCESS_ALLOWED_ACE) + SECURITY_MAX_SID_SIZE)]{};
        auto* queryAcl = reinterpret_cast<ACL*>(queryAclBytes);
        h::Require(InitializeAcl(queryAcl, sizeof queryAclBytes, ACL_REVISION) &&
            AddAccessDeniedAce(queryAcl, ACL_REVISION, SYNCHRONIZE, everyone) &&
            AddAccessAllowedAce(queryAcl, ACL_REVISION, PROCESS_QUERY_LIMITED_INFORMATION, everyone),
            "fixture query-only ACL initialization");
        h::Require(SetSecurityInfo(old.info.hProcess, SE_KERNEL_OBJECT, DACL_SECURITY_INFORMATION,
            nullptr, nullptr, queryAcl, nullptr) == ERROR_SUCCESS, "fixture query-only ACL");
        h::File combined(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
            FALSE, old.info.dwProcessId));
        const DWORD combinedError = GetLastError();
        h::Require(!combined.handle && combinedError == ERROR_ACCESS_DENIED,
            "fixture query-only ACL did not deny synchronization");
        h::File query(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, old.info.dwProcessId));
        h::Require(query.handle && Creation(query.handle) == creation,
            "fixture query-only ACL did not permit exact creation query");
        Refuses([&] { h::RequireRetired(record); }, "query-only live historical process accepted");
        h::RequireRetired(reused); // A one-FILETIME-tick difference still proves another lifetime.
    }
    ACL deny{};
    h::Require(InitializeAcl(&deny, sizeof deny, ACL_REVISION) != FALSE, "fixture ACL initialization");
    h::Require(SetSecurityInfo(old.info.hProcess, SE_KERNEL_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &deny, nullptr) == ERROR_SUCCESS, "fixture deny-query ACL");
    std::string deniedQuery;
    try { h::RequireRetired(record); }
    catch (const std::exception& error) { deniedQuery = error.what(); }
    h::Require(SetSecurityInfo(old.info.hProcess, SE_KERNEL_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS, "fixture ACL restoration");
    h::Require(deniedQuery.find("pid=" + std::to_string(old.info.dwProcessId)) != std::string::npos &&
        deniedQuery.find("recordedCreation=" + std::to_string(creation)) != std::string::npos &&
        deniedQuery.find("win32=5") != std::string::npos,
        "inaccessible process error omitted denied identity or access-denied code");
    Directory directory;
    const std::wstring legacyPath = directory.bridge + L"\\" + name;
    WriteNew(legacyPath, legacy + readback);
    {
        h::Serialization serialization;
        h::History history(directory.profile);
        Refuses([&] { history.Qualify(); }, "alive history accepted");
        Child contender(L"--contend");
        h::Require(WaitForSingleObject(contender.info.hProcess, 5000) == WAIT_OBJECT_0, "contender timeout");
        DWORD result = 999;
        h::Require(GetExitCodeProcess(contender.info.hProcess, &result) && result == 0,
            "concurrent binder acquired mutex");
    }
    old.Retire();
    h::RequireRetired(record);
    for (const auto& bytes : {std::string(), std::string(4097, 'x'), legacy + "partial"}) {
        Directory invalid;
        WriteNew(invalid.bridge + L"\\" + name, bytes);
        h::History history(invalid.profile);
        Refuses([&] { history.Qualify(); }, "invalid disk journal accepted");
    }
    {
        Directory linked;
        const auto original = linked.bridge + L"\\" + name;
        WriteNew(original, legacy);
        h::Require(CreateHardLinkW((linked.profile + L"\\other-link").c_str(), original.c_str(), nullptr) != FALSE,
            "fixture hardlink creation");
        h::History history(linked.profile);
        Refuses([&] { history.Qualify(); }, "hardlinked evidence accepted");
    }
    {
        Directory bounded;
        for (size_t i = 1; i < h::kMaximumJournals; ++i) {
            std::string bytes = intent;
            const size_t selected = bytes.find("selected=55652");
            bytes.replace(selected, 14, "selected=" + std::to_string(i));
            const std::string filename = std::string("company_bind_") + h::kDiagnosticDigest + "_" +
                std::to_string(i) + ".attempt";
            WriteNew(bounded.bridge + L"\\" + std::wstring(filename.begin(), filename.end()), bytes);
        }
        h::History history(bounded.profile);
        history.Qualify();
        h::Require(history.journals == h::kMaximumJournals - 1 &&
            history.unknown == h::kMaximumJournals - 1,
            "below-bound unknown history was not fully counted");
    }
    {
        Directory full;
        for (size_t i = 1; i <= h::kMaximumJournals; ++i) {
            std::string bytes = intent;
            const size_t selected = bytes.find("selected=55652");
            bytes.replace(selected, 14, "selected=" + std::to_string(i));
            const std::string filename = std::string("company_bind_") + h::kDiagnosticDigest + "_" +
                std::to_string(i) + ".attempt";
            WriteNew(full.bridge + L"\\" + std::wstring(filename.begin(), filename.end()), bytes);
        }
        h::History history(full.profile);
        Refuses([&] { history.Qualify(); }, "exhausted journal capacity accepted");
        h::Require(history.journals == h::kMaximumJournals, "history failed before the capacity boundary");
    }
    {
        h::Serialization serialization;
        h::History history(directory.profile);
        history.Qualify();
        h::Require(history.journals == 1 && history.unknown == 1, "retired unknown lost");
        // Reader handles prevent modification/deletion of qualifying evidence.
        Refuses([&] { WriteNew(legacyPath, "replacement\n"); }, "legacy barrier replaced");
        const uint64_t currentCreation = Creation(GetCurrentProcess());
        const auto processPath = history.ProcessPath(GetCurrentProcessId(), currentCreation);
        WriteNew(processPath, Intent(GetCurrentProcessId(), currentCreation));
        Refuses([&] { WriteNew(processPath, Intent(GetCurrentProcessId(), currentCreation)); },
            "second attempt in process lifetime accepted");
        for (const auto& key : {std::string("grantId="), std::string("saveSha256="), std::string("selected=")}) {
            std::string changed = Intent(GetCurrentProcessId(), currentCreation);
            const size_t at = changed.find(key) + key.size();
            changed[at] = changed[at] == 'a' ? 'b' : 'a';
            if (key == "selected=") changed[at] = '6';
            Refuses([&] { WriteNew(processPath, changed); }, "changed grant/save/company bypassed process latch");
        }
        h::History next(directory.profile);
        Refuses([&] { next.Qualify(); }, "same lifetime retry passed qualification");
    }
    printf("history_fixture_pass: strict_parser=13 alive=refused retired_unknown=preserved "
        "full_filetime=checked query_only_same=refused query_only_reused=accepted "
        "access_denied=refused concurrency=refused create_new=one_lifetime "
        "grant_save_company_variations=refused disk_bounds=checked hardlinks=refused\n");
    printf("fixture_evidence=%ls\n", directory.profile.c_str());
}
} // namespace
int wmain(int argc, wchar_t** argv) {
    if (argc == 2 && !wcscmp(argv[1], L"--child")) { Sleep(30000); return 0; }
    if (argc == 2 && !wcscmp(argv[1], L"--contend")) {
        try { h::Serialization serialization; return 8; } catch (...) { return 0; }
    }
    try { h::Require(argc == 1, "fixture takes no arguments"); Run(); return 0; }
    catch (const std::exception& error) { fprintf(stderr, "%s\n", error.what()); return 1; }
}
