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

constexpr ULONGLONG kPartialFrameDeadlineMs = 5000;

bool ReadExact(HANDLE pipe, void* data, DWORD bytes, bool nonblocking,
               bool permitIdleBeforeFirstByte) {
  auto* out = static_cast<unsigned char*>(data);
  ULONGLONG deadline = permitIdleBeforeFirstByte ? 0 : GetTickCount64() + kPartialFrameDeadlineMs;
  while (bytes != 0) {
    DWORD got = 0;
    if (ReadFile(pipe, out, bytes, &got, nullptr) && got != 0) {
      if (deadline == 0) deadline = GetTickCount64() + kPartialFrameDeadlineMs;
      out += got; bytes -= got; continue;
    }
    const DWORD error = GetLastError();
    if (!nonblocking || (error != ERROR_NO_DATA && error != ERROR_PIPE_LISTENING)) return false;
    if (deadline != 0 && GetTickCount64() >= deadline) return false;
    Sleep(2);
  }
  return true;
}
bool WriteExact(HANDLE pipe, const void* data, DWORD bytes, bool nonblocking) {
  const auto* in = static_cast<const unsigned char*>(data);
  const ULONGLONG deadline = GetTickCount64() + kPartialFrameDeadlineMs;
  while (bytes != 0) {
    DWORD put = 0;
    if (WriteFile(pipe, in, bytes, &put, nullptr) && put != 0) {
      in += put; bytes -= put; continue;
    }
    const DWORD error = GetLastError();
    if (!nonblocking || (error != ERROR_NO_DATA && error != ERROR_PIPE_LISTENING)) return false;
    if (GetTickCount64() >= deadline) return false;
    Sleep(2);
  }
  return true;
}
void WaitForPeerCloseAfterShutdown(HANDLE pipe) {
  // DisconnectNamedPipe discards unread response bytes. After the authenticated
  // shutdown receipt is queued, let the client read it and close, but never let
  // a non-reading peer strand the in-process worker.
  DWORD mode = PIPE_READMODE_BYTE | PIPE_NOWAIT;
  if (!SetNamedPipeHandleState(pipe, &mode, nullptr, nullptr)) return;
  const ULONGLONG deadline = GetTickCount64() + kPartialFrameDeadlineMs;
  unsigned char discard = 0;
  while (GetTickCount64() < deadline) {
    DWORD got = 0;
    if (ReadFile(pipe, &discard, 1, &got, nullptr) && got != 0) continue;
    const DWORD error = GetLastError();
    if (error == ERROR_BROKEN_PIPE || error == ERROR_PIPE_NOT_CONNECTED) return;
    if (error != ERROR_NO_DATA && error != ERROR_PIPE_LISTENING) return;
    Sleep(2);
  }
}
bool ValidHeader(const Tf3RuntimeIpcFrameHeader& h) {
  return h.magic == TF3_RUNTIME_IPC_MAGIC && h.version == TF3_RUNTIME_IPC_VERSION && h.payload_size <= TF3_RUNTIME_IPC_MAX_PAYLOAD;
}
bool ReadFrame(HANDLE pipe, Tf3RuntimeIpcFrameHeader* h, std::string* payload, bool nonblocking) {
  if (!ReadExact(pipe, h, sizeof(*h), nonblocking, true) || !ValidHeader(*h)) return false;
  payload->assign(h->payload_size, '\0');
  return h->payload_size == 0 || ReadExact(pipe, payload->data(), h->payload_size, nonblocking, false);
}
bool SendFrame(HANDLE pipe, Tf3RuntimeIpcType type, std::uint64_t correlation, const std::array<unsigned char,16>& session, const std::string& payload, bool nonblocking) {
  if (payload.size() > TF3_RUNTIME_IPC_MAX_PAYLOAD) return false;
  Tf3RuntimeIpcFrameHeader h{TF3_RUNTIME_IPC_MAGIC, TF3_RUNTIME_IPC_VERSION, static_cast<std::uint16_t>(type), static_cast<std::uint32_t>(payload.size()), correlation, {}};
  std::memcpy(h.session, session.data(), session.size());
  return WriteExact(pipe, &h, sizeof(h), nonblocking) && (payload.empty() || WriteExact(pipe, payload.data(), static_cast<DWORD>(payload.size()), nonblocking));
}
bool ConstantTimeEqual(const std::string& a, const std::string& b) {
  if (a.size() != b.size()) return false; unsigned char diff = 0; for (size_t i=0;i<a.size();++i) diff |= static_cast<unsigned char>(a[i] ^ b[i]); return diff == 0;
}
bool ExtractToken(const std::string& json, std::string* token) {
  const std::string prefix = "{\"token\":\"";
  if (json.compare(0, prefix.size(), prefix) != 0 || json.size() < prefix.size() + 2 ||
      json.compare(json.size() - 2, 2, "\"}") != 0) return false;
  *token = json.substr(prefix.size(), json.size() - prefix.size() - 2);
  return token->find('"') == std::string::npos;
}
bool IsSession(const Tf3RuntimeIpcFrameHeader& h, const std::array<unsigned char,16>& session) { return std::memcmp(h.session, session.data(), session.size()) == 0; }
bool IsSafeControl(const std::string& payload, std::string* control) {
  for (const char* candidate : {"ping", "hold", "release", "halt", "shutdown"}) {
    if (payload == "{\"control\":\"" + std::string(candidate) + "\"}") {
      *control = candidate; return true;
    }
  }
  return false;
}
bool ValidPipeName(const std::wstring& n) { if (n.empty() || n.size()>80) return false; for (wchar_t c:n) if (!(std::iswalnum(c)||c==L'_'||c==L'-')) return false; return true; }
bool ValidToken(const std::string& token) {
  if (token.size() != 64) return false;
  for (char c : token) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  return true;
}
HANDLE CreateOwnerPipe(const std::wstring& name, bool boundedConnect) {
  PSECURITY_DESCRIPTOR sd=nullptr; if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(L"D:P(A;;GA;;;OW)", SDDL_REVISION_1, &sd, nullptr)) return INVALID_HANDLE_VALUE;
  SECURITY_ATTRIBUTES sa{sizeof(sa),sd,FALSE}; const std::wstring full=L"\\\\.\\pipe\\"+name;
  const DWORD mode = PIPE_TYPE_BYTE|PIPE_READMODE_BYTE|(boundedConnect?PIPE_NOWAIT:PIPE_WAIT)|PIPE_REJECT_REMOTE_CLIENTS;
  HANDLE p=CreateNamedPipeW(full.c_str(), PIPE_ACCESS_DUPLEX|FILE_FLAG_FIRST_PIPE_INSTANCE, mode, 1, 8192, 8192, 0, &sa);
  LocalFree(sd); return p;
}

