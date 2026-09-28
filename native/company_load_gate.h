#pragma once

#include <windows.h>
#include <cstdint>
#include <string>

namespace tf3::company_load_gate {

// This checks file/log evidence only. The caller must independently prove that
// the target is at the main menu on attach and stopped at the qualified load
// return on verification. A successful result authorizes no write by itself.
class Gate final {
public:
    Gate() = default;
    ~Gate();
    Gate(const Gate&) = delete;
    Gate& operator=(const Gate&) = delete;

    bool AttachProduction(const std::wstring& canonicalProfileDirectory,
                          const std::wstring& canonicalSavePath,
                          bool mainMenuConfirmed, std::wstring* error);
    bool VerifyAtStoppedLoadReturn(std::wstring* error);

#ifdef TF3_COMPANY_GATE_TESTING
    // Isolated fixture only; production code must use AttachProduction.
    bool AttachFixture(const std::wstring& canonicalProfileDirectory,
                       const std::wstring& canonicalSavePath,
                       const std::string& saveName, uint64_t saveBytes,
                       const std::string& saveSha256, bool mainMenuConfirmed,
                       std::wstring* error);
#endif

private:
    bool Attach(const std::wstring&, const std::wstring&, const std::string&,
                uint64_t, const std::string&, bool, std::wstring*);
    void Close();
    HANDLE profile_ = INVALID_HANDLE_VALUE;
    HANDLE saveDirectory_ = INVALID_HANDLE_VALUE;
    HANDLE log_ = INVALID_HANDLE_VALUE;
    HANDLE save_ = INVALID_HANDLE_VALUE;
    std::wstring profilePath_, saveDirectoryPath_, logPath_, savePath_;
    std::string saveName_, saveDigest_, logPrefixDigest_;
    uint64_t saveBytes_ = 0, logOffset_ = 0;
    DWORD profileVolume_ = 0, saveDirectoryVolume_ = 0, logVolume_ = 0, saveVolume_ = 0;
    uint64_t profileFileId_ = 0, saveDirectoryFileId_ = 0, logFileId_ = 0, saveFileId_ = 0;
    bool armed_ = false, spent_ = false;
};

} // namespace tf3::company_load_gate
