#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <sddl.h>
#include <array>
#include <cctype>
#include <cwctype>
#include <cstring>
#include <string>
#include <vector>
#include "runtime_ipc.h"

extern "C" BOOLEAN WINAPI SystemFunction036(PVOID, ULONG);

namespace tf3runtimeipc {

bool ReadExact(HANDLE pipe, void* data, DWORD bytes) {
  auto* out = static_cast<unsigned char*>(data);
  while (bytes != 0) { DWORD got = 0; if (!ReadFile(pipe, out, bytes, &got, nullptr) || got == 0) return false; out += got; bytes -= got; }
  return true;
}
bool WriteExact(HANDLE pipe, const void* data, DWORD bytes) {
  const auto* in = static_cast<const unsigned char*>(data);
  while (bytes != 0) { DWORD put = 0; if (!WriteFile(pipe, in, bytes, &put, nullptr) || put == 0) return false; in += put; bytes -= put; }
  return true;
}
bool ValidHeader(const Tf3RuntimeIpcFrameHeader& h) {
  return h.magic == TF3_RUNTIME_IPC_MAGIC && h.version == TF3_RUNTIME_IPC_VERSION && h.payload_size <= TF3_RUNTIME_IPC_MAX_PAYLOAD;
}
bool ReadFrame(HANDLE pipe, Tf3RuntimeIpcFrameHeader* h, std::string* payload) {
  if (!ReadExact(pipe, h, sizeof(*h)) || !ValidHeader(*h)) return false;
  payload->assign(h->payload_size, '\0');
  return h->payload_size == 0 || ReadExact(pipe, payload->data(), h->payload_size);
}
bool SendFrame(HANDLE pipe, Tf3RuntimeIpcType type, std::uint64_t correlation, const std::array<unsigned char,16>& session, const std::string& payload) {
  if (payload.size() > TF3_RUNTIME_IPC_MAX_PAYLOAD) return false;
  Tf3RuntimeIpcFrameHeader h{TF3_RUNTIME_IPC_MAGIC, TF3_RUNTIME_IPC_VERSION, static_cast<std::uint16_t>(type), static_cast<std::uint32_t>(payload.size()), correlation, {}};
  std::memcpy(h.session, session.data(), session.size());
  return WriteExact(pipe, &h, sizeof(h)) && (payload.empty() || WriteExact(pipe, payload.data(), static_cast<DWORD>(payload.size())));
}
bool IsJsonObject(const std::string& s) { return s.size() >= 2 && s.front() == '{' && s.back() == '}'; }
bool ConstantTimeEqual(const std::string& a, const std::string& b) {
  if (a.size() != b.size()) return false; unsigned char diff = 0; for (size_t i=0;i<a.size();++i) diff |= static_cast<unsigned char>(a[i] ^ b[i]); return diff == 0;
}
bool ExtractToken(const std::string& json, std::string* token) {
  const std::string key = "\"token\":\""; const auto at = json.find(key); if (at == std::string::npos) return false;
  const auto begin = at + key.size(); const auto end = json.find('"', begin); if (end == std::string::npos || json.find('"', end + 1) != std::string::npos && json.find("\"token\"", end + 1) != std::string::npos) return false;
  *token = json.substr(begin, end - begin); return true;
}
bool IsSession(const Tf3RuntimeIpcFrameHeader& h, const std::array<unsigned char,16>& session) { return std::memcmp(h.session, session.data(), session.size()) == 0; }
bool IsSafeControl(const std::string& payload, std::string* control) {
  if (!IsJsonObject(payload)) return false;
  const std::string key = "\"control\":\""; const auto at = payload.find(key); if (at == std::string::npos) return false;
  const auto begin=at+key.size(), end=payload.find('"',begin); if(end==std::string::npos) return false;
  *control=payload.substr(begin,end-begin);
  return *control=="ping" || *control=="hold" || *control=="release" || *control=="halt" || *control=="shutdown";
}
bool ValidPipeName(const std::wstring& n) { if (n.empty() || n.size()>80) return false; for (wchar_t c:n) if (!(std::iswalnum(c)||c==L'_'||c==L'-')) return false; return true; }
HANDLE CreateOwnerPipe(const std::wstring& name) {
  PSECURITY_DESCRIPTOR sd=nullptr; if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;GA;;;OW)", SDDL_REVISION_1, &sd, nullptr)) return INVALID_HANDLE_VALUE;
  SECURITY_ATTRIBUTES sa{sizeof(sa),sd,FALSE}; const std::wstring full=L"\\\\.\\pipe\\"+name;
  HANDLE p=CreateNamedPipeW(full.c_str(), PIPE_ACCESS_DUPLEX|FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_TYPE_BYTE|PIPE_READMODE_BYTE|PIPE_WAIT, 1, 8192, 8192, 0, &sa);
  LocalFree(sd); return p;
}

int Serve(const std::wstring& name, const std::string& token) {
  HANDLE pipe=CreateOwnerPipe(name); if(pipe==INVALID_HANDLE_VALUE) return 10;
  const bool connected=ConnectNamedPipe(pipe,nullptr)!=FALSE || GetLastError()==ERROR_PIPE_CONNECTED; if(!connected){CloseHandle(pipe);return 11;}
  Tf3RuntimeIpcFrameHeader h{}; std::string payload, supplied;
  if(!ReadFrame(pipe,&h,&payload)||h.type!=static_cast<std::uint16_t>(Tf3RuntimeIpcType::hello)||h.correlation_id==0||!ExtractToken(payload,&supplied)||!ConstantTimeEqual(token,supplied)){CloseHandle(pipe);return 12;}
  std::array<unsigned char,16> session{}; if(!SystemFunction036(session.data(),static_cast<ULONG>(session.size()))){CloseHandle(pipe);return 13;}
  if(!SendFrame(pipe,Tf3RuntimeIpcType::hello_ack,h.correlation_id,session,"{\"capabilities\":[\"transport.health\"],\"engineObserver\":false}")){CloseHandle(pipe);return 14;}
  bool held=false; std::vector<std::uint64_t> ids;
  while(ReadFrame(pipe,&h,&payload)) {
    if(!IsSession(h,session)||h.type!=static_cast<std::uint16_t>(Tf3RuntimeIpcType::control)||h.correlation_id==0){CloseHandle(pipe);return 15;}
    bool duplicate=false; for(auto id:ids) if(id==h.correlation_id) duplicate=true;
    std::string control; if(duplicate||!IsSafeControl(payload,&control)) { if(!SendFrame(pipe,Tf3RuntimeIpcType::error,h.correlation_id,session,"{\"code\":\""+std::string(duplicate?"DUPLICATE_ID":"INVALID_CONTROL")+"\"}"))break; continue; }
    ids.push_back(h.correlation_id); if(ids.size()>512){CloseHandle(pipe);return 16;}
    if(control=="hold")held=true; if(control=="release")held=false;
    const std::string state=control=="halt"?"transport_halt_not_engine_halt":(held?"held":"running");
    if(!SendFrame(pipe,Tf3RuntimeIpcType::receipt,h.correlation_id,session,"{\"status\":\"accepted\",\"control\":\""+control+"\",\"state\":\""+state+"\",\"engineObserver\":false}"))break;
    if(control=="shutdown")break;
  }
  FlushFileBuffers(pipe); DisconnectNamedPipe(pipe); CloseHandle(pipe); return 0;
}
} // namespace tf3runtimeipc
