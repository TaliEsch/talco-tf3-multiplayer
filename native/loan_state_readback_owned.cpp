#include "loan_state_readback.h"
#include "lua.h"
#include "lauxlib.h"
#include <cmath>
#include <cstdio>
#include <stdexcept>

namespace {
using Readback = tf3loanstate::ProtectedReadback<struct Binding>;
struct Snapshot { double owner; double loan; };
unsigned cases = 0, reads = 0, validations = 0, getterCalls = 0, indexCalls = 0;
void* receiverAddress = nullptr;
void* classKey = reinterpret_cast<void*>(0x1234);
void* upvalueKey = reinterpret_cast<void*>(0x2345);
bool witnessValid = true, witnessInvalidatesInGetter = false;
bool mutateReceiver = false, getterErrors = false, decoderErrors = false;
int prepareMutation = 0;
int getterMode = 0; // 0: normal table; 1: scalar; 2: table with a metatable; 3: bad number.
int registryMode = 0; // 0: correct table; 1: absent; 2: wrong value.
int getterModeInstall = 0; // 0: exact getter; 1: absent; 2: wrong C function.
int closureUpvalues = 1, upvalueMode = 0;
tf3loanstate::Receiver receiver{0x12345000, 0x6789abc0};

void Require(bool value, const char* label) {
    if (!value) throw std::runtime_error(label);
    ++cases;
}
bool ReadMemory(std::uint64_t address, void* output, std::size_t size) noexcept {
    ++reads;
    if (!receiverAddress || address != reinterpret_cast<std::uint64_t>(receiverAddress)
        || size != sizeof receiver) return false;
    *static_cast<tf3loanstate::Receiver*>(output) =
        *static_cast<const tf3loanstate::Receiver*>(receiverAddress);
    return true;
}
int CheckType(lua_State* s, int i) { return lua_type(s, i); }
std::size_t RawLen(lua_State* s, int i) { return lua_rawlen(s, i); }
void* ToUserdata(lua_State* s, int i) { return lua_touserdata(s, i); }
int GetTop(lua_State* s) { return lua_gettop(s); }
int CheckStack(lua_State* s, int n) { return lua_checkstack(s, n); }
void SetTop(lua_State* s, int i) { lua_settop(s, i); }
void PushClosure(lua_State* s, tf3loanstate::CFunction f, int n) { lua_pushcclosure(s, f, n); }
void PushLight(lua_State* s, void* p) { lua_pushlightuserdata(s, p); }
void PushValue(lua_State* s, int i) { lua_pushvalue(s, i); }
int GetMetatable(lua_State* s, int i) { return lua_getmetatable(s, i); }
void RawGetP(lua_State* s, int i, const void* p) { lua_rawgetp(s, i, p); }
int RawEqual(lua_State* s, int a, int b) { return lua_rawequal(s, a, b); }
const char* PushString(lua_State* s, const char* p, std::size_t n) { return lua_pushlstring(s, p, n); }
void RawGet(lua_State* s, int i) { lua_rawget(s, i); }
const char* GetUpvalue(lua_State* s, int i, int n) { return lua_getupvalue(s, i, n); }
int ProtectedCall(lua_State* s, int a, int r, int e, int c, tf3loanstate::CFunction k) {
    return lua_pcallk(s, a, r, e, c, k);
}
const tf3loanstate::GetterApi getterApi{{CheckType, RawLen, ToUserdata}, GetTop,
    CheckStack, SetTop, PushClosure, PushLight, PushValue, GetMetatable, RawGetP,
    RawEqual, PushString, RawGet, GetUpvalue, ProtectedCall};

int Getter(lua_State* s) {
    ++getterCalls;
    if (getterErrors) return luaL_error(s, "synthetic getter failure");
    if (mutateReceiver && receiverAddress) {
        auto* value = static_cast<tf3loanstate::Receiver*>(receiverAddress);
        value->helper++;
    }
    if (witnessInvalidatesInGetter) witnessValid = false;
    if (getterMode == 1) { lua_pushnumber(s, 42); return 1; }
    lua_createtable(s, 0, 2);
    lua_pushnumber(s, getterMode == 3 ? 57.5 : 57); lua_setfield(s, -2, "owner");
    lua_pushnumber(s, 9); lua_setfield(s, -2, "loan");
    if (getterMode == 2) {
        lua_newtable(s);
        lua_pushcfunction(s, [](lua_State* inner) -> int { ++indexCalls; return luaL_error(inner, "hostile __index ran"); });
        lua_setfield(s, -2, "__index");
        lua_setmetatable(s, -2);
    }
    return 1;
}
int WrongGetter(lua_State* s) { lua_pushnil(s); return 1; }
int HostileIndex(lua_State* s) { ++indexCalls; return luaL_error(s, "hostile __index ran"); }

struct Binding {
    using Observation = Snapshot;
    static const tf3loanstate::GetterApi& Functions() { return getterApi; }
    static bool Read(std::uint64_t a, void* o, std::size_t n) noexcept { return ReadMemory(a, o, n); }
    static bool ValidateCurrent(lua_State*, const tf3loanstate::Receiver& expected) noexcept {
        ++validations;
        return witnessValid && expected.vtable == receiver.vtable && expected.helper == receiver.helper;
    }
    static bool MatchesGetter(lua_State* s, int i) noexcept { return lua_tocfunction(s, i) == Getter; }
    static bool PrepareKeys(lua_State* s) {
        PushString(s, "owner", 5);
        PushString(s, "loan", 4);
        if (prepareMutation == 4) return luaL_error(s, "synthetic key preparation failure") != 0;
        if (prepareMutation == 1) {
            lua_pushnil(s);
            lua_setupvalue(s, 4, 1);
        } else if (prepareMutation == 2) {
            lua_pushnil(s);
            lua_rawsetp(s, LUA_REGISTRYINDEX, classKey);
        } else if (prepareMutation == 3) {
            lua_newtable(s);
            lua_setmetatable(s, 2);
        }
        return true;
    }
    static bool ReadTable(lua_State* s, int table, Observation* out) {
        if (decoderErrors) { out->owner = 999; return luaL_error(s, "synthetic decoder failure") != 0; }
        const int base = lua_gettop(s);
        lua_pushvalue(s, 5); lua_rawget(s, table);
        if (lua_type(s, -1) != LUA_TNUMBER) { lua_settop(s, base); return false; }
        int isNumber = 0; const double owner = lua_tonumberx(s, -1, &isNumber);
        if (!isNumber || !std::isfinite(owner) || owner != std::floor(owner)) { lua_settop(s, base); return false; }
        lua_pop(s, 1);
        lua_pushvalue(s, 6); lua_rawget(s, table);
        if (lua_type(s, -1) != LUA_TNUMBER) { lua_settop(s, base); return false; }
        const double loan = lua_tonumberx(s, -1, &isNumber);
        if (!isNumber || !std::isfinite(loan) || loan != std::floor(loan)) { lua_settop(s, base); return false; }
        lua_settop(s, base);
        *out = {owner, loan};
        return true;
    }
};

void Reset(lua_State* s) {
    lua_settop(s, 0);
    lua_pushnil(s);
    lua_rawsetp(s, LUA_REGISTRYINDEX, classKey);
    reads = validations = getterCalls = indexCalls = 0;
    witnessValid = true; witnessInvalidatesInGetter = false;
    mutateReceiver = getterErrors = decoderErrors = false;
    prepareMutation = 0;
    getterMode = registryMode = getterModeInstall = upvalueMode = 0; closureUpvalues = 1;
    receiver = {0x12345000, 0x6789abc0};
    receiverAddress = nullptr;
}
void Install(lua_State* s, bool installRegistry = true, bool installMetatable = true) {
    lua_newtable(s); // metatable/class table
    const int mt = lua_gettop(s);
    if (getterModeInstall != 1) {
        auto* upvalue = static_cast<unsigned char*>(lua_newuserdata(s, 1));
        *upvalue = 0x5a;
        if (upvalueMode == 1) { lua_pop(s, 1); lua_pushlightuserdata(s, upvalueKey); }
        else if (upvalueMode == 2) { lua_pop(s, 1); lua_newuserdata(s, 2); }
        for (int i = 0; i < closureUpvalues; ++i) lua_pushvalue(s, -1);
        lua_pushcclosure(s, getterModeInstall == 2 ? WrongGetter : Getter, closureUpvalues);
        lua_setfield(s, mt, "get");
        lua_pop(s, 1);
    }
    if (installRegistry) {
        if (registryMode == 2) lua_pushnumber(s, 1);
        else lua_pushvalue(s, mt);
        lua_rawsetp(s, LUA_REGISTRYINDEX, classKey);
    }
    {
        auto* payload = static_cast<tf3loanstate::Receiver*>(lua_newuserdata(s, sizeof receiver));
        *payload = receiver;
        receiverAddress = payload;
        if (installMetatable) {
        lua_pushvalue(s, mt);
        lua_setmetatable(s, -2);
        }
    }
    lua_remove(s, mt);
}
bool Read(lua_State* s, Snapshot* out) {
    auto* payload = static_cast<tf3loanstate::Receiver*>(lua_touserdata(s, 1));
    receiverAddress = payload;
    return Readback::Read(s, 1, receiver, classKey, out);
}
void Success(lua_State* s) {
    Snapshot out{-1, -1};
    const int top = lua_gettop(s);
    Require(Read(s, &out), "valid protected readback succeeds");
    Require(out.owner == 57 && out.loan == 9, "decoded fields match synthetic getter");
    Require(lua_gettop(s) == top, "successful readback preserves stack");
    Require(validations >= 2 && reads >= 4, "witness and receiver revalidated around decode");
}
void Reject(lua_State* s, const char* label) {
    Snapshot out{111, 222};
    const int top = lua_gettop(s);
    Require(!Read(s, &out), label);
    Require(out.owner == 111 && out.loan == 222, "failed readback leaves output untouched");
    Require(lua_gettop(s) == top, "failed readback preserves stack");
}
}

