// Owned child only. Exercises local WMI evidence with process-query rights denied.
#define WIN32_LEAN_AND_MEAN
#include "company_assignment_history.h"
#include <aclapi.h>
#include <cstdio>
#include <functional>

namespace h = tf3::company_assignment_history;
namespace wmi = tf3::company_assignment_history::wmi;
namespace {
uint64_t Creation(HANDLE process) {
    FILETIME creation{}, exit{}, kernel{}, user{};
    h::Require(GetProcessTimes(process, &creation, &exit, &kernel, &user) != FALSE,
        "WMI fixture owned-child creation");
    return (uint64_t(creation.dwHighDateTime) << 32) | creation.dwLowDateTime;
}
void Refuses(const std::function<void()>& action, const char* label) {
    bool refused = false;
    try { action(); } catch (const std::exception&) { refused = true; }
    h::Require(refused, label);
}
struct Child {
    PROCESS_INFORMATION info{};
    Child() {
        wchar_t image[32768]{};
        h::Require(GetModuleFileNameW(nullptr, image, 32768) != 0, "WMI fixture image path");
        std::wstring command = L"\"" + std::wstring(image) + L"\" --child";
        STARTUPINFOW startup{}; startup.cb = sizeof startup;
        h::Require(CreateProcessW(image, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
            nullptr, nullptr, &startup, &info) != FALSE, "WMI fixture child creation");
    }
    ~Child() {
        if (info.hProcess) {
            if (WaitForSingleObject(info.hProcess, 0) == WAIT_TIMEOUT) {
                TerminateProcess(info.hProcess, 0);
                WaitForSingleObject(info.hProcess, 5000);
            }
            CloseHandle(info.hProcess);
        }
        if (info.hThread) CloseHandle(info.hThread);
    }
};
void Run() {
    wmi::LifetimeInterval interval{}, sameOffset{};
    h::Require(wmi::ParseCreationDate(L"20261002155333.778517+060", interval) &&
        wmi::ParseCreationDate(L"20261002145333.778517+000", sameOffset) &&
        interval.lower == sameOffset.lower && interval.upper == sameOffset.upper &&
        interval.upper - interval.lower == 2 * wmi::kSecond,
        "WMI fixture UTC offset conversion");
    h::Require(wmi::ParseCreationDate(L"20240229010101.123456-060", interval),
        "WMI fixture valid leap date");
    h::Require(wmi::ParseCreationDate(L"20261002155333.778517+060", interval) &&
        !wmi::ProvesLater(interval.lower, interval) &&
        !wmi::ProvesLater(interval.lower + 1, interval) &&
        wmi::ProvesLater(interval.lower - 1, interval),
        "WMI fixture lower-bound overlap or later proof");
    for (const wchar_t* invalid : {
        L"20260229010101.123456+000", L"20261002155333.778517+***",
        L"20261002155333.******+060", L"20261002155360.778517+060",
        L"20261002155333.778517:000", L"20261002155333.778517+06",
        L"20261002155333.778517+1000", L"20261302155333.778517+060",
        L"20261002155333.778517+06x", L"20261002155333.778517+060 ",
        L"00000000000000.000000+000"}) {
        h::Require(!wmi::ParseCreationDate(invalid, interval), "WMI fixture malformed date accepted");
    }
    Child child;
    const uint64_t exact = Creation(child.info.hProcess);
    h::Require(GetModuleHandleW(L"SbieDll.dll") == nullptr &&
        !h::AbsentFromHostSnapshot(child.info.dwProcessId), "WMI fixture host snapshot unavailable");
    wmi::LifetimeInterval missing{};
    h::Require(!wmi::QueryCreation(MAXDWORD, missing), "WMI fixture missing PID accepted");
    ACL deny{};
    h::Require(InitializeAcl(&deny, sizeof deny, ACL_REVISION) != FALSE,
        "WMI fixture ACL initialization");
    h::Require(SetSecurityInfo(child.info.hProcess, SE_KERNEL_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, &deny, nullptr) == ERROR_SUCCESS, "WMI fixture deny-query ACL");
    h::File combined(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
        FALSE, child.info.dwProcessId));
    h::File query(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, child.info.dwProcessId));
    h::Require(!combined.handle && !query.handle, "WMI fixture process opens were not denied");
    wmi::LifetimeInterval observed{};
    std::string diagnostic;
    if (!wmi::QueryCreation(child.info.dwProcessId, observed, &diagnostic))
        throw std::runtime_error("WMI fixture creation query unavailable: " + diagnostic);
    h::Require(observed.lower <= exact && exact <= observed.upper,
        "WMI fixture interval excludes full owned-child FILETIME");
    h::Record original{child.info.dwProcessId, exact, false};
    Refuses([&] { h::RequireRetired(original); }, "WMI fixture same lifetime accepted");
    h::Record earlier = original;
    h::Require(exact > 5 * wmi::kSecond, "WMI fixture creation underflow");
    earlier.creation = exact - 5 * wmi::kSecond;
    h::Require(observed.lower > earlier.creation, "WMI fixture later lower bound unavailable");
    h::RequireRetired(earlier);
    h::Require(SetSecurityInfo(child.info.hProcess, SE_KERNEL_OBJECT, DACL_SECURITY_INFORMATION,
        nullptr, nullptr, nullptr, nullptr) == ERROR_SUCCESS, "WMI fixture ACL restoration");
    printf("history_wmi_fixture_pass: parser=strict timezone=checked actual_interval=contains_full_filetime "
        "query_denied=confirmed same_creation=refused later_lower_bound=accepted\n");
}
} // namespace
int wmain(int argc, wchar_t** argv) {
    if (argc == 2 && !wcscmp(argv[1], L"--child")) { Sleep(30000); return 0; }
    try { h::Require(argc == 1, "WMI fixture takes no arguments"); Run(); return 0; }
    catch (const std::exception& error) { fprintf(stderr, "%s\n", error.what()); return 1; }
}
