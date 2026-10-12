// Disposable files and owned child process only. No game process or save access.
#define wmain ArchiveToolMain
#include "company_assignment_history_archive.cpp"
#undef wmain
#include <functional>

namespace {
void Refuses(const std::function<void()>& action, const char* reason) {
    bool refused = false;
    try { action(); } catch (const std::exception&) { refused = true; }
    h::Require(refused, reason);
}
uint64_t Creation(HANDLE process) {
    FILETIME creation{}, exit{}, kernel{}, user{};
    h::Require(GetProcessTimes(process, &creation, &exit, &kernel, &user) != FALSE,
        "fixture creation query failed");
    return (uint64_t(creation.dwHighDateTime) << 32) | creation.dwLowDateTime;
}
void WriteNew(const std::wstring& path, const std::string& bytes) {
    h::File file(CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH, nullptr));
    h::Require(file.handle != INVALID_HANDLE_VALUE, "fixture CREATE_NEW failed");
    DWORD written = 0;
    h::Require(WriteFile(file.handle, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) &&
        written == bytes.size() && FlushFileBuffers(file.handle), "fixture write failed");
}
struct Directory {
    std::wstring profile, bridge;
    explicit Directory(unsigned ordinal, size_t targetArchiveLength = 0,
        size_t archiveNameLength = 0) {
        wchar_t current[32768]{};
        h::Require(GetCurrentDirectoryW(32768, current) != 0, "fixture workdir unavailable");
        profile = std::wstring(current) + L"\\dist\\af-" + std::to_wstring(GetCurrentProcessId()) +
            L"-" + std::to_wstring(GetTickCount64()) + L"-" + std::to_wstring(ordinal);
        if (targetArchiveLength) {
            const size_t plainLength = profile.size() + wcslen(L"\\tf3mp_status_1\\") + archiveNameLength;
            h::Require(targetArchiveLength >= plainLength &&
                targetArchiveLength - plainLength < 200, "fixture archive length invalid");
            profile += std::wstring(targetArchiveLength - plainLength, L'x');
        }
        bridge = profile + L"\\tf3mp_status_1";
        h::Require(CreateDirectoryW(profile.c_str(), nullptr) && CreateDirectoryW(bridge.c_str(), nullptr),
            "fixture directory creation failed");
    }
};
std::string Intent(DWORD pid, uint64_t creation, unsigned selected) {
    return "attempt pid=" + std::to_string(pid) + " creation=" + std::to_string(creation) +
        " build=40408 exeSha256=" + h::kExecutableDigest + " saveSha256=" + h::kDiagnosticDigest +
        " saveBytes=12 grantId=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb site=1234 state=1000 field=120c"
        " old=3141 selected=" + std::to_string(selected) + " bytes=4\n";
}
void Run() {
    wchar_t image[32768]{};
    h::Require(GetModuleFileNameW(nullptr, image, 32768) != 0, "fixture image unavailable");
    std::wstring command = L"\"" + std::wstring(image) + L"\" --child";
    STARTUPINFOW startup{}; startup.cb = sizeof startup;
    PROCESS_INFORMATION child{};
    h::Require(CreateProcessW(image, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
        nullptr, nullptr, &startup, &child) != FALSE, "fixture child launch failed");
    h::File process(child.hProcess), thread(child.hThread);
    const DWORD pid = child.dwProcessId;
    const uint64_t creation = Creation(process.handle);
    const std::wstring name = L"company_bind_process_" + std::to_wstring(pid) + L"_" +
        std::to_wstring(creation) + L".attempt";
    const std::string intent = Intent(pid, creation, 55652);
    const std::string released = intent + "memory_readback selected=55652 bytes=4\n" + h::kTerminal;
    const std::string digest = Sha256(released);
    Directory main(1);
    const std::wstring source = main.bridge + L"\\" + name;
    WriteNew(source, released);
    Refuses([&] { ArchiveOne(main.profile, name, digest); }, "live process archived");
    h::Require(TerminateProcess(process.handle, 0) &&
        WaitForSingleObject(process.handle, 5000) == WAIT_OBJECT_0,
        "fixture child retirement failed");
    for (unsigned i = 1; i < h::kMaximumJournals; ++i) {
        const std::string filename = std::string("company_bind_") + h::kDiagnosticDigest + "_" +
            std::to_string(i) + ".attempt";
        WriteNew(main.bridge + L"\\" + std::wstring(filename.begin(), filename.end()),
            Intent(pid, creation, i));
    }
    Refuses([&] { ArchiveOne(main.profile, name, std::string(64, '0')); },
        "wrong SHA256 archived");
    const std::wstring archiveName = L"archived_" + name + L"." +
        std::wstring(digest.begin(), digest.end()) + L".archive";
    const std::wstring archive = main.bridge + L"\\" + archiveName;
    WriteNew(archive, "collision\n");
    Refuses([&] { ArchiveOne(main.profile, name, digest); }, "archive collision replaced");
    h::Require(Exists(source) && Exists(archive) && DeleteFileW(archive.c_str()),
        "fixture collision cleanup failed");
    const Result first = ArchiveOne(main.profile, name, digest);
    h::Require(!first.alreadyArchived && first.activeJournals == h::kMaximumJournals &&
        !Exists(source) && Exists(archive), "full-capacity one-record archive failed");
    {
        h::History after(main.profile);
        after.Qualify();
        h::Require(after.journals == h::kMaximumJournals - 1 &&
            after.unknown == h::kMaximumJournals - 1,
            "archive did not restore one-journal qualification capacity");
    }
    const Result second = ArchiveOne(main.profile, name, digest);
    h::Require(second.alreadyArchived && second.activeJournals == h::kMaximumJournals - 1,
        "post-interruption archive verification failed");
    h::Require(Exists(main.bridge + L"\\company_bind_" +
        std::wstring(h::kDiagnosticDigest, h::kDiagnosticDigest + 64) + L"_1.attempt"),
        "unknown journal lost");
    Directory unknown(2);
    WriteNew(unknown.bridge + L"\\" + name,
        intent + "memory_readback selected=55652 bytes=4\n");
    Refuses([&] { ArchiveOne(unknown.profile, name,
        Sha256(intent + "memory_readback selected=55652 bytes=4\n")); },
        "unknown outcome archived");
    h::Require(Exists(unknown.bridge + L"\\" + name), "unknown source lost");
    Directory linked(3);
    const std::wstring linkedSource = linked.bridge + L"\\" + name;
    WriteNew(linkedSource, released);
    h::Require(CreateHardLinkW((linked.profile + L"\\other-link").c_str(),
        linkedSource.c_str(), nullptr) != FALSE, "fixture hardlink creation failed");
    Refuses([&] { ArchiveOne(linked.profile, name, digest); }, "hardlinked journal archived");
    Directory boundaryArchive(4, 259, archiveName.size());
    const std::wstring boundarySource = boundaryArchive.bridge + L"\\" + name;
    const std::wstring boundaryDestination = boundaryArchive.bridge + L"\\" + archiveName;
    h::Require(boundaryDestination.size() == 259 && boundarySource.size() < MAX_PATH,
        "fixture did not match the actual failing archive length");
    WriteNew(boundarySource, released);
    const Result boundaryFirst = ArchiveOne(boundaryArchive.profile, name, digest);
    const Result boundarySecond = ArchiveOne(boundaryArchive.profile, name, digest);
    h::Require(!boundaryFirst.alreadyArchived && boundarySecond.alreadyArchived &&
        !Exists(boundarySource) && Exists(boundaryDestination),
        "259-character destination archive or verification failed");
    Directory longArchive(5, 290, archiveName.size());
    const std::wstring longSource = longArchive.bridge + L"\\" + name;
    const std::wstring longDestination = longArchive.bridge + L"\\" + archiveName;
    h::Require(longSource.size() < MAX_PATH && longDestination.size() > MAX_PATH,
        "fixture did not cross the destination path-length boundary");
    WriteNew(longSource, released);
    const Result longFirst = ArchiveOne(longArchive.profile, name, digest);
    const Result longSecond = ArchiveOne(longArchive.profile, name, digest);
    h::Require(!longFirst.alreadyArchived && longSecond.alreadyArchived &&
        !Exists(longSource) && Exists(longDestination),
        "long destination archive or interrupted verification failed");
    printf("archive_fixture_pass: full256=one_record unknown=preserved live=refused "
        "hash_mismatch=refused collision=refused hardlink=refused repeated=verified "
        "destination259=verified long_destination=verified\n");
    printf("fixture_evidence=%ls\n", main.profile.c_str());
}
} // namespace
int wmain(int argc, wchar_t** argv) {
    if (argc == 2 && wcscmp(argv[1], L"--child") == 0) { Sleep(30000); return 0; }
    try { h::Require(argc == 1, "fixture takes no arguments"); Run(); return 0; }
    catch (const std::exception& error) { fprintf(stderr, "%s\n", error.what()); return 1; }
}
