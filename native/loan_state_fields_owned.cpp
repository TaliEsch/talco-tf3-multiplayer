#include "loan_state_fields.h"
#include "lauxlib.h"
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>

namespace {
using namespace tf3loanstate;
unsigned cases = 0, allocationCalls = 0, numericConversions = 0, stringConversions = 0;
unsigned metamethodCalls = 0;
bool trackAllocations = false;
const std::string oversizedRound(129, 'r');

void Require(bool value, const char* label) {
    if (!value) throw std::runtime_error(label);
    ++cases;
}
void* Alloc(void*, void* ptr, std::size_t oldSize, std::size_t newSize) {
    if (!newSize) { std::free(ptr); return nullptr; }
    if (trackAllocations && (!ptr || newSize > oldSize)) ++allocationCalls;
    return std::realloc(ptr, newSize);
}
int Type(lua_State* s, int i) { return lua_type(s, i); }
std::size_t RawLen(lua_State* s, int i) { return lua_rawlen(s, i); }
void* ToUserdata(lua_State* s, int i) { return lua_touserdata(s, i); }
int Top(lua_State* s) { return lua_gettop(s); }
int CheckStack(lua_State* s, int n) { return lua_checkstack(s, n); }
void SetTop(lua_State* s, int i) { lua_settop(s, i); }
void PushClosure(lua_State* s, CFunction f, int n) { lua_pushcclosure(s, f, n); }
void PushLight(lua_State* s, void* p) { lua_pushlightuserdata(s, p); }
void PushValue(lua_State* s, int i) { lua_pushvalue(s, i); }
int GetMetatable(lua_State* s, int i) { return lua_getmetatable(s, i); }
void RawGetP(lua_State* s, int i, const void* p) { lua_rawgetp(s, i, p); }
int RawEqual(lua_State* s, int a, int b) { return lua_rawequal(s, a, b); }
const char* PushLString(lua_State* s, const char* p, std::size_t n) { return lua_pushlstring(s, p, n); }
void RawGet(lua_State* s, int i) { lua_rawget(s, i); }
const char* GetUpvalue(lua_State* s, int i, int n) { return lua_getupvalue(s, i, n); }
int PCall(lua_State* s, int a, int r, int e, int c, CFunction k) { return lua_pcallk(s, a, r, e, c, k); }
const GetterApi getter{{Type, RawLen, ToUserdata}, Top, CheckStack, SetTop,
    PushClosure, PushLight, PushValue, GetMetatable, RawGetP, RawEqual,
    PushLString, RawGet, GetUpvalue, PCall};
void RawGetI(lua_State* s, int t, int i) { lua_rawgeti(s, t, i); }
void PushNil(lua_State* s) { lua_pushnil(s); }
int Next(lua_State* s, int t) { return lua_next(s, t); }
double ToNumber(lua_State* s, int i, int* n) {
    if (lua_type(s, i) != LUA_TNUMBER) ++numericConversions;
    return lua_tonumberx(s, i, n);
}
const char* ToString(lua_State* s, int i, std::size_t* n) {
    if (lua_type(s, i) != LUA_TSTRING) ++stringConversions;
    return lua_tolstring(s, i, n);
}
FieldsApi fields{&getter, RawGetI, PushNil, Next, ToNumber, ToString};

enum class Fault {
    none, extraLoan, extraLoanField, missingLoanField, missingLoan, sparseLoan, foreignLoanKey, extraOwner,
    missingOwnerField, foreignOwnerKey, ownerLoanMismatch, ownerAmount,
    ownerDuration, ownerRate, ownerType, ownerSchema, freeId,
    nonceChar, nonceLong, nonceNul, roundLong, roundNul, operationMalformed,
    amountString, paidFraction, amountNan, sequenceHigh, ownerOutOfRange,
    rootMetatable, loansMetatable, ownerMetatable
};
struct Values {
    std::uint64_t id=1, free=2, amount=21000000, duration=35064000, last=479200,
        paid=0, seq=1, borrower=15702;
    double rate=.12;
    const char* type="Medium";
    const char* nonce="abcdef0123456789abcdef0123456789";
    std::size_t nonceLength=32;
    const char* round="resume-round";
    std::size_t roundLength=12;
    const char* operation="obtain-op-1";
    std::size_t operationLength=11;
    Fault fault=Fault::none;
};
void SetNumber(lua_State* s, int table, const char* key, double value) {
    lua_pushnumber(s, value); lua_setfield(s, table, key);
}
void SetString(lua_State* s, int table, const char* key, const char* value, std::size_t length) {
    lua_pushlstring(s, value, length); lua_setfield(s, table, key);
}
int Hostile(lua_State* s) { ++metamethodCalls; return luaL_error(s, "hostile metamethod invoked"); }
void AddHostileMetatable(lua_State* s, int target) {
    lua_newtable(s); lua_pushcfunction(s, Hostile); lua_setfield(s, -2, "__index");
    lua_setmetatable(s, target);
}
void PushLoan(lua_State* s, const Values& v) {
    lua_newtable(s); const int t=lua_gettop(s);
    SetNumber(s,t,"id",static_cast<double>(v.id));
    SetString(s,t,"type",v.type,std::strlen(v.type));
    if(v.fault==Fault::amountString)SetString(s,t,"amount","21000000",8);
    else if(v.fault==Fault::amountNan)SetNumber(s,t,"amount",NAN);
    else SetNumber(s,t,"amount",static_cast<double>(v.amount));
    SetNumber(s,t,"duration",static_cast<double>(v.duration));
    SetNumber(s,t,"percentage",v.rate);
    SetNumber(s,t,"lastPayDay",static_cast<double>(v.last));
    SetNumber(s,t,"timesPaid",v.fault==Fault::paidFraction?.5:static_cast<double>(v.paid));
    if(v.fault==Fault::extraLoanField)SetNumber(s,t,"unexpected",1);
    if(v.fault==Fault::missingLoanField)lua_pushnil(s),lua_setfield(s,t,"timesPaid");
}
void PushOwner(lua_State* s, const Values& v) {
    lua_newtable(s); const int t=lua_gettop(s);
    SetNumber(s,t,"schemaVersion",v.fault==Fault::ownerSchema?2:1);
    SetNumber(s,t,"loanId",static_cast<double>(v.id+(v.fault==Fault::ownerLoanMismatch)));
    SetNumber(s,t,"ownerCompanyEntity",static_cast<double>(v.fault==Fault::ownerOutOfRange?2147483648ULL:v.borrower));
    const char* nonce=v.nonce; std::size_t nonceLength=v.nonceLength;
    char altered[64]{};
    if(v.fault==Fault::nonceChar){std::memcpy(altered,nonce,nonceLength);altered[0]='G';nonce=altered;}
    if(v.fault==Fault::nonceLong){nonce="0123456789abcdef0123456789abcdef0";nonceLength=33;}
    if(v.fault==Fault::nonceNul){altered[0]='a';altered[1]='\0';altered[2]='b';nonce=altered;nonceLength=3;}
    SetString(s,t,"nonce",nonce,nonceLength);
    const char* round=v.round; std::size_t roundLength=v.roundLength;
    if(v.fault==Fault::roundLong){round=oversizedRound.c_str();roundLength=oversizedRound.size();}
    if(v.fault==Fault::roundNul){altered[0]='a';altered[1]='\0';altered[2]='b';round=altered;roundLength=3;}
    SetString(s,t,"roundId",round,roundLength);
    const char* operation=v.operation; std::size_t operationLength=v.operationLength;
    if(v.fault==Fault::operationMalformed){operation="bad/value";operationLength=9;}
    SetString(s,t,"operationId",operation,operationLength);
    SetNumber(s,t,"hostSequence",static_cast<double>(v.fault==Fault::sequenceHigh?9007199254740992ULL:v.seq));
    SetString(s,t,"type",v.fault==Fault::ownerType?"Large":v.type,
        std::strlen(v.fault==Fault::ownerType?"Large":v.type));
    SetNumber(s,t,"amount",static_cast<double>(v.amount+(v.fault==Fault::ownerAmount)));
    SetNumber(s,t,"duration",static_cast<double>(v.duration+(v.fault==Fault::ownerDuration)));
    SetNumber(s,t,"percentage",v.fault==Fault::ownerRate?.13:v.rate);
    if(v.fault==Fault::extraOwner)SetNumber(s,t,"unexpected",1);
    if(v.fault==Fault::missingOwnerField)lua_pushnil(s),lua_setfield(s,t,"operationId");
    if(v.fault==Fault::ownerMetatable)AddHostileMetatable(s,t);
}
void PushState(lua_State* s, const Values& v) {
    lua_newtable(s); const int root=lua_gettop(s);
    SetNumber(s,root,"freeId",static_cast<double>(v.fault==Fault::freeId?v.free+1:v.free));
    lua_newtable(s); const int loans=lua_gettop(s);
    if(v.fault!=Fault::missingLoan) {
        PushLoan(s,v); lua_rawseti(s,loans,v.fault==Fault::sparseLoan?2:1);
    }
    if(v.fault==Fault::extraLoan){PushLoan(s,v);lua_rawseti(s,loans,2);}
    if(v.fault==Fault::foreignLoanKey){PushLoan(s,v);lua_rawseti(s,loans,3);}
    if(v.fault==Fault::loansMetatable)AddHostileMetatable(s,loans);
    lua_setfield(s,root,"obtainedLoans");
    lua_newtable(s); const int owners=lua_gettop(s);
    if(v.fault!=Fault::foreignOwnerKey) {
        PushOwner(s,v); lua_rawseti(s,owners,static_cast<int>(v.fault==Fault::ownerLoanMismatch?v.id+1:v.id));
    }
    if(v.fault==Fault::foreignOwnerKey){PushOwner(s,v);lua_rawseti(s,owners,static_cast<int>(v.id+1));}
    if(v.fault==Fault::ownerMetatable){} // Metatable is attached to the owner object above.
    lua_setfield(s,root,"tf3mpLoanOwners");
    if(v.fault==Fault::rootMetatable)AddHostileMetatable(s,root);
}
void Begin(lua_State* s) {
    lua_settop(s,0);
    Require(PrepareFieldKeys(s,getter),"all field keys prepared before snapshot construction");
    Require(lua_gettop(s)==keyCount,"prepared key count exact");
}
void Make(lua_State* s, const Values& v) { Begin(s); PushState(s,v); }
void CheckOk(lua_State* s, const Values& v) {
    Make(s,v); const int root=keyCount+1, top=lua_gettop(s);
    LoanFacts facts{};
    const unsigned allocations=allocationCalls, conversions=numericConversions+stringConversions;
    trackAllocations=true;
    const bool okay=ReadFields(s,fields,root,1,&facts);
    trackAllocations=false;
    Require(okay,"valid ordinary loan fields accepted");
    Require(lua_gettop(s)==top,"successful decode preserves Lua stack");
    Require(allocationCalls==allocations,"decoder allocates nothing");
    Require(numericConversions+stringConversions==conversions,"decoder converts no strings or numbers");
    Require(facts.loan_id==v.id&&facts.free_id==v.free&&facts.owner==static_cast<std::int32_t>(v.borrower)
        &&facts.amount==v.amount&&facts.duration==v.duration&&facts.last_pay_day==v.last
        &&facts.times_paid==v.paid&&facts.host_sequence==v.seq&&facts.percentage==v.rate
        &&std::strcmp(facts.type,v.type)==0&&std::strcmp(facts.nonce,v.nonce)==0,
        "detached fact values match snapshot");
}
void CheckBad(lua_State* s, const Values& v, const char* label) {
    Make(s,v); const int root=keyCount+1, top=lua_gettop(s);
    LoanFacts facts; std::memset(&facts,0xa5,sizeof facts); LoanFacts before=facts;
    const unsigned allocations=allocationCalls, conversions=numericConversions+stringConversions;
    trackAllocations=true;
    const bool okay=ReadFields(s,fields,root,1,&facts);
    trackAllocations=false;
    Require(!okay,label);
    Require(lua_gettop(s)==top,"failed decode preserves Lua stack");
    Require(std::memcmp(&facts,&before,sizeof facts)==0,"failed decode leaves output untouched");
    Require(allocationCalls==allocations,"failed decode allocates nothing");
    Require(numericConversions+stringConversions==conversions,"failed decode converts no strings or numbers");
    Require(metamethodCalls==0,"hostile metamethod never executes");
}
}

