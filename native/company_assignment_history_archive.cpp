// One-record maintenance for a RELEASED, retired external-company process journal.
// This executable never mutates a game process, save, or grant ledger.
#define WIN32_LEAN_AND_MEAN
#include "company_assignment_history.h"
#include <bcrypt.h>
#include <array>
#include <cstddef>
#include <cstdio>
#include <cstring>
#include <vector>

namespace h = tf3::company_assignment_history;
namespace {
std::string Ascii(const std::wstring& wide) {
    std::string result;
    for (wchar_t ch : wide) {
        h::Require(ch >= 0x21 && ch <= 0x7e, "non-ASCII maintenance argument");
        result.push_back(static_cast<char>(ch));
    }
    return result;
}
std::string Sha256(const std::string& bytes) {
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    h::Require(BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) >= 0,
        "journal SHA256 provider unavailable");
    std::array<BYTE, 32> digest{};
    const NTSTATUS status = BCryptHash(algorithm, nullptr, 0,
        reinterpret_cast<PUCHAR>(const_cast<char*>(bytes.data())),
        static_cast<ULONG>(bytes.size()), digest.data(), static_cast<ULONG>(digest.size()));
    const NTSTATUS closed = BCryptCloseAlgorithmProvider(algorithm, 0);
    h::Require(status >= 0 && closed >= 0, "journal SHA256 failed");
    constexpr char hex[] = "0123456789abcdef";
    std::string result;
    result.reserve(64);
    for (BYTE byte : digest) { result.push_back(hex[byte >> 4]); result.push_back(hex[byte & 15]); }
    return result;
}
std::wstring ExtendedPath(const std::wstring& path) {
    h::Require(path.size() >= 3 && path[1] == L':' && path[2] == L'\\' &&
        path.size() < 32760, "canonical archive path required");
    // Extended DOS paths bypass Win32's trailing-dot/space normalization.
    // Refuse components that could name a different object than History pinned.
    size_t start = 3;
    while (start < path.size()) {
        const size_t end = path.find(L'\\', start);
        const size_t stop = end == std::wstring::npos ? path.size() : end;
        h::Require(stop > start && path[stop - 1] != L'.' && path[stop - 1] != L' ' &&
            path.substr(start, stop - start) != L"..", "ambiguous archive path component");
        if (end == std::wstring::npos) break;
        start = end + 1;
    }
    return L"\\\\?\\" + path;
}
bool Exists(const std::wstring& path) {
    const DWORD attributes = GetFileAttributesW(ExtendedPath(path).c_str());
    if (attributes != INVALID_FILE_ATTRIBUTES) return true;
    h::Require(GetLastError() == ERROR_FILE_NOT_FOUND, "journal path inspection failed");
    return false;
}
struct Evidence {
    BY_HANDLE_FILE_INFORMATION identity{};
    std::string bytes;
};
Evidence ReadEvidence(HANDLE handle, const std::wstring& originalName,
    const std::string& expectedSha256) {
    Evidence evidence{};
    h::Require(handle && handle != INVALID_HANDLE_VALUE &&
        GetFileInformationByHandle(handle, &evidence.identity) &&
        !(evidence.identity.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) &&
        evidence.identity.nNumberOfLinks == 1 && !evidence.identity.nFileSizeHigh &&
        evidence.identity.nFileSizeLow && evidence.identity.nFileSizeLow <= h::kMaximumJournalBytes,
        "selected journal unreadable, redirected, linked, empty or oversized");
    evidence.bytes.resize(evidence.identity.nFileSizeLow);
    DWORD read = 0;
    LARGE_INTEGER zero{};
    h::Require(SetFilePointerEx(handle, zero, nullptr, FILE_BEGIN) != FALSE,
        "selected journal seek failed");
    h::Require(ReadFile(handle, evidence.bytes.data(),
        evidence.identity.nFileSizeLow, &read, nullptr) && read == evidence.identity.nFileSizeLow,
        "selected journal read incomplete");
    const h::Record record = h::Parse(originalName, evidence.bytes);
    h::Require(record.released, "selected process journal is not RELEASED");
    h::RequireRetired(record);
    h::Require(Sha256(evidence.bytes) == expectedSha256, "selected journal SHA256 mismatch");
    return evidence;
}
void RenameNoReplace(HANDLE source, const std::wstring& destination) {
    const std::wstring extended = ExtendedPath(destination);
    const size_t nameBytes = extended.size() * sizeof(wchar_t);
    h::Require(nameBytes <= MAXDWORD, "archive destination too long");
    // FileNameLength excludes the trailing NUL, but Windows still expects
    // the buffer to contain one for this handle-rename information class.
    std::vector<BYTE> storage(offsetof(FILE_RENAME_INFO, FileName) + nameBytes + sizeof(wchar_t));
    auto* request = reinterpret_cast<FILE_RENAME_INFO*>(storage.data());
    request->ReplaceIfExists = FALSE;
    request->RootDirectory = nullptr;
    request->FileNameLength = static_cast<DWORD>(nameBytes);
    std::memcpy(request->FileName, extended.data(), nameBytes);
    h::Require(SetFileInformationByHandle(source, FileRenameInfo, request,
        static_cast<DWORD>(storage.size())) != FALSE, "collision or journal archive rename failed");
}
bool SameFile(const BY_HANDLE_FILE_INFORMATION& a, const BY_HANDLE_FILE_INFORMATION& b) {
    return a.dwVolumeSerialNumber == b.dwVolumeSerialNumber &&
        a.nFileIndexHigh == b.nFileIndexHigh && a.nFileIndexLow == b.nFileIndexLow;
}
struct Result { bool alreadyArchived; std::wstring archiveName; size_t activeJournals; };
Result ArchiveOne(const std::wstring& profile, const std::wstring& journalName,
    const std::string& expectedSha256) {
    const std::wstring prefix = L"company_bind_process_", suffix = L".attempt";
    h::Require(journalName.size() > prefix.size() + suffix.size() &&
        journalName.compare(0, prefix.size(), prefix) == 0 &&
        journalName.compare(journalName.size() - suffix.size(), suffix.size(), suffix) == 0 &&
        journalName.find_first_of(L"\\/:*?\"<>|") == std::wstring::npos,
        "explicit process journal filename required");
    (void)Ascii(journalName);
    h::Require(h::Digest(expectedSha256, 64), "lowercase SHA256 argument required");
    h::Serialization serialization;
    h::History history(profile);
    history.Scan(&journalName); // Full bounded scan and pinned candidate; no capacity check.
    const std::wstring archiveName = L"archived_" + journalName + L"." +
        std::wstring(expectedSha256.begin(), expectedSha256.end()) + L".archive";
    const std::wstring sourcePath = history.bridge + L"\\" + journalName;
    const std::wstring destination = history.bridge + L"\\" + archiveName;
    if (!Exists(sourcePath)) {
        h::Require(Exists(destination), "explicit journal and its archive are absent");
        h::File archived(CreateFileW(ExtendedPath(destination).c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
            OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
        (void)ReadEvidence(archived.handle, journalName, expectedSha256);
        return {true, archiveName, history.journals};
    }
    h::Require(history.ArchiveCandidate() != INVALID_HANDLE_VALUE,
        "selected journal was not part of the validated scan");
    h::Require(!Exists(destination), "archive destination already exists");
    Evidence before = ReadEvidence(history.ArchiveCandidate(), journalName, expectedSha256);
    RenameNoReplace(history.ArchiveCandidate(), destination);
    h::Require(!Exists(sourcePath), "source journal still present after archive rename");
    h::File archived(CreateFileW(ExtendedPath(destination).c_str(), GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    Evidence after = ReadEvidence(archived.handle, journalName, expectedSha256);
    h::Require(SameFile(before.identity, after.identity) && before.bytes == after.bytes,
        "archive identity or bytes changed after rename");
    return {false, archiveName, history.journals};
}
} // namespace
int wmain(int argc, wchar_t** argv) {
    try {
        h::Require(argc == 7 && wcscmp(argv[1], L"--profile-dir") == 0 &&
            wcscmp(argv[3], L"--journal-name") == 0 &&
            wcscmp(argv[5], L"--sha256") == 0,
            "usage: --profile-dir ABSOLUTE --journal-name NAME --sha256 LOWERCASE_HEX");
        const Result result = ArchiveOne(argv[2], argv[4], Ascii(argv[6]));
        printf("{\"event\":\"company_journal_archive_verified\",\"alreadyArchived\":%s,"
            "\"activeJournalsBefore\":%zu,\"journal\":\"%s\",\"archive\":\"%s\","
            "\"sha256\":\"%s\",\"retired\":true,\"released\":true}\n",
            result.alreadyArchived ? "true" : "false", result.activeJournals,
            Ascii(argv[4]).c_str(), Ascii(result.archiveName).c_str(), Ascii(argv[6]).c_str());
        h::Require(fflush(stdout) == 0, "archive verification receipt flush failed");
        return 0;
    } catch (const std::exception& error) {
        fprintf(stderr, "%s\n", error.what());
        return 1;
    }
}
