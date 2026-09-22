// OWNED PROCESS ONLY. No TF3 loading, code patching, or production capability.
#include "inprocess_control.h"
#include "runtime_ipc.h"
#include <bcrypt.h>
#include <sddl.h>
#include <array>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <set>
#include <string>
#include <thread>
#include <vector>

namespace {
using tf3inprocesscontrol::Control;
using tf3inprocesscontrol::Result;
using tf3inprocesscontrol::State;
constexpr DWORD kOperationMs = 250;
constexpr ULONGLONG kFrameMs = 500;
struct Handle {
    HANDLE value;
    explicit Handle(HANDLE handle) : value(handle) {}
    ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
struct Fixture {
    Control control;
    std::atomic<std::uint64_t> iterations{0};
    std::atomic<bool> owner_stopped{false};
    std::atomic<bool> operation_done{false};
    std::atomic<Result> operation_result{Result::invalid_transition};
    std::thread owner;
    std::thread operation;
    explicit Fixture(DWORD step_ms) {
        // Begin seeking a real ordinary-execution boundary before serving IPC.
        (void)control.Hold(0);
        owner = std::thread([this, step_ms] {
            while (control.Boundary() == tf3inprocesscontrol::BoundaryResult::advance) {
                Sleep(step_ms);
                iterations.fetch_add(1, std::memory_order_release);
            }
            owner_stopped.store(true, std::memory_order_release);
        });
    }
    ~Fixture() {
        (void)control.Disconnect(0);
        if (owner.joinable()) owner.join();
        if (operation.joinable()) operation.join();
    }
};
bool SafeName(const std::wstring& name) {
    if (name.empty() || name.size() > 80) return false;
    for (wchar_t c : name) if (!((c >= L'a' && c <= L'z') || (c >= L'A' && c <= L'Z') ||
        (c >= L'0' && c <= L'9') || c == L'_' || c == L'-')) return false;
    return true;
}
HANDLE Pipe(const std::wstring& name) {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;GA;;;OW)", SDDL_REVISION_1,
        &descriptor, nullptr)) return INVALID_HANDLE_VALUE;
    SECURITY_ATTRIBUTES security{sizeof(security), descriptor, FALSE};
    const std::wstring path = L"\\\\.\\pipe\\" + name;
    const HANDLE pipe = CreateNamedPipeW(path.c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
        PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_NOWAIT | PIPE_REJECT_REMOTE_CLIENTS,
        1, 8192, 8192, 0, &security);
    LocalFree(descriptor);
    return pipe;
}
bool Write(HANDLE pipe, const void* data, DWORD size) {
    const auto* bytes = static_cast<const unsigned char*>(data);
    const ULONGLONG deadline = GetTickCount64() + 100;
    while (size) {
        DWORD written = 0;
        if (WriteFile(pipe, bytes, size, &written, nullptr) && written) {
            bytes += written; size -= written; continue;
        }
        const DWORD error = GetLastError();
        if (error != ERROR_NO_DATA || GetTickCount64() >= deadline) return false;
        Sleep(1);
    }
    return true;
}
bool Send(HANDLE pipe, Tf3RuntimeIpcType type, std::uint64_t id,
          const std::array<unsigned char, 16>& epoch, const std::string& body) {
    Tf3RuntimeIpcFrameHeader header{TF3_RUNTIME_IPC_MAGIC, TF3_RUNTIME_IPC_VERSION,
        static_cast<std::uint16_t>(type), static_cast<std::uint32_t>(body.size()), id, {}};
    std::memcpy(header.session, epoch.data(), epoch.size());
    return Write(pipe, &header, sizeof(header)) && Write(pipe, body.data(), static_cast<DWORD>(body.size()));
}
bool Equal(const std::string& left, const std::string& right) {
    if (left.size() != right.size()) return false;
    unsigned char different = 0;
    for (std::size_t i = 0; i < left.size(); ++i)
        different |= static_cast<unsigned char>(left[i] ^ right[i]);
    return different == 0;
}
std::string Fields(const Fixture& fixture, bool halted) {
    const auto state = fixture.control.Read().state;
    const bool stopped = fixture.owner_stopped.load(std::memory_order_acquire);
    // Informational state only. A release receipt additionally requires the
    // operation's acquire-published completion at the following boundary.
    const bool held_ready = state == State::held && fixture.control.Read().held_ready;
    return ",\"protocolHalted\":" + std::string(halted ? "true" : "false") +
        ",\"simulationThreadHeld\":" + (held_ready ? "true" : "false") +
        ",\"engineHalted\":false,\"fixtureWorkerStopped\":" + (stopped ? "true" : "false") +
        ",\"completedIterations\":" + std::to_string(fixture.iterations.load(std::memory_order_acquire)) +
        ",\"productionQualified\":false";
}
int Serve(const std::wstring& name, const std::string& token, DWORD step_ms) {
    Handle pipe(Pipe(name));
    if (pipe.value == INVALID_HANDLE_VALUE) return 10;
    Fixture fixture(step_ms);
    const ULONGLONG startup = GetTickCount64();
    // State::held is published just before its acknowledgement. Do not expose
    // release admission until that initial acknowledgement is complete.
    while (fixture.control.Read().hold_acknowledged == 0) {
        if (GetTickCount64() - startup > 1000) return 14;
        Sleep(1);
    }
    bool connected = false;
    while (GetTickCount64() - startup < 3000) {
        if (ConnectNamedPipe(pipe.value, nullptr) || GetLastError() == ERROR_PIPE_CONNECTED) { connected = true; break; }
        if (GetLastError() != ERROR_PIPE_LISTENING) return 11;
        Sleep(2);
    }
    if (!connected) return 12;
    std::array<unsigned char, 16> epoch{};
    if (BCryptGenRandom(nullptr, epoch.data(), static_cast<ULONG>(epoch.size()), BCRYPT_USE_SYSTEM_PREFERRED_RNG) < 0) return 13;
    bool authenticated = false, halted = false, closing = false;
    std::vector<unsigned char> input;
    std::set<std::uint64_t> seen;
    std::uint64_t last_id = 0, pending_id = 0;
    std::string pending_control;
    ULONGLONG partial_started = 0, last_traffic = GetTickCount64(), close_deadline = 0;
    auto send = [&](Tf3RuntimeIpcType type, std::uint64_t id, const std::string& body) {
        if (!Send(pipe.value, type, id, epoch, body)) connected = false;
    };
    auto error = [&](std::uint64_t id, const char* code) {
        send(Tf3RuntimeIpcType::error, id, "{\"code\":\"" + std::string(code) + "\"" + Fields(fixture, halted) + "}");
    };
    while (connected) {
        const ULONGLONG now = GetTickCount64();
        if ((!authenticated && now - last_traffic > 1000) || now - last_traffic > 3000 ||
            (partial_started && now - partial_started > kFrameMs) || (closing && now >= close_deadline)) break;
        if (pending_id && fixture.operation_done.load(std::memory_order_acquire)) {
            fixture.operation.join();
            const Result result = fixture.operation_result.load(std::memory_order_relaxed);
            const bool success = result == Result::accepted || result == Result::already_held;
            if (!success) { halted = true; (void)fixture.control.Halt(0); }
            if (success && !halted) send(Tf3RuntimeIpcType::receipt, pending_id,
                "{\"status\":\"completed\",\"control\":\"" + pending_control + "\"" + Fields(fixture, halted) + "}");
            else error(pending_id, pending_control == "release-one" ? "UNKNOWN_ITERATION_OUTCOME" : "HOLD_NOT_CONFIRMED");
            pending_id = 0;
        }
        DWORD available = 0;
        if (!PeekNamedPipe(pipe.value, nullptr, 0, nullptr, &available, nullptr)) break;
        if (available) {
            unsigned char bytes[4096]{};
            DWORD got = 0;
            if (!ReadFile(pipe.value, bytes, (available < sizeof(bytes) ? available : static_cast<DWORD>(sizeof(bytes))), &got, nullptr) || !got) break;
            if (input.empty()) partial_started = now;
            input.insert(input.end(), bytes, bytes + got);
            if (input.size() > 8192) break;
        }
        while (connected && !closing && input.size() >= sizeof(Tf3RuntimeIpcFrameHeader)) {
            Tf3RuntimeIpcFrameHeader header{};
            std::memcpy(&header, input.data(), sizeof(header));
            if (header.magic != TF3_RUNTIME_IPC_MAGIC || header.version != TF3_RUNTIME_IPC_VERSION ||
                header.payload_size > TF3_RUNTIME_IPC_MAX_PAYLOAD || !header.correlation_id) { connected = false; break; }
            const auto size = sizeof(header) + header.payload_size;
            if (input.size() < size) break;
            const std::string body(reinterpret_cast<const char*>(input.data() + sizeof(header)), header.payload_size);
            input.erase(input.begin(), input.begin() + static_cast<std::ptrdiff_t>(size));
            partial_started = input.empty() ? 0 : now;
            last_traffic = now;
            if (!authenticated) {
                const std::array<unsigned char, 16> empty{};
                if (header.type != static_cast<std::uint16_t>(Tf3RuntimeIpcType::hello) ||
                    std::memcmp(header.session, empty.data(), empty.size()) || !Equal(body, "{\"token\":\"" + token + "\"}")) { connected = false; break; }
                authenticated = true;
                last_id = header.correlation_id; seen.insert(last_id);
                send(Tf3RuntimeIpcType::hello_ack, last_id,
                    "{\"capabilities\":[\"transport.health\",\"qualification.owned.control\"],\"engineObserver\":false,\"productionQualified\":false}");
                continue;
            }
            if (header.type != static_cast<std::uint16_t>(Tf3RuntimeIpcType::control) ||
                std::memcmp(header.session, epoch.data(), epoch.size())) { connected = false; break; }
            const auto id = header.correlation_id;
            if (seen.count(id)) { error(id, "DUPLICATE_ID"); continue; }
            if (id <= last_id) { error(id, "OUT_OF_ORDER_ID"); continue; }
            if (seen.size() >= 4096) { connected = false; break; }
            seen.insert(id); last_id = id;
            std::string control;
            for (const char* candidate : {"ping", "hold", "release-one", "halt", "shutdown"})
                if (body == "{\"control\":\"" + std::string(candidate) + "\"}") control = candidate;
            if (control.empty()) { error(id, "INVALID_CONTROL"); continue; }
            if (control == "ping") {
                send(Tf3RuntimeIpcType::receipt, id, "{\"status\":\"observed\",\"control\":\"ping\"" + Fields(fixture, halted) + "}");
            } else if (control == "halt" || control == "shutdown") {
                halted = true; (void)fixture.control.Halt(0);
                send(Tf3RuntimeIpcType::receipt, id, "{\"status\":\"accepted\",\"control\":\"" + control + "\"" + Fields(fixture, halted) + "}");
                if (control == "shutdown") { closing = true; close_deadline = now + 500; }
            } else if (halted) error(id, "PROTOCOL_HALTED");
            else if (pending_id) error(id, "CONTROL_PENDING");
            else if (control == "hold" && fixture.control.Read().state == State::held) {
                send(Tf3RuntimeIpcType::receipt, id, "{\"status\":\"completed\",\"control\":\"hold\"" + Fields(fixture, false) + "}");
            } else {
                // The fixture starts held and every release reholds. It has
                // no unrestricted-running operation and never queues a retry.
                if (fixture.control.Read().state != State::held) { error(id, "GATE_NOT_HELD"); continue; }
                pending_id = id; pending_control = control;
                fixture.operation_done.store(false, std::memory_order_relaxed);
                fixture.operation = std::thread([&fixture] {
                    const Result result = fixture.control.ReleaseOne(kOperationMs);
                    fixture.operation_result.store(result, std::memory_order_relaxed);
                    fixture.operation_done.store(true, std::memory_order_release);
                });
            }
        }
        Sleep(1);
    }
    halted = true;
    (void)fixture.control.Disconnect(0);
    fixture.owner.join();
    if (fixture.operation.joinable()) fixture.operation.join();
    DisconnectNamedPipe(pipe.value);
    const std::string report = "{\"event\":\"owned-control-stopped\",\"authenticated\":" +
        std::string(authenticated ? "true" : "false") + Fields(fixture, halted) + "}";
    std::puts(report.c_str());
    return 0;
}
}
int wmain(int argc, wchar_t** argv) {
    try {
        if ((argc != 3 && argc != 4) || std::wcscmp(argv[1], L"--pipe") || !SafeName(argv[2]) ||
            (argc == 4 && std::wcscmp(argv[3], L"--slow-step"))) return 2;
        char token[65]{};
        if (GetEnvironmentVariableA("TF3_RUNTIME_TOKEN", token, sizeof(token)) != 64) return 3;
        for (std::size_t i = 0; i < 64; ++i)
            if (!((token[i] >= '0' && token[i] <= '9') || (token[i] >= 'a' && token[i] <= 'f'))) return 3;
        return Serve(argv[2], token, argc == 4 ? 1000 : 5);
    } catch (...) { return 20; }
}
