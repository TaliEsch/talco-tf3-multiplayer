#pragma once
#include "loan_lua_consumer.h"

namespace tf3loanlua {
// Ordinary Win64 three-argument call forwarding only. This does not install a
// call interceptor or admit a TF3 address. Binding must supply the exact-build
// stock registrar, immutable Lua APIs and an independently disabling latch.
template<class Binding, CFunction ConsumerFunction = &Consumer<Binding>> bool StockRegistrationBridge(lua_State* state,
    void* stock_function, const char* stock_name) {
    static_assert(noexcept(Binding::Disable()), "Registration failure must disable without throwing");
    try {
        const bool original_result = Binding::StockRegister(state, stock_function, stock_name);
        if (!original_result) { Binding::Disable(); return original_result; }
        if (!Register<Binding, ConsumerFunction>(state)) Binding::Disable();
        return original_result;
    } catch (...) {
        // Disable permission, then propagate the original C++/Lua error through
        // normal unwind metadata. No replacement result or exception suppression.
        Binding::Disable(); throw;
    }
}
}
