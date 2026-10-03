#pragma once
#include "loan_state_readback.h"
#include <cmath>
#include <cstring>

namespace tf3loanstate {
struct FieldsApi {
    const GetterApi* getter;
    void (*rawgeti)(lua_State*, int, int);
    void (*pushnil)(lua_State*);
    int (*next)(lua_State*, int);
    double (*tonumberx)(lua_State*, int, int*);
    const char* (*tolstring)(lua_State*, int, std::size_t*);
    bool Complete() const noexcept {
        return getter && getter->Complete() && rawgeti && pushnil && next && tonumberx && tolstring;
    }
};
// Detached diagnostic facts only. Matching these fields does not prove the
// full persisted-history projection or authorize a payment/resume.
struct LoanFacts {
    std::uint32_t loan_id, free_id;
    std::int32_t owner;
    std::uint64_t amount, duration, last_pay_day, times_paid, host_sequence;
    double percentage;
    char type[11], nonce[33], round_id[129], operation_id[129];
};
enum Key : int {
    obtainedLoans, tf3mpLoanOwners, freeId, id, type, amount, duration,
    percentage, lastPayDay, timesPaid, schemaVersion, loanId,
    ownerCompanyEntity, nonce, roundId, operationId, hostSequence,
    keyCount
};
inline constexpr const char* keys[keyCount] = {
    "obtainedLoans", "tf3mpLoanOwners", "freeId", "id", "type", "amount", "duration",
    "percentage", "lastPayDay", "timesPaid", "schemaVersion", "loanId",
    "ownerCompanyEntity", "nonce", "roundId", "operationId", "hostSequence"
};

// Called inside the protected reader BEFORE the getter. Reserve every key
// and all decoder temporaries before pushing; these operations may run GC.
inline bool PrepareFieldKeys(lua_State* state, const GetterApi& api) {
    if (!api.checkstack(state, keyCount + 16)) return false;
    for (const auto* name : keys) api.pushlstring(state, name, std::strlen(name));
    return true;
}

class FieldsReader {
    lua_State* state_;
    const FieldsApi& fields_;
    const GetterApi& api_;
    int keys_begin_;
    int Top() const { return api_.gettop(state_); }
    void PopTo(int top) const { api_.settop(state_, top); }
    int Field(int table, Key key) const {
        api_.pushvalue(state_, keys_begin_ + static_cast<int>(key));
        api_.rawget(state_, table);
        return Top();
    }
    bool Plain(int table) const {
        if (api_.receiver.type(state_, table) != 5) return false;
        if (!api_.getmetatable(state_, table)) return true;
        PopTo(Top() - 1); return false;
    }
    bool Integer(int index, std::uint64_t low, std::uint64_t high, std::uint64_t* out) const {
        if (api_.receiver.type(state_, index) != 3) return false;
        int numeric = 0;
        const double value = fields_.tonumberx(state_, index, &numeric);
        if (!numeric || !std::isfinite(value) || value != std::floor(value) ||
            value < static_cast<double>(low) || value > static_cast<double>(high)) return false;
        *out = static_cast<std::uint64_t>(value); return true;
    }
    bool NumberField(int table, Key key, std::uint64_t low, std::uint64_t high, std::uint64_t* out) const {
        const int top = Top();
        const bool valid = Integer(Field(table, key), low, high, out);
        PopTo(top); return valid;
    }
    bool Rate(int table, double* out) const {
        const int top = Top();
        const int index = Field(table, percentage);
        bool valid = api_.receiver.type(state_, index) == 3;
        int numeric = 0;
        const double value = valid ? fields_.tonumberx(state_, index, &numeric) : 0;
        valid = valid && numeric && std::isfinite(value) && value > 0 && value < 1;
        PopTo(top); if (valid) *out = value; return valid;
    }
    template<std::size_t N> bool String(int table, Key key, char (&out)[N], bool hex = false) const {
        const int top = Top();
        const int index = Field(table, key);
        bool valid = api_.receiver.type(state_, index) == 4;
        std::size_t length = 0;
        const char* text = valid ? fields_.tolstring(state_, index, &length) : nullptr;
        valid = valid && text && length > 0 && length < N && (!hex || length == 32);
        for (std::size_t i = 0; valid && i < length; ++i) {
            const char c = text[i];
            valid = hex ? ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) :
                ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                 (c >= '0' && c <= '9') || c == '_' || c == '.' || c == ':' || c == '-');
        }
        if (valid) { std::memcpy(out, text, length); out[length] = 0; }
        PopTo(top); return valid;
    }
    bool SingleNumericKey(int table, std::uint64_t expected) const {
        const int top = Top();
        fields_.pushnil(state_);
        if (!fields_.next(state_, table)) return false;
        std::uint64_t key = 0;
        const bool valid = Integer(Top() - 1, expected, expected, &key);
        PopTo(top + 1); // Keep iteration key, discard value.
        const bool extra = fields_.next(state_, table) != 0;
        PopTo(top); return valid && !extra;
    }
    template<std::size_t N> bool Shape(int table, const Key (&expected)[N]) const {
        if (!Plain(table)) return false;
        const int top = Top();
        fields_.pushnil(state_);
        unsigned count = 0;
        while (fields_.next(state_, table)) {
            bool known = false;
            for (const auto key : expected)
                known = known || api_.rawequal(state_, Top() - 1, keys_begin_ + static_cast<int>(key));
            if (!known || ++count > N) { PopTo(top); return false; }
            PopTo(top + 1);
        }
        return count == N;
    }
