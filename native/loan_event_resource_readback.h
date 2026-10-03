#pragma once
// External diagnostic only. Caller must hold the matching debug event pending;
// the temporary callback frame is not safe to inspect after it is continued.
// No registration, authorization or native execution is performed here.
#include <windows.h>
#include <array>
#include <cstdint>
#include <cstring>

namespace tf3loanresourceobservation {
using ReadSpan = bool(*)(HANDLE, std::uint64_t, void*, SIZE_T);
struct Snapshot {
    std::uint64_t script_rep, script_ref, resource, wrapper, raw_state, engine;
    std::int32_t entity;
    std::array<unsigned char, 64> header;
    std::array<std::array<unsigned char, 257>, 2> strings;
    std::array<std::uint32_t, 2> string_bytes;
};
inline bool Add(std::uint64_t base, std::uint64_t offset, std::uint64_t* result) noexcept {
    constexpr std::uint64_t limit = 0x00007fffffffffffULL;
    if (!base || base > limit || offset > limit - base) return false;
    *result = base + offset; return true;
}
inline std::uint64_t Word(const unsigned char* bytes) noexcept {
    std::uint64_t value = 0; std::memcpy(&value, bytes, sizeof value); return value;
}
inline bool Capture(HANDLE process, const CONTEXT& context, ReadSpan read, Snapshot* output) {
    if (!read || !output || context.Rbp < 0x80) return false;
    Snapshot result{};
    std::array<std::uint64_t, 7> descriptor{};
    if (!read(process, context.R13, descriptor.data(), sizeof descriptor)) return false;
    result.script_rep = descriptor[0]; result.script_ref = descriptor[1];
    result.resource = descriptor[2];
    std::uint64_t helper = 0;
    if (!result.script_rep || !result.script_ref || !result.resource ||
        !read(process, context.Rbp - 0x80, &result.wrapper, sizeof result.wrapper) ||
        !read(process, result.wrapper, &result.raw_state, sizeof result.raw_state) ||
        !result.raw_state || !read(process, descriptor[6], &helper, sizeof helper)) return false;
    std::uint64_t entity_address = 0;
    if (!Add(helper, 0x10, &entity_address) ||
        !read(process, helper, &result.engine, sizeof result.engine) || !result.engine ||
        !read(process, entity_address, &result.entity, sizeof result.entity) ||
        !read(process, result.resource, result.header.data(), result.header.size())) return false;
    for (std::size_t i = 0; i < 2; ++i) {
        const auto* field = result.header.data() + i * 32;
        const auto length = Word(field + 16), capacity = Word(field + 24);
        if (length > 256 || length > capacity) return false;
        const SIZE_T count = static_cast<SIZE_T>(length) + 1;
        if (capacity < 16) {
            if (length > 15) return false;
            std::memcpy(result.strings[i].data(), field, count);
        } else {
            std::uint64_t last = 0;
            if (!Add(Word(field), count - 1, &last) ||
                !read(process, Word(field), result.strings[i].data(), count)) return false;
        }
        if (result.strings[i][static_cast<SIZE_T>(length)] != 0) return false;
        for (SIZE_T j = 0; j < static_cast<SIZE_T>(length); ++j)
            if (result.strings[i][j] == 0) return false;
        result.string_bytes[i] = static_cast<std::uint32_t>(count);
    }
    std::array<unsigned char, 64> fresh{};
    if (!read(process, result.resource, fresh.data(), fresh.size()) || fresh != result.header) return false;
    // Publish only after every read passes. A header reread detects some
    // changes; it does not replace the pending-debug-event lifetime contract.
    *output = result; return true;
}
}