int main() {
    try {
        lua_State* s = luaL_newstate(); Require(s != nullptr, "Lua state created");
        Reset(s); Install(s); Success(s);

        Reset(s); Install(s, false, true); Reject(s, "missing class registry entry rejected");
        Reset(s); registryMode = 2; Install(s); Reject(s, "wrong class registry entry rejected");
        Reset(s); Install(s, true, false); Reject(s, "missing receiver metatable rejected");
        Reset(s); getterModeInstall = 1; Install(s); Reject(s, "missing getter rejected");
        Reset(s); getterModeInstall = 2; Install(s); Reject(s, "wrong C getter rejected");
        Reset(s); closureUpvalues = 2; Install(s); Reject(s, "second getter upvalue rejected");
        Reset(s); closureUpvalues = 0; Install(s); Reject(s, "missing getter upvalue rejected");
        Reset(s); upvalueMode = 1; Install(s); Reject(s, "lightuserdata getter upvalue rejected");
        Reset(s); upvalueMode = 2; Install(s); Reject(s, "wrong-size getter upvalue rejected");

        Reset(s); Install(s); lua_newtable(s); lua_pushcfunction(s, HostileIndex);
        lua_setfield(s, -2, "__index"); lua_setmetatable(s, 1);
        Reject(s, "hostile receiver metatable rejected without lookup");
        Require(indexCalls == 0, "receiver hostile __index never runs");

        Reset(s); Install(s); getterErrors = true; Reject(s, "getter Lua error is protected");
        Reset(s); Install(s); getterMode = 1; Reject(s, "non-table getter result rejected");
        Reset(s); Install(s); getterMode = 2; Reject(s, "table with metatable rejected");
        Require(indexCalls == 0, "returned table hostile __index never runs");
        Reset(s); Install(s); getterMode = 3; Reject(s, "fractional numeric field rejected");
        Reset(s); Install(s); decoderErrors = true; Reject(s, "decoder Lua error is protected");

        Reset(s); Install(s); witnessInvalidatesInGetter = true;
        Reject(s, "callback witness change during getter rejected");
        Reset(s); Install(s); prepareMutation = 1; Reject(s, "getter upvalue changed during key preparation rejected");
        Require(getterCalls == 0, "changed getter is never invoked");
        Reset(s); Install(s); prepareMutation = 2; Reject(s, "class registry changed during key preparation rejected");
        Reset(s); Install(s); prepareMutation = 3; Reject(s, "receiver metatable changed during key preparation rejected");
        Reset(s); Install(s); prepareMutation = 4; Reject(s, "key preparation Lua error is protected");
        Reset(s); Install(s); mutateReceiver = true; Reject(s, "receiver change during getter rejected");

        Reset(s); Install(s); auto* payload = static_cast<tf3loanstate::Receiver*>(lua_touserdata(s, 1));
        payload->vtable++; Reject(s, "mismatched receiver vtable rejected");
        Reset(s); Install(s); payload = static_cast<tf3loanstate::Receiver*>(lua_touserdata(s, 1));
        payload->helper++; Reject(s, "mismatched receiver helper rejected");

        std::printf("loan_state_readback_owned_pass cases=%u; synthetic Lua objects only; no TF3 pointers or permission\n", cases);
        lua_close(s); return 0;
    } catch (const std::exception& error) {
        std::fprintf(stderr, "loan_state_readback_owned_failed: %s\n", error.what()); return 1;
    }
}