public:
    FieldsReader(lua_State* state, const FieldsApi& api, int keys_begin) :
        state_(state), fields_(api), api_(*api.getter), keys_begin_(keys_begin) {}
    bool Read(int root, LoanFacts* output) const {
        constexpr std::uint64_t max = 9007199254740991ULL;
        const int top = Top();
        LoanFacts value{};
        auto decode = [&]() {
            if (!output || !Plain(root)) return false;
            for (int i = 0; i < keyCount; ++i) {
                if (api_.receiver.type(state_, keys_begin_ + i) != 4) return false;
                std::size_t length = 0;
                const char* key = fields_.tolstring(state_, keys_begin_ + i, &length);
                const std::size_t expected_length = std::strlen(keys[i]);
                if (!key || length != expected_length || std::memcmp(key, keys[i], length)) return false;
            }
            std::uint64_t free = 0, loan = 0, paid = 0, borrower = 0, version = 0, owner_loan = 0;
            if (!NumberField(root, freeId, 1, 2147483647, &free)) return false;
            const int loans = Field(root, obtainedLoans);
            if (!Plain(loans) || !SingleNumericKey(loans, 1)) return false;
            fields_.rawgeti(state_, loans, 1);
            const int entry = Top();
            constexpr Key loan_shape[] = {id, type, amount, duration, percentage, lastPayDay, timesPaid};
            if (!Shape(entry, loan_shape) || !NumberField(entry, id, 0, 2147483646, &loan) ||
                free != loan + 1 || !NumberField(entry, timesPaid, 0, max, &paid) ||
                !NumberField(entry, amount, 1, max, &value.amount) ||
                !NumberField(entry, duration, 1, max, &value.duration) ||
                !NumberField(entry, lastPayDay, 0, max, &value.last_pay_day) ||
                !Rate(entry, &value.percentage) || !String(entry, type, value.type)) return false;
            if (std::strcmp(value.type, "Small") && std::strcmp(value.type, "Medium") &&
                std::strcmp(value.type, "Large") && std::strcmp(value.type, "ExtraLarge")) return false;
            const int owners = Field(root, tf3mpLoanOwners);
            if (!Plain(owners) || !SingleNumericKey(owners, loan)) return false;
            fields_.rawgeti(state_, owners, static_cast<int>(loan));
            const int owner = Top();
            constexpr Key owner_shape[] = {schemaVersion, loanId, ownerCompanyEntity, nonce,
                roundId, operationId, hostSequence, type, amount, duration, percentage};
            std::uint64_t owner_amount = 0, owner_duration = 0;
            double owner_rate = 0; char owner_type[11]{};
            if (!Shape(owner, owner_shape) || !NumberField(owner, schemaVersion, 1, 1, &version) ||
                !NumberField(owner, loanId, loan, loan, &owner_loan) ||
                !NumberField(owner, ownerCompanyEntity, 1, 2147483647, &borrower) ||
                !NumberField(owner, amount, 1, max, &owner_amount) || owner_amount != value.amount ||
                !NumberField(owner, duration, 1, max, &owner_duration) || owner_duration != value.duration ||
                !Rate(owner, &owner_rate) || owner_rate != value.percentage ||
                !String(owner, type, owner_type) || std::strcmp(owner_type, value.type) ||
                !String(owner, nonce, value.nonce, true) || !String(owner, roundId, value.round_id) ||
                !String(owner, operationId, value.operation_id) ||
                !NumberField(owner, hostSequence, 1, max, &value.host_sequence)) return false;
            value.loan_id = static_cast<std::uint32_t>(loan);
            value.free_id = static_cast<std::uint32_t>(free);
            value.times_paid = paid;
            value.owner = static_cast<std::int32_t>(borrower);
            return true;
        };
        const bool valid = decode();
        PopTo(top);
        if (valid) *output = value;
        return valid;
    }
};
inline bool ReadFields(lua_State* state, const FieldsApi& api, int root,
    int keys_begin, LoanFacts* output) {
    if (!state || !output || !api.Complete()) return false;
    const int top = api.getter->gettop(state);
    if (root <= 0 || root > top || keys_begin <= 0 || keys_begin > top ||
        keyCount - 1 > top - keys_begin) return false;
    return FieldsReader(state, api, keys_begin).Read(root, output);
}
}
