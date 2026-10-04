#include "common_exit_cold_owner_witness.h"

#include <cstdint>
#include <cstring>
#include <iostream>

namespace {
constexpr std::uint64_t kGame = 0x10000000;
constexpr std::uint64_t kManager = 0x20000000;
constexpr std::uint32_t kThread = 1234;

struct Memory {
    std::uint64_t manager = kManager;
    std::uint32_t thread = kThread;
    int fault_at = 0;
    bool change_manager = false;
    bool change_thread = false;
    int calls = 0;
    int manager_reads = 0;
    int thread_reads = 0;
} memory;

bool Read(std::uint64_t address, void* target, std::size_t bytes) noexcept {
    ++memory.calls;
    if (memory.calls == memory.fault_at) return false;
    if (address == kGame + 0x1f0 && bytes == sizeof(std::uint64_t)) {
        ++memory.manager_reads;
        const auto value = memory.change_manager && memory.manager_reads == 2
            ? memory.manager + 8 : memory.manager;
        std::memcpy(target, &value, bytes);
        return true;
    }
    if (address == memory.manager + 0xa8 && bytes == sizeof(std::uint32_t)) {
        ++memory.thread_reads;
        const auto value = memory.change_thread && memory.thread_reads == 2
            ? memory.thread + 1 : memory.thread;
        std::memcpy(target, &value, bytes);
        return true;
    }
    return false;
}

bool Case(const char* name, tf3commonexitcoldowner::Result expected,
          std::uint64_t game = kGame, std::uint32_t current = kThread,
          tf3commonexitcoldowner::ReadSpan read = Read) {
    tf3commonexitcoldowner::Snapshot snapshot{0xdeadbeefu};
    const auto actual = tf3commonexitcoldowner::CaptureSavedRoot(
        game, current, read, &snapshot);
    const bool passed = actual == expected &&
        snapshot.thread_id == (expected == tf3commonexitcoldowner::Result::matched
            ? kThread : 0xdeadbeefu);
    if (!passed) std::cerr << "failed: " << name << '\n';
    return passed;
}
}

int main() {
    using tf3commonexitcoldowner::Result;
    bool passed = true;
    int cases = 0;
    const auto check = [&](const char* name, Result expected,
                           std::uint64_t game = kGame,
                           std::uint32_t current = kThread,
                           tf3commonexitcoldowner::ReadSpan read = Read) {
        memory = {};
        passed = Case(name, expected, game, current, read) && passed;
        ++cases;
    };
    check("stable current thread", Result::matched);
    check("null game", Result::invalid_game, 0);
    check("overflow game field", Result::invalid_game, 0x00007ffffffffe80ULL);
    check("misaligned game", Result::invalid_game, kGame + 1);
    check("zero current thread", Result::invalid_input, kGame, 0);
    check("null reader", Result::invalid_input, kGame, kThread, nullptr);
    memory = {};
    tf3commonexitcoldowner::Snapshot sentinel{0xdeadbeefu};
    passed = tf3commonexitcoldowner::CaptureSavedRoot(kGame, kThread, Read, nullptr)
        == Result::invalid_input && sentinel.thread_id == 0xdeadbeefu && passed;
    ++cases;
    for (int fault = 1; fault <= 4; ++fault) {
        memory = {};
        memory.fault_at = fault;
        passed = Case("read fault", Result::read_fault) && passed;
        ++cases;
    }
    memory = {}; memory.manager = 0;
    passed = Case("null manager", Result::invalid_manager) && passed; ++cases;
    memory = {}; memory.manager = kManager + 1;
    passed = Case("misaligned manager", Result::invalid_manager) && passed; ++cases;
    memory = {}; memory.manager = 0x00007fffffffff80ULL;
    passed = Case("overflow manager field", Result::invalid_manager) && passed; ++cases;
    memory = {}; memory.thread = 0;
    passed = Case("zero thread", Result::zero_thread) && passed; ++cases;
    memory = {}; memory.thread = kThread + 1;
    passed = Case("foreign thread", Result::foreign_thread) && passed; ++cases;
    memory = {}; memory.change_manager = true;
    passed = Case("manager changed on reread", Result::changed_manager) && passed; ++cases;
    memory = {}; memory.change_thread = true;
    passed = Case("thread changed on reread", Result::changed_thread) && passed; ++cases;
    std::cout << std::boolalpha << "{\"scope\":\"common-exit-cold-owner-witness-owned\","
        "\"tf3Qualified\":false,\"activationPermitted\":false,\"passed\":"
        << passed << ",\"cases\":" << cases << "}\n";
    return passed ? 0 : 1;
}
