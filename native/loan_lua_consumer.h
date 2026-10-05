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
    void (*rawgeti)(lua_State*, int, int);
    const char* (*pushlstring)(lua_State*, const char*, std::size_t);
    void (*rawget)(lua_State*, int);
    int (*rawequal)(lua_State*, int, int);
    int (*pcallk)(lua_State*, int, int, int, int, CFunction);
    bool Complete() const noexcept {
        return gettop && checkstack && type && tolstring && pushboolean && settop &&
            pushcclosure && rawgeti &&
            pushlstring && rawget && rawequal && pcallk;
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
// Inert diagnostic purpose: exact userdata argument reaches the independent
// observer, but no observer result can become permission or resume fallback.
template<class Binding> int DueDiagnosticConsumer(lua_State* state) {
    const auto& api = Binding::Functions();
    if (api.gettop(state) == 3 && api.type(state, 1) == 4 &&
        api.type(state, 2) == 4 && api.type(state, 3) == 7) {
        std::size_t nonce_length = 0, digest_length = 0;
        const auto* nonce_text = api.tolstring(state, 1, &nonce_length);
        const auto* digest_text = api.tolstring(state, 2, &digest_length);
        tf3loanresume::Nonce nonce{}; tf3loanresume::Digest digest{};
        static_assert(noexcept(Binding::ObserveDue(state, nonce, digest)));
        if (Decode(nonce_text, nonce_length, &nonce) && Decode(digest_text, digest_length, &digest))
            Binding::ObserveDue(state, nonce, digest);
    }
    api.pushboolean(state, 0); return 1;
}
// Preserve the installed reader/loader and optional adapter upvalues while moving a three-argument
// callback beneath a protected Lua boundary. The zero-upvalue outer thunk needs
// no allocated closure; allocation of the inner closure happens
// inside pcall. Three-root callers reserve seven slots BEFORE opening any native latch and
// retire their owned latch after Run, including a protected allocation error.
template<class Binding, CFunction Callback, int Roots = 2, bool ForwardResult = false> struct ProtectedRootedCallback {
    static_assert(Roots == 2 || Roots == 3);
    static_assert(!ForwardResult || Roots == 3);
    static int Thunk(lua_State* state) {
        const auto& api = Binding::Functions();
        if (api.gettop(state) != 3 + Roots || api.type(state, 4) != 6 || api.type(state, 5) != 6 ||
            (Roots == 3 && api.type(state, 6) != 5))
            { api.pushboolean(state, 0); return 1; }
        Binding::PushValue(state, 4);
        Binding::PushValue(state, 5);
        if constexpr (Roots == 3) Binding::PushValue(state, 6);
        api.pushcclosure(state, Callback, Roots);
        for (int i = 1; i <= 3; ++i) Binding::PushValue(state, i);
        // Errors belong to the outer pcall, which also covers closure creation.
        // Diagnostic callers report only protected completion. The due path
        // may carry its native callback's actual boolean result; successful
        // pcall, nil or Lua truthiness cannot substitute for that result.
        // Lua's MULTRET (-1) preserves the result count for exact-shape
        // validation instead of silently discarding an unexpected extra result.
        const int status = api.pcallk(state, 3, ForwardResult ? -1 : 0, 0, 0, nullptr);
        bool accepted = status == 0;
        if constexpr (ForwardResult) {
            accepted = accepted && api.gettop(state) == 4 + Roots && api.type(state, -1) == 1;
            if (accepted) {
                api.pushboolean(state, 1);
                accepted = api.rawequal(state, -1, -2) != 0;
            }
            api.settop(state, 3 + Roots);
        }
        api.pushboolean(state, accepted ? 1 : 0);
        return 1;
    }
    static bool Run(lua_State* state) {
        const auto& api = Binding::Functions();
        const int top = api.gettop(state);
        if (top != 3) return false;
        api.pushcclosure(state, &Thunk, 0);
        for (int i = 1; i <= 3; ++i) Binding::PushValue(state, i);
        Binding::PushValue(state, -1001001);
        Binding::PushValue(state, -1001002);
        if constexpr (Roots == 3) Binding::PushValue(state, -1001003);
        const int status = api.pcallk(state, 3 + Roots, 1, 0, 0, nullptr);
        bool okay = false;
        if (status == 0 && api.type(state, -1) == 1) {
            api.pushboolean(state, 1);
            okay = api.rawequal(state, -1, -2) != 0;
        }
        api.settop(state, top);
        return okay;
    }
};
// The existing three-argument initialization Claim and an optional read-only
// post-Claim probe share one protected Lua call. Binding supplies only the
// already-qualified native Claim/Probe and nonallocating stack value copies.
// A probe error cannot change a Claim result already detached in Context.
template<class Binding> struct ProtectedClaimProbe {
    struct Context {
        tf3loanresume::Nonce nonce{};
        tf3loanresume::Digest digest{};
        bool consumed = false;
    };
    static bool& Active() noexcept {
        static thread_local bool active = false;
        return active;
    }
    static int Thunk(lua_State* state) {
        const auto& api = Binding::Functions();
        if (api.gettop(state) != 4 || api.type(state, 4) != 2) return 0;
        auto* context = static_cast<Context*>(Binding::ToContext(state, 4));
        if (!context || Active() || !Binding::Ready(state)) return 0;
        api.settop(state, 3);
        Active() = true;
        context->consumed = Binding::Claim(state, context->nonce, context->digest);
        if (context->consumed && api.gettop(state) == 3)
            Binding::Probe(state, context->nonce, context->digest);
        return 0;
    }
    static bool Run(lua_State* state, const tf3loanresume::Nonce& nonce,
        const tf3loanresume::Digest& digest) {
        const auto& api = Binding::Functions();
        if (!state || Active() || api.gettop(state) != 3 ||
            api.type(state, 1) != 4 || api.type(state, 2) != 4 ||
            api.type(state, 3) != 7 || !api.checkstack(state, 6)) return false;
        const int top = api.gettop(state);
        Context context{nonce, digest};
        // These fixed pushes follow the stack reserve and precede Claim. The
        // zero-upvalue C function and copied values do not allocate.
        api.pushcclosure(state, &Thunk, 0);
        Binding::PushValue(state, 1);
        Binding::PushValue(state, 2);
        Binding::PushValue(state, 3);
        Binding::PushContext(state, &context);
        api.pcallk(state, 4, 0, 0, 0, nullptr);
        Active() = false;
        api.settop(state, top);
        return context.consumed;
    }
};
template<class Binding, CFunction ConsumerFunction = &Consumer<Binding>, bool Due = false>
int RegistrationThunk(lua_State* state) {
    const auto& api = Binding::Functions();
    constexpr int kShapeError = 2; // Lua 5.2 LUA_ERRRUN.
    auto finish = [&](int status) {
        // Lua 5.2 status codes are single digits. This allocation is itself
        // protected by the outer pcall, including an out-of-memory failure.
        const char result = static_cast<char>('0' + status);
        api.pushlstring(state, &result, 1);
        return 1;
    };
    constexpr char module[] = "tf3mp_status_1::/tf3mp_ordinary_loan_native_consumer.lua";
    api.rawgeti(state, -1001000, 2); // Lua 5.2 registry globals table.
    if (api.type(state, -1) != 5) return finish(kShapeError);
    api.pushlstring(state, "ug_require", sizeof("ug_require") - 1);
    api.rawget(state, -2); // Ignore globals __index and __newindex policies.
    if (api.type(state, -1) != 6) return finish(kShapeError);
    api.pushlstring(state, module, sizeof(module) - 1);
    const int require_status = api.pcallk(state, 1, 1, 0, 0, nullptr);
    if (require_status != 0) return finish(require_status);
    if (api.type(state, -1) != 5) return finish(kShapeError);
    if constexpr (Due) api.pushlstring(state, "installDue", sizeof("installDue") - 1);
    else api.pushlstring(state, "install", sizeof("install") - 1);
    api.rawget(state, -2); // A malformed module cannot invoke __index.
    if (api.type(state, -1) != 6) return finish(kShapeError);
    api.pushcclosure(state, ConsumerFunction, 0);
    const int install_status = api.pcallk(state, 1, 1, 0, 0, nullptr);
    if (install_status != 0) return finish(install_status);
    api.pushboolean(state, 1);
    if (api.type(state, -2) != 1 || !api.rawequal(state, -2, -1))
        return finish(kShapeError);
    return finish(0);
}
// All registry/module reads, require and installer calls run under Lua's
// protected call. No noexcept/SEH wrapper
// or catch-all may suppress its C++ error unwinding. The caller/bridge must have
// normal unwind metadata and run on the owning Lua thread outside VEH.
// Failure can leave an earlier module closure installed: the integration must
// independently disable native Claim/arming and halt, not infer revocation from
// Register(false). Code remains pinned while any Lua closure may retain it.
template<class Binding, CFunction ConsumerFunction = &Consumer<Binding>, bool Due = false> bool Register(lua_State* state,
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
    if (!api.checkstack(state, 8)) { stage(RegistrationStage::checkstack_failed); return false; }
    stage(RegistrationStage::push_closure);
    api.pushcclosure(state, &RegistrationThunk<Binding, ConsumerFunction, Due>, 0);
    stage(RegistrationStage::protected_call);
    const int outer_status = api.pcallk(state, 0, 1, 0, 0, nullptr);
    int status = outer_status;
    if (!outer_status) {
        std::size_t length = 0;
        const char* result = api.type(state, -1) == 4 ? api.tolstring(state, -1, &length) : nullptr;
        status = result && length == 1 && result[0] >= '0' && result[0] <= '9'
            ? result[0] - '0' : 2;
    }
    if (report) report->lua_status = status;
    stage(RegistrationStage::restore_stack);
    api.settop(state, saved_top);
    stage(status == 0 ? RegistrationStage::success : RegistrationStage::protected_error);
    return status == 0;
}
// The callback is explicit: no default initialization consumer can be installed
// in the due slot accidentally. Failures require independent native revocation.
template<class Binding, CFunction ConsumerFunction> bool RegisterDue(lua_State* state,
    RegistrationReport* report = nullptr) {
    return Register<Binding, ConsumerFunction, true>(state, report);
}
}
