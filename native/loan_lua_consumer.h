#pragma once
#include "loan_resume_authority.h"
#include <cstddef>

struct lua_State;
namespace tf3loanlua {
using CFunction = int (*)(lua_State*);
enum class RegistrationStage : unsigned {
    initial, stock_call, stock_false, invalid_state, incomplete_api, gettop,
    invalid_top, checkstack, checkstack_failed, push_closure, protected_call,
    restore_stack, protected_error, success
};
// Scalar diagnostics only; no retained VM strings, allocation or authority.
struct RegistrationReport {
    RegistrationStage stage = RegistrationStage::initial;
    int lua_status = 0, saved_top = -1;
    bool exception = false;
};
// Lua 5.2 continuation ABI: ctx is int, not intptr_t. These declarations
// follow the official public API; exact TF3 function binding remains separate.
struct Api {
    int (*gettop)(lua_State*);
    int (*checkstack)(lua_State*, int);
    int (*type)(lua_State*, int);
    const char* (*tolstring)(lua_State*, int, std::size_t*);
    void (*pushboolean)(lua_State*, int);
    void (*settop)(lua_State*, int);
    void (*pushcclosure)(lua_State*, CFunction, int);
    void (*setglobal)(lua_State*, const char*);
    int (*pcallk)(lua_State*, int, int, int, int, CFunction);
    bool Complete() const noexcept {
        return gettop && checkstack && type && tolstring && pushboolean && settop &&
            pushcclosure && setglobal && pcallk;
    }
};
template<std::size_t N> bool Decode(const char* source, std::size_t length,
    std::array<unsigned char, N>* output) noexcept {
    if (!source || !output || length != N * 2) return false;
    std::array<unsigned char, N> decoded{};
    for (std::size_t i = 0; i < N; ++i) {
        unsigned nibbles[2]{};
        for (std::size_t j = 0; j < 2; ++j) {
            const char c = source[i * 2 + j];
            if (c >= '0' && c <= '9') nibbles[j] = static_cast<unsigned>(c - '0');
            else if (c >= 'a' && c <= 'f') nibbles[j] = static_cast<unsigned>(c - 'a' + 10);
            else return false;
        }
        decoded[i] = static_cast<unsigned char>(nibbles[0] * 16 + nibbles[1]);
    }
    *output = decoded; return true;
}
// Binding supplies an immutable qualified API and native Claim. Claim must
// independently prove the current Loan invocation/resource/raw VM and world,
// revalidate borrower/loan, then consume Authority. Lua args convey no identity.
template<class Binding> int Consumer(lua_State* state) {
    const auto& api = Binding::Functions();
    bool accepted = false;
    if (api.gettop(state) == 2 && api.type(state, 1) == 4 && api.type(state, 2) == 4) {
        std::size_t nonce_length = 0, digest_length = 0;
        // Only actual strings reach tolstring: number conversion can allocate.
        const auto* nonce_string = api.tolstring(state, 1, &nonce_length);
        const auto* digest_string = api.tolstring(state, 2, &digest_length);
        tf3loanresume::Nonce nonce{}; tf3loanresume::Digest digest{};
        static_assert(noexcept(Binding::Claim(state, nonce, digest)),
            "Native Claim must deny without C++ exceptions; registration remains throwable");
        if (Decode(nonce_string, nonce_length, &nonce) && Decode(digest_string, digest_length, &digest))
            accepted = Binding::Claim(state, nonce, digest);
    }
    // Lua's C dispatcher reserves at least 20 slots; this pushes exactly one.
    api.pushboolean(state, accepted ? 1 : 0); return 1;
}
template<class Binding, CFunction ConsumerFunction = &Consumer<Binding>> int RegistrationThunk(lua_State* state) {
    const auto& api = Binding::Functions();
    api.pushcclosure(state, ConsumerFunction, 0);
    api.setglobal(state, "tf3mpConsumeOrdinaryLoanResume");
    return 0;
}
// Allocating setglobal runs under Lua's protected call. No noexcept/SEH wrapper
// or catch-all may suppress its C++ error unwinding. The caller/bridge must have
// normal unwind metadata and run on the owning Lua thread outside VEH.
// Failure can leave an earlier global closure installed: the integration must
// independently disable native Claim/arming and halt, not infer revocation from
// Register(false). Code remains pinned while any Lua closure may retain it.
template<class Binding, CFunction ConsumerFunction = &Consumer<Binding>> bool Register(lua_State* state,
    RegistrationReport* report = nullptr) {
    auto stage = [&](RegistrationStage value) noexcept { if (report) report->stage = value; };
    const auto& api = Binding::Functions();
    if (!state) { stage(RegistrationStage::invalid_state); return false; }
    if (!api.Complete()) { stage(RegistrationStage::incomplete_api); return false; }
    stage(RegistrationStage::gettop);
    const int saved_top = api.gettop(state);
    if (report) report->saved_top = saved_top;
    if (saved_top < 0) { stage(RegistrationStage::invalid_top); return false; }
    stage(RegistrationStage::checkstack);
    if (!api.checkstack(state, 4)) { stage(RegistrationStage::checkstack_failed); return false; }
    stage(RegistrationStage::push_closure);
    api.pushcclosure(state, &RegistrationThunk<Binding, ConsumerFunction>, 0);
    stage(RegistrationStage::protected_call);
    const int status = api.pcallk(state, 0, 0, 0, 0, nullptr);
    if (report) report->lua_status = status;
    stage(RegistrationStage::restore_stack);
    api.settop(state, saved_top);
    stage(status == 0 ? RegistrationStage::success : RegistrationStage::protected_error);
    return status == 0;
}
}
