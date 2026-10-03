#pragma once
#include <cstddef>
#include <cstdint>

struct lua_State;
namespace tf3loanstate {
// Nonallocating Lua APIs only. Production binding requires exact-image pins.
struct ReceiverApi {
    int (*type)(lua_State*, int);
    std::size_t (*rawlen)(lua_State*, int);
    void* (*touserdata)(lua_State*, int);
};
using ReadSpan = bool (*)(std::uint64_t, void*, std::size_t) noexcept;
struct Receiver { std::uint64_t vtable, helper; };
static_assert(sizeof(Receiver) == 16);

// A Lua argument transports the receiver, never borrower/loan authority.
// expected comes from the independently witnessed current callback and a
// qualified exact-image vtable. Caller must separately verify the metatable,
// getter and current world, and read state under protected execution.
// This check alone grants no permission and retains no Lua/native pointer.
inline bool MatchesReceiver(lua_State* state, int index, const ReceiverApi& api,
    ReadSpan read, const Receiver& expected) noexcept {
    constexpr std::uint64_t limit = 0x00007fffffffffffULL;
    if (!state || index <= 0 || !read || !api.type || !api.rawlen || !api.touserdata ||
        !expected.vtable || expected.vtable > limit ||
        !expected.helper || expected.helper > limit || api.type(state, index) != 7 ||
        api.rawlen(state, index) != sizeof(Receiver)) return false;
    const auto address = reinterpret_cast<std::uint64_t>(api.touserdata(state, index));
    if (!address || address > limit || sizeof(Receiver) - 1 > limit - address) return false;
    Receiver first{}, fresh{};
    return read(address, &first, sizeof first) &&
        first.vtable == expected.vtable && first.helper == expected.helper &&
        read(address, &fresh, sizeof fresh) &&
        fresh.vtable == first.vtable && fresh.helper == first.helper;
}
}