bool ExtractBinding(const std::string& payload, std::string* session, std::string* role) {
  const std::string prefix = "{\"control\":\"bind\",\"sessionId\":\"";
  if (payload.compare(0, prefix.size(), prefix) != 0) return false;
  const auto sessionEnd = payload.find('"', prefix.size());
  if (sessionEnd == std::string::npos || sessionEnd == prefix.size() || sessionEnd - prefix.size() > 128) return false;
  *session = payload.substr(prefix.size(), sessionEnd - prefix.size());
  for (char c : *session) if (!std::isalnum(static_cast<unsigned char>(c)) && c != '_' && c != '.' && c != ':' && c != '-') return false;
  const std::string rolePrefix = "\",\"role\":\"";
  if (payload.compare(sessionEnd, rolePrefix.size(), rolePrefix) != 0 || payload.back() != '}') return false;
  const auto roleBegin = sessionEnd + rolePrefix.size();
  const auto roleEnd = payload.find('"', roleBegin);
  if (roleEnd == std::string::npos || roleEnd + 2 != payload.size() || payload[roleEnd + 1] != '}') return false;
  *role = payload.substr(roleBegin, roleEnd - roleBegin);
  return *role == "host" || *role == "participant";
}

int ServeMode(const std::wstring& name, const std::string& token, bool inProcess,
              RuntimeObservationProvider observer, std::uint32_t observerStartStatus) {
  if (!ValidPipeName(name) || !ValidToken(token)) return 9;
  HANDLE pipe=CreateOwnerPipe(name,inProcess); if(pipe==INVALID_HANDLE_VALUE) return 10;
  bool connected=false;
  const ULONGLONG connectDeadline=GetTickCount64()+30000;
  do {
    connected=ConnectNamedPipe(pipe,nullptr)!=FALSE || GetLastError()==ERROR_PIPE_CONNECTED;
    if(connected||!inProcess)break;
    if(GetLastError()!=ERROR_PIPE_LISTENING){CloseHandle(pipe);return 11;}
    Sleep(10);
  } while(GetTickCount64()<connectDeadline);
  if(!connected){CloseHandle(pipe);return 11;}
  Tf3RuntimeIpcFrameHeader h{}; std::string payload, supplied;
  if(!ReadFrame(pipe,&h,&payload,inProcess)||h.type!=static_cast<std::uint16_t>(Tf3RuntimeIpcType::hello)||h.correlation_id==0||!ExtractToken(payload,&supplied)||!ConstantTimeEqual(token,supplied)){CloseHandle(pipe);return 12;}
  std::array<unsigned char,16> session{}; if(!SystemFunction036(session.data(),static_cast<ULONG>(session.size()))){CloseHandle(pipe);return 13;}
  const bool observing = observer != nullptr && observer().active;
  const std::string hello = inProcess
    ? (observing
      ? "{\"capabilities\":[\"transport.health\",\"session.bind\",\"qualification.inprocess.observer\"],\"engineObserver\":true,\"productionQualified\":false,\"guiFreezes\":false}"
      : "{\"capabilities\":[\"transport.health\",\"session.bind\"],\"engineObserver\":false,\"productionQualified\":false,\"guiFreezes\":false"+
        (observerStartStatus==0?std::string():",\"observerStartStatus\":"+std::to_string(observerStartStatus))+"}")
    : "{\"capabilities\":[\"transport.health\"],\"engineObserver\":false}";
  if(!SendFrame(pipe,Tf3RuntimeIpcType::hello_ack,h.correlation_id,session,hello,inProcess)){CloseHandle(pipe);return 14;}
  bool held=false; std::vector<std::uint64_t> ids;
  std::string boundSession, boundRole;
  while(ReadFrame(pipe,&h,&payload,inProcess)) {
    if(!IsSession(h,session)||h.type!=static_cast<std::uint16_t>(Tf3RuntimeIpcType::control)||h.correlation_id==0){CloseHandle(pipe);return 15;}
    bool duplicate=false; for(auto id:ids) if(id==h.correlation_id) duplicate=true;
    std::string control, requestedSession, requestedRole;
    const bool binding = inProcess && ExtractBinding(payload, &requestedSession, &requestedRole);
    if(duplicate||(!binding&&!IsSafeControl(payload,&control))) { if(!SendFrame(pipe,Tf3RuntimeIpcType::error,h.correlation_id,session,"{\"code\":\""+std::string(duplicate?"DUPLICATE_ID":"INVALID_CONTROL")+"\"}",inProcess))break; continue; }
    ids.push_back(h.correlation_id); if(ids.size()>512){CloseHandle(pipe);return 16;}
    if (binding) {
      if (!boundSession.empty()) {
        if(!SendFrame(pipe,Tf3RuntimeIpcType::error,h.correlation_id,session,"{\"code\":\"SESSION_ALREADY_BOUND\"}",inProcess))break;
        continue;
      }
      boundSession=requestedSession; boundRole=requestedRole;
      const std::string receipt="{\"status\":\"accepted\",\"control\":\"bind\",\"boundSessionId\":\""+boundSession+"\",\"boundRole\":\""+boundRole+"\",\"engineObserver\":"+std::string(observing?"true":"false")+",\"productionQualified\":false}";
      if(!SendFrame(pipe,Tf3RuntimeIpcType::receipt,h.correlation_id,session,receipt,inProcess))break;
      continue;
    }
    if(control=="hold")held=true; if(control=="release")held=false;
    const std::string state=control=="halt"?"transport_halt_not_engine_halt":(held?"held":"running");
    std::string receipt="{\"status\":\"accepted\",\"control\":\""+control+"\",\"state\":\""+state+"\",\"engineObserver\":"+std::string(observing?"true":"false");
    if(control=="ping"&&observing){const auto observation=observer();receipt+=",\"observationHits\":"+std::to_string(observation.hits)+",\"observationThread\":"+std::to_string(observation.owner_thread)+",\"observationActive\":"+std::string(observation.active?"true":"false")+",\"observationCrossThread\":"+std::string(observation.cross_thread?"true":"false")+",\"observationSaturated\":"+std::string(observation.saturated?"true":"false");}
    receipt+="}";
    if(!SendFrame(pipe,Tf3RuntimeIpcType::receipt,h.correlation_id,session,receipt,inProcess))break;
    if(control=="shutdown"){
      // The standalone fixture can use the blocking flush that its client has
      // always expected. Never put that unbounded kernel wait in TF3: the
      // in-process path instead uses the bounded peer-close drain above.
      if(inProcess)WaitForPeerCloseAfterShutdown(pipe);else FlushFileBuffers(pipe);
      break;
    }
  }
  DisconnectNamedPipe(pipe); CloseHandle(pipe); return 0;
}
int Serve(const std::wstring& name, const std::string& token) { return ServeMode(name, token, false, nullptr, 0); }
int ServeInProcess(const std::wstring& name, const std::string& token,
                   RuntimeObservationProvider observer,
                   std::uint32_t observerStartStatus) { return ServeMode(name, token, true, observer, observerStartStatus); }
} // namespace tf3runtimeipc
