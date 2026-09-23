#pragma once

// Deliberately narrow native-runtime transport boundary.  The observer owns all
// game-thread work; this transport never receives a game pointer, path, or code.
#include <cstdint>
#include <string>

constexpr std::uint32_t TF3_RUNTIME_IPC_MAGIC = 0x54463349u; // "IF3T"
constexpr std::uint16_t TF3_RUNTIME_IPC_VERSION = 1;
constexpr std::uint32_t TF3_RUNTIME_IPC_MAX_PAYLOAD = 4096;
// A qualified in-process gate must not remain attached indefinitely when its
// authenticated controller stops servicing it.  This exceeds the current
// coordinator heartbeat period while still bounding a hung local helper.
constexpr std::uint32_t TF3_RUNTIME_IPC_INPROCESS_GATE_LEASE_MS = 15000;

enum class Tf3RuntimeIpcType : std::uint16_t {
  hello = 1, hello_ack = 2, control = 3, receipt = 4, event = 5, error = 6,
};

#pragma pack(push, 1)
struct Tf3RuntimeIpcFrameHeader {
  std::uint32_t magic;
  std::uint16_t version;
  std::uint16_t type;
  std::uint32_t payload_size;
  std::uint64_t correlation_id;
  std::uint8_t session[16];
};
#pragma pack(pop)
static_assert(sizeof(Tf3RuntimeIpcFrameHeader) == 36, "wire header drift");

