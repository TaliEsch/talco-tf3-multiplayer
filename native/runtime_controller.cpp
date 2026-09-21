// Debugger-backed qualification gate. The entire target, including its GUI,
// freezes while a debug event is held. This is not a production game adapter.
// Emergency holds are fail-stop: once attached, an abrupt controller exit
// terminates the debug target rather than silently resuming it.  Only an
// authenticated explicit shutdown restores registers and detaches normally.
#define TF3_RUNTIME_OBSERVER_LIBRARY
#include "runtime_observer.cpp"
#include "runtime_ipc.h"
#include <sddl.h>
#include <deque>
#include <mutex>
#include <set>
#include <thread>
#pragma comment(lib, "advapi32.lib")

namespace controller {
struct FixtureState {
    volatile LONG64 iterations;
    volatile LONG64 background;
    volatile LONG stop;
    volatile LONG workersReady;
    volatile LONG unownedTrapDelivered;
    DWORD iterationDelay;
    DWORD workerCount;
    bool unownedTrap;
};
// A configured register is evidence only for a thread we actually armed.
// DR6 hit bits are advisory: Windows can omit them from an execution-trap
// context. The shared classifier also requires exception address, RIP, slot
// address and execution mode to agree, and rejects TF / BD / BS / BT causes.
int OwnedTrapSite(const SavedThread* thread, const EXCEPTION_RECORD& exception,
                  const CONTEXT& context, ULONG64 base, const std::array<Site, 4>& sites) {
    return thread && thread->armed ? ConfiguredTrapSite(exception, context, base, sites) : -1;
}
int TrapOwnershipFixture() {
    SavedThread thread{}; thread.armed = true;
    constexpr ULONG64 base = 0x140000000;
    unsigned rejected = 0;
    for (size_t i = 0; i < tf3Sites.size(); ++i) {
        CONTEXT context{};
        context.Dr0 = base + tf3Sites[0].rva; context.Dr1 = base + tf3Sites[1].rva;
        context.Dr2 = base + tf3Sites[2].rva; context.Dr3 = base + tf3Sites[3].rva;
        context.Dr7 = 0x55; context.Rip = base + tf3Sites[i].rva;
        EXCEPTION_RECORD exception{}; exception.ExceptionCode = EXCEPTION_SINGLE_STEP;
        exception.ExceptionAddress = reinterpret_cast<void*>(context.Rip);
        Require(OwnedTrapSite(&thread, exception, context, base, tf3Sites) == static_cast<int>(i),
                "controller missing-DR6 trap rejected");
        context.Dr6 = 1ULL << i;
        Require(OwnedTrapSite(&thread, exception, context, base, tf3Sites) == static_cast<int>(i),
                "controller normal trap rejected");
        auto reject = [&](const SavedThread* owner, const CONTEXT& candidate, const EXCEPTION_RECORD& record) {
            Require(OwnedTrapSite(owner, record, candidate, base, tf3Sites) == -1, "controller accepted unowned trap");
            ++rejected;
        };
        reject(nullptr, context, exception);
        thread.armed = false; reject(&thread, context, exception); thread.armed = true;
        auto changed = context; changed.Rip++; reject(&thread, changed, exception);
        changed = context; changed.EFlags |= 0x100; reject(&thread, changed, exception);
        for (unsigned bit : {13U, 14U, 15U}) {
            changed = context; changed.Dr6 |= 1ULL << bit; reject(&thread, changed, exception);
        }
        changed = context; changed.Dr7 &= ~(1ULL << (2 * i)); reject(&thread, changed, exception);
        changed = context; changed.Dr7 |= 1ULL << (16 + 4 * i); reject(&thread, changed, exception);
        changed = context; changed.Dr7 |= 1ULL << (18 + 4 * i); reject(&thread, changed, exception);
        changed = context; changed.Dr0++; changed.Dr1++; changed.Dr2++; changed.Dr3++;
        reject(&thread, changed, exception);
        auto other = exception; other.ExceptionAddress = reinterpret_cast<void*>(context.Rip + 1);
        reject(&thread, context, other);
        other = exception; other.ExceptionCode = EXCEPTION_BREAKPOINT; reject(&thread, context, other);
    }
    printf("{\"event\":\"controller-trap-ownership-passed\",\"sites\":4,\"rejectedCases\":%u,\"missingDr6Accepted\":true}\n", rejected);
    return 0;
}
struct Request { std::uint64_t id; std::uint64_t generation; std::string control; std::string sessionId; std::string role; };
struct Reply { std::uint64_t id; std::uint64_t generation; bool error; std::string body; };
struct Channel {
    std::mutex lock;
    std::deque<Request> requests;
    std::deque<Reply> replies;
    std::atomic<bool> stop{false};
    std::atomic<bool> lost{false};
    std::atomic<bool> authenticated{false};
    std::atomic<bool> failed{false};
    std::atomic<bool> ready{false};
    std::atomic<bool> listening{false};
    std::atomic<bool> fixture{false};
    // Only the debugger-owner thread accesses these persistent binding fields.
    std::string boundSession;
    std::string boundRole;
    void ReplyTo(const Request& request, bool error, const std::string& body) {
        std::lock_guard<std::mutex> guard(lock);
        if (replies.size() >= 128) { lost.store(true); return; }
        replies.push_back({request.id, request.generation, error, body});
    }
};
bool Transfer(HANDLE pipe, void* data, DWORD length, DWORD* transferred, bool writing) {
    Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr));
    if (!event.value) return false;
    OVERLAPPED overlap{}; overlap.hEvent = event.value;
    const BOOL started = writing ? WriteFile(pipe, data, length, nullptr, &overlap) : ReadFile(pipe, data, length, nullptr, &overlap);
    if (!started && GetLastError() != ERROR_IO_PENDING) return false;
    if (WaitForSingleObject(event.value, 500) != WAIT_OBJECT_0) {
        CancelIoEx(pipe, &overlap); GetOverlappedResult(pipe, &overlap, transferred, TRUE); return false;
    }
    return GetOverlappedResult(pipe, &overlap, transferred, FALSE) != FALSE;
}
bool WriteAll(HANDLE pipe, const void* data, DWORD length) {
    const auto* bytes = static_cast<const BYTE*>(data);
    while (length) { DWORD written = 0; if (!Transfer(pipe, const_cast<BYTE*>(bytes), length, &written, true) || !written) return false;
        bytes += written; length -= written; }
    return true;
}
bool Send(HANDLE pipe, Tf3RuntimeIpcType type, std::uint64_t id, const std::array<BYTE, 16>& session, const std::string& body) {
    Tf3RuntimeIpcFrameHeader header{TF3_RUNTIME_IPC_MAGIC, TF3_RUNTIME_IPC_VERSION, static_cast<std::uint16_t>(type),
        static_cast<DWORD>(body.size()), id, {}};
    memcpy(header.session, session.data(), session.size());
    return WriteAll(pipe, &header, sizeof(header)) && WriteAll(pipe, body.data(), static_cast<DWORD>(body.size()));
}
HANDLE OwnerPipe(const std::wstring& name) {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;GA;;;OW)", SDDL_REVISION_1, &descriptor, nullptr)) return INVALID_HANDLE_VALUE;
    SECURITY_ATTRIBUTES security{sizeof(security), descriptor, FALSE};
    const std::wstring full = L"\\\\.\\pipe\\" + name;
    HANDLE pipe = CreateNamedPipeW(full.c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED,
        PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1, 8192, 8192, 0, &security);
    LocalFree(descriptor); return pipe;
}
bool EqualToken(const std::string& expected, const std::string& given) {
    if (expected.size() != given.size()) return false;
    BYTE difference = 0;
    for (size_t i = 0; i < expected.size(); ++i) difference |= static_cast<BYTE>(expected[i] ^ given[i]);
    return difference == 0;
}
Request ParseRequest(std::uint64_t id, std::uint64_t generation, const std::string& body) {
    Request result{id, generation, {}, {}, {}};
    for (const char* control : {"ping", "hold", "release", "halt", "shutdown"}) {
        if (body == std::string("{\"control\":\"") + control + "\"}") { result.control = control; return result; }
    }
    const std::string prefix = "{\"control\":\"bind\",\"sessionId\":\"";
    if (body.compare(0, prefix.size(), prefix) != 0) return result;
    const size_t end = body.find('"', prefix.size());
    if (end == std::string::npos || end - prefix.size() < 1 || end - prefix.size() > 128) return result;
    const std::string identity = body.substr(prefix.size(), end - prefix.size());
    for (char c : identity) if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
        (c >= '0' && c <= '9') || c == '_' || c == '.' || c == ':' || c == '-')) return result;
    for (const char* role : {"host", "participant"}) {
        if (body.substr(end) == std::string("\",\"role\":\"") + role + "\"}") {
            result.control = "bind"; result.sessionId = identity; result.role = role; break;
        }
    }
    return result;
}
void Worker(Channel& channel, const std::wstring& name, const std::string& token) noexcept {
    try {
        std::uint64_t generation = 0;
        while (!channel.stop.load()) {
            Handle pipe(OwnerPipe(name));
            if (pipe.value == INVALID_HANDLE_VALUE) { channel.failed.store(true); channel.lost.store(true); return; }
            channel.listening.store(true);
            Handle connectEvent(CreateEventW(nullptr, TRUE, FALSE, nullptr));
            Require(connectEvent.value != nullptr, "cannot create pipe connect event");
            OVERLAPPED connectOverlap{}; connectOverlap.hEvent = connectEvent.value;
            if (!ConnectNamedPipe(pipe.value, &connectOverlap)) {
                const DWORD error = GetLastError();
                if (error == ERROR_IO_PENDING) {
                    while (!channel.stop.load() && WaitForSingleObject(connectEvent.value, 20) == WAIT_TIMEOUT) {}
                    DWORD transferred = 0;
                    if (channel.stop.load()) { CancelIoEx(pipe.value, &connectOverlap); GetOverlappedResult(pipe.value, &connectOverlap, &transferred, TRUE); return; }
                    Require(GetOverlappedResult(pipe.value, &connectOverlap, &transferred, FALSE) != FALSE, "pipe connect failed");
                } else Require(error == ERROR_PIPE_CONNECTED, "pipe connect failed");
            }
            ++generation;
            std::array<BYTE, 16> session{};
            Require(BCryptGenRandom(nullptr, session.data(), static_cast<ULONG>(session.size()), BCRYPT_USE_SYSTEM_PREFERRED_RNG) >= 0,
                    "cannot create controller IPC epoch");
            std::vector<BYTE> input;
            std::set<std::uint64_t> seen;
            std::uint64_t lastId = 0;
            bool hello = false, connected = true;
            const ULONGLONG connectedAt = GetTickCount64();
            while (connected && !channel.stop.load()) {
                if (!hello && GetTickCount64() - connectedAt > 3000) break;
                DWORD available = 0;
                if (!PeekNamedPipe(pipe.value, nullptr, 0, nullptr, &available, nullptr)) break;
                if (available) {
                    BYTE chunk[4096]{}; DWORD received = 0;
                    if (!Transfer(pipe.value, chunk, (std::min)(available, static_cast<DWORD>(sizeof(chunk))), &received, false) || !received) break;
                    input.insert(input.end(), chunk, chunk + received);
                    if (input.size() > 8192) break;
                }
                while (input.size() >= sizeof(Tf3RuntimeIpcFrameHeader)) {
                    Tf3RuntimeIpcFrameHeader header{}; memcpy(&header, input.data(), sizeof(header));
                    if (header.magic != TF3_RUNTIME_IPC_MAGIC || header.version != TF3_RUNTIME_IPC_VERSION ||
                        header.payload_size > TF3_RUNTIME_IPC_MAX_PAYLOAD || header.correlation_id == 0) { connected = false; break; }
                    const size_t total = sizeof(header) + header.payload_size;
                    if (input.size() < total) break;
                    std::string body(reinterpret_cast<const char*>(input.data() + sizeof(header)), header.payload_size);
                    input.erase(input.begin(), input.begin() + static_cast<ptrdiff_t>(total));
                    if (!hello) {
                        const std::string expected = "{\"token\":\"" + token + "\"}";
                        const std::array<BYTE, 16> empty{};
                        if (header.type != static_cast<WORD>(Tf3RuntimeIpcType::hello) ||
                            memcmp(header.session, empty.data(), empty.size()) != 0 || !EqualToken(expected, body)) { connected = false; break; }
                        seen.insert(header.correlation_id);
                        lastId = header.correlation_id;
                        const std::string capabilities = channel.fixture.load() ?
                            "[\"transport.health\",\"session.bind\",\"qualification.fixture.gate\"]" : "[\"transport.health\",\"session.bind\",\"qualification.debugger.gate\"]";
                        if (!Send(pipe.value, Tf3RuntimeIpcType::hello_ack, header.correlation_id, session,
                            "{\"capabilities\":" + capabilities + ",\"engineObserver\":true,\"productionQualified\":false,\"guiFreezes\":true}")) { connected = false; break; }
                        hello = true; channel.authenticated.store(true); continue;
                    }
                    if (header.type != static_cast<WORD>(Tf3RuntimeIpcType::control) || memcmp(header.session, session.data(), session.size())) {
                        connected = false; break;
                    }
                    const Request request = ParseRequest(header.correlation_id, generation, body);
                    if (seen.count(header.correlation_id)) {
                        channel.ReplyTo(request, true, "{\"code\":\"DUPLICATE_ID\"}"); continue;
                    }
                    if (header.correlation_id <= lastId) {
                        channel.ReplyTo(request, true, "{\"code\":\"OUT_OF_ORDER_ID\"}"); continue;
                    }
                    if (seen.size() >= 4096) { connected = false; break; }
                    seen.insert(header.correlation_id);
                    lastId = header.correlation_id;
                    if (request.control.empty()) { channel.ReplyTo(request, true, "{\"code\":\"INVALID_CONTROL\"}"); continue; }
                    std::lock_guard<std::mutex> guard(channel.lock);
                    if (channel.requests.size() >= 128) { connected = false; break; }
                    channel.requests.push_back(request);
                }
                std::deque<Reply> outgoing;
                { std::lock_guard<std::mutex> guard(channel.lock); outgoing.swap(channel.replies); }
                for (const auto& reply : outgoing) {
                    if (reply.generation != generation) continue;
                    if (!Send(pipe.value, reply.error ? Tf3RuntimeIpcType::error : Tf3RuntimeIpcType::receipt,
                              reply.id, session, reply.body)) { connected = false; break; }
                }
                Sleep(2);
            }
            channel.authenticated.store(false);
            if (hello && !channel.stop.load()) channel.lost.store(true);
            DisconnectNamedPipe(pipe.value);
        }
    } catch (...) { channel.failed.store(true); channel.lost.store(true); }
}

