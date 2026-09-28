#include "company_load_gate.h"

#include <windows.h>
#include <cstdio>
#include <stdexcept>
#include <string>

using tf3::company_load_gate::Gate;
namespace {
constexpr char kName[] = "fixture_disposable";
constexpr char kHash[] = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
constexpr char kLoad[] = "[2026-09-28 14:51:19Z - MESSAGE  - Load Game Pool 1 - Main           ]  Loading game from file fixture_disposable\r\n";
constexpr char kOtherLoad[] = "[2026-09-28 14:51:20Z - MESSAGE  - Load Game Pool 1 - Main           ]  Loading game from file other\r\n";
constexpr char kObservedSaveLoad[] = "[2026-09-28 14:51:19Z - MESSAGE  - Load Game Pool 1 - Main           ]  Loading game from file tf3mp_disposable_43b49d368fbbd409ae2614ada7b0c757\r\n";
constexpr char kStale[] = "[2026-09-28 14:50:00Z - MESSAGE  - Load Game Pool 1 - Main           ]  Loading game from file stale\r\n";

void Check(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
void Write(const std::wstring& path, const std::string& bytes, DWORD disposition) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                              nullptr, disposition, FILE_ATTRIBUTE_NORMAL, nullptr);
    Check(file != INVALID_HANDLE_VALUE, "open fixture file");
    if (disposition == OPEN_EXISTING) SetFilePointer(file, 0, nullptr, FILE_END);
    DWORD written = 0;
    const bool ok = WriteFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) &&
                    written == bytes.size();
    CloseHandle(file);
    Check(ok, "write fixture file");
}

struct Fixture {
    std::wstring root, crash, saveDirectory, log, save;
    explicit Fixture(unsigned number) {
        wchar_t temp[MAX_PATH]{};
        Check(GetTempPathW(MAX_PATH, temp) != 0, "temp path");
        root = std::wstring(temp) + L"tf3_company_gate_" + std::to_wstring(GetCurrentProcessId()) +
               L"_" + std::to_wstring(number);
        crash = root + L"\\crash_dump";
        saveDirectory = root + L"\\save";
        log = crash + L"\\stdout.txt";
        save = saveDirectory + L"\\fixture_disposable.sav";
        Check(CreateDirectoryW(root.c_str(), nullptr) != 0 &&
              CreateDirectoryW(crash.c_str(), nullptr) != 0 &&
              CreateDirectoryW(saveDirectory.c_str(), nullptr) != 0, "create fixture directory");
        Write(log, kStale, CREATE_ALWAYS);
        Write(save, "abc", CREATE_ALWAYS);
    }
    ~Fixture() {
        DeleteFileW(log.c_str());
        DeleteFileW((crash + L"\\old.txt").c_str());
        DeleteFileW(save.c_str());
        DeleteFileW((root + L"\\old.sav").c_str());
        DeleteFileW((root + L"\\fixture_disposable.sav").c_str());
        RemoveDirectoryW(crash.c_str());
        RemoveDirectoryW(saveDirectory.c_str());
        RemoveDirectoryW(root.c_str());
    }
    bool Attach(Gate& gate) {
        std::wstring error;
        return gate.AttachFixture(root, save, kName, 3, kHash, true, &error);
    }
    bool Verify(Gate& gate) {
        std::wstring error;
        return gate.VerifyAtStoppedLoadReturn(&error);
    }
};
} // namespace

int wmain() {
    try {
        unsigned n = 0;
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "valid attach");
            Write(f.log, kLoad, OPEN_EXISTING);
            Check(f.Verify(gate), "one fresh load should pass");
            Check(!f.Verify(gate), "gate must be one-use");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "stale attach");
            Check(!f.Verify(gate), "stale load must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "conflict attach");
            Write(f.log, std::string(kLoad) + kOtherLoad, OPEN_EXISTING);
            Check(!f.Verify(gate), "conflicting load must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "duplicate attach");
            Write(f.log, std::string(kLoad) + kLoad, OPEN_EXISTING);
            Check(!f.Verify(gate), "two matching lines must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "truncate attach");
            Write(f.log, kLoad, CREATE_ALWAYS);
            Check(!f.Verify(gate), "truncation must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "replace attach");
            Check(MoveFileW(f.log.c_str(), (f.crash + L"\\old.txt").c_str()) != 0, "move log");
            Write(f.log, std::string(kStale) + kLoad, CREATE_ALWAYS);
            Check(!f.Verify(gate), "log replacement must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "save replace attach");
            Check(MoveFileW(f.save.c_str(), (f.root + L"\\old.sav").c_str()) != 0, "move save");
            Write(f.save, "abc", CREATE_ALWAYS);
            Write(f.log, kLoad, OPEN_EXISTING);
            Check(!f.Verify(gate), "same-content save replacement must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "prefix mutation attach");
            Write(f.log, std::string("[2026-09-28 14:50:00Z - MESSAGE  - Load Game Pool 1 - Main           ]  Loading game from file alter\r\n") + kLoad,
                  CREATE_ALWAYS);
            Check(!f.Verify(gate), "rewritten prefix must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Write(f.save, "abd", CREATE_ALWAYS);
            Check(!f.Attach(gate), "wrong hash at attach must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "save mutation attach");
            Write(f.log, kLoad, OPEN_EXISTING);
            Write(f.save, "abd", CREATE_ALWAYS);
            Check(!f.Verify(gate), "wrong hash at return must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(!gate.AttachFixture(f.root, f.save, kName, 3, kHash, false, nullptr),
                  "main menu assertion required");
            Check(f.Attach(gate), "attach after rejected assertion");
            Write(f.log, "[2026-09-28 14:51:19Z - MESSAGE  - Load Game Pool 1 - Main           ]  Loading game from file fixture_disposable", OPEN_EXISTING);
            Check(!f.Verify(gate), "partial line must fail");
        }
        {
            Fixture f(++n); Gate gate;
            const std::wstring wrongFolder = f.root + L"\\fixture_disposable.sav";
            Write(wrongFolder, "abc", CREATE_ALWAYS);
            Check(!gate.AttachFixture(f.root, wrongFolder, kName, 3, kHash, true, nullptr),
                  "matching save in wrong folder must fail");
        }
        {
            Fixture f(++n); Gate gate;
            Check(f.Attach(gate), "observed-format conflict attach");
            Write(f.log, kObservedSaveLoad, OPEN_EXISTING);
            Check(!f.Verify(gate), "literal observed TF3 load of different save must fail");
        }
        std::puts("company load gate: 13 owned-file cases passed");
        return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "company load gate fixture failed: %s\n", error.what());
        return 1;
    }
}
