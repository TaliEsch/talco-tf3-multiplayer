#pragma once

// Deliberately narrow native-runtime transport boundary.  The observer owns all
// game-thread work; this transport never receives a game pointer, path, or code.
#include <cstdint>

constexpr std::uint32_t TF3_RUNTIME_IPC_MAGIC = 0x54463349u; // "IF3T"
constexpr std::uint16_t TF3_RUNTIME_IPC_VERSION = 1;
constexpr std::uint32_t TF3_RUNTIME_IPC_MAX_PAYLOAD = 4096;

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

// Observer integration contract (implemented by a future *qualified* TF3
// observer, not by this host):
//   bool enqueue_control(const char* canonical_json, uint64_t correlation);
//   void poll_game_thread(); // emits a receipt/event only after observed effect
//   void shutdown();
// The observer must advertise capabilities only after build/ABI/thread gates.
