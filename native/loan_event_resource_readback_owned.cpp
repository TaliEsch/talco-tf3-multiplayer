// Owned-process pointer/layout checks only; never opens or attaches to TF3.
#define wmain ExternalProbeUnusedMain
#include "external_hardware_load_probe.cpp"
#undef wmain

namespace {
unsigned read_count = 0, fail_at = 0;
bool FaultRead(HANDLE process, uint64_t address, void* output, SIZE_T size) {
    if (++read_count == fail_at) return false;
    return SafeReadSpan(process, address, output, size);
}
uint64_t changed_header = 0;
unsigned header_reads = 0;
bool ChangedHeaderRead(HANDLE process, uint64_t address, void* output, SIZE_T size) {
    if (!SafeReadSpan(process, address, output, size)) return false;
    if (address == changed_header && ++header_reads == 2) static_cast<unsigned char*>(output)[0] ^= 1;
    return true;
}
uint64_t changed_identity = 0;
unsigned identity_reads = 0;
bool ChangedIdentityRead(HANDLE process, uint64_t address, void* output, SIZE_T size) {
    if (!SafeReadSpan(process, address, output, size)) return false;
    if (address == changed_identity && ++identity_reads == 2)
        static_cast<unsigned char*>(output)[0] ^= 1;
    return true;
}
void Require(bool value, const char* label) { if (!value) throw Error(label); }
struct Owned {
    std::array<uint64_t, 7> descriptor{};
    std::array<uint64_t, 32> frame{};
    std::array<unsigned char, 64> resource{};
    std::array<uint64_t, 3> helper{};
    std::string path = "game_mechanics/finance/loan.gs";
    uint64_t raw = 123, wrapper = reinterpret_cast<uint64_t>(&raw), helper_slot = reinterpret_cast<uint64_t>(helper.data());
    CONTEXT context{};
    Owned() {
        descriptor[0] = reinterpret_cast<uint64_t>(&raw); descriptor[1] = descriptor[0];
        descriptor[2] = reinterpret_cast<uint64_t>(resource.data());
        descriptor[6] = reinterpret_cast<uint64_t>(&helper_slot);
        frame[0] = reinterpret_cast<uint64_t>(&wrapper);
        context.Rbp = reinterpret_cast<uint64_t>(frame.data() + 16);
        context.R13 = reinterpret_cast<uint64_t>(descriptor.data());
        helper[0] = reinterpret_cast<uint64_t>(&raw); helper[2] = 3141;
        uint64_t length = 0, capacity = 15;
        memcpy(resource.data() + 16, &length, 8); memcpy(resource.data() + 24, &capacity, 8);
        const uint64_t pointer = reinterpret_cast<uint64_t>(path.c_str());
        length = path.size(); capacity = length;
        memcpy(resource.data() + 32, &pointer, 8); memcpy(resource.data() + 48, &length, 8);
        memcpy(resource.data() + 56, &capacity, 8);
    }
};
}
int main() {
    try {
        using namespace tf3loanresourceobservation;
        Owned owned; Snapshot output{};
        Require(Capture(GetCurrentProcess(), owned.context, SafeReadSpan, &output), "valid capture");
        Require(output.entity == 3141 && output.raw_state == reinterpret_cast<uint64_t>(&owned.raw), "frame chain");
        Require(output.state_helper_slot == reinterpret_cast<uint64_t>(&owned.helper_slot) &&
            output.state_helper == reinterpret_cast<uint64_t>(owned.helper.data()), "active state receiver");
        Require(output.string_bytes[0] == 1 && output.string_bytes[1] == owned.path.size() + 1 &&
            memcmp(output.strings[1].data(), owned.path.c_str(), owned.path.size() + 1) == 0, "string data");
        Require(EmitLoanResource(GetCurrentProcess(), GetCurrentProcessId(), GetCurrentThreadId(), owned.context, 1),
            "native serialized candidate");
        owned.resource[0] = ':';
        const uint64_t foreignScopeLength = 1, emptyScopeLength = 0;
        memcpy(owned.resource.data() + 16, &foreignScopeLength, 8);
        Require(!EmitLoanResource(GetCurrentProcess(), GetCurrentProcessId(), GetCurrentThreadId(), owned.context, 2),
            "foreign resource scope is not a Loan candidate");
        owned.resource[0] = 0;
        memcpy(owned.resource.data() + 16, &emptyScopeLength, 8);
        owned.path[0] = '/';
        Require(!EmitLoanResource(GetCurrentProcess(), GetCurrentProcessId(), GetCurrentThreadId(), owned.context, 3),
            "path variants are not Loan candidates");
        owned.path[0] = 'g';
        owned.helper[2] = UINT32_MAX;
        Require(Capture(GetCurrentProcess(), owned.context, SafeReadSpan, &output) && output.entity == -1,
            "sentinel entity retained for observation");
        owned.helper[2] = 3141;
        read_count = 0; fail_at = 0;
        Require(Capture(GetCurrentProcess(), owned.context, FaultRead, &output), "counted success");
        const unsigned total = read_count;
        for (unsigned i = 1; i <= total; ++i) {
            read_count = 0; fail_at = i;
            memset(&output, 0xa5, sizeof output); const Snapshot sentinel = output;
            Require(!Capture(GetCurrentProcess(), owned.context, FaultRead, &output) &&
                memcmp(&output, &sentinel, sizeof output) == 0, "partial capture publication");
        }
        changed_header = reinterpret_cast<uint64_t>(owned.resource.data()); header_reads = 0;
        Require(!Capture(GetCurrentProcess(), owned.context, ChangedHeaderRead, &output), "changed header rejected");
        const uint64_t identities[] = {
            reinterpret_cast<uint64_t>(owned.descriptor.data()),
            reinterpret_cast<uint64_t>(&owned.helper_slot),
            reinterpret_cast<uint64_t>(owned.helper.data()),
            reinterpret_cast<uint64_t>(owned.helper.data()) + 0x10,
        };
        for (const auto address : identities) {
            changed_identity = address; identity_reads = 0;
            memset(&output, 0xa5, sizeof output); const Snapshot sentinel = output;
            Require(!Capture(GetCurrentProcess(), owned.context, ChangedIdentityRead, &output) &&
                memcmp(&output, &sentinel, sizeof output) == 0, "changed callback identity rejected without publication");
        }
        const uint64_t too_long = 257; memcpy(owned.resource.data() + 48, &too_long, 8);
        Require(!Capture(GetCurrentProcess(), owned.context, SafeReadSpan, &output), "oversized string rejected");
        SYSTEM_INFO info{}; GetSystemInfo(&info);
        auto* pages = static_cast<unsigned char*>(VirtualAlloc(nullptr, info.dwPageSize * 2,
            MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE));
        Require(pages != nullptr, "owned pages");
        DWORD old = 0; std::array<unsigned char, 64> scratch{};
        Require(VirtualProtect(pages + info.dwPageSize, info.dwPageSize, PAGE_READWRITE | PAGE_GUARD, &old) != FALSE,
            "owned guard");
        Require(!SafeReadSpan(GetCurrentProcess(), reinterpret_cast<uint64_t>(pages + info.dwPageSize - 32),
            scratch.data(), scratch.size()), "cross-page guard rejected");
        MEMORY_BASIC_INFORMATION guard{};
        Require(VirtualQuery(pages + info.dwPageSize, &guard, sizeof guard) == sizeof guard &&
            (guard.Protect & PAGE_GUARD), "guard remains untouched");
        Require(VirtualProtect(pages + info.dwPageSize, info.dwPageSize, PAGE_NOACCESS, &old) != FALSE,
            "owned noaccess");
        Require(!SafeReadSpan(GetCurrentProcess(), reinterpret_cast<uint64_t>(pages + info.dwPageSize),
            scratch.data(), scratch.size()), "noaccess rejected");
        Require(VirtualFree(pages, 0, MEM_RELEASE) != FALSE, "owned page cleanup");
        Require(!SafeReadSpan(GetCurrentProcess(), UINT64_MAX - 1, scratch.data(), 8), "overflow rejected");
        printf("{\"scope\":\"loan-resource-readback-owned\",\"passed\":true,\"readsFaultInjected\":%u,"
            "\"guardPreserved\":true,\"partialPublicationRejected\":true,\"changedIdentityCases\":4,\"activationPermitted\":false,\"tf3Qualified\":false}\n", total);
        return 0;
    } catch (const std::exception& error) { fprintf(stderr, "owned resource readback failed: %s\n", error.what()); return 1; }
}
