#include "loan_state_receiver.h"
#include "lua.h"
#include "lauxlib.h"
#include <cstdint>
#include <cstdio>
#include <stdexcept>
#include <string>

namespace {
unsigned cases = 0;
tf3loanstate::Receiver actual{0x12345000, 0x6789abc0};
void* receiverAddress = nullptr;
unsigned calls = 0;
unsigned fail_call = 0;
bool change_second = false;
tf3loanstate::Receiver changed{0x12345000, 0x6789abc1};

void Require(bool value, const char* label) {
    if (!value) throw std::runtime_error(label);
    ++cases;
}
int Type(lua_State* state, int index) { return lua_type(state, index); }
std::size_t RawLen(lua_State* state, int index) { return lua_rawlen(state, index); }
void* ToUserdata(lua_State* state, int index) { return lua_touserdata(state, index); }
bool Read(std::uint64_t address, void* output, std::size_t size) noexcept {
    ++calls;
    if (size != sizeof actual || address != reinterpret_cast<std::uint64_t>(receiverAddress)
        || calls == fail_call) return false;
    const auto& value = change_second && calls == 2 ? changed
        : *static_cast<const tf3loanstate::Receiver*>(receiverAddress);
    *static_cast<tf3loanstate::Receiver*>(output) = value;
    return true;
}
const tf3loanstate::ReceiverApi api{Type, RawLen, ToUserdata};
const tf3loanstate::Receiver expected{actual.vtable, actual.helper};

bool Check(lua_State* state, int index, const tf3loanstate::ReceiverApi& receiverApi = api,
    tf3loanstate::ReadSpan reader = Read) {
    const int top = state ? lua_gettop(state) : -1;
    const bool matched = tf3loanstate::MatchesReceiver(state, index, receiverApi, reader, expected);
    Require((state ? lua_gettop(state) : -1) == top, "receiver check preserves Lua stack");
    return matched;
}
void ResetReader() { calls = 0; fail_call = 0; change_second = false; }
}

int main() {
    try {
        lua_State* state = luaL_newstate();
        Require(state != nullptr, "Lua state created");

        auto* bytes = static_cast<unsigned char*>(lua_newuserdata(state, sizeof actual));
        *reinterpret_cast<tf3loanstate::Receiver*>(bytes) = actual;
        receiverAddress = bytes;
        Require(Check(state, 1), "matching full userdata accepted");
        Require(calls == 2, "valid userdata read twice");

        ResetReader();
        lua_newtable(state);
        Require(!Check(state, 2), "table rejected");
        Require(calls == 0, "table causes no external reads");
        lua_pushlightuserdata(state, &actual);
        Require(!Check(state, 3), "light userdata rejected");
        Require(calls == 0, "light userdata causes no external reads");
        lua_pushnil(state);
        Require(!Check(state, 4), "nil rejected");
        Require(calls == 0, "nil causes no external reads");

        ResetReader();
        lua_newuserdata(state, sizeof actual - 1);
        Require(!Check(state, 5), "wrong userdata length rejected");
        Require(calls == 0, "wrong length causes no external reads");

        ResetReader();
        auto* wrongVtable = static_cast<tf3loanstate::Receiver*>(lua_newuserdata(state, sizeof actual));
        *wrongVtable = {actual.vtable + 1, actual.helper};
        receiverAddress = wrongVtable;
        Require(!Check(state, 6), "wrong vtable rejected");
        Require(calls == 1, "wrong first vtable stops before second read");

        ResetReader();
        auto* wrongHelper = static_cast<tf3loanstate::Receiver*>(lua_newuserdata(state, sizeof actual));
        *wrongHelper = {actual.vtable, actual.helper + 1};
        receiverAddress = wrongHelper;
        Require(!Check(state, 7), "wrong helper rejected");
        Require(calls == 1, "wrong first helper stops before second read");

        ResetReader(); fail_call = 1;
        receiverAddress = bytes;
        Require(!Check(state, 1), "first read failure rejected");
        Require(calls == 1, "first read failure stops before second read");
        ResetReader(); fail_call = 2;
        Require(!Check(state, 1), "second read failure rejected");
        Require(calls == 2, "second read attempted exactly once");
        ResetReader(); change_second = true;
        Require(!Check(state, 1), "changed second read rejected");
        Require(calls == 2, "changed receiver read exactly twice");

        ResetReader();
        Require(!Check(nullptr, 1), "null state rejected");
        Require(!Check(state, 1, {nullptr, RawLen, ToUserdata}), "missing type API rejected");
        Require(!Check(state, 1, {Type, nullptr, ToUserdata}), "missing raw length API rejected");
        Require(!Check(state, 1, {Type, RawLen, nullptr}), "missing userdata API rejected");
        Require(!Check(state, 1, api, nullptr), "missing read callback rejected");
        Require(!tf3loanstate::MatchesReceiver(state, 1, api, Read, {0, expected.helper}),
            "zero expected vtable rejected");
        Require(!tf3loanstate::MatchesReceiver(state, 1, api, Read, {expected.vtable, 0}),
            "zero expected helper rejected");
        Require(!Check(state, 0) && !Check(state, LUA_REGISTRYINDEX),
            "non-argument indices rejected before Lua access");
        Require(!tf3loanstate::MatchesReceiver(state, 1, api, Read, {UINT64_MAX, expected.helper}) &&
            !tf3loanstate::MatchesReceiver(state, 1, api, Read, {expected.vtable, UINT64_MAX}),
            "noncanonical expected receiver rejected");

        std::printf("loan_state_receiver_owned_pass cases=%u; synthetic Lua userdata only; no TF3 pointers or permission\n", cases);
        lua_close(state);
        return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "loan_state_receiver_owned_failed: %s\n", error.what());
        return 1;
    }
}
