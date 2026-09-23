#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cwchar>
#include <iostream>
#include <string>
#include <atomic>
#include <array>
#include "runtime_ipc.h"
namespace {
tf3runtimeipc::RuntimeObservation OwnedObservation() noexcept {
  return {7, 65536, 123, 1, 261, true, true, true, false, false};
}
tf3runtimeipc::PassiveVehicleActionObservation OwnedPassiveVehicleObservation() noexcept {
  // Owned wire fixture: values are copied diagnostics, never object pointers.
  return {12, 9, 8, 2, 321, 66005, 1, true, true, true, true, false, false,
    8, 321, 66005, 1, 0, true, true, true, false, 321,
    8, 321, true, 8, 321, 66005, 1, 0, true, true, true, 8, 321,
    8, 23, 23, 23, 66005, 1, true, 321};
}
// Owned wire-contract fixture only. It models state transitions and delayed
// notifications without claiming a TF3 engine boundary.
std::atomic<unsigned int> gateState{0}; // 0 running, 1 held, 2 terminal, 3 detached
std::array<tf3runtimeipc::GateNotification, 4> notifications{};
std::size_t notificationRead=0, notificationWrite=0;
unsigned int notificationDelay=0;
bool Push(const tf3runtimeipc::GateRequest& request,
          tf3runtimeipc::GateReceipt receipt) noexcept {
  if (notificationWrite >= notifications.size()) return false;
  notifications[notificationWrite++] = {tf3runtimeipc::GateNotificationKind::receipt,
    request, receipt, tf3runtimeipc::GateEvent::boundary_applied};
  return true;
}
bool Push(const tf3runtimeipc::GateRequest& request,
          tf3runtimeipc::GateEvent event) noexcept {
  if (notificationWrite >= notifications.size()) return false;
  notifications[notificationWrite++] = {tf3runtimeipc::GateNotificationKind::event,
    request, tf3runtimeipc::GateReceipt::held, event};
  return true;
}
bool SubmitOwnedGate(const tf3runtimeipc::GateRequest& request) noexcept {
  using namespace tf3runtimeipc;
  const auto state = gateState.load();
  switch (request.control) {
    case GateControl::hold:
      if (state != 0) return false;
      gateState.store(1); return Push(request, GateReceipt::held);
    case GateControl::release:
      if (state != 1) return false;
      gateState.store(0); notificationDelay=20;
      return Push(request, GateReceipt::permit_consumed) &&
        Push(request, GateEvent::boundary_applied);
    case GateControl::halt:
      if (state == 2 || state == 3) return false;
      gateState.store(2); return Push(request, GateReceipt::halt_requested) &&
        Push(request, GateEvent::terminal_parked);
    case GateControl::detach:
      if (state != 0) return false;
      gateState.store(3); return Push(request, GateReceipt::detach_prepared) &&
        Push(request, GateEvent::detached);
  }
  return false;
}
bool PollOwnedGate(tf3runtimeipc::GateNotification* notification) noexcept {
  if (notificationDelay != 0) { --notificationDelay; return false; }
  if (notificationRead == notificationWrite) {
    notificationRead=0; notificationWrite=0; return false;
  }
  *notification = notifications[notificationRead++]; return true;
}
const tf3runtimeipc::GateProvider OwnedGateProvider{true, false, &SubmitOwnedGate, &PollOwnedGate};
std::atomic<bool> vehicleCancelArmed{false};
bool ArmOwnedVehicleCancel(const tf3runtimeipc::VehicleCancelArmRequest& request,
                           tf3runtimeipc::VehicleCancelArmReceipt* receipt) noexcept {
  // Owned fixture accepts one outstanding arm only. It does not touch a game
  // object or claim a cancellation was consumed; that needs a later observer receipt.
  if (!receipt || request.stopped != 1 || request.entity != 66005 ||
      request.correlation_id == 0 || request.deadline_ms <= GetTickCount64() ||
      vehicleCancelArmed.exchange(true)) return false;
  receipt->expected_invocation = 23;
  return true;
}
tf3runtimeipc::VehicleCancelArmSnapshot OwnedVehicleCancelSnapshot() noexcept {
  const bool armed = vehicleCancelArmed.load();
  return {armed ? tf3runtimeipc::VehicleCancelArmState::armed : tf3runtimeipc::VehicleCancelArmState::disabled,
    armed ? 23ULL : 0ULL, 0, armed ? 66005 : 0, 0,
    static_cast<std::uint8_t>(armed ? 1 : 0), 0, 0, false, false, false};
}
const tf3runtimeipc::VehicleCancelProvider OwnedVehicleCancelProvider{
  &ArmOwnedVehicleCancel, &OwnedVehicleCancelSnapshot};
}
int wmain(int argc,wchar_t** argv) {
  const bool leaseFixture = argc == 8 && std::wcscmp(argv[1], L"--owned-qualified-gate-fixture") == 0 &&
    std::wcscmp(argv[2], L"--gate-lease-ms") == 0;
  const bool inProcess = (argc == 6 || leaseFixture) && (std::wcscmp(argv[1], L"--in-process") == 0 ||
    std::wcscmp(argv[1], L"--in-process-observer") == 0 || std::wcscmp(argv[1], L"--in-process-passive-vehicle") == 0 ||
    std::wcscmp(argv[1], L"--owned-qualified-gate-fixture") == 0 || std::wcscmp(argv[1], L"--owned-vehicle-cancel-fixture") == 0);
  const bool withObserver = inProcess && std::wcscmp(argv[1], L"--in-process-observer") == 0;
  const bool withPassiveVehicle = inProcess && std::wcscmp(argv[1], L"--in-process-passive-vehicle") == 0;
  const bool withVehicleCancel = inProcess && std::wcscmp(argv[1], L"--owned-vehicle-cancel-fixture") == 0;
  const bool withGate = inProcess && std::wcscmp(argv[1], L"--owned-qualified-gate-fixture") == 0;
  const int first = leaseFixture ? 4 : (inProcess ? 2 : 1);
  if((!inProcess && argc != 5) || std::wcscmp(argv[first],L"--pipe") || std::wcscmp(argv[first + 2],L"--token")){std::wcerr<<L"usage: TF3RuntimeIpcHost [--in-process] --pipe <safe-name> --token <64-lowercase-hex>\n";return 2;}
  const std::wstring pipe=argv[first + 1]; const std::wstring wideToken=argv[first + 3];
  if(!tf3runtimeipc::ValidPipeName(pipe)||wideToken.size()!=64){return 3;}
  std::uint32_t leaseMs = TF3_RUNTIME_IPC_INPROCESS_GATE_LEASE_MS;
  if (leaseFixture) {
    wchar_t* end = nullptr;
    const unsigned long parsed = std::wcstoul(argv[3], &end, 10);
    if (end == argv[3] || *end != L'\0' || parsed < 100 || parsed > 30000) return 3;
    leaseMs = static_cast<std::uint32_t>(parsed);
  }
  std::string token; token.reserve(64); for(wchar_t c:wideToken){if(!((c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f')))return 3;token.push_back(static_cast<char>(c));}
  if(!tf3runtimeipc::ValidToken(token))return 3;
  return inProcess ? tf3runtimeipc::ServeInProcess(pipe,token,
    withObserver ? &OwnedObservation : nullptr, 0,
    withGate ? &OwnedGateProvider : nullptr, leaseMs,
    (withPassiveVehicle || withVehicleCancel) ? &OwnedPassiveVehicleObservation : nullptr,
    withVehicleCancel ? &OwnedVehicleCancelProvider : nullptr) : tf3runtimeipc::Serve(pipe,token);
}
