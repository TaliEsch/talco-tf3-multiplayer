#pragma once
#include "loan_state_receiver.h"
#include <type_traits>

namespace tf3loanstate {
using CFunction = int (*)(lua_State*);
struct GetterApi {
    ReceiverApi receiver;
    int (*gettop)(lua_State*);
    int (*checkstack)(lua_State*, int);
    void (*settop)(lua_State*, int);
    void (*pushcclosure)(lua_State*, CFunction, int);
    void (*pushlightuserdata)(lua_State*, void*);
    void (*pushvalue)(lua_State*, int);
    int (*getmetatable)(lua_State*, int);
    void (*rawgetp)(lua_State*, int, const void*);
    int (*rawequal)(lua_State*, int, int);
    const char* (*pushlstring)(lua_State*, const char*, std::size_t);
    void (*rawget)(lua_State*, int);
    const char* (*getupvalue)(lua_State*, int, int);
    int (*pcallk)(lua_State*, int, int, int, int, CFunction);
    bool Complete() const noexcept {
        return receiver.type && receiver.rawlen && receiver.touserdata && gettop &&
            checkstack && settop && pushcclosure && pushlightuserdata && pushvalue &&
            getmetatable && rawgetp && rawequal && pushlstring && rawget && getupvalue && pcallk;
    }
};
constexpr int kRegistryIndex = -1001000; // Public Lua 5.2 ABI, independently pin TF3 APIs.

// Binding supplies immutable qualified APIs, safe memory reads, fresh callback
// witness, exact C-closure identity, and bounded raw table decoding. Neither
// userdata nor a Lua result establishes borrower authority by itself.
template<class Binding> struct ProtectedReadback {
    using Observation = typename Binding::Observation;
    static_assert(std::is_trivially_copyable_v<Observation>);
    struct Context {
        Receiver expected;
        const void* class_key;
        Observation observed{};
        bool complete = false;
    };
    static bool GetterMatches(lua_State* state, int index) {
        const auto& api = Binding::Functions();
        const int top = api.gettop(state);
        if (api.receiver.type(state, index) != 6 || !Binding::MatchesGetter(state, index) ||
            !api.getupvalue(state, index, 1)) return false;
        const bool shape = api.receiver.type(state, -1) == 7 &&
            api.receiver.rawlen(state, -1) == 1 && api.receiver.touserdata(state, -1);
        api.settop(state, top);
        if (!shape) return false;
        const bool extra = api.getupvalue(state, index, 2) != nullptr;
        api.settop(state, top);
        return !extra;
    }
    static int Thunk(lua_State* state) {
        const auto& api = Binding::Functions();
        if (api.gettop(state) != 2 || api.receiver.type(state, 1) != 2 ||
            !api.checkstack(state, 12)) return 0;
        auto* context = static_cast<Context*>(api.receiver.touserdata(state, 1));
        if (!context || !MatchesReceiver(state, 2, api.receiver, Binding::Read, context->expected) ||
            !Binding::ValidateCurrent(state, context->expected)) return 0;
        // Exact 40408 registration places `get` directly in the class table.
        // Compare the receiver metatable with the registry LIGHTUSERDATA key,
        // then use raw lookup; do not execute a caller-supplied __index.
        api.rawgetp(state, kRegistryIndex, context->class_key);
        if (api.receiver.type(state, -1) != 5 || !api.getmetatable(state, 2) ||
            !api.rawequal(state, -1, -2)) return 0;
        api.settop(state, 3);
        api.pushlstring(state, "get", 3);
        api.rawget(state, 3);
        if (!GetterMatches(state, 4)) return 0;
        // Intern/root every fixed decoding key before taking the snapshot:
        // even pushing an existing string can run GC/finalizers in TF3.
        // PrepareKeys leaves only rooted keys above the method at index 4.
        if (!Binding::PrepareKeys(state) || !api.checkstack(state, 12) ||
            !MatchesReceiver(state, 2, api.receiver, Binding::Read, context->expected) ||
            !Binding::ValidateCurrent(state, context->expected) ||
            !GetterMatches(state, 4)) return 0;
        // Key preparation can run finalizers and change a closure's upvalues
        // or receiver metatable. Recheck after the last allocating operation.
        const int prepared_top = api.gettop(state);
        api.rawgetp(state, kRegistryIndex, context->class_key);
        if (api.receiver.type(state, -1) != 5 || !api.getmetatable(state, 2) ||
            !api.rawequal(state, -1, -2) || !api.rawequal(state, -1, 3)) return 0;
        api.settop(state, prepared_top);
        api.pushvalue(state, 4);
        api.pushvalue(state, 2);
        if (api.pcallk(state, 1, 1, 0, 0, nullptr) != 0 ||
            api.receiver.type(state, -1) != 5 || api.getmetatable(state, -1)) return 0;
        const int table_index = api.gettop(state);
        // Decoder uses the already-rooted keys: no allocations, metamethods
        // or number/string conversions during observation. It must restore
        // its stack and retain no native/Lua table pointers.
        if (!Binding::ReadTable(state, table_index, &context->observed) ||
            api.gettop(state) != table_index ||
            !MatchesReceiver(state, 2, api.receiver, Binding::Read, context->expected) ||
            !Binding::ValidateCurrent(state, context->expected)) return 0;
        context->complete = true;
        return 0;
    }
    static bool Read(lua_State* state, int receiver_index, const Receiver& expected,
        const void* class_key, Observation* output) {
        static_assert(noexcept(Binding::ValidateCurrent(state, expected)));
        const auto& api = Binding::Functions();
        if (!state || !output || !class_key || !api.Complete()) return false;
        const int top = api.gettop(state);
        // Only a real argument index, never a registry/upvalue pseudo-index.
        if (receiver_index <= 0 || receiver_index > top || !api.checkstack(state, 12)) return false;
        Context context{expected, class_key};
        // Zero-upvalue C closure, light userdata and pushvalue do not allocate.
        // All method lookup, getter execution and decoding are protected.
        api.pushcclosure(state, &Thunk, 0);
        api.pushlightuserdata(state, &context);
        api.pushvalue(state, receiver_index);
        const int status = api.pcallk(state, 2, 0, 0, 0, nullptr);
        api.settop(state, top);
        if (status != 0 || !context.complete) return false;
        *output = context.observed;
        return true;
    }
};
}