namespace tf3runtimeipc {

struct RuntimeObservation {
  std::uint64_t hits;
  std::uint64_t minimum_stack_headroom;
  // Legacy observation-owner sample retained for compatibility. A later
  // callback can update it, so it is not admission affinity evidence.
  std::uint32_t owner_thread;
  std::uint32_t cfg_flags;
  std::uint32_t cet_flags;
  bool cfg_known;
  bool cet_known;
  bool active;
  bool cross_thread;
  bool saturated;
};
using RuntimeObservationProvider = RuntimeObservation (*)() noexcept;

// A candidate action is deliberately a diagnostic, not a command.  It is a
// pointer-free snapshot copied at an exact instruction boundary; it carries no
// game allocation, callback, object lifetime, or replay authority.  The
// native worker reads this only after authentication, never from VEH.
struct PassiveVehicleActionObservation {
  std::uint64_t factory_hits;
  std::uint64_t admission_hits;
  std::uint64_t correlated_hits;
  std::uint64_t dropped_candidates;
  std::uint32_t owner_thread;
  std::int32_t latest_entity;
  std::uint8_t latest_stopped;
  bool latest_valid;
  bool latest_entry_result_zero;
  bool latest_callback_shape_matches;
  bool active;
  bool cross_thread;
  bool saturated;
  // Callback receipts are copied scalar diagnostics from the observer-owned
  // storage.  They are intentionally pointer-free and do not authorize a
  // callback, replay, or engine command.
  std::uint64_t callback_hits;
  std::uint32_t callback_thread;
  std::int32_t latest_callback_entity;
  std::uint8_t latest_callback_stopped;
  std::uint8_t latest_callback_result;
  bool latest_callback_valid;
  bool latest_callback_matches_admission_storage;
  bool latest_admission_progress_known;
  bool latest_admission_progress_empty;
  // Copied at the correlated admission boundary; no thread handle/pointer
  // crosses this transport boundary.
  std::uint32_t latest_correlated_admission_thread;
  // Normal native call-return observations, not Lua command success or
  // permission to suppress or replay a command.
  std::uint64_t send_return_hits;
  std::uint32_t send_return_thread;
  bool latest_send_return_matches_admission_storage;
  std::uint64_t marshaler_return_hits;
  std::uint32_t marshaler_return_thread;
  std::int32_t latest_marshaler_entity;
  std::uint8_t latest_marshaler_stopped;
  std::uint8_t latest_marshaler_result;
  bool latest_marshaler_valid;
  bool latest_marshaler_matches_admission_storage;
  bool latest_marshaler_matches_callback_storage;
  // Continuation after the common send body has returned normally and run
  // its local cleanup. This remains passive evidence, not Lua/UI success.
  std::uint64_t post_send_body_hits;
  std::uint32_t post_send_body_thread;
  std::uint64_t post_send_body_correlated_hits;
  std::uint64_t latest_correlated_admission_invocation;
  std::uint64_t latest_send_return_invocation;
  std::uint64_t latest_post_send_body_invocation;
  std::int32_t latest_post_send_body_entity;
  std::uint8_t latest_post_send_body_stopped;
  bool latest_post_send_body_valid;
  std::uint32_t latest_post_send_body_thread;
};
using PassiveVehicleActionObservationProvider =
  PassiveVehicleActionObservation (*)() noexcept;

// A one-use cancellation arm is intentionally narrower than a vehicle command:
// it names the next qualified action and expires at a native-computed deadline.
// The provider owns the action correlation and consumes the arm at its exact
// qualified boundary.  The pipe worker never receives an engine pointer.
struct VehicleCancelArmRequest {
  std::int32_t entity;
  std::uint8_t stopped;
  std::uint64_t deadline_ms;
  std::uint64_t correlation_id;
};
struct VehicleCancelArmReceipt { std::uint64_t expected_invocation; };
using VehicleCancelArmProvider = bool (*)(const VehicleCancelArmRequest&,
                                          VehicleCancelArmReceipt*) noexcept;
enum class VehicleCancelArmState : std::uint8_t {
  disabled, armed, claiming, claimed, completed, expired, revoked, failed,
};
struct VehicleCancelArmSnapshot {
  VehicleCancelArmState state;
  std::uint64_t expected_invocation;
  std::uint64_t claimed_invocation;
  std::int32_t expected_entity;
  std::int32_t claimed_entity;
  std::uint8_t expected_stopped;
  std::uint8_t claimed_stopped;
  std::uint32_t claimed_thread;
  bool callback_result_zero;
  bool send_return;
  bool post_send_body;
};
using VehicleCancelArmSnapshotProvider = VehicleCancelArmSnapshot (*)() noexcept;
struct VehicleCancelProvider {
  VehicleCancelArmProvider arm;
  // Optional, pointer-free diagnostic snapshot. It reports observed lifecycle
  // facts only; no acknowledgement from this transport is cancellation proof.
  VehicleCancelArmSnapshotProvider snapshot;
};

// A deliberately small bridge from the transport to a qualified native update
// boundary.  It does not expose a game pointer or permit the pipe worker to
// wait on the simulation thread. Submit must be bounded and non-blocking;
// delayed observed effects are returned by poll_event on later transport
// iterations. The production adapter owns all gate-state validation.
enum class GateControl : std::uint8_t { hold, release, halt, detach };
enum class GateReceipt : std::uint8_t { held, permit_consumed, halt_requested, detach_prepared };
enum class GateEvent : std::uint8_t { boundary_applied, terminal_parked, detached };
struct GateRequest {
  GateControl control;
  std::uint64_t epoch;
  std::uint64_t generation;
  std::uint64_t correlation_id;
};
struct GateEventRecord {
  GateEvent event;
  std::uint64_t epoch;
  std::uint64_t generation;
  std::uint64_t correlation_id;
};
enum class GateNotificationKind : std::uint8_t { receipt, event };
struct GateNotification {
  GateNotificationKind kind;
  GateRequest request;
  GateReceipt receipt;
  GateEvent event;
};
using GateSubmitProvider = bool (*)(const GateRequest&) noexcept;
using GatePollNotificationProvider = bool (*)(GateNotification*) noexcept;
struct GateProvider {
  // This must remain false until the concrete TF3 build, native boundary and
  // halt path have been qualified. A fixture may exercise the wire contract,
  // but it must not advertise these capabilities as production-qualified.
  bool qualification_enabled;
  bool production_qualified;
  GateSubmitProvider submit;
  GatePollNotificationProvider poll_notification;
};

bool ValidPipeName(const std::wstring& name);
bool ValidToken(const std::string& token);

// Diagnostic host: transport health only.  This remains the contract used by
// TF3RuntimeIpcHost.exe and must not be mistaken for an engine binding.
int Serve(const std::wstring& name, const std::string& token);

// In-process transport boundary. This adds a persistent session bind and may
// expose the exact-build post-iteration observer. A concrete provider may
// advertise production qualification only after real TF3 hold/halt/detach
// evidence; diagnostic and owned-fixture providers remain false.
int ServeInProcess(const std::wstring& name, const std::string& token,
                   RuntimeObservationProvider observer = nullptr,
                   std::uint32_t observer_start_status = 0,
                   const GateProvider* gate_provider = nullptr,
                   std::uint32_t authenticated_session_lease_ms =
                     TF3_RUNTIME_IPC_INPROCESS_GATE_LEASE_MS,
                   PassiveVehicleActionObservationProvider passive_vehicle = nullptr,
                   const VehicleCancelProvider* vehicle_cancel_provider = nullptr);

}  // namespace tf3runtimeipc
