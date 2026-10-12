#pragma once
// Persistent safety barriers for the external company binder. No game ABI here.
#include <windows.h>
#include <tlhelp32.h>
#include <cstdint>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
#include "company_assignment_history_wmi.h"

namespace tf3::company_assignment_history {
constexpr size_t kMaximumJournals = 256;
constexpr DWORD kMaximumJournalBytes = 4096;
constexpr char kExecutableDigest[] = "de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2";
constexpr char kExecutableDigest25754343[] = "74861ac43b041aebc5179154345b3cf1ec83154c8e6cc58e0d9e02ff5fa602e4";
constexpr char kDiagnosticDigest[] = "ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5";
constexpr char kTerminal[] = "released restorationVerified=1 detached=1 targetAlive=1\n";
inline void Require(bool value, const char* reason) {
    if (!value) throw std::runtime_error(std::string("assignment history: ") + reason +
        " (win32=" + std::to_string(GetLastError()) + ")");
}
struct File {
    HANDLE handle;
    explicit File(HANDLE value) : handle(value) {}
    ~File() { if (handle && handle != INVALID_HANDLE_VALUE) CloseHandle(handle); }
    File(const File&) = delete;
    File& operator=(const File&) = delete;
};
// Serialize every cooperating binder, including read-only qualification, across
// profiles and Windows sessions. Access failures and contention fail closed.
struct Serialization {
    File mutex{CreateMutexW(nullptr, FALSE, L"Global\\TF3CompanyAssignmentHistory40408")};
    bool owned = false;
    Serialization() {
        Require(mutex.handle != nullptr, "cannot open serialization mutex");
        const DWORD wait = WaitForSingleObject(mutex.handle, 0);
        owned = wait == WAIT_OBJECT_0 || wait == WAIT_ABANDONED;
        // Abandonment does not erase disk evidence. Scan it normally while owned.
        Require(owned, "another binder is qualifying or assigning");
    }
    ~Serialization() { if (owned) ReleaseMutex(mutex.handle); }
};
inline uint64_t Number(const std::string& text, uint64_t maximum, unsigned base = 10) {
    Require(!text.empty() && (text.size() == 1 || text.front() != '0'), "noncanonical number");
    uint64_t result = 0;
    for (char ch : text) {
        const unsigned digit = ch >= '0' && ch <= '9' ? ch - '0' :
            ch >= 'a' && ch <= 'f' ? ch - 'a' + 10 : 255;
        Require(digit < base && digit <= maximum && result <= (maximum - digit) / base,
            "number invalid or overflowing");
        result = result * base + digit;
    }
    Require(result != 0, "zero identity or field");
    return result;
}
inline bool Digest(const std::string& value, size_t size) {
    if (value.size() != size) return false;
    for (char ch : value) if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) return false;
    return true;
}
struct Record {
    DWORD pid = 0;
    uint64_t creation = 0;
    bool released = false;
};
inline Record Parse(const std::wstring& filename, const std::string& text) {
    Require(!text.empty() && text.size() <= kMaximumJournalBytes && text.back() == '\n',
        "empty, oversized or truncated journal");
    for (unsigned char ch : text) Require(ch == '\n' || (ch >= 0x20 && ch <= 0x7e), "non-ASCII journal");
    const size_t firstEnd = text.find('\n');
    const std::string first = text.substr(0, firstEnd);
    Require(first.compare(0, 8, "attempt ") == 0, "unknown intent record");
    std::map<std::string, std::string> fields;
    size_t start = 8;
    while (start < first.size()) {
        const size_t end = first.find(' ', start);
        const std::string token = first.substr(start, end == std::string::npos ? end : end - start);
        const size_t equals = token.find('=');
        Require(equals != std::string::npos && equals && equals + 1 < token.size() &&
            token.find('=', equals + 1) == std::string::npos &&
            fields.emplace(token.substr(0, equals), token.substr(equals + 1)).second,
            "invalid or duplicate intent field");
        if (end == std::string::npos) break;
        start = end + 1;
        Require(start < first.size(), "trailing intent space");
    }
    const bool extended = fields.count("saveBytes") || fields.count("grantId");
    Require(fields.size() == (extended ? 13u : 11u), "unknown or missing intent fields");
    const auto get = [&](const char* key) -> const std::string& {
        const auto found = fields.find(key);
        Require(found != fields.end(), "missing required intent field");
        return found->second;
    };
    Record record{};
    record.pid = static_cast<DWORD>(Number(get("pid"), MAXDWORD));
    record.creation = Number(get("creation"), UINT64_MAX);
    FILETIME now{}; GetSystemTimeAsFileTime(&now);
    const uint64_t current = (uint64_t(now.dwHighDateTime) << 32) | now.dwLowDateTime;
    Require(record.creation >= 116444736000000000ULL && record.creation <= current,
        "creation time outside valid FILETIME history");
    const std::string& build = get("build");
    const std::string& executable = get("exeSha256");
    const bool recognizedPair = (build == "40408" && executable == kExecutableDigest) ||
        (build == "25754343" && executable == kExecutableDigest25754343);
    Require(recognizedPair && Digest(get("saveSha256"), 64) && get("bytes") == "4",
        "unrecognized build or save evidence");
    const uint64_t old = Number(get("old"), INT32_MAX);
    const uint64_t selected = Number(get("selected"), INT32_MAX);
    Require(old != selected, "same old and selected company");
    (void)Number(get("site"), UINT64_MAX, 16);
    const uint64_t state = Number(get("state"), UINT64_MAX - 0x20c, 16);
    Require(!(state & 7) && Number(get("field"), UINT64_MAX, 16) == state + 0x20c,
        "inconsistent recorded field");
    if (extended) {
        (void)Number(get("saveBytes"), UINT64_MAX);
        Require(Digest(get("grantId"), 32), "invalid recorded grant");
    } else {
        Require(get("saveSha256") == kDiagnosticDigest && old == 3141 && selected == 55652,
            "unrecognized diagnostic journal");
    }
    const std::string legacy = "company_bind_" + get("saveSha256") + "_" + get("selected") + ".attempt";
    const std::string lifetime = "company_bind_process_" + get("pid") + "_" + get("creation") + ".attempt";
    const bool processJournal = filename == std::wstring(lifetime.begin(), lifetime.end());
    Require(processJournal || filename == std::wstring(legacy.begin(), legacy.end()),
        "journal filename does not match its identity");
    Require(!processJournal || extended, "process journal lacks save evidence");
    const std::string readback = "memory_readback selected=" + get("selected") + " bytes=4\n";
    const std::string tail = text.substr(firstEnd + 1);
    record.released = processJournal && tail == readback + kTerminal;
    Require(tail.empty() || tail == readback || record.released, "unknown, partial or reordered outcome record");
    return record;
}
// Only a nonexistent PID, a signalled process, or a different full creation
// FILETIME proves retirement. Access denied, missing query rights and wait
// failures never count as retirement. PID reuse is explicitly distinguished.
inline bool AbsentFromHostSnapshot(DWORD pid) {
    // Sandboxie can filter process enumeration. A boxed view cannot establish
    // host-wide absence, even when selected host processes remain visible.
    Require(GetModuleHandleW(L"SbieDll.dll") == nullptr,
        "unfiltered host process snapshot required");
    File snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
    Require(snapshot.handle != INVALID_HANDLE_VALUE, "process snapshot unavailable");
    PROCESSENTRY32W entry{}; entry.dwSize = sizeof entry;
    Require(Process32FirstW(snapshot.handle, &entry) != FALSE, "process snapshot empty or unavailable");
    bool found = false, current = false;
    size_t count = 0;
    do {
        Require(++count <= 65536, "process snapshot bound exceeded");
        found = found || entry.th32ProcessID == pid;
        current = current || entry.th32ProcessID == GetCurrentProcessId();
    } while (Process32NextW(snapshot.handle, &entry));
    Require(GetLastError() == ERROR_NO_MORE_FILES && current,
        "process snapshot incomplete or filtered");
    return !found;
}
inline void RequireRetired(const Record& record) {
    File process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, record.pid));
    if (!process.handle) {
        const DWORD error = GetLastError();
        if (error == ERROR_ACCESS_DENIED) {
            // A reused PID may deny waiting while permitting a creation-time
            // query. Only a different full lifetime proves retirement here.
            File query(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, record.pid));
            if (query.handle) {
                FILETIME creation{}, exit{}, kernel{}, user{};
                Require(GetProcessTimes(query.handle, &creation, &exit, &kernel, &user) != FALSE,
                    "query-only historical process creation unavailable");
                const uint64_t actual = (uint64_t(creation.dwHighDateTime) << 32) | creation.dwLowDateTime;
                Require(actual != record.creation, "query-only historical process lifetime still matches");
                return;
            }
        }
        if (error != ERROR_INVALID_PARAMETER) {
            if (error == ERROR_ACCESS_DENIED && GetModuleHandleW(L"SbieDll.dll") == nullptr) {
                if (AbsentFromHostSnapshot(record.pid)) return;
                // A present PID can be inaccessible through both process opens.
                // Only an independently queried, later creation interval proves
                // that its current lifetime is not the recorded lifetime.
                wmi::LifetimeInterval lifetime{};
                if (wmi::QueryCreation(record.pid, lifetime) && wmi::ProvesLater(record.creation, lifetime))
                    return;
            }
            throw std::runtime_error("assignment history: historical process is inaccessible or unqueryable pid=" +
                std::to_string(record.pid) + " recordedCreation=" + std::to_string(record.creation) +
                " (win32=" + std::to_string(error) + ")");
        }
        return;
    }
    FILETIME creation{}, exit{}, kernel{}, user{};
    Require(GetProcessTimes(process.handle, &creation, &exit, &kernel, &user) != FALSE,
        "historical process creation unavailable");
    const uint64_t actual = (uint64_t(creation.dwHighDateTime) << 32) | creation.dwLowDateTime;
    const DWORD state = WaitForSingleObject(process.handle, 0);
    Require(state == WAIT_OBJECT_0 || state == WAIT_TIMEOUT, "historical process state unavailable");
    Require(actual != record.creation || state == WAIT_OBJECT_0, "historical process lifetime still alive");
}
class History final {
    std::vector<std::unique_ptr<File>> held_;
    HANDLE archiveCandidate_ = INVALID_HANDLE_VALUE;
    bool scanned_ = false;
public:
    std::wstring bridge;
    size_t journals = 0, unknown = 0;
    explicit History(const std::wstring& profile) {
        Require(profile.size() >= 3 && profile.size() < 32000 && profile[1] == L':' &&
            profile[2] == L'\\' && profile.find(L'/') == std::wstring::npos,
            "canonical absolute profile required");
        std::wstring canonical(32768, L'\0');
        const DWORD length = GetFullPathNameW(profile.c_str(), static_cast<DWORD>(canonical.size()), canonical.data(), nullptr);
        Require(length && length < canonical.size(), "profile resolution failed");
        canonical.resize(length);
        Require(canonical == profile, "noncanonical profile path");
        bridge = profile + (profile.back() == L'\\' ? L"tf3mp_status_1" : L"\\tf3mp_status_1");
        // Pin every ancestor against deletion/redirection while qualification and
        // assignment run. Final-component OPEN_REPARSE_POINT prevents following it.
        for (size_t end = 3; end <= bridge.size();) {
            const std::wstring directory = bridge.substr(0, end);
            auto handle = std::make_unique<File>(CreateFileW(directory.c_str(), FILE_READ_ATTRIBUTES,
                FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
            BY_HANDLE_FILE_INFORMATION info{};
            const std::string reason = "history directory missing or redirected at prefix length " +
                std::to_string(end);
            Require(handle->handle != INVALID_HANDLE_VALUE && GetFileInformationByHandle(handle->handle, &info) &&
                (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) &&
                !(info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT), reason.c_str());
            held_.push_back(std::move(handle));
            if (end == bridge.size()) break;
            end = bridge.find(L'\\', end + 1);
            if (end == std::wstring::npos) end = bridge.size();
        }
    }
    // Maintenance may inspect a full history. It does not authorize another
    // assignment; only Qualify applies the one-free-slot admission rule.
    // Every journal remains pinned. Only the explicit archive candidate gets
    // DELETE access, allowing a rename through that same validated handle.
    void Scan(const std::wstring* archiveName = nullptr) {
        Require(!scanned_, "history was already scanned");
        scanned_ = true;
        WIN32_FIND_DATAW entry{};
        HANDLE search = FindFirstFileW((bridge + L"\\company_bind_*").c_str(), &entry);
        if (search == INVALID_HANDLE_VALUE) {
            Require(GetLastError() == ERROR_FILE_NOT_FOUND, "history enumeration unavailable");
            return;
        }
        try {
            do {
                Require(++journals <= kMaximumJournals, "journal history bound exceeded");
                Require(!(entry.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)),
                    "journal is redirected or not a regular file");
                const bool selected = archiveName && *archiveName == entry.cFileName;
                auto file = std::make_unique<File>(CreateFileW((bridge + L"\\" + entry.cFileName).c_str(),
                    GENERIC_READ | (selected ? DELETE : 0), FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                    FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
                BY_HANDLE_FILE_INFORMATION info{};
                Require(file->handle != INVALID_HANDLE_VALUE && GetFileInformationByHandle(file->handle, &info) &&
                    !(info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) &&
                    info.nNumberOfLinks == 1 && !info.nFileSizeHigh && info.nFileSizeLow &&
                    info.nFileSizeLow <= kMaximumJournalBytes, "journal unreadable, linked, empty or oversized");
                std::string bytes(info.nFileSizeLow, '\0');
                DWORD read = 0;
                Require(ReadFile(file->handle, bytes.data(), info.nFileSizeLow, &read, nullptr) &&
                    read == info.nFileSizeLow, "journal read incomplete");
                const Record record = Parse(entry.cFileName, bytes);
                RequireRetired(record);
                if (!record.released) ++unknown;
                if (selected) archiveCandidate_ = file->handle;
                held_.push_back(std::move(file));
            } while (FindNextFileW(search, &entry));
            Require(GetLastError() == ERROR_NO_MORE_FILES, "history enumeration incomplete");
        } catch (...) { FindClose(search); throw; }
        FindClose(search);
    }
    void Qualify() {
        Scan();
        Require(journals < kMaximumJournals, "no capacity for another persistent journal");
    }
    HANDLE ArchiveCandidate() const { return archiveCandidate_; }
    std::wstring ProcessPath(DWORD pid, uint64_t creation) const {
        return bridge + L"\\company_bind_process_" + std::to_wstring(pid) + L"_" +
            std::to_wstring(creation) + L".attempt";
    }
};
} // namespace tf3::company_assignment_history