volatile LONG64 fixtureValue = 0;
extern "C" __declspec(dllexport) __declspec(noinline) void ControllerFixturePre() { InterlockedExchange64(&fixtureValue, 1); }
extern "C" __declspec(dllexport) __declspec(noinline) void ControllerFixturePost() { InterlockedExchange64(&fixtureValue, 2); }
extern "C" __declspec(dllexport) __declspec(noinline) void ControllerFixtureAuxPre() { InterlockedIncrement64(&fixtureValue); }
extern "C" __declspec(dllexport) __declspec(noinline) void ControllerFixtureAuxPost() { InterlockedDecrement64(&fixtureValue); }
FixtureState* exceptionFixtureState = nullptr;
LONG CALLBACK FixtureException(PEXCEPTION_POINTERS exception) {
    if (exception->ExceptionRecord->ExceptionCode != EXCEPTION_SINGLE_STEP) return EXCEPTION_CONTINUE_SEARCH;
    if (!exceptionFixtureState || !exceptionFixtureState->unownedTrap) return RejectLeakedSingleStep(exception);
    if (exception->ExceptionRecord->ExceptionAddress != reinterpret_cast<void*>(&ControllerFixturePre)) ExitProcess(85);
    InterlockedIncrement(&exceptionFixtureState->unownedTrapDelivered);
    return EXCEPTION_CONTINUE_SEARCH;
}
__declspec(noinline) void RaiseUnownedFixtureTrap() {
    // A real OS exception whose address coincides with a configured site, but
    // whose instruction context is unrelated. Address-only teardown used to
    // swallow its second chance. No game or external process uses this path.
    using RaiseNativeException = LONG (NTAPI*)(PEXCEPTION_RECORD, PCONTEXT, BOOLEAN);
    const auto raise = reinterpret_cast<RaiseNativeException>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtRaiseException"));
    if (!raise) ExitProcess(86);
    CONTEXT context{}; RtlCaptureContext(&context);
    EXCEPTION_RECORD exception{}; exception.ExceptionCode = EXCEPTION_SINGLE_STEP;
    exception.ExceptionAddress = reinterpret_cast<void*>(&ControllerFixturePre);
    raise(&exception, &context, TRUE);
    ExitProcess(87); // The fixture deliberately leaves this exception unhandled.
}
DWORD WINAPI Background(void* pointer) {
    auto* state = static_cast<FixtureState*>(pointer);
    ControllerFixtureAuxPre(); ControllerFixtureAuxPost();
    InterlockedIncrement(&state->workersReady);
    while (!InterlockedCompareExchange(&state->stop, 0, 0)) {
        ControllerFixtureAuxPre();
        InterlockedIncrement64(&state->background);
        ControllerFixtureAuxPost();
        Sleep(2);
    }
    return 0;
}
int Fixture(const std::wstring& name) {
    // Any debugger-owned trap leaked during release or detach is a hard test
    // failure, rather than a silently handled fixture exception.
    Handle mapping(OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, name.c_str()));
    if (!mapping.value) return 80;
    auto* state = static_cast<FixtureState*>(MapViewOfFile(mapping.value, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(FixtureState)));
    if (!state) return 81;
    exceptionFixtureState = state;
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    if (!AddVectoredExceptionHandler(1, FixtureException)) return 84;
    std::vector<HANDLE> workers;
    for (DWORD i = 0; i < state->workerCount; ++i) {
        const HANDLE worker = CreateThread(nullptr, 0, Background, state, 0, nullptr);
        if (!worker) return 82;
        workers.push_back(worker);
    }
    while (static_cast<DWORD>(InterlockedCompareExchange(&state->workersReady, 0, 0)) != state->workerCount) Sleep(1);
    while (!InterlockedCompareExchange(&state->stop, 0, 0)) {
        ControllerFixturePre();
        InterlockedIncrement64(&state->iterations);
        if (state->unownedTrap) RaiseUnownedFixtureTrap();
        Sleep(state->iterationDelay);
        ControllerFixturePost();
    }
    const bool exited = WaitForMultipleObjects(static_cast<DWORD>(workers.size()), workers.data(), TRUE, 2000) == WAIT_OBJECT_0;
    for (HANDLE worker : workers) CloseHandle(worker);
    UnmapViewOfFile(state);
    return exited ? 0 : 83;
}
struct WorkerLifetime {
    Channel& channel;
    std::thread thread;
    WorkerLifetime(Channel& value, const std::wstring& pipe, const std::string& token)
        : channel(value), thread(Worker, std::ref(value), pipe, token) {}
    ~WorkerLifetime() {
        channel.stop.store(true);
        CancelSynchronousIo(thread.native_handle());
        if (thread.joinable()) thread.join();
    }
};
std::string StateReceipt(const Request& request, const char* state, bool held, ULONG64 iterations, FixtureState* fixture, const Channel& channel) {
    std::string result = "{\"status\":\"accepted\",\"control\":\"" + request.control + "\",\"state\":\"" + state +
        "\",\"engineHalted\":" + (held ? "true" : "false") + ",\"completedIterations\":" + std::to_string(iterations) +
        ",\"engineObserver\":true,\"productionQualified\":false,\"sessionBound\":" + (channel.boundSession.empty() ? "false" : "true") +
        ",\"gateReady\":" + (held && !channel.boundSession.empty() && std::string(state) == "held_at_pre" ? "true" : "false") +
        ",\"boundSessionId\":\"" + channel.boundSession + "\",\"boundRole\":\"" + channel.boundRole + "\"";
    if (fixture) result += ",\"fixtureIterations\":" + std::to_string(InterlockedCompareExchange64(&fixture->iterations, 0, 0)) +
        ",\"fixtureBackground\":" + std::to_string(InterlockedCompareExchange64(&fixture->background, 0, 0)) +
        ",\"fixtureUnownedTrapDelivered\":" + std::to_string(InterlockedCompareExchange(&fixture->unownedTrapDelivered, 0, 0));
    return result + "}";
}
int Run(DWORD targetPid, bool owned, const std::wstring& pipeName, const std::string& token,
        bool slowFixture, bool multithreadFixture, bool missingDr6Fixture, bool unownedTrapFixture) {
    Handle initial(owned ? nullptr : OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ | SYNCHRONIZE, FALSE, targetPid));
    Require(owned || initial.value, "cannot open explicit target PID");
    const std::wstring path = ImagePath(owned ? GetCurrentProcess() : initial.value);
    Image image(path);
    Require(owned || image.hash == kTf3Hash, "unsupported target executable SHA256");
    if (!owned) {
        const size_t slash = path.find_last_of(L"\\/");
        Require(slash != std::wstring::npos && _wcsicmp(path.c_str() + slash + 1, L"TransportFever3.exe") == 0,
                "target executable name mismatch");
    }
    auto sites = tf3Sites;
    Handle mapping;
    FixtureState* fixtureState = nullptr;
    const std::wstring mappingName = pipeName + L"_fixture";
    if (owned) {
        mapping.value = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0, sizeof(FixtureState), mappingName.c_str());
        Require(mapping.value && GetLastError() != ERROR_ALREADY_EXISTS, "fixture mapping unavailable or already exists");
        fixtureState = static_cast<FixtureState*>(MapViewOfFile(mapping.value, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(FixtureState)));
        Require(fixtureState != nullptr, "cannot map fixture counters");
        memset(fixtureState, 0, sizeof(*fixtureState));
        fixtureState->iterationDelay = slowFixture ? 3000 : 5;
        fixtureState->workerCount = multithreadFixture ? 15 : 1;
        fixtureState->unownedTrap = unownedTrapFixture;
        const auto base = reinterpret_cast<ULONG64>(GetModuleHandleW(nullptr));
        sites = {{{"owned_pre", static_cast<DWORD>(reinterpret_cast<ULONG64>(&ControllerFixturePre) - base)},
                  {"owned_post", static_cast<DWORD>(reinterpret_cast<ULONG64>(&ControllerFixturePost) - base)},
                  {"owned_aux_pre", static_cast<DWORD>(reinterpret_cast<ULONG64>(&ControllerFixtureAuxPre) - base)},
                  {"owned_aux_post", static_cast<DWORD>(reinterpret_cast<ULONG64>(&ControllerFixtureAuxPost) - base)}}};
    } else {
        // Only use two sites for the gate: the known pre/post inner-iteration
        // instruction boundaries. Remaining slots are still read-only leads.
        sites = {{{"iteration_pre", 0x1594c0}, {"iteration_post", 0x159581},
                  {"batch_entry", 0x1593b0}, {"command_entry", 0x9e2380}}};
    }
    PROCESS_INFORMATION child{};
    Session session;
    if (owned) {
        STARTUPINFOW startup{}; startup.cb = sizeof(startup);
        std::wstring command = L"\"" + path + L"\" --controller-fixture \"" + mappingName + L"\"";
        Require(CreateProcessW(path.c_str(), command.data(), nullptr, nullptr, FALSE, DEBUG_ONLY_THIS_PROCESS | CREATE_NO_WINDOW,
                nullptr, nullptr, &startup, &child) != FALSE, "cannot create owned controller fixture");
        targetPid = child.dwProcessId;
    } else Require(DebugActiveProcess(targetPid) != FALSE, "cannot attach exact target");
    Handle childProcess(child.hProcess); Handle childThread(child.hThread);
    session.pid = targetPid; session.attached = true; session.failStop = true;
    Require(DebugSetProcessKillOnExit(TRUE) != FALSE, "cannot arm debugger fail-stop kill-on-exit");
    session.killOnExit = true;
    session.process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, targetPid);
    Require(session.process != nullptr, "cannot open debugger target");
    Channel channel; channel.fixture.store(owned);
    WorkerLifetime worker(channel, pipeName, token);
    const ULONGLONG pipeStarted = GetTickCount64();
    while (!channel.listening.load() && !channel.failed.load() && GetTickCount64() - pipeStarted < 2000) Sleep(2);
    Require(channel.listening.load() && !channel.failed.load(), "controller pipe unavailable before gate activation");
    bool held = false, emergency = false, releasing = false, sawPost = false, detach = false;
    bool initialBreak = false, targetExited = false;
    DWORD simulationThread = 0;
    ULONG64 iterations = 0;
    ULONG64 trapHits = 0, missingDr6Hits = 0;
    std::set<DWORD> trapThreads;
    Request releaseRequest{};
    Request shutdownRequest{};
    std::vector<Request> waitingHolds;
    ULONGLONG releaseStarted = 0;
    const ULONGLONG started = GetTickCount64();
    printf("{\"event\":\"controller-started\",\"pid\":%lu,\"ownedFixture\":%s,\"guiFreezes\":true}\n", targetPid, owned ? "true" : "false"); fflush(stdout);
    while (!detach && !targetExited) {
      try {
        if (channel.lost.exchange(false) || channel.failed.load() || interrupted.exchange(false)) emergency = true;
        std::deque<Request> requests;
        { std::lock_guard<std::mutex> guard(channel.lock); requests.swap(channel.requests); }
        for (const auto& request : requests) {
            const char* state = emergency ? (held ? "emergency_halted" : "emergency_stopping") : held ? "held_at_pre" : "seeking_pre";
            if (request.control == "ping") channel.ReplyTo(request, false, StateReceipt(request, state, held, iterations, fixtureState, channel));
            else if (request.control == "bind") {
                if (!channel.boundSession.empty()) channel.ReplyTo(request, true, "{\"code\":\"SESSION_ALREADY_BOUND\"}");
                else {
                    channel.boundSession = request.sessionId; channel.boundRole = request.role;
                    channel.ReplyTo(request, false, StateReceipt(request, state, held, iterations, fixtureState, channel));
                }
            }
            else if (request.control == "shutdown") {
                // This is the only ordinary control that resumes the target and
                // detaches. Disconnect, errors and timeouts never imply resume.
                detach = true; shutdownRequest = request;
            } else if (request.control == "halt") {
                emergency = true;
                if (held) channel.ReplyTo(request, false, StateReceipt(request, "emergency_halted", true, iterations, fixtureState, channel));
                else waitingHolds.push_back(request);
            } else if (request.control == "hold") {
                if (held) channel.ReplyTo(request, false, StateReceipt(request, state, true, iterations, fixtureState, channel));
                else waitingHolds.push_back(request);
            } else if (request.control == "release") {
                if (channel.boundSession.empty()) channel.ReplyTo(request, true, "{\"code\":\"SESSION_NOT_BOUND\"}");
                else if (emergency || !held || releasing) channel.ReplyTo(request, true, "{\"code\":\"GATE_NOT_RELEASABLE\"}");
                else {
                    releasing = true; sawPost = false; releaseRequest = request; releaseStarted = GetTickCount64(); held = false;
                    Require(ContinueDebugEvent(session.event.dwProcessId, session.event.dwThreadId, session.disposition) != FALSE, "cannot release held pre-boundary");
                    session.pending = false;
                }
            }
        }
        if (detach) break;
        if (held) { Sleep(2); continue; }
        if (releasing && GetTickCount64() - releaseStarted > 2000) emergency = true;
        if (!simulationThread && GetTickCount64() - started > 15000) emergency = true;
        if (emergency && !session.pending) {
            Require(DebugBreakProcess(session.process) != FALSE, "cannot request emergency OS debugger break");
            // The resulting system breakpoint is handled below and retained.
        }
        if (!WaitForDebugEvent(&session.event, 20)) {
            Require(GetLastError() == ERROR_SEM_TIMEOUT, "controller debug wait failed"); continue;
        }
        session.pending = true; session.disposition = DBG_CONTINUE;
        auto& event = session.event;
        Require(event.dwProcessId == targetPid, "unexpected child debug event");
        if (event.dwDebugEventCode == CREATE_PROCESS_DEBUG_EVENT) {
            const auto& created = event.u.CreateProcessInfo;
            Handle file(created.hFile); session.debugProcess = created.hProcess; session.debugThreads[event.dwThreadId] = created.hThread;
            Require(ImagePath(created.hProcess) == path, "controller process image path mismatch");
            FILETIME expectedCreate{}, expectedExit{}, expectedKernel{}, expectedUser{}, actualCreate{}, actualExit{}, actualKernel{}, actualUser{};
            Require(GetProcessTimes(owned ? childProcess.value : initial.value, &expectedCreate, &expectedExit, &expectedKernel, &expectedUser) &&
                    GetProcessTimes(created.hProcess, &actualCreate, &actualExit, &actualKernel, &actualUser) &&
                    CompareFileTime(&expectedCreate, &actualCreate) == 0, "controller target PID reused");
            session.base = reinterpret_cast<ULONG64>(created.lpBaseOfImage); session.sites = sites;
            ValidateMapped(session.process, session.base, image, sites, false);
            session.AddThread(event.dwThreadId, created.hThread, session.base, sites);
        } else if (event.dwDebugEventCode == CREATE_THREAD_DEBUG_EVENT) {
            session.debugThreads[event.dwThreadId] = event.u.CreateThread.hThread;
            session.AddThread(event.dwThreadId, event.u.CreateThread.hThread, session.base, sites);
        } else if (event.dwDebugEventCode == EXIT_THREAD_DEBUG_EVENT) {
            session.debugThreads.erase(event.dwThreadId);
            auto found = session.threads.find(event.dwThreadId);
            if (found != session.threads.end()) { CloseHandle(found->second.handle); session.threads.erase(found); }
            if (event.dwThreadId == simulationThread) emergency = true;
        } else if (event.dwDebugEventCode == LOAD_DLL_DEBUG_EVENT) {
            if (event.u.LoadDll.hFile) CloseHandle(event.u.LoadDll.hFile);
        } else if (event.dwDebugEventCode == EXIT_PROCESS_DEBUG_EVENT) {
            session.exited = true; targetExited = true; session.debugProcess = nullptr; session.debugThreads.clear();
        } else if (event.dwDebugEventCode == EXCEPTION_DEBUG_EVENT) {
            session.disposition = DBG_EXCEPTION_NOT_HANDLED;
            const auto& exception = event.u.Exception.ExceptionRecord;
            if (IsSystemAttachBreakpoint(session.process, exception)) {
                session.disposition = DBG_CONTINUE;
                if (initialBreak && emergency) held = true;
                initialBreak = true;
            } else if (exception.ExceptionCode == EXCEPTION_SINGLE_STEP) {
                auto found = session.threads.find(event.dwThreadId);
                Require(found != session.threads.end(), "unknown controller trap thread");
                CONTEXT context{}; context.ContextFlags = CONTEXT_FULL | CONTEXT_DEBUG_REGISTERS;
                Require(GetThreadContext(found->second.handle, &context) != FALSE, "cannot inspect controller boundary");
                // Fault injection affects only the owned-fixture classification
                // input; the target still raises real hardware execution traps.
                if (missingDr6Fixture) context.Dr6 &= ~0xfULL;
                const int index = OwnedTrapSite(&found->second, exception, context, session.base, sites);
                if (index >= 0) {
                    ++trapHits; trapThreads.insert(event.dwThreadId);
                    if ((context.Dr6 & (1ULL << index)) == 0) ++missingDr6Hits;
                    context.EFlags |= 0x10000; context.Dr6 = 0;
                    Require(SetThreadContext(found->second.handle, &context) != FALSE, "cannot prepare gate instruction resume");
                    session.disposition = DBG_CONTINUE;
                    if (index <= 1 && simulationThread && simulationThread != event.dwThreadId) { emergency = true; held = true; }
                    else if (index == 0) {
                        simulationThread = event.dwThreadId; held = true; channel.ready.store(true);
                        if (releasing) {
                            if (!sawPost) emergency = true;
                            channel.ReplyTo(releaseRequest, emergency, emergency ? "{\"code\":\"ITERATION_SEQUENCE_MISMATCH\"}" :
                                StateReceipt(releaseRequest, "held_at_pre", true, iterations, fixtureState, channel));
                            releasing = false;
                        }
                    } else if (index == 1) {
                        if (!simulationThread && !releasing) {
                            // Attachment may land partway through an existing
                            // iteration. Synchronize at the next pre; do not
                            // count that partial iteration or claim a receipt.
                        } else if (!releasing || sawPost || event.dwThreadId != simulationThread) { emergency = true; held = true; }
                        else { sawPost = true; ++iterations; }
                    }
                } else {
                    // Do not consume an unrelated trap or let it execute while
                    // the gate claims control. Preserve its context/disposition
                    // and retain the event until authenticated shutdown.
                    EmitTrapDiagnostic("controller-unowned-single-step", event, context);
                    emergency = true; held = true;
                }
            } else if (!event.u.Exception.dwFirstChance) { emergency = true; held = true; }
        }
        if (emergency && session.pending) held = true;
        if (held) {
            if (emergency && releasing) {
                channel.ReplyTo(releaseRequest, true, "{\"code\":\"UNKNOWN_ITERATION_OUTCOME\"}");
                releasing = false;
            }
            for (const auto& request : waitingHolds) channel.ReplyTo(request, false,
                StateReceipt(request, emergency ? "emergency_halted" : "held_at_pre", true, iterations, fixtureState, channel));
            waitingHolds.clear();
        } else {
            Require(ContinueDebugEvent(event.dwProcessId, event.dwThreadId, session.disposition) != FALSE, "cannot continue gate event");
            session.pending = false;
        }
      } catch (const std::exception& error) {
        // Never unwind Session (which resumes during normal teardown) after a
        // gate failure. Retain the debug event and accept only explicit shutdown.
        emergency = true;
        held = session.pending;
        if (releasing) {
            channel.ReplyTo(releaseRequest, true, "{\"code\":\"UNKNOWN_ITERATION_OUTCOME\"}");
            releasing = false;
        }
        fprintf(stderr, "controller_emergency: %s\n", error.what());
        Sleep(20);
      }
    }
    // This is reached only from the authenticated shutdown control.  Clean
    // restores every debug register, drains pending traps, detaches, and only
    // then clears the process-wide kill-on-exit policy.  Any failure retains
    // failStop so destruction (or a crash) kills an attached target.
    Require(session.Clean(), "controller restore/detach failed");
    session.failStop = false;
    if (shutdownRequest.id) channel.ReplyTo(shutdownRequest, false, StateReceipt(shutdownRequest,
        session.exited ? "target_exited" : "resumed_and_detached", false, iterations, fixtureState, channel));
    if (fixtureState) {
        InterlockedExchange(&fixtureState->stop, 1);
        DWORD code = 999;
        const DWORD expectedCode = unownedTrapFixture ? EXCEPTION_SINGLE_STEP : 0;
        Require(WaitForSingleObject(childProcess.value, 3000) == WAIT_OBJECT_0 && GetExitCodeProcess(childProcess.value, &code) && code == expectedCode,
                "owned fixture failed after explicit resume/detach");
        if (unownedTrapFixture) {
            const LONG delivered = InterlockedCompareExchange(&fixtureState->unownedTrapDelivered, 0, 0);
            Require(delivered == 1, "unowned fixture exception was not delivered exactly once");
            printf("{\"event\":\"controller-unowned-trap-delivered\",\"handlerDeliveries\":%ld,\"exitCode\":%lu}\n", delivered, code);
        }
        UnmapViewOfFile(fixtureState);
    }
    // Allow the isolated worker to flush the explicit shutdown receipt.
    Sleep(30);
    printf("{\"event\":\"controller-detached\",\"completedIterations\":%llu,\"trapHits\":%llu,\"trapThreads\":%zu,"
           "\"missingDr6Hits\":%llu,\"restoredAndDetached\":true}\n", iterations, trapHits, trapThreads.size(), missingDr6Hits); fflush(stdout);
    return 0;
}
}
int wmain(int argc, wchar_t** argv) {
    SetConsoleCtrlHandler(Control, TRUE);
    try {
        if (argc == 2 && wcscmp(argv[1], L"--self-test-trap-ownership") == 0) return controller::TrapOwnershipFixture();
        if (argc == 3 && wcscmp(argv[1], L"--controller-fixture") == 0) return controller::Fixture(argv[2]);
        const bool slowFixture = argc == 4 && wcscmp(argv[1], L"--fixture-slow") == 0;
        const bool missingDr6Fixture = argc == 4 && wcscmp(argv[1], L"--fixture-missing-dr6") == 0;
        const bool unownedTrapFixture = argc == 4 && wcscmp(argv[1], L"--fixture-unowned-trap") == 0;
        const bool multithreadFixture = missingDr6Fixture || (argc == 4 && wcscmp(argv[1], L"--fixture-multithread") == 0);
        const bool fixture = argc == 4 && (wcscmp(argv[1], L"--fixture") == 0 || slowFixture || multithreadFixture || unownedTrapFixture) && wcscmp(argv[2], L"--pipe") == 0;
        const bool target = argc == 5 && wcscmp(argv[1], L"--pid") == 0 && wcscmp(argv[3], L"--pipe") == 0;
        Require(fixture || target, "usage: TF3RuntimeController --fixture --pipe NAME | --pid PID --pipe NAME; token in TF3_RUNTIME_TOKEN");
        const std::wstring name = argv[fixture ? 3 : 4];
        Require(!name.empty() && name.size() <= 80, "invalid pipe name length");
        for (wchar_t c : name) Require((c >= L'a' && c <= L'z') || (c >= L'A' && c <= L'Z') ||
            (c >= L'0' && c <= L'9') || c == L'_' || c == L'-', "invalid pipe name");
        char token[65]{};
        Require(GetEnvironmentVariableA("TF3_RUNTIME_TOKEN", token, sizeof(token)) == 64, "TF3_RUNTIME_TOKEN must contain 64 lowercase hex characters");
        for (size_t i = 0; i < 64; ++i) Require((token[i] >= '0' && token[i] <= '9') || (token[i] >= 'a' && token[i] <= 'f'), "invalid IPC token");
        return controller::Run(target ? Number(argv[2], 1, MAXDWORD) : 0, fixture, name, token,
                               slowFixture, multithreadFixture, missingDr6Fixture, unownedTrapFixture);
    } catch (const std::exception& error) { fprintf(stderr, "controller_error: %s\n", error.what()); return 2; }
}
