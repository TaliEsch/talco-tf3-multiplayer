#include "company_load_gate.h"

#include <wincrypt.h>
#include <algorithm>
#include <array>
#include <cctype>
#include <vector>

namespace tf3::company_load_gate {
namespace {
constexpr uint64_t kMaxExistingLog = 256ULL * 1024 * 1024;
constexpr uint64_t kMaxNewLog = 1024ULL * 1024;
constexpr char kLoadMarker[] = "Loading game from file ";
constexpr char kProductionName[] = "tf3mp_disposable_43b49d368fbbd409ae2614ada7b0c757";
constexpr char kProductionDigest[] = "ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5";
constexpr uint64_t kProductionBytes = 87719389;

bool Fail(std::wstring* error, const wchar_t* reason) {
    if (error) *error = reason;
    return false;
}

struct ScopedHandle {
    HANDLE value = INVALID_HANDLE_VALUE;
    explicit ScopedHandle(HANDLE h = INVALID_HANDLE_VALUE) : value(h) {}
    ~ScopedHandle() { if (value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    ScopedHandle(const ScopedHandle&) = delete;
    ScopedHandle& operator=(const ScopedHandle&) = delete;
};

bool CanonicalAbsolute(const std::wstring& path) {
    if (path.empty() || path.find(L'/') != std::wstring::npos) return false;
    const bool drive = path.size() >= 3 &&
        ((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')) &&
        path[1] == L':' && path[2] == L'\\';
    const bool unc = path.rfind(L"\\\\", 0) == 0;
    if (!drive && !unc) return false;
    const DWORD needed = GetFullPathNameW(path.c_str(), 0, nullptr, nullptr);
    if (!needed || needed > 32767) return false;
    std::wstring full(needed, L'\0');
    const DWORD written = GetFullPathNameW(path.c_str(), needed, full.data(), nullptr);
    if (!written || written >= needed) return false;
    full.resize(written);
    return CompareStringOrdinal(path.c_str(), -1, full.c_str(), -1, TRUE) == CSTR_EQUAL;
}

HANDLE OpenRead(const std::wstring& path, bool directory = false) {
    return CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                       nullptr, OPEN_EXISTING, directory ? FILE_FLAG_BACKUP_SEMANTICS : FILE_ATTRIBUTE_NORMAL,
                       nullptr);
}

bool Identity(HANDLE file, DWORD* volume, uint64_t* index) {
    BY_HANDLE_FILE_INFORMATION info{};
    if (!GetFileInformationByHandle(file, &info)) return false;
    *volume = info.dwVolumeSerialNumber;
    *index = (static_cast<uint64_t>(info.nFileIndexHigh) << 32) | info.nFileIndexLow;
    return true;
}

bool SameIdentity(HANDLE file, DWORD volume, uint64_t index) {
    DWORD foundVolume = 0;
    uint64_t foundIndex = 0;
    return Identity(file, &foundVolume, &foundIndex) && foundVolume == volume && foundIndex == index;
}

bool Size(HANDLE file, uint64_t* size) {
    LARGE_INTEGER length{};
    if (!GetFileSizeEx(file, &length) || length.QuadPart < 0) return false;
    *size = static_cast<uint64_t>(length.QuadPart);
    return true;
}

bool Seek(HANDLE file, uint64_t offset) {
    LARGE_INTEGER target{};
    target.QuadPart = static_cast<LONGLONG>(offset);
    return SetFilePointerEx(file, target, nullptr, FILE_BEGIN) != 0;
}

bool HashBytes(HANDLE file, uint64_t length, std::string* digest) {
    HCRYPTPROV provider = 0;
    HCRYPTHASH hash = 0;
    if (!CryptAcquireContextW(&provider, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) return false;
    const bool created = CryptCreateHash(provider, CALG_SHA_256, 0, 0, &hash) != 0;
    if (!created) { CryptReleaseContext(provider, 0); return false; }
    bool ok = Seek(file, 0);
    std::array<BYTE, 64 * 1024> block{};
    uint64_t left = length;
    while (ok && left) {
        const DWORD requested = static_cast<DWORD>(std::min<uint64_t>(left, block.size()));
        DWORD read = 0;
        ok = ReadFile(file, block.data(), requested, &read, nullptr) && read == requested &&
             CryptHashData(hash, block.data(), read, 0);
        left -= read;
    }
    BYTE bytes[32]{};
    DWORD count = sizeof bytes;
    ok = ok && CryptGetHashParam(hash, HP_HASHVAL, bytes, &count, 0) && count == sizeof bytes;
    if (ok) {
        constexpr char digits[] = "0123456789abcdef";
        digest->clear();
        for (BYTE byte : bytes) { digest->push_back(digits[byte >> 4]); digest->push_back(digits[byte & 15]); }
    }
    CryptDestroyHash(hash);
    CryptReleaseContext(provider, 0);
    return ok;
}

bool ReadExact(HANDLE file, uint64_t offset, uint64_t length, std::string* result) {
    if (!Seek(file, offset)) return false;
    result->resize(static_cast<size_t>(length));
    size_t pos = 0;
    while (pos < result->size()) {
        DWORD read = 0;
        const DWORD requested = static_cast<DWORD>(std::min<size_t>(result->size() - pos, 64 * 1024));
        if (!ReadFile(file, result->data() + pos, requested, &read, nullptr) || read != requested) return false;
        pos += read;
    }
    return true;
}

bool Tf3LoadPayloadOffset(const std::string& line, size_t* payload) {
    // Observed TF3 40408 stdout shape:
    // [2026-09-28 14:51:19Z - MESSAGE  - Load Game Pool 1 - Main           ]  Loading game from file ...
    if (line.size() < 24 || line[0] != '[' || line[5] != '-' || line[8] != '-' ||
        line[11] != ' ' || line[14] != ':' || line[17] != ':' || line[20] != 'Z') return false;
    for (size_t i : {1u, 2u, 3u, 4u, 6u, 7u, 9u, 10u, 12u, 13u, 15u, 16u, 18u, 19u})
        if (!std::isdigit(static_cast<unsigned char>(line[i]))) return false;
    const size_t close = line.find(']', 21);
    if (close == std::string::npos || close + 3 > line.size() ||
        line[close + 1] != ' ' || line[close + 2] != ' ') return false;
    std::string origin = line.substr(21, close - 21);
    while (!origin.empty() && origin.back() == ' ') origin.pop_back();
    if (origin != " - MESSAGE  - Load Game Pool 1 - Main") return false;
    *payload = close + 3;
    return true;
}

bool ValidName(const std::string& name) {
    if (name.empty() || name.size() > 128) return false;
    for (unsigned char c : name)
        if (!(std::isalnum(c) || c == '_' || c == '-')) return false;
    return true;
}

bool ValidDigest(const std::string& digest) {
    if (digest.size() != 64) return false;
    for (char c : digest) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
    return true;
}
} // namespace

Gate::~Gate() { Close(); }

void Gate::Close() {
    if (profile_ != INVALID_HANDLE_VALUE) CloseHandle(profile_);
    if (saveDirectory_ != INVALID_HANDLE_VALUE) CloseHandle(saveDirectory_);
    if (log_ != INVALID_HANDLE_VALUE) CloseHandle(log_);
    if (save_ != INVALID_HANDLE_VALUE) CloseHandle(save_);
    profile_ = saveDirectory_ = log_ = save_ = INVALID_HANDLE_VALUE;
    armed_ = false;
}

bool Gate::AttachProduction(const std::wstring& profile, const std::wstring& save,
                            bool mainMenuConfirmed, std::wstring* error) {
    return Attach(profile, save, kProductionName, kProductionBytes, kProductionDigest,
                  mainMenuConfirmed, error);
}

#ifdef TF3_COMPANY_GATE_TESTING
bool Gate::AttachFixture(const std::wstring& profile, const std::wstring& save,
                         const std::string& name, uint64_t bytes, const std::string& digest,
                         bool mainMenuConfirmed, std::wstring* error) {
    return Attach(profile, save, name, bytes, digest, mainMenuConfirmed, error);
}
#endif

bool Gate::Attach(const std::wstring& profile, const std::wstring& save,
                  const std::string& name, uint64_t bytes, const std::string& digest,
                  bool mainMenuConfirmed, std::wstring* error) {
    if (armed_ || spent_) return Fail(error, L"gate is already armed or spent");
    if (!mainMenuConfirmed) return Fail(error, L"main-menu state was not confirmed");
    if (!CanonicalAbsolute(profile) || !CanonicalAbsolute(save) || !ValidName(name) ||
        !ValidDigest(digest)) return Fail(error, L"noncanonical path or invalid expectation");
    const std::wstring expectedFile = std::wstring(name.begin(), name.end()) + L".sav";
    const size_t slash = save.find_last_of(L'\\');
    if (slash == std::wstring::npos || save.substr(slash + 1) != expectedFile)
        return Fail(error, L"save filename does not match the expected disposable save");
    const std::wstring saveDirectory = profile + (profile.back() == L'\\' ? L"save" : L"\\save");
    if (CompareStringOrdinal(save.substr(0, slash).c_str(), -1,
                             saveDirectory.c_str(), -1, TRUE) != CSTR_EQUAL)
        return Fail(error, L"save is not directly under the selected profile save directory");
    const DWORD saveDirectoryAttributes = GetFileAttributesW(saveDirectory.c_str());
    if (saveDirectoryAttributes == INVALID_FILE_ATTRIBUTES ||
        !(saveDirectoryAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
        (saveDirectoryAttributes & FILE_ATTRIBUTE_REPARSE_POINT))
        return Fail(error, L"save directory is missing, invalid, or redirected");

    profilePath_ = profile;
    saveDirectoryPath_ = saveDirectory;
    logPath_ = profile + (profile.back() == L'\\' ? L"crash_dump\\stdout.txt" : L"\\crash_dump\\stdout.txt");
    savePath_ = save;
    profile_ = OpenRead(profilePath_, true);
    saveDirectory_ = OpenRead(saveDirectoryPath_, true);
    log_ = OpenRead(logPath_);
    save_ = OpenRead(savePath_);
    if (profile_ == INVALID_HANDLE_VALUE || saveDirectory_ == INVALID_HANDLE_VALUE ||
        log_ == INVALID_HANDLE_VALUE || save_ == INVALID_HANDLE_VALUE) {
        Close(); return Fail(error, L"profile, stdout.txt, or save cannot be opened");
    }
    const DWORD attributes = GetFileAttributesW(profilePath_.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES || !(attributes & FILE_ATTRIBUTE_DIRECTORY) ||
        !Identity(profile_, &profileVolume_, &profileFileId_) ||
        !Identity(saveDirectory_, &saveDirectoryVolume_, &saveDirectoryFileId_) ||
        !Identity(log_, &logVolume_, &logFileId_) ||
        !Identity(save_, &saveVolume_, &saveFileId_)) {
        Close(); return Fail(error, L"file identity unavailable");
    }
    uint64_t logSize = 0, saveSize = 0;
    if (!Size(log_, &logSize) || logSize > kMaxExistingLog ||
        !Size(save_, &saveSize) || saveSize != bytes) {
        Close(); return Fail(error, L"log exceeds bound or save size differs");
    }
    if (logSize) {
        std::string last;
        if (!ReadExact(log_, logSize - 1, 1, &last) || last[0] != '\n') {
            Close(); return Fail(error, L"stdout.txt does not end at a complete line");
        }
    }
    std::string saveHash;
    if (!HashBytes(log_, logSize, &logPrefixDigest_) || !Size(log_, &logOffset_) || logOffset_ != logSize ||
        !HashBytes(save_, saveSize, &saveHash) || !Size(save_, &saveBytes_) ||
        saveBytes_ != bytes || saveHash != digest) {
        Close(); return Fail(error, L"attach file contents changed or save hash differs");
    }
    saveName_ = name;
    saveDigest_ = digest;
    armed_ = true;
    if (error) error->clear();
    return true;
}

bool Gate::VerifyAtStoppedLoadReturn(std::wstring* error) {
    if (!armed_ || spent_) return Fail(error, L"gate is not armed or was already spent");
    spent_ = true; // Fail closed after any verification attempt.
    ScopedHandle profile(OpenRead(profilePath_, true));
    ScopedHandle saveDirectory(OpenRead(saveDirectoryPath_, true));
    ScopedHandle log(OpenRead(logPath_));
    ScopedHandle save(OpenRead(savePath_));
    if (profile.value == INVALID_HANDLE_VALUE || saveDirectory.value == INVALID_HANDLE_VALUE ||
        log.value == INVALID_HANDLE_VALUE ||
        save.value == INVALID_HANDLE_VALUE ||
        !SameIdentity(profile.value, profileVolume_, profileFileId_) ||
        !SameIdentity(saveDirectory.value, saveDirectoryVolume_, saveDirectoryFileId_) ||
        !SameIdentity(log.value, logVolume_, logFileId_) ||
        !SameIdentity(save.value, saveVolume_, saveFileId_)) {
        Close(); return Fail(error, L"profile, log, or save path was replaced");
    }
    uint64_t currentLog = 0, currentSave = 0;
    if (!Size(log.value, &currentLog) || currentLog < logOffset_ ||
        currentLog - logOffset_ > kMaxNewLog ||
        !Size(save.value, &currentSave) || currentSave != saveBytes_) {
        Close(); return Fail(error, L"log truncated or exceeded append bound, or save size changed");
    }
    std::string prefixHash, saveHash, appended;
    if (!HashBytes(log.value, logOffset_, &prefixHash) || prefixHash != logPrefixDigest_ ||
        !ReadExact(log.value, logOffset_, currentLog - logOffset_, &appended) ||
        !HashBytes(save.value, saveBytes_, &saveHash) || saveHash != saveDigest_) {
        Close(); return Fail(error, L"log prefix or save content changed");
    }
    uint64_t afterLog = 0, afterSave = 0;
    if (!Size(log.value, &afterLog) || afterLog != currentLog ||
        !Size(save.value, &afterSave) || afterSave != currentSave) {
        Close(); return Fail(error, L"log or save changed during verification");
    }
    size_t count = 0, begin = 0;
    while (begin < appended.size()) {
        const size_t end = appended.find('\n', begin);
        if (end == std::string::npos) {
            Close(); return Fail(error, L"appended log ends with a partial line");
        }
        std::string line = appended.substr(begin, end - begin);
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (line.find(kLoadMarker) != std::string::npos) {
            const std::string wanted = std::string(kLoadMarker) + saveName_;
            size_t payload = 0;
            if (!Tf3LoadPayloadOffset(line, &payload) || line.substr(payload) != wanted || ++count > 1) {
                Close(); return Fail(error, L"conflicting or malformed load line");
            }
        }
        begin = end + 1;
    }
    if (count != 1) { Close(); return Fail(error, L"exactly one fresh expected load line was not found"); }
    ScopedHandle finalProfile(OpenRead(profilePath_, true));
    ScopedHandle finalSaveDirectory(OpenRead(saveDirectoryPath_, true));
    ScopedHandle finalLog(OpenRead(logPath_));
    ScopedHandle finalSave(OpenRead(savePath_));
    if (finalProfile.value == INVALID_HANDLE_VALUE || finalSaveDirectory.value == INVALID_HANDLE_VALUE ||
        finalLog.value == INVALID_HANDLE_VALUE ||
        finalSave.value == INVALID_HANDLE_VALUE ||
        !SameIdentity(finalProfile.value, profileVolume_, profileFileId_) ||
        !SameIdentity(finalSaveDirectory.value, saveDirectoryVolume_, saveDirectoryFileId_) ||
        !SameIdentity(finalLog.value, logVolume_, logFileId_) ||
        !SameIdentity(finalSave.value, saveVolume_, saveFileId_)) {
        Close(); return Fail(error, L"profile, log, or save path changed during verification");
    }
    Close();
    if (error) error->clear();
    return true;
}

} // namespace tf3::company_load_gate
