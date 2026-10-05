#include "loan_lua_consumer.h"
#include "loan_registration_bridge.h"
#include "loan_invocation_stack.h"
#include "lua.h"
#include "lauxlib.h"
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
bool foreign_context = false, fail_allocations = false, force_registration_error = false;
bool require_witness = false;
bool native_disabled = false, stock_result = true, throw_stock = false;
lua_State* stock_expected_state = nullptr;
void* stock_expected_function = nullptr;
const char* stock_expected_name = nullptr;
unsigned stock_calls = 0;
unsigned custom_calls = 0;
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
void SetGlobal(lua_State* state, const char* name) {
    if (force_registration_error) {
        lua_pushstring(state, "owned registration failure");
        lua_error(state); // Real C++ Lua error, caught by the Lua DLL's pcall.
    }
    lua_setglobal(state, name);
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
            lua_pushboolean, lua_settop, lua_pushcclosure, SetGlobal, lua_pcallk};
        return api;
    }
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
    lua_getglobal(state, "tf3mpConsumeOrdinaryLoanResume");
    lua_pushlstring(state, nonce.data(), nonce.size());
    lua_pushlstring(state, digest.data(), digest.size());
    if (extra) lua_pushboolean(state, 1);
    Require(lua_pcallk(state, 2 + extra, 1, 0, 0, nullptr) == LUA_OK, "owned consumer protected return");
    Require(lua_gettop(state) == base + 1 && lua_type(state, -1) == LUA_TBOOLEAN,
        "one exact boolean result");
    const bool result = lua_toboolean(state, -1) != 0;
    lua_settop(state, base); return result;
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
        ProtectedClaimProbeChecks(state);
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
        Require(tf3loanlua::Register<Binding, &CustomConsumer>(state) && lua_gettop(state) == base,
            "custom protected registration preserves stack");
        lua_getglobal(state, "tf3mpConsumeOrdinaryLoanResume");
        lua_pushliteral(state, "owned nonce"); lua_pushliteral(state, "owned digest");
        lua_newuserdata(state, 16);
        Require(lua_pcall(state, 3, 1, 0) == 0 && !lua_toboolean(state, -1) &&
            custom_calls == 1 && claims == 0, "custom registration forwards actual third userdata without default claim");
        lua_settop(state, base);
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
        lua_getglobal(state, "tf3mpConsumeOrdinaryLoanResume"); lua_pushinteger(state, 123);
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
        force_registration_error = true;
        fprintf(stderr, "owned_stage=protected_error\n");
        Require(!tf3loanlua::Register<Binding>(state, &registration_report) &&
            registration_report.stage == tf3loanlua::RegistrationStage::protected_error &&
            registration_report.lua_status != 0 && registration_report.saved_top == base &&
            lua_gettop(state) == base,
            "protected Lua failure distinguished with restored stack");
        Require(!tf3loanlua::Register<Binding>(state) && lua_gettop(state) == base &&
            lua_tointeger(state, 1) == 42, "C++ Lua registration error crosses DLL and restores stack");
        force_registration_error = false;
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
        stock_result = true; Arm(); force_registration_error = true;
        Require(LoanOwnedStockRegistration(state, stock_expected_function, stock_expected_name) &&
            native_disabled && !Invoke(state, nonce, digest) && lua_gettop(state) == base,
            "registration error independently disables retained closure");
        force_registration_error = false; Arm(); throw_stock = true;
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
        // Use a fresh VM so the global's name must allocate/intern for the first
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
