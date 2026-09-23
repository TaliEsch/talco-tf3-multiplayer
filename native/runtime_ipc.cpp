#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <sddl.h>
#include <array>
#include <cctype>
#include <cwctype>
#include <cstring>
#include <string>
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
bool ParseCanonicalUint64(const std::string& text, std::uint64_t* value) {
  if (text.empty() || (text.size() > 1 && text[0] == '0') || text.size() > 20) return false;
  std::uint64_t out = 0;
  for (const char c : text) {
    if (c < '0' || c > '9') return false;
    const auto digit = static_cast<std::uint64_t>(c - '0');
    if (out > (UINT64_MAX - digit) / 10) return false;
    out = out * 10 + digit;
  }
  *value = out; return true;
}
bool ExtractGateRequest(const std::string& payload, GateRequest* request) {
  // This byte-for-byte canonical form rejects duplicate keys, numeric JSON
  // coercion, alternate key order, and leading-zero identifiers.
  constexpr const char* names[] = {"hold", "release", "halt", "detach"};
  for (std::size_t i = 0; i != _countof(names); ++i) {
    const std::string prefix = "{\"control\":\"" + std::string(names[i]) + "\",\"epoch\":\"";
    if (payload.compare(0, prefix.size(), prefix) != 0) continue;
    const auto epoch_end = payload.find('"', prefix.size());
    if (epoch_end == std::string::npos || payload.compare(epoch_end, 16, "\",\"generation\":\"") != 0 || payload.back() != '}') return false;
    const auto generation_begin = epoch_end + 16;
    const auto generation_end = payload.find('"', generation_begin);
    if (generation_end == std::string::npos || generation_end + 2 != payload.size() || payload[generation_end + 1] != '}') return false;
    std::uint64_t epoch = 0, generation = 0;
    if (!ParseCanonicalUint64(payload.substr(prefix.size(), epoch_end - prefix.size()), &epoch) ||
        !ParseCanonicalUint64(payload.substr(generation_begin, generation_end - generation_begin), &generation)) return false;
    request->control = static_cast<GateControl>(i);
    request->epoch = epoch; request->generation = generation; return true;
  }
  return false;
}
const char* GateControlName(GateControl control) {
  constexpr const char* names[] = {"hold", "release", "halt", "detach"};
  const auto index = static_cast<unsigned int>(control);
  return index < _countof(names) ? names[index] : nullptr;
}
const char* GateReceiptName(GateReceipt receipt) {
  constexpr const char* names[] = {"held", "permit_consumed", "halt_requested", "detach_prepared"};
  const auto index = static_cast<unsigned int>(receipt);
  return index < _countof(names) ? names[index] : nullptr;
}
const char* GateEventName(GateEvent event) {
  constexpr const char* names[] = {"boundary_applied", "terminal_parked", "detached"};
  const auto index = static_cast<unsigned int>(event);
  return index < _countof(names) ? names[index] : nullptr;
}
bool ReceiptMatches(GateControl control, GateReceipt receipt) {
  return static_cast<unsigned int>(control) == static_cast<unsigned int>(receipt);
}
std::string GateReceiptJson(const GateRequest& request, GateReceipt receipt) {
  const char* const control = GateControlName(request.control);
  const char* const status = GateReceiptName(receipt);
  if (!control || !status || !ReceiptMatches(request.control, receipt)) return {};
  const char* field = request.control == GateControl::hold ? "heldGeneration" :
    request.control == GateControl::release ? "permitConsumedGeneration" :
    request.control == GateControl::halt ? "haltGeneration" : "detachGeneration";
  const auto epoch = std::to_string(request.epoch), generation = std::to_string(request.generation);
  return "{\"status\":\"" + std::string(status) + "\",\"control\":\"" + control +
    "\",\"epoch\":\"" + epoch + "\",\"generation\":\"" + generation + "\",\"" + field + "\":\"" + generation + "\"}";
}
std::string GateEventJson(const GateEventRecord& event) {
  const char* const name = GateEventName(event.event);
  if (!name) return {};
  const char* field = event.event == GateEvent::boundary_applied ? "releaseAppliedGeneration" :
    event.event == GateEvent::terminal_parked ? "haltGeneration" : "detachGeneration";
  const auto epoch = std::to_string(event.epoch), generation = std::to_string(event.generation);
  return "{\"event\":\"" + std::string(name) + "\",\"epoch\":\"" + epoch +
    "\",\"generation\":\"" + generation + "\",\"" + field + "\":\"" + generation + "\"}";
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
              RuntimeObservationProvider observer, std::uint32_t observerStartStatus,
              const GateProvider* gateProvider,
              std::uint32_t authenticatedSessionLeaseMs,
              PassiveVehicleActionObservationProvider passiveVehicle) {
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
  const bool observingPassiveVehicle = passiveVehicle != nullptr && passiveVehicle().active;
  const bool gateAvailable = inProcess && gateProvider != nullptr && gateProvider->qualification_enabled &&
    gateProvider->submit != nullptr && gateProvider->poll_notification != nullptr;
  // A lease is deliberately meaningful only to the in-process qualified gate.
  // Standalone diagnostic transport keeps its historical indefinite session
  // behavior.  The initial hello is authenticated by the one-shot token and
  // establishes the random session carried by all later control frames.
  const bool gateLeaseEnabled = gateAvailable;
  const ULONGLONG gateLeaseDuration = authenticatedSessionLeaseMs;
  ULONGLONG gateLeaseDeadline = gateLeaseEnabled
    ? GetTickCount64() + gateLeaseDuration : 0;
  const std::string hello = inProcess
    ? (observing
      ? "{\"capabilities\":[\"transport.health\",\"session.bind\",\"qualification.inprocess.observer\"" +
        std::string(gateAvailable ? ",\"qualification.inprocess.gate\",\"simulation.hold\",\"engine.halt\",\"simulation.gate-receipts.v1\",\"engine.detach\"" : "") +
        std::string(observingPassiveVehicle ? ",\"diagnostic.passive-vehicle-action.v1\"" : "") +
        "],\"engineObserver\":true,\"productionQualified\":" + std::string(gateProvider && gateProvider->production_qualified ? "true" : "false") + ",\"guiFreezes\":" + std::string(gateProvider && gateProvider->production_qualified ? "true" : "false") + "}"
      : "{\"capabilities\":[\"transport.health\",\"session.bind\"" +
        std::string(gateAvailable ? ",\"qualification.inprocess.gate\",\"simulation.hold\",\"engine.halt\",\"simulation.gate-receipts.v1\",\"engine.detach\"" : "") +
        std::string(observingPassiveVehicle ? ",\"diagnostic.passive-vehicle-action.v1\"" : "") +
        "],\"engineObserver\":false,\"productionQualified\":" + std::string(gateProvider && gateProvider->production_qualified ? "true" : "false") + ",\"guiFreezes\":false"+
        (observerStartStatus==0?std::string():",\"observerStartStatus\":"+std::to_string(observerStartStatus))+"}")
    : "{\"capabilities\":[\"transport.health\"],\"engineObserver\":false}";
  if(!SendFrame(pipe,Tf3RuntimeIpcType::hello_ack,h.correlation_id,session,hello,inProcess)){CloseHandle(pipe);return 14;}
  bool held=false;
  // Correlation IDs are a strictly increasing per-connection sequence.  This
  // single bounded high-water mark rejects both replay and out-of-order input
  // without retaining an arbitrary 512-request lifetime cache.
  std::uint64_t lastCorrelationId = h.correlation_id;
  std::string boundSession, boundRole;
  while(true) {
    if (gateLeaseEnabled && GetTickCount64() >= gateLeaseDeadline) {
      // Returning makes the in-process runtime's existing cleanup path request
      // a real engine halt unless a verified detach already happened.
      DisconnectNamedPipe(pipe); CloseHandle(pipe); return 17;
    }
    // The native update boundary reports events only by polling. Never wait on
    // a gate receipt here: a held simulation must still service ping/teardown.
    if (gateAvailable) {
      GateNotification notification{};
      if (gateProvider->poll_notification(&notification)) {
        const auto& request = notification.request;
        const bool receipt = notification.kind == GateNotificationKind::receipt;
        const auto json = receipt ? GateReceiptJson(request, notification.receipt) :
          GateEventJson({notification.event, request.epoch, request.generation,
                         request.correlation_id});
        if (json.empty() || request.correlation_id == 0 ||
            !SendFrame(pipe, receipt ? Tf3RuntimeIpcType::receipt : Tf3RuntimeIpcType::event,
                       request.correlation_id, session, json, true)) break;
        continue;
      }
      DWORD available = 0;
      if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &available, nullptr)) break;
      if (available == 0) { Sleep(2); continue; }
    }
    if (!ReadFrame(pipe,&h,&payload,inProcess)) break;
    if(!IsSession(h,session)||h.type!=static_cast<std::uint16_t>(Tf3RuntimeIpcType::control)||h.correlation_id==0){CloseHandle(pipe);return 15;}
    const bool duplicate = h.correlation_id == lastCorrelationId;
    const bool outOfOrder = h.correlation_id < lastCorrelationId;
    if (duplicate || outOfOrder) {
      const char* const code = duplicate ? "DUPLICATE_ID" : "OUT_OF_ORDER_ID";
      if (!SendFrame(pipe, Tf3RuntimeIpcType::error, h.correlation_id, session,
                     "{\"code\":\"" + std::string(code) + "\"}", inProcess)) break;
      continue;
    }
    lastCorrelationId = h.correlation_id;
    std::string control, requestedSession, requestedRole;
    const bool binding = inProcess && ExtractBinding(payload, &requestedSession, &requestedRole);
    GateRequest gateRequest{};
    const bool gateControl = gateAvailable && ExtractGateRequest(payload, &gateRequest);
    const bool safeControl = IsSafeControl(payload, &control);
    if(!binding&&!gateControl&&!safeControl) {
      if(!SendFrame(pipe,Tf3RuntimeIpcType::error,h.correlation_id,session,"{\"code\":\"INVALID_CONTROL\"}",inProcess))break;
      continue;
    }
    // Semantic validation above, not merely a byte arriving on the pipe,
    // refreshes the fail-safe lease.  Gate notifications are outbound-only and
    // intentionally cannot keep a silent helper alive.
    if (gateLeaseEnabled) gateLeaseDeadline = GetTickCount64() + gateLeaseDuration;
    if (binding) {
      if (!boundSession.empty()) {
        if(!SendFrame(pipe,Tf3RuntimeIpcType::error,h.correlation_id,session,"{\"code\":\"SESSION_ALREADY_BOUND\"}",inProcess))break;
        continue;
      }
      boundSession=requestedSession; boundRole=requestedRole;
      const std::string receipt="{\"status\":\"accepted\",\"control\":\"bind\",\"boundSessionId\":\""+boundSession+"\",\"boundRole\":\""+boundRole+"\",\"engineObserver\":"+std::string(observing?"true":"false")+",\"productionQualified\":"+std::string(gateProvider && gateProvider->production_qualified?"true":"false")+"}";
      if(!SendFrame(pipe,Tf3RuntimeIpcType::receipt,h.correlation_id,session,receipt,inProcess))break;
      continue;
    }
    if (gateControl) {
      gateRequest.correlation_id = h.correlation_id;
      if (boundSession.empty()) {
        if (!SendFrame(pipe, Tf3RuntimeIpcType::error, h.correlation_id, session,
                       "{\"code\":\"SESSION_NOT_BOUND\"}", true)) break;
        continue;
      }
      if (!gateProvider->submit(gateRequest)) {
        if (!SendFrame(pipe, Tf3RuntimeIpcType::error, h.correlation_id, session, "{\"code\":\"GATE_REJECTED\"}", true)) break;
        continue;
      }
      continue;
    }
    if(control=="hold")held=true; if(control=="release")held=false;
    const std::string state=control=="halt"?"transport_halt_not_engine_halt":(held?"held":"running");
    std::string receipt="{\"status\":\"accepted\",\"control\":\""+control+"\",\"state\":\""+state+"\",\"engineObserver\":"+std::string(observing?"true":"false");
    if(control=="ping"&&observing){const auto observation=observer();receipt+=",\"observationHits\":"+std::to_string(observation.hits)+",\"observationMinimumStackHeadroom\":"+std::to_string(observation.minimum_stack_headroom)+",\"observationThread\":"+std::to_string(observation.owner_thread)+",\"observationCfgFlags\":"+std::to_string(observation.cfg_flags)+",\"observationCetFlags\":"+std::to_string(observation.cet_flags)+",\"observationCfgKnown\":"+std::string(observation.cfg_known?"true":"false")+",\"observationCetKnown\":"+std::string(observation.cet_known?"true":"false")+",\"observationActive\":"+std::string(observation.active?"true":"false")+",\"observationCrossThread\":"+std::string(observation.cross_thread?"true":"false")+",\"observationSaturated\":"+std::string(observation.saturated?"true":"false");}
    if(control=="ping"&&observingPassiveVehicle){
      const auto action=passiveVehicle();
      receipt+=",\"passiveVehicleFactoryHits\":\""+std::to_string(action.factory_hits)+"\",\"passiveVehicleAdmissionHits\":\""+std::to_string(action.admission_hits)+"\",\"passiveVehicleCorrelatedHits\":\""+std::to_string(action.correlated_hits)+"\",\"passiveVehicleDroppedCandidates\":\""+std::to_string(action.dropped_candidates)+"\",\"passiveVehicleThread\":"+std::to_string(action.owner_thread)+",\"passiveVehicleLatestEntity\":"+std::to_string(action.latest_entity)+",\"passiveVehicleLatestStopped\":"+std::to_string(action.latest_stopped)+",\"passiveVehicleLatestValid\":"+std::string(action.latest_valid?"true":"false")+",\"passiveVehicleLatestEntryResultZero\":"+std::string(action.latest_entry_result_zero?"true":"false")+",\"passiveVehicleLatestCallbackShapeMatches\":"+std::string(action.latest_callback_shape_matches?"true":"false")+",\"passiveVehicleActive\":"+std::string(action.active?"true":"false")+",\"passiveVehicleCrossThread\":"+std::string(action.cross_thread?"true":"false")+",\"passiveVehicleSaturated\":"+std::string(action.saturated?"true":"false")+",\"passiveVehicleCallbackHits\":\""+std::to_string(action.callback_hits)+"\",\"passiveVehicleCallbackThread\":"+std::to_string(action.callback_thread)+",\"passiveVehicleLatestCallbackEntity\":"+std::to_string(action.latest_callback_entity)+",\"passiveVehicleLatestCallbackStopped\":"+std::to_string(action.latest_callback_stopped)+",\"passiveVehicleLatestCallbackResult\":"+std::to_string(action.latest_callback_result)+",\"passiveVehicleLatestCallbackValid\":"+std::string(action.latest_callback_valid?"true":"false")+",\"passiveVehicleLatestCallbackMatchesAdmissionStorage\":"+std::string(action.latest_callback_matches_admission_storage?"true":"false")+",\"passiveVehicleLatestAdmissionProgressKnown\":"+std::string(action.latest_admission_progress_known?"true":"false")+",\"passiveVehicleLatestAdmissionProgressEmpty\":"+std::string(action.latest_admission_progress_empty?"true":"false")+",\"passiveVehicleLatestCorrelatedAdmissionThread\":"+std::to_string(action.latest_correlated_admission_thread);
      receipt+=",\"passiveVehicleSendReturnHits\":\""+std::to_string(action.send_return_hits)+"\",\"passiveVehicleSendReturnThread\":"+std::to_string(action.send_return_thread)+",\"passiveVehicleLatestSendReturnMatchesAdmissionStorage\":"+std::string(action.latest_send_return_matches_admission_storage?"true":"false")+",\"passiveVehicleMarshalerReturnHits\":\""+std::to_string(action.marshaler_return_hits)+"\",\"passiveVehicleMarshalerReturnThread\":"+std::to_string(action.marshaler_return_thread)+",\"passiveVehicleLatestMarshalerEntity\":"+std::to_string(action.latest_marshaler_entity)+",\"passiveVehicleLatestMarshalerStopped\":"+std::to_string(action.latest_marshaler_stopped)+",\"passiveVehicleLatestMarshalerResult\":"+std::to_string(action.latest_marshaler_result)+",\"passiveVehicleLatestMarshalerValid\":"+std::string(action.latest_marshaler_valid?"true":"false")+",\"passiveVehicleLatestMarshalerMatchesAdmissionStorage\":"+std::string(action.latest_marshaler_matches_admission_storage?"true":"false")+",\"passiveVehicleLatestMarshalerMatchesCallbackStorage\":"+std::string(action.latest_marshaler_matches_callback_storage?"true":"false");
      receipt+=",\"passiveVehiclePostSendBodyHits\":\""+std::to_string(action.post_send_body_hits)+"\",\"passiveVehiclePostSendBodyThread\":"+std::to_string(action.post_send_body_thread);
      receipt+=",\"passiveVehiclePostSendBodyCorrelatedHits\":\""+std::to_string(action.post_send_body_correlated_hits)+"\",\"passiveVehicleLatestCorrelatedAdmissionInvocation\":\""+std::to_string(action.latest_correlated_admission_invocation)+"\",\"passiveVehicleLatestSendReturnInvocation\":\""+std::to_string(action.latest_send_return_invocation)+"\",\"passiveVehicleLatestPostSendBodyInvocation\":\""+std::to_string(action.latest_post_send_body_invocation)+"\",\"passiveVehicleLatestPostSendBodyEntity\":"+std::to_string(action.latest_post_send_body_entity)+",\"passiveVehicleLatestPostSendBodyStopped\":"+std::to_string(action.latest_post_send_body_stopped)+",\"passiveVehicleLatestPostSendBodyValid\":"+std::string(action.latest_post_send_body_valid?"true":"false")+",\"passiveVehicleLatestPostSendBodyThread\":"+std::to_string(action.latest_post_send_body_thread);
    }
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
int Serve(const std::wstring& name, const std::string& token) { return ServeMode(name, token, false, nullptr, 0, nullptr, 0, nullptr); }
int ServeInProcess(const std::wstring& name, const std::string& token,
                   RuntimeObservationProvider observer,
                   std::uint32_t observerStartStatus,
                   const GateProvider* gateProvider,
                   std::uint32_t authenticatedSessionLeaseMs,
                   PassiveVehicleActionObservationProvider passiveVehicle) {
  if (gateProvider != nullptr && gateProvider->qualification_enabled &&
      (authenticatedSessionLeaseMs < 100 || authenticatedSessionLeaseMs > 30000)) return 18;
  return ServeMode(name, token, true, observer, observerStartStatus, gateProvider,
                   authenticatedSessionLeaseMs, passiveVehicle);
}
} // namespace tf3runtimeipc