int main() {
    try {
        lua_State* s=lua_newstate(Alloc,nullptr); Require(s!=nullptr,"Lua state created");
        for(const char* type:{"Small","Medium","Large","ExtraLarge"}) {
            Values v; v.type=type; CheckOk(s,v);
        }
        Values v; v.id=0;v.free=1;CheckOk(s,v);
        v=Values{};v.amount=v.duration=v.last=v.paid=v.seq=9007199254740991ULL;CheckOk(s,v);
        const Fault bad[]={Fault::extraLoan,Fault::extraLoanField,Fault::missingLoanField,Fault::missingLoan,
            Fault::sparseLoan,Fault::foreignLoanKey,Fault::extraOwner,
            Fault::missingOwnerField,Fault::foreignOwnerKey,Fault::ownerLoanMismatch,
            Fault::ownerAmount,Fault::ownerDuration,Fault::ownerRate,Fault::ownerType,Fault::ownerSchema,
            Fault::freeId,Fault::nonceChar,Fault::nonceLong,Fault::nonceNul,Fault::roundLong,
            Fault::roundNul,Fault::operationMalformed,Fault::amountString,Fault::paidFraction,
            Fault::amountNan,Fault::sequenceHigh,Fault::ownerOutOfRange,Fault::rootMetatable,
            Fault::loansMetatable,Fault::ownerMetatable};
        const char* names[]={"extra loan entry","extra loan field","missing loan field","missing loan table entry",
            "sparse loan","foreign loan key","extra owner key",
            "missing owner key","foreign owner key","owner loan id mismatch",
            "owner amount mismatch","owner duration mismatch","owner rate mismatch","owner type mismatch",
            "owner schema mismatch","free id mismatch","malformed nonce","oversized nonce",
            "embedded-NUL nonce","oversized round id","embedded-NUL round id","malformed operation id",
            "numeric string rejected","fractional integer rejected","NaN rejected","unsafe integer rejected",
            "owner out of range","root metatable rejected","loans metatable rejected","owner metatable rejected"};
        for(std::size_t i=0;i<std::size(bad);++i){v=Values{};v.fault=bad[i];CheckBad(s,v,names[i]);}
        v=Values{};v.nonce="0123456789abcdef0123456789abcdef";v.nonceLength=33;
        CheckBad(s,v,"nonce buffer overflow rejected");
        v=Values{};v.round=oversizedRound.c_str();v.roundLength=oversizedRound.size();
        CheckBad(s,v,"oversized round buffer rejected");

        const auto saved=fields;
        for(int missing=0;missing<6;++missing){
            fields=saved;
            if(missing==0)fields.getter=nullptr;else if(missing==1)fields.rawgeti=nullptr;
            else if(missing==2)fields.pushnil=nullptr;else if(missing==3)fields.next=nullptr;
            else if(missing==4)fields.tonumberx=nullptr;else fields.tolstring=nullptr;
            Make(s,Values{});const int top=lua_gettop(s);LoanFacts out;std::memset(&out,0x5a,sizeof out);LoanFacts before=out;
            Require(!ReadFields(s,fields,keyCount+1,1,&out),"missing decoder API rejected");
            Require(lua_gettop(s)==top&&std::memcmp(&out,&before,sizeof out)==0,"missing API preserves stack/output");
        }
        fields=saved;
        Make(s,Values{});const int top=lua_gettop(s);LoanFacts out;std::memset(&out,0x5a,sizeof out);LoanFacts before=out;
        Require(!ReadFields(nullptr,fields,keyCount+1,1,&out),"null state rejected");
        Require(!ReadFields(s,fields,0,1,&out),"invalid root index rejected");
        Require(!ReadFields(s,fields,keyCount+1,0,&out),"invalid key index rejected");
        Require(!ReadFields(s,fields,keyCount+1,2,&out),"shifted incorrect key range rejected");
        Make(s,Values{});const int amountKey=1+static_cast<int>(Key::amount);
        lua_pushvalue(s,amountKey);lua_pushvalue(s,amountKey+1);
        lua_replace(s,amountKey);lua_replace(s,amountKey+1);
        const int swappedTop=lua_gettop(s);const unsigned swappedAllocations=allocationCalls;
        trackAllocations=true;const bool swapped=ReadFields(s,fields,keyCount+1,1,&out);trackAllocations=false;
        Require(!swapped,"swapped amount/duration rooted keys rejected");
        Require(lua_gettop(s)==swappedTop&&std::memcmp(&out,&before,sizeof out)==0,
            "swapped keys preserve stack/output");
        Require(allocationCalls==swappedAllocations,"swapped key validation allocates nothing");
        Require(lua_gettop(s)==top&&std::memcmp(&out,&before,sizeof out)==0,"invalid indices preserve stack/output");
        Require(metamethodCalls==0,"no hostile Lua callback ran");
        std::printf("loan_state_fields_owned_pass cases=%u; synthetic Lua tables only; no TF3 pointers or permission\n",cases);
        lua_close(s);return 0;
    } catch(const std::exception& e){std::fprintf(stderr,"loan_state_fields_owned_failed: %s\n",e.what());return 1;}
}
