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
                     TF3_RUNTIME_IPC_INPROCESS_GATE_LEASE_MS);

}  // namespace tf3runtimeipc
