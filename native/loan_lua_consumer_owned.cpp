#include "loan_lua_consumer.h"
#include "loan_registration_bridge.h"
#include "loan_invocation_stack.h"
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>

extern "C" void LoanOwnedInvocation(std::uint64_t descriptor, std::uint64_t wrapper);
extern "C" unsigned char LoanOwnedInvocationReturn, LoanOwnedInvocationEnd;
extern "C" bool LoanOwnedStockRegistration(lua_State*, void*, const char*);

namespace {
unsigned cases = 0, claims = 0, string_reads = 0;
unsigned allocation_failures = 0;
bool foreign_context = false, fail_allocations = false;
int module_mode = 0, module_ref = LUA_NOREF, error_module_ref = LUA_NOREF,
    false_module_ref = LUA_NOREF, metamethod_calls = 0, strict_writes = 0;
bool require_witness = false;
bool native_disabled = false, stock_result = true, throw_stock = false;
lua_State* stock_expected_state = nullptr;
void* stock_expected_function = nullptr;
const char* stock_expected_name = nullptr;
unsigned stock_calls = 0;
unsigned custom_calls = 0;
unsigned due_observations = 0;
void* expected_due_receiver = nullptr;
bool due_arguments_match = false;
int rooted_reader_ref = LUA_NOREF, rooted_loader_ref = LUA_NOREF, rooted_adapter_ref = LUA_NOREF;
int rooted_expected_roots = 2;
int rooted_nonce_ref = LUA_NOREF, rooted_digest_ref = LUA_NOREF, rooted_receiver_ref = LUA_NOREF;
void* rooted_expected_receiver = nullptr;
unsigned rooted_callback_calls = 0;
bool rooted_callback_arguments_match = false, rooted_callback_error = false;
bool rooted_owned_active = false, rooted_reentry_denied = false;
bool rooted_outer_state_preserved = false, rooted_last_callback_ok = false;
int rooted_outer_environment = 0;
void* rooted_environment = nullptr;
int rooted_candidate_environment_marker = 0;
void* rooted_candidate_environment = nullptr;
bool rooted_registration_busy = false;
int CustomConsumer(lua_State* state) {
    if (lua_gettop(state) == 3 && lua_type(state, 1) == LUA_TSTRING &&
        lua_type(state, 2) == LUA_TSTRING && lua_type(state, 3) == LUA_TUSERDATA)
        ++custom_calls;
    lua_pushboolean(state, 0); return 1;
}
struct OwnedStockError {};
tf3loaninvocation::Site invocation_site{};
struct OwnedDescriptor { bool loan; };
struct OwnedInvocation {
    lua_State* state;
    const std::string* nonce;
    const std::string* digest;
    bool accepted = false;
};
OwnedInvocation* active_owned_call = nullptr;
std::uint64_t Tick() noexcept { return 1000; }
tf3loanresume::Authority authority(Tick);
tf3loanresume::Grant grant{};
void Require(bool value, const char* label) {
    if (!value) throw std::runtime_error(label);
    ++cases;
}
void* Allocator(void*, void* pointer, std::size_t old_size, std::size_t size) {
    if (!size) { std::free(pointer); return nullptr; }
    // Lua's allocator contract requires shrinking an existing block to succeed.
    // Reject only new/growing allocations, including protected error retries.
    if (fail_allocations && (!pointer || size > old_size)) { ++allocation_failures; return nullptr; }
    return std::realloc(pointer, size);
}
const char* StringRead(lua_State* state, int index, std::size_t* length) {
    ++string_reads; return lua_tolstring(state, index, length);
}
int StrictNewIndex(lua_State* state) {
    ++strict_writes; return luaL_error(state, "strict globals reject new key");
}
int StrictIndex(lua_State* state) {
    ++metamethod_calls; return luaL_error(state, "strict globals reject missing key");
}
int ModuleIndex(lua_State* state) {
    ++metamethod_calls; return luaL_error(state, "module index must not run");
}
int OwnedRequire(lua_State* state) {
    const char* name = lua_tostring(state, 1);
    if (!name || std::strcmp(name, "tf3mp_status_1::/tf3mp_ordinary_loan_native_consumer.lua") != 0)
        return luaL_error(state, "wrong qualified module");
    if (module_mode == 1) return luaL_error(state, "require failed");
    if (module_mode == 2) { lua_pushboolean(state, 1); return 1; }
    if (module_mode == 3) {
        lua_newtable(state); lua_newtable(state);
        lua_pushcfunction(state, ModuleIndex); lua_setfield(state, -2, "__index");
        lua_setmetatable(state, -2); return 1;
    }
    lua_rawgeti(state, LUA_REGISTRYINDEX,
        module_mode == 4 ? error_module_ref : module_mode == 5 ? false_module_ref : module_ref);
    return 1;
}
int LoadModule(lua_State* state, const char* source) {
    Require(luaL_loadstring(state, source) == LUA_OK && lua_pcall(state, 0, 1, 0) == LUA_OK &&
        lua_type(state, -1) == LUA_TTABLE, "owned Lua module source loads");
    return luaL_ref(state, LUA_REGISTRYINDEX);
}
void ResetModule(lua_State* state) {
    if (module_ref != LUA_NOREF) luaL_unref(state, LUA_REGISTRYINDEX, module_ref);
    module_ref = LoadModule(state, "local native,due; return {install=function(fn) "
        "if type(fn) ~= 'function' then error('function required') end "
        "if native and native ~= fn then error('different consumer') end "
        "native=fn; return true end, consume=function(...) "
        "if native then return native(...) end return false end, installDue=function(fn) "
        "if type(fn) ~= 'function' then error('function required') end "
        "if due and due ~= fn then error('different due consumer') end "
        "due=fn; return true end,consumeDue=function(...) "
        "if due then return due(...) end return false end}");
}
void PushConsumer(lua_State* state) {
    lua_rawgeti(state, LUA_REGISTRYINDEX, module_ref);
    lua_getfield(state, -1, "consume");
    lua_remove(state, -2);
}
void PushDueConsumer(lua_State* state) {
    lua_rawgeti(state, LUA_REGISTRYINDEX, module_ref);
    lua_getfield(state, -1, "consumeDue"); lua_remove(state, -2);
}
void SetRequire(lua_State* state, bool enabled) {
    lua_pushglobaltable(state);
    lua_pushliteral(state, "ug_require");
    if (enabled) lua_pushcfunction(state, OwnedRequire);
    else lua_pushnil(state);
    lua_rawset(state, -3); lua_pop(state, 1);
}
struct Binding {
    static bool StockRegister(lua_State* state, void* function, const char* name) {
        ++stock_calls;
        Require(state == stock_expected_state && function == stock_expected_function && name == stock_expected_name,
            "three stock registrar arguments forwarded unchanged");
        if (throw_stock) throw OwnedStockError{};
        return stock_result;
    }
    static void Disable() noexcept { native_disabled = true; authority.Invalidate(); }
    static const tf3loanlua::Api& Functions() {
        static const tf3loanlua::Api api{lua_gettop, lua_checkstack, lua_type, StringRead,
            lua_pushboolean, lua_settop, lua_pushcclosure, lua_rawgeti,
            lua_pushlstring, lua_rawget, lua_rawequal, lua_pcallk};
        return api;
    }
    static void PushValue(lua_State* state, int index) { lua_pushvalue(state, index); }
    static bool Claim(lua_State* state, const tf3loanresume::Nonce& nonce, const tf3loanresume::Digest& digest) noexcept {
        ++claims;
        if (require_witness) {
            CONTEXT context{};
            if (tf3loaninvocation::CaptureCurrent(invocation_site, &context) != tf3loaninvocation::Result::found)
                return false;
            const auto* descriptor = reinterpret_cast<const OwnedDescriptor*>(context.R13);
            const auto wrapper = *reinterpret_cast<const std::uint64_t*>(context.Rbp - 0x80);
            if (!descriptor || !descriptor->loan || !wrapper ||
                *reinterpret_cast<lua_State* const*>(wrapper) != state) return false;
        }
        // Fixture resource and borrower identity only; no actual TF3 layout or
        // ownership observation is represented by this owned C++ descriptor.
        return !native_disabled && !foreign_context && authority.Consume(grant.world, nonce, digest, grant.owner, grant.loan);
    }
    static void ObserveDue(lua_State* state, const tf3loanresume::Nonce& nonce,
        const tf3loanresume::Digest& digest) noexcept {
        ++due_observations;
        due_arguments_match = lua_gettop(state) == 3 && lua_type(state, 3) == LUA_TUSERDATA &&
            lua_touserdata(state, 3) == expected_due_receiver && nonce == grant.nonce && digest == grant.digest;
        // Owned observer only records argument forwarding. It never consults or
        // consumes authority and makes no TF3 identity/readback assertion.
    }
};
unsigned protected_claims = 0, protected_probes = 0;
bool protected_ready = true, protected_accept = false, protected_published = false;
bool protected_reentry_denied = false;
int protected_probe_mode = 0; // 1: Lua error; 2: nested attempt.
struct ProtectedBinding {
    static const tf3loanlua::Api& Functions() { return Binding::Functions(); }
    static bool Ready(lua_State*) noexcept { return protected_ready; }
    static void* ToContext(lua_State* state, int index) noexcept {
        return lua_touserdata(state, index);
    }
    static void PushValue(lua_State* state, int index) { lua_pushvalue(state, index); }
    static void PushContext(lua_State* state, void* context) {
        lua_pushlightuserdata(state, context);
    }
    static bool Claim(lua_State* state, const tf3loanresume::Nonce&,
        const tf3loanresume::Digest&) noexcept {
        ++protected_claims;
        return protected_ready && lua_gettop(state) == 3 &&
            lua_type(state, 3) == LUA_TUSERDATA && protected_accept;
    }
    static void Probe(lua_State* state, const tf3loanresume::Nonce& nonce,
        const tf3loanresume::Digest& digest) {
        ++protected_probes;
        if (protected_probe_mode == 1) luaL_error(state, "synthetic post-claim probe failure");
        if (protected_probe_mode == 2) {
            protected_reentry_denied = !tf3loanlua::ProtectedClaimProbe<ProtectedBinding>::Run(
                state, nonce, digest) && protected_claims == 1;
        }
        protected_published = true;
    }
};
void ProtectedClaimProbeChecks(lua_State* state) {
    const int saved = lua_gettop(state);
    lua_settop(state, 0);
    lua_pushliteral(state, "nonce");
    lua_pushliteral(state, "digest");
    auto* receiver = lua_newuserdata(state, 16);
    tf3loanresume::Nonce nonce{}; tf3loanresume::Digest digest{};
    nonce[0] = 9; digest[0] = 7;
    auto reset = [&]() {
        protected_claims = protected_probes = 0;
        protected_ready = true; protected_accept = false;
        protected_published = protected_reentry_denied = false;
        protected_probe_mode = 0;
    };
    auto preserved = [&]() {
        return lua_gettop(state) == 3 && lua_type(state, 1) == LUA_TSTRING &&
            lua_type(state, 2) == LUA_TSTRING && lua_touserdata(state, 3) == receiver &&
            !tf3loanlua::ProtectedClaimProbe<ProtectedBinding>::Active();
    };
    reset(); protected_accept = true; protected_probe_mode = 1;
    Require(tf3loanlua::ProtectedClaimProbe<ProtectedBinding>::Run(state, nonce, digest) &&
        protected_claims == 1 && protected_probes == 1 && !protected_published && preserved(),
        "post-Claim Lua error preserves spent truth and caller stack without publication");
    reset();
    Require(!tf3loanlua::ProtectedClaimProbe<ProtectedBinding>::Run(state, nonce, digest) &&
        protected_claims == 1 && protected_probes == 0 && preserved(),
        "denied Claim never reaches post-Claim probe");
    reset(); protected_ready = false;
    Require(!tf3loanlua::ProtectedClaimProbe<ProtectedBinding>::Run(state, nonce, digest) &&
        protected_claims == 0 && protected_probes == 0 && preserved(),
        "pre-Claim readiness rejection consumes nothing");
    reset(); protected_accept = true; protected_probe_mode = 2;
    Require(tf3loanlua::ProtectedClaimProbe<ProtectedBinding>::Run(state, nonce, digest) &&
        protected_reentry_denied && protected_claims == 1 && protected_probes == 1 &&
        protected_published && preserved(),
        "nested protected Claim denied without replacing outer consumed truth");
    lua_settop(state, saved);
}
int RootedOwnedWrapper(lua_State* state);
int rooted_wrapper_ref = LUA_NOREF;
int RootedReentrantCallback(lua_State* state) {
    ++rooted_callback_calls;
    const auto& api = Binding::Functions();
    bool reader_matches = false, loader_matches = false;
    api.rawgeti(state, LUA_REGISTRYINDEX, rooted_reader_ref);
    reader_matches = api.rawequal(state, lua_upvalueindex(1), -1) != 0;
    lua_pop(state, 1);
    api.rawgeti(state, LUA_REGISTRYINDEX, rooted_loader_ref);
    loader_matches = api.rawequal(state, lua_upvalueindex(2), -1) != 0;
    lua_pop(state, 1);
    std::size_t nonce_length = 0, digest_length = 0;
    const auto* nonce = lua_type(state, 1) == LUA_TSTRING
        ? lua_tolstring(state, 1, &nonce_length) : nullptr;
    const auto* digest = lua_type(state, 2) == LUA_TSTRING
        ? lua_tolstring(state, 2, &digest_length) : nullptr;
    const bool args_match = api.gettop(state) == 3 && nonce && nonce_length == 12 &&
        std::memcmp(nonce, "rooted nonce", 12) == 0 && digest && digest_length == 13 &&
        std::memcmp(digest, "rooted digest", 13) == 0 && lua_type(state, 3) == LUA_TUSERDATA &&
        lua_touserdata(state, 3) == rooted_expected_receiver;
    bool adapter_matches = rooted_expected_roots == 2;
    if (rooted_expected_roots == 3) {
        api.rawgeti(state, LUA_REGISTRYINDEX, rooted_adapter_ref);
        adapter_matches = lua_type(state, lua_upvalueindex(3)) == LUA_TTABLE &&
            api.rawequal(state, lua_upvalueindex(3), -1) != 0;
        lua_pop(state, 1);
    }
    rooted_callback_arguments_match = reader_matches && loader_matches && adapter_matches && args_match;
    if (rooted_owned_active && rooted_environment == &rooted_outer_environment) {
        api.rawgeti(state, LUA_REGISTRYINDEX, rooted_wrapper_ref);
        for (int i = 1; i <= 3; ++i) Binding::PushValue(state, i);
        const int status = api.pcallk(state, 3, 1, 0, 0, nullptr);
        rooted_reentry_denied = status == LUA_OK && lua_type(state, -1) == LUA_TBOOLEAN &&
            !lua_toboolean(state, -1);
        if (status == LUA_OK) lua_pop(state, 1);
        rooted_outer_state_preserved = rooted_owned_active &&
            rooted_environment == &rooted_outer_environment;
    }
    if (rooted_callback_error) return luaL_error(state, "synthetic rooted callback failure");
    return 0;
}
int RootedOwnedWrapper(lua_State* state) {
    if (rooted_owned_active || rooted_environment || rooted_candidate_environment ||
        rooted_registration_busy || lua_gettop(state) != 3 || !lua_checkstack(state, rooted_expected_roots == 3 ? 7 : 6)) {
        lua_pushboolean(state, 0); return 1;
    }
    rooted_owned_active = true;
    rooted_environment = &rooted_outer_environment;
    rooted_last_callback_ok = rooted_expected_roots == 3
        ? tf3loanlua::ProtectedRootedCallback<Binding, &RootedReentrantCallback, 3>::Run(state)
        : tf3loanlua::ProtectedRootedCallback<Binding, &RootedReentrantCallback>::Run(state);
    const bool cleanup_state_preserved = rooted_owned_active &&
        rooted_environment == &rooted_outer_environment;
    rooted_environment = nullptr;
    rooted_owned_active = false;
    rooted_outer_state_preserved = rooted_outer_state_preserved && cleanup_state_preserved;
    // Diagnostic callbacks are never permission; this mirrors production's
    // inert consumer result after protected callback completion.
    lua_pushboolean(state, 0); return 1;
}
void RootedCallbackChecks(lua_State* state, int roots) {
    const int saved = lua_gettop(state); lua_settop(state, 0);
    rooted_expected_roots = roots;
    const int module = LoadModule(state,
        "return {reader=function(value) return value end,loader=function(value) return value end}");
    lua_rawgeti(state, LUA_REGISTRYINDEX, module); lua_getfield(state, -1, "reader");
    rooted_reader_ref = luaL_ref(state, LUA_REGISTRYINDEX);
    lua_getfield(state, -1, "loader"); rooted_loader_ref = luaL_ref(state, LUA_REGISTRYINDEX);
    lua_pop(state, 1); luaL_unref(state, LUA_REGISTRYINDEX, module);
    lua_rawgeti(state, LUA_REGISTRYINDEX, rooted_reader_ref);
    lua_rawgeti(state, LUA_REGISTRYINDEX, rooted_loader_ref);
    if (roots == 3) {
        lua_newtable(state);
        lua_pushvalue(state, -1);
        rooted_adapter_ref = luaL_ref(state, LUA_REGISTRYINDEX);
    }
    lua_pushcclosure(state, RootedOwnedWrapper, roots);
    rooted_wrapper_ref = luaL_ref(state, LUA_REGISTRYINDEX);
    lua_pushliteral(state, "rooted nonce"); rooted_nonce_ref = luaL_ref(state, LUA_REGISTRYINDEX);
    lua_pushliteral(state, "rooted digest"); rooted_digest_ref = luaL_ref(state, LUA_REGISTRYINDEX);
    rooted_expected_receiver = lua_newuserdata(state, 16);
    rooted_receiver_ref = luaL_ref(state, LUA_REGISTRYINDEX);
    rooted_callback_calls = 0; rooted_callback_error = false;
    rooted_callback_arguments_match = rooted_reentry_denied = rooted_outer_state_preserved = false;
    rooted_owned_active = false; rooted_environment = nullptr; rooted_last_callback_ok = false;
    rooted_candidate_environment = nullptr; rooted_registration_busy = false;
    auto invoke = [&]() {
        lua_rawgeti(state, LUA_REGISTRYINDEX, rooted_wrapper_ref);
        lua_rawgeti(state, LUA_REGISTRYINDEX, rooted_nonce_ref);
        lua_rawgeti(state, LUA_REGISTRYINDEX, rooted_digest_ref);
        lua_rawgeti(state, LUA_REGISTRYINDEX, rooted_receiver_ref);
        const int status = lua_pcall(state, 3, 1, 0);
        const bool inert_result = status == LUA_OK && lua_type(state, -1) == LUA_TBOOLEAN &&
            !lua_toboolean(state, -1) && lua_gettop(state) == 1;
        if (status == LUA_OK) lua_pop(state, 1);
        return inert_result;
    };
    rooted_environment = &rooted_outer_environment;
    const auto before_registration_reentry = rooted_callback_calls;
    Require(invoke() && rooted_callback_calls == before_registration_reentry &&
        !rooted_owned_active && rooted_environment == &rooted_outer_environment &&
        lua_gettop(state) == 0,
        "existing registration environment rejects reentry without clearing outer context");
    rooted_environment = nullptr; // The fixture, not the rejected wrapper, retires this context.
    rooted_callback_error = true;
    Require(invoke() && rooted_callback_calls == 1 && rooted_callback_arguments_match &&
        rooted_reentry_denied && rooted_outer_state_preserved && !rooted_last_callback_ok &&
        !rooted_owned_active && rooted_environment == nullptr && lua_gettop(state) == 0,
        "rooted inner callback sees exact retained upvalues and three arguments under pcall error");
    rooted_callback_error = false; rooted_callback_calls = 0;
    rooted_callback_arguments_match = rooted_reentry_denied = rooted_outer_state_preserved = false;
    fail_allocations = true; const auto allocation_before = allocation_failures;
    Require(invoke() && rooted_callback_calls == 0 && allocation_failures > allocation_before &&
        !rooted_last_callback_ok && !rooted_owned_active && rooted_environment == nullptr &&
        lua_gettop(state) == 0,
        "inner closure allocation error returns inert false and restores wrapper stack/latch");
    fail_allocations = false;
    rooted_callback_arguments_match = rooted_reentry_denied = rooted_outer_state_preserved = false;
    Require(invoke() && rooted_callback_calls == 1 && rooted_callback_arguments_match &&
        rooted_last_callback_ok && rooted_reentry_denied && rooted_outer_state_preserved &&
        !rooted_owned_active && rooted_environment == nullptr && lua_gettop(state) == 0,
        "retry after protected allocation failure works and rejected reentry preserves outer latch");
    luaL_unref(state, LUA_REGISTRYINDEX, rooted_wrapper_ref);
    luaL_unref(state, LUA_REGISTRYINDEX, rooted_reader_ref);
    luaL_unref(state, LUA_REGISTRYINDEX, rooted_loader_ref);
    if (roots == 3) luaL_unref(state, LUA_REGISTRYINDEX, rooted_adapter_ref);
    luaL_unref(state, LUA_REGISTRYINDEX, rooted_nonce_ref);
    luaL_unref(state, LUA_REGISTRYINDEX, rooted_digest_ref);
    luaL_unref(state, LUA_REGISTRYINDEX, rooted_receiver_ref);
    rooted_wrapper_ref = rooted_reader_ref = rooted_loader_ref = rooted_adapter_ref = LUA_NOREF;
    rooted_nonce_ref = rooted_digest_ref = rooted_receiver_ref = LUA_NOREF;
    rooted_expected_receiver = nullptr;
    lua_settop(state, saved);
}
int forwarded_mode = 0;
unsigned forwarded_calls = 0;
const void* forwarded_adapter = nullptr;
bool forwarded_roots_seen = false, forwarded_stack_preserved = false;
int ForwardedOwnedBody(lua_State* state) {
    ++forwarded_calls;
    forwarded_roots_seen = lua_gettop(state) == 3 &&
        lua_type(state, 1) == LUA_TSTRING && lua_type(state, 2) == LUA_TSTRING &&
        lua_type(state, 3) == LUA_TUSERDATA &&
        lua_tocfunction(state, lua_upvalueindex(1)) == &RootedReentrantCallback &&
        lua_tocfunction(state, lua_upvalueindex(2)) == &RootedOwnedWrapper &&
        lua_type(state, lua_upvalueindex(3)) == LUA_TTABLE &&
        lua_topointer(state, lua_upvalueindex(3)) == forwarded_adapter;
    if (!forwarded_roots_seen) { lua_pushboolean(state, 0); return 1; }
    switch (forwarded_mode) {
    case 0: lua_pushboolean(state, 1); return 1;
    case 1: lua_pushboolean(state, 0); return 1;
    case 2: return 0;
    case 3: lua_pushinteger(state, 1); return 1;
    case 4: lua_newtable(state); return 1;
    case 5: return luaL_error(state, "owned forwarded callback error");
    case 6: lua_pushboolean(state, 0); lua_pushboolean(state, 1); return 2;
    case 7: lua_pushboolean(state, 1); lua_pushboolean(state, 0); return 2;
    default: lua_pushnil(state); return 1;
    }
}
int ForwardedOwnedWrapper(lua_State* state) {
    const int top = lua_gettop(state);
    const auto* receiver = lua_touserdata(state, 3);
    const bool accepted = lua_checkstack(state, 7) &&
        tf3loanlua::ProtectedRootedCallback<Binding, &ForwardedOwnedBody, 3, true>::Run(state);
    forwarded_stack_preserved = lua_gettop(state) == top &&
        lua_touserdata(state, 3) == receiver;
    lua_pushboolean(state, accepted); return 1;
}
void ForwardedCallbackChecks(lua_State* state) {
    const int saved = lua_gettop(state); lua_settop(state, 0);
    lua_pushcfunction(state, &RootedReentrantCallback);
    lua_pushcfunction(state, &RootedOwnedWrapper);
    lua_newtable(state); forwarded_adapter = lua_topointer(state, -1);
    lua_pushcclosure(state, &ForwardedOwnedWrapper, 3);
    const int wrapper = luaL_ref(state, LUA_REGISTRYINDEX);
    auto invoke = [&](int arguments) {
        lua_rawgeti(state, LUA_REGISTRYINDEX, wrapper);
        for (int i = 0; i < arguments; ++i) {
            if (i < 2) lua_pushliteral(state, "owned copied argument");
            else if (i == 2) (void)lua_newuserdata(state, 16);
            else lua_pushnil(state);
        }
        const int status = lua_pcall(state, arguments, 1, 0);
        Require(status == LUA_OK && lua_gettop(state) == 1 &&
            lua_type(state, -1) == LUA_TBOOLEAN, "forwarded callback returns one protected boolean");
        const bool result = lua_toboolean(state, -1) != 0;
        lua_pop(state, 1); return result;
    };
    forwarded_calls = 0;
    for (int mode = 0; mode <= 8; ++mode) {
        forwarded_mode = mode; forwarded_roots_seen = forwarded_stack_preserved = false;
        Require(invoke(3) == (mode == 0) && forwarded_roots_seen &&
            forwarded_stack_preserved && lua_gettop(state) == 0,
            "only actual callback true propagates; false/nil/number/table/error/extra result deny");
    }
    const auto calls = forwarded_calls;
    Require(!invoke(4) && forwarded_calls == calls && forwarded_stack_preserved,
        "malformed forwarded argument count cannot enter callback");
    lua_rawgeti(state, LUA_REGISTRYINDEX, wrapper); lua_pushboolean(state, 0);
    Require(lua_setupvalue(state, -2, 3) != nullptr, "owned adapter root replaced for rejection test");
    lua_pop(state, 1);
    Require(!invoke(3) && forwarded_calls == calls && forwarded_stack_preserved,
        "replaced non-table adapter root cannot enter callback");
    luaL_unref(state, LUA_REGISTRYINDEX, wrapper);
    forwarded_adapter = nullptr; lua_settop(state, saved);
}
std::string Hex(const unsigned char* value, std::size_t count) {
    const char* alphabet = "0123456789abcdef"; std::string result;
    for (std::size_t i = 0; i < count; ++i) {
        result += alphabet[value[i] >> 4]; result += alphabet[value[i] & 15];
    }
    return result;
}
void Arm() {
    const auto transition = authority.Invalidate();
    tf3loanresume::Epoch epoch{}; epoch[0] = 1;
    Require(authority.OpenWorld(epoch, transition, &grant.world), "owned native world");
    grant.nonce[0] = 2; grant.digest[0] = 3; grant.owner = 15702; grant.loan = 0; grant.expires_at = 1100;
    Require(authority.Arm(grant), "owned native arm");
    native_disabled = false;
}
bool Invoke(lua_State* state, const std::string& nonce, const std::string& digest, int extra = 0) {
    const int base = lua_gettop(state);
    PushConsumer(state);
    lua_pushlstring(state, nonce.data(), nonce.size());
    lua_pushlstring(state, digest.data(), digest.size());
    if (extra) lua_pushboolean(state, 1);
    Require(lua_pcallk(state, 2 + extra, 1, 0, 0, nullptr) == LUA_OK, "owned consumer protected return");
    Require(lua_gettop(state) == base + 1 && lua_type(state, -1) == LUA_TBOOLEAN,
        "one exact boolean result");
    const bool result = lua_toboolean(state, -1) != 0;
    lua_settop(state, base); return result;
}
bool InvokeDue(lua_State* state, const std::string& nonce, const std::string& digest,
    int receiver_type = LUA_TUSERDATA, bool extra = false) {
    const int base = lua_gettop(state); PushDueConsumer(state);
    lua_pushlstring(state, nonce.data(), nonce.size()); lua_pushlstring(state, digest.data(), digest.size());
    if (receiver_type == LUA_TUSERDATA) expected_due_receiver = lua_newuserdata(state, 16);
    else if (receiver_type == LUA_TTABLE) lua_newtable(state);
    else if (receiver_type == LUA_TLIGHTUSERDATA) lua_pushlightuserdata(state, &expected_due_receiver);
    else if (receiver_type != LUA_TNONE) lua_pushboolean(state, 1);
    if (extra) lua_pushboolean(state, 1);
    const int count = 2 + (receiver_type != LUA_TNONE ? 1 : 0) + (extra ? 1 : 0);
    Require(lua_pcall(state, count, 1, 0) == LUA_OK && lua_type(state, -1) == LUA_TBOOLEAN &&
        lua_gettop(state) == base+1, "due diagnostic protected exact boolean result");
    const bool result = lua_toboolean(state, -1) != 0; lua_settop(state, base); return result;
}
void DueRegistrationChecks(lua_State* state) {
    const int base = lua_gettop(state); ResetModule(state);
    Require(tf3loanlua::Register<Binding>(state), "resume slot installed before due slot");
    Arm(); const auto nonce = Hex(grant.nonce.data(), grant.nonce.size());
    const auto digest = Hex(grant.digest.data(), grant.digest.size());
    const auto claims_before = claims;
    Require(!InvokeDue(state, nonce, digest) && due_observations == 0 && claims == claims_before,
        "uninstalled due never falls back to initialization");
    tf3loanlua::RegistrationReport report{};
    Require((tf3loanlua::RegisterDue<Binding, &tf3loanlua::DueDiagnosticConsumer<Binding>>(state, &report)) &&
        report.stage == tf3loanlua::RegistrationStage::success && lua_gettop(state) == base,
        "separate due installer preserves Lua stack");
    Require((tf3loanlua::RegisterDue<Binding, &tf3loanlua::DueDiagnosticConsumer<Binding>>(state)) &&
        lua_gettop(state) == base, "same due closure may be registered again");
    Require(!InvokeDue(state, nonce, digest) && due_observations == 1 && due_arguments_match && claims == claims_before,
        "exact native due userdata observed but never authorizes or invokes resume");
    Require(!InvokeDue(state, nonce, digest) && due_observations == 2,
        "repeated inert observation still returns false");
    Require(Invoke(state, nonce, digest), "inert due observations leave resume permission unconsumed");
    const auto observed = due_observations;
    Require(!InvokeDue(state, nonce.substr(1), digest) && !InvokeDue(state, nonce, digest+"0") &&
        !InvokeDue(state, "A"+nonce.substr(1), digest) && due_observations == observed,
        "malformed due correlation strings never observe");
    auto embedded = nonce; embedded[4] = '\0';
    Require(!InvokeDue(state, embedded, digest) && due_observations == observed, "embedded NUL due nonce rejected");
    for (const int kind : {LUA_TNONE, LUA_TTABLE, LUA_TLIGHTUSERDATA, LUA_TBOOLEAN})
        Require(!InvokeDue(state, nonce, digest, kind) && due_observations == observed,
            "due requires actual third full userdata");
    Require(!InvokeDue(state, nonce, digest, LUA_TUSERDATA, true) && due_observations == observed,
        "due rejects extra argument");
    const auto reads_before = string_reads;
    PushDueConsumer(state); lua_pushinteger(state, 17); lua_pushlstring(state, digest.data(), digest.size());
    lua_newuserdata(state, 16);
    Require(lua_pcall(state, 3, 1, 0) == LUA_OK && !lua_toboolean(state, -1) &&
        due_observations == observed && string_reads == reads_before, "due rejects numeric strings without conversion");
    lua_settop(state, base);
    Require((!tf3loanlua::RegisterDue<Binding, &CustomConsumer>(state, &report)) &&
        report.stage == tf3loanlua::RegistrationStage::protected_error && lua_gettop(state) == base,
        "due closure replacement denied with protected error");
    Require(!InvokeDue(state, nonce, digest) && due_observations == observed+1,
        "failed due replacement retains only inert original closure");
    for (int mode = 1; mode <= 5; ++mode) {
        module_mode = mode; const auto previous_meta = metamethod_calls;
        Require((!tf3loanlua::RegisterDue<Binding, &tf3loanlua::DueDiagnosticConsumer<Binding>>(state, &report)) &&
            report.stage == tf3loanlua::RegistrationStage::protected_error &&
            lua_gettop(state) == base && metamethod_calls == previous_meta,
            "missing/malformed due installer never falls back or invokes metamethod");
    }
    module_mode = 0;
    Require(strict_writes == 0 && metamethod_calls == 0, "both registrations preserve strict globals");
    ResetModule(state); Require(tf3loanlua::Register<Binding>(state), "restore original fixture consumer");
    claims = 0; // Original fixture below independently counts initialization claims.
}
}
extern "C" __declspec(noinline) void LoanOwnedCallback() {
    if (!active_owned_call) throw std::runtime_error("owned callback absent");
    active_owned_call->accepted = Invoke(active_owned_call->state, *active_owned_call->nonce,
        *active_owned_call->digest);
}
extern "C" __declspec(noinline) void LoanOwnedMissingMetadataCallback() {
    throw std::runtime_error("unused owned metadata callback");
}
extern "C" __declspec(noinline) bool LoanOwnedStockRegistrationBridge(lua_State* state,
    void* function, const char* name) {
    return tf3loanlua::StockRegistrationBridge<Binding>(state, function, name);
}
int main(int argc, char**) {
    if (argc != 1) return 2;
    lua_State* state = nullptr;
    try {
#ifdef TF3_LOAN_OWNED_CFG
        PROCESS_MITIGATION_CONTROL_FLOW_GUARD_POLICY policy{};
        Require(GetProcessMitigationPolicy(GetCurrentProcess(), ProcessControlFlowGuardPolicy,
            &policy, sizeof policy) && policy.EnableControlFlowGuard,
            "owned caller CFG policy actually enabled");
        fprintf(stderr, "owned_cfg_enabled=true legacy_lua_dll=true\n");
#endif
        state = lua_newstate(Allocator, nullptr);
        Require(state != nullptr, "owned C++ Lua state");
        luaL_openlibs(state);
        ResetModule(state);
        error_module_ref = LoadModule(state, "return {install=function() error('install failed') end,"
            "installDue=function() error('due install failed') end}");
        false_module_ref = LoadModule(state, "return {install=function() return false end,"
            "installDue=function() return false end}");
        SetRequire(state, true);
        lua_pushglobaltable(state); lua_newtable(state);
        lua_pushcfunction(state, StrictNewIndex); lua_setfield(state, -2, "__newindex");
        lua_pushcfunction(state, StrictIndex); lua_setfield(state, -2, "__index");
        lua_setmetatable(state, -2); lua_pop(state, 1);
        DueRegistrationChecks(state);
        ProtectedClaimProbeChecks(state);
        RootedCallbackChecks(state, 2);
        RootedCallbackChecks(state, 3);
        ForwardedCallbackChecks(state);
        fprintf(stderr, "owned_stage=register\n");
        lua_pushinteger(state, 42); const auto base = lua_gettop(state);
        tf3loanlua::RegistrationReport registration_report{};
        Require(tf3loanlua::Register<Binding>(state, &registration_report) &&
            registration_report.stage == tf3loanlua::RegistrationStage::success &&
            registration_report.saved_top == base && registration_report.lua_status == 0,
            "registration diagnostic records successful protected boundary");
        Require(!tf3loanlua::Register<Binding>(nullptr, &registration_report) &&
            registration_report.stage == tf3loanlua::RegistrationStage::invalid_state,
            "null VM registration diagnosed without Lua call");
        Require(tf3loanlua::Register<Binding>(state) && lua_gettop(state) == base &&
            lua_tointeger(state, 1) == 42, "protected registration preserves stack");
        ResetModule(state);
        Require(tf3loanlua::Register<Binding, &CustomConsumer>(state) && lua_gettop(state) == base,
            "custom protected registration preserves stack");
        PushConsumer(state);
        lua_pushliteral(state, "owned nonce"); lua_pushliteral(state, "owned digest");
        lua_newuserdata(state, 16);
        Require(lua_pcall(state, 3, 1, 0) == 0 && !lua_toboolean(state, -1) &&
            custom_calls == 1 && claims == 0, "custom registration forwards actual third userdata without default claim");
        lua_settop(state, base);
        ResetModule(state);
        Require(tf3loanlua::Register<Binding>(state) && lua_gettop(state) == base,
            "default consumer restored after custom callback");
        Arm();
        fprintf(stderr, "owned_stage=consumer\n");
        const auto nonce = Hex(grant.nonce.data(), grant.nonce.size());
        const auto digest = Hex(grant.digest.data(), grant.digest.size());
        foreign_context = true;
        Require(!Invoke(state, nonce, digest), "foreign context denied");
        foreign_context = false;
        const auto before = claims;
        Require(!Invoke(state, nonce.substr(1), digest) && claims == before, "short nonce never claims");
        Require(!Invoke(state, nonce, digest + "0") && claims == before, "long digest never claims");
        Require(!Invoke(state, "A" + nonce.substr(1), digest) && claims == before, "uppercase never claims");
        auto embedded = nonce; embedded[3] = '\0';
        Require(!Invoke(state, embedded, digest) && claims == before, "embedded null never claims");
        Require(!Invoke(state, nonce, digest, 1) && claims == before, "extra argument never claims");
        const auto reads_before = string_reads;
        PushConsumer(state); lua_pushinteger(state, 123);
        lua_pushlstring(state, digest.data(), digest.size());
        Require(lua_pcallk(state, 2, 1, 0, 0, nullptr) == LUA_OK && lua_type(state, -1) == LUA_TBOOLEAN &&
            !lua_toboolean(state, -1) && claims == before && string_reads == reads_before,
            "number rejected without string conversion");
        lua_settop(state, base);
        Require(Invoke(state, nonce, digest), "one valid consume");
        Require(!Invoke(state, nonce, digest), "duplicate stays spent");
        DWORD64 image = 0;
        const auto* function = RtlLookupFunctionEntry(reinterpret_cast<DWORD64>(&LoanOwnedInvocationReturn), &image, nullptr);
        Require(function && image, "owned Lua invocation unwind entry");
        invocation_site = {image, function->BeginAddress, function->EndAddress,
            static_cast<std::uint32_t>(reinterpret_cast<DWORD64>(&LoanOwnedInvocationReturn) - image)};
        Require(image + invocation_site.end_rva == reinterpret_cast<DWORD64>(&LoanOwnedInvocationEnd),
            "owned Lua invocation range");
        Arm(); require_witness = true;
        Require(!Invoke(state, nonce, digest), "same Lua VM without active invocation denied");
        OwnedDescriptor descriptor{false}; auto* wrapper = state;
        OwnedInvocation call{state, &nonce, &digest}; active_owned_call = &call;
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(&descriptor), reinterpret_cast<std::uint64_t>(&wrapper));
        Require(!call.accepted, "foreign resource frame on shared VM denied");
        descriptor.loan = true; wrapper = nullptr;
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(&descriptor), reinterpret_cast<std::uint64_t>(&wrapper));
        Require(!call.accepted, "matching frame wrong raw VM denied");
        wrapper = state;
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(&descriptor), reinterpret_cast<std::uint64_t>(&wrapper));
        Require(call.accepted, "current Lua consumer unwinds to owned Loan frame");
        LoanOwnedInvocation(reinterpret_cast<std::uint64_t>(&descriptor), reinterpret_cast<std::uint64_t>(&wrapper));
        Require(!call.accepted, "owned witnessed consume stays spent");
        active_owned_call = nullptr; require_witness = false;
        Require(strict_writes == 0 && metamethod_calls == 0,
            "registration leaves strict globals untouched");
        module_mode = 1;
        fprintf(stderr, "owned_stage=protected_error\n");
        Require(!tf3loanlua::Register<Binding>(state, &registration_report) &&
            registration_report.stage == tf3loanlua::RegistrationStage::protected_error &&
            registration_report.lua_status == LUA_ERRRUN && registration_report.saved_top == base &&
            lua_gettop(state) == base,
            "nested require error propagated with restored stack");
        Require(!tf3loanlua::Register<Binding>(state) && lua_gettop(state) == base &&
            lua_tointeger(state, 1) == 42, "nested Lua error crosses DLL and restores stack");
        for (int mode = 2; mode <= 5; ++mode) {
            module_mode = mode;
            const int previous_meta = metamethod_calls;
            Require(!tf3loanlua::Register<Binding>(state, &registration_report) &&
                registration_report.stage == tf3loanlua::RegistrationStage::protected_error &&
                registration_report.lua_status == LUA_ERRRUN && lua_gettop(state) == base &&
                metamethod_calls == previous_meta, "malformed module or installer rejected raw");
        }
        module_mode = 0; SetRequire(state, false);
        const int previous_meta = metamethod_calls;
        Require(!tf3loanlua::Register<Binding>(state, &registration_report) &&
            registration_report.lua_status == LUA_ERRRUN && metamethod_calls == previous_meta &&
            lua_gettop(state) == base, "missing ug_require rejected without global __index");
        SetRequire(state, true);
        Require(luaL_loadstring(state, "tf3mpConsumeOrdinaryLoanResume = function() end") == LUA_OK &&
            lua_pcall(state, 0, 0, 0) == LUA_ERRRUN &&
            strict_writes == 1, "strict globals reject legacy global consumer write");
        lua_settop(state, base);
        Require(tf3loanlua::Register<Binding>(state) && lua_gettop(state) == base, "registration after protected error");
        int owned_function_object = 42;
        stock_expected_state = state; stock_expected_function = &owned_function_object;
        stock_expected_name = "owned_stock_useFn";
        Require(LoanOwnedStockRegistration(state, stock_expected_function, stock_expected_name) &&
            stock_calls == 1 && lua_gettop(state) == base, "ordinary stock bridge original true return");
        stock_result = false;
        Require(!tf3loanlua::StockRegistrationBridge<Binding>(state, stock_expected_function,
            stock_expected_name, &registration_report) &&
            registration_report.stage == tf3loanlua::RegistrationStage::stock_false &&
            !registration_report.exception && native_disabled,
            "stock rejection distinguished from protected Lua failure");
        Require(!LoanOwnedStockRegistration(state, stock_expected_function, stock_expected_name) &&
            stock_calls == 3 && native_disabled && lua_gettop(state) == base,
            "ordinary stock bridge original false return disables native permission");
        stock_result = true; Arm(); module_mode = 1;
        Require(LoanOwnedStockRegistration(state, stock_expected_function, stock_expected_name) &&
            native_disabled && !Invoke(state, nonce, digest) && lua_gettop(state) == base,
            "registration error independently disables retained closure");
        module_mode = 0; Arm(); throw_stock = true;
        bool propagated = false;
        try { LoanOwnedStockRegistration(state, stock_expected_function, stock_expected_name); }
        catch (const OwnedStockError&) { propagated = true; }
        throw_stock = false;
        Require(propagated && native_disabled && !Invoke(state, nonce, digest) && lua_gettop(state) == base,
            "stock C++ error unwinds owned ASM and revokes native permission");
        Arm(); throw_stock = true; propagated = false;
        try { tf3loanlua::StockRegistrationBridge<Binding>(state, stock_expected_function,
            stock_expected_name, &registration_report); }
        catch (const OwnedStockError&) { propagated = true; }
        throw_stock = false;
        Require(propagated && native_disabled && registration_report.exception &&
            registration_report.stage == tf3loanlua::RegistrationStage::stock_call,
            "escaping stock exception diagnosed without changing propagation");
        // Use a fresh VM so the module path must allocate/intern for the first
        // time. Allocation failure remains inside the protected registration.
        auto* allocation_state = lua_newstate(Allocator, nullptr);
        fprintf(stderr, "owned_stage=allocation_error\n");
        Require(allocation_state != nullptr, "allocation-failure VM");
        fail_allocations = true;
        const bool allocated = tf3loanlua::Register<Binding>(allocation_state);
        fail_allocations = false;
        Require(!allocated && allocation_failures > 0 && lua_gettop(allocation_state) == 0,
            "allocation failure restores stack");
        lua_close(allocation_state);
        lua_close(state); state = nullptr;
        printf("{\"scope\":\"loan-lua-consumer-owned\",\"luaVersion\":\"5.2.4-cpp\",\"cases\":%u,"
            "\"passed\":true,\"activationPermitted\":false,\"tf3Qualified\":false}\n", cases);
        return 0;
    } catch (const std::exception& e) {
        fail_allocations = false; if (state) lua_close(state);
        fprintf(stderr, "loan_lua_consumer_owned_failed: %s\n", e.what()); return 1;
    }
}
