// Owned-process qualification of the production binder's unknown-write stop helper.
// This includes the binder implementation so StopUnknownWrite is the actual
// production function. The real Assign catch cannot be reached without TF3's
// exact image, save gate, and debug hit; the fixture simulates its post-Clean
// detached state and invokes that helper from a fault catch.
#include "external_company_assignment.cpp"

namespace {
struct OwnedChild {
    PROCESS_INFORMATION info{};
    explicit OwnedChild(const wchar_t* mode) {
        wchar_t path[MAX_PATH]{};
        const DWORD length = GetModuleFileNameW(nullptr, path, MAX_PATH);
        Check(length && length < MAX_PATH, "fixture image path unavailable");
        std::wstring command = L"\"" + std::wstring(path) + L"\" " + mode;
        STARTUPINFOW startup{};
        startup.cb = sizeof startup;
        Check(CreateProcessW(path, command.data(), nullptr, nullptr, FALSE,
            CREATE_NO_WINDOW, nullptr, nullptr, &startup, &info) != FALSE,
            "cannot create owned fixture child");
    }
    ~OwnedChild() {
        if (info.hProcess) {
            if (WaitForSingleObject(info.hProcess, 0) == WAIT_TIMEOUT) {
                TerminateProcess(info.hProcess, 91);
                WaitForSingleObject(info.hProcess, 5000);
            }
            CloseHandle(info.hProcess);
        }
        if (info.hThread) CloseHandle(info.hThread);
    }
    OwnedChild(const OwnedChild&) = delete;
    OwnedChild& operator=(const OwnedChild&) = delete;
};

void DetachedAfterWrite() {
    OwnedChild child(L"--child-live");
    printf("owned_abort_child_pid=%lu\n", child.info.dwProcessId);
    fflush(stdout);
    Check(WaitForSingleObject(child.info.hProcess, 0) == WAIT_TIMEOUT,
        "owned child exited before selected-field write");

    void* field = VirtualAllocEx(child.info.hProcess, nullptr, sizeof(int32_t),
        MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    Check(field != nullptr, "cannot allocate owned child selected field");
    const int32_t selected = kSelectedPlayer;
    SIZE_T written = 0;
    unsigned writeAttempts = 0;
    ++writeAttempts;
    Check(WriteProcessMemory(child.info.hProcess, field, &selected, sizeof selected,
        &written) && written == sizeof selected, "selected-field write failed");
    int32_t readback = 0;
    SIZE_T read = 0;
    Check(ReadProcessMemory(child.info.hProcess, field, &readback, sizeof readback,
        &read) && read == sizeof readback && readback == selected,
        "selected-field readback failed");

    Session session(child.info.dwProcessId, child.info.hProcess);
    session.detached = true;
    session.attached = false; // State after Clean() detached but failed its final check.
    bool writeAttempted = true;
    bool caught = false;
    bool stopped = false;
    try {
        throw Error("post-write restoration/detach failed; outcome unknown");
    } catch (...) {
        caught = true;
        if (writeAttempted) stopped = StopUnknownWrite(child.info.hProcess);
        else if (session.attached) (void)session.Clean();
    }
    Check(caught && stopped && session.detached && !session.attached && writeAttempts == 1,
        "detached unknown-write catch did not request production stop exactly once");
    Check(WaitForSingleObject(child.info.hProcess, 5000) == WAIT_OBJECT_0,
        "detached owned child survived production stop");
    DWORD exitCode = 0;
    Check(GetExitCodeProcess(child.info.hProcess, &exitCode) && exitCode == 90,
        "detached child did not exit via production stop code");
    printf("owned_abort_detached_pass: writes=1 selected=%ld attached=0 detached=1 exit=90\n",
        selected);
}

void AlreadyExitedAfterWrite() {
    OwnedChild child(L"--child-exit");
    printf("owned_abort_child_pid=%lu\n", child.info.dwProcessId);
    fflush(stdout);
    Check(WaitForSingleObject(child.info.hProcess, 5000) == WAIT_OBJECT_0,
        "exit-case owned child did not exit");
    DWORD exitCode = 999;
    Check(GetExitCodeProcess(child.info.hProcess, &exitCode) && exitCode == 0,
        "exit-case owned child returned an error");
    Check(StopUnknownWrite(child.info.hProcess),
        "production stop rejected an already exited child");
    Check(GetExitCodeProcess(child.info.hProcess, &exitCode) && exitCode == 0,
        "production stop altered the already exited child");
    printf("owned_abort_exited_pass: exit=0 stop_idempotent=1\n");
}
} // namespace

int main(int argc, char** argv) {
    if (argc == 2 && strcmp(argv[1], "--child-live") == 0) {
        Sleep(INFINITE);
        return 2;
    }
    if (argc == 2 && strcmp(argv[1], "--child-exit") == 0) return 0;
    try {
        Check(argc == 1, "fixture takes no arguments");
        DetachedAfterWrite();
        AlreadyExitedAfterWrite();
        return 0;
    } catch (const std::exception& error) {
        fprintf(stderr, "owned_abort_failed: %s\n", error.what());
        return 1;
    }
}
