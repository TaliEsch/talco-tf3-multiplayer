#include "production_boundary_gate.h"
#include <windows.h>
#include <atomic>
#include <iostream>
#include <thread>

extern "C" { std::uint64_t ProductionHarnessStep(); extern unsigned char ProductionHarnessTrap,ProductionHarnessResume; DWORD64 ProductionHarnessSeed=0xffffffff0000000fULL; }
namespace { constexpr std::uint64_t kSecret=0x54f33b0d84e1aa91ULL; PVOID veh=nullptr;
LONG CALLBACK Handler(EXCEPTION_POINTERS* p) { return tf3boundary::DispatchOwnedException(p); }
bool Until(inprocess_gate::State wanted) { auto d=GetTickCount64()+5000; while(tf3boundary::Read().gate.state!=wanted) {if(GetTickCount64()>d)return false; Sleep(1);}return true; }
[[noreturn]] void Fail(DWORD stage) { std::cerr << "stage=" << stage << "\n"; ExitProcess(stage); }
}
int main() {
  veh=AddVectoredExceptionHandler(1,Handler); if(!veh) return 1;
  const auto startup=tf3boundary::StartOwnedFixture(&ProductionHarnessTrap,&ProductionHarnessResume);
  if(startup!=tf3boundary::Status::started || tf3boundary::Start()!=tf3boundary::Status::disabled_pending_live_qualification) return 2;
  std::atomic<std::uint64_t> a{0};
  std::atomic<bool> owner_ready{false}, enter_gate{false};
  std::thread worker([&]{
    a=ProductionHarnessStep();
    owner_ready.store(true);
    while(!enter_gate.load()) Sleep(1);
    (void)ProductionHarnessStep();
    (void)ProductionHarnessStep();
  });
  while(!owner_ready.load()) Sleep(1);
  if(tf3boundary::RequestHold()!=inprocess_gate::Result::accepted) Fail(3);
  // The same observed owner reaches the sole owned breakpoint and waits in the ordinary helper.
  enter_gate.store(true);
  if(!Until(inprocess_gate::State::held)) Fail(4);
  const auto held=tf3boundary::Read();
  if(!held.owns_breakpoint_byte || !held.external_xstate_aligned || !held.full_xstate_enabled ||
      held.xcr0<3 || held.xstate_bytes<576 ||
      tf3boundary::RequestRelease(held.gate.boundary_generation)!=inprocess_gate::Result::accepted) Fail(5);
  if(!Until(inprocess_gate::State::held)) Fail(6);
  const auto reheld=tf3boundary::Read();
  if(reheld.gate.release_applied_generation!=held.gate.boundary_generation || !reheld.helper_outside_veh) Fail(7);
  const bool det=tf3boundary::PrepareOwnedDetach(kSecret,reheld.gate.boundary_generation)==inprocess_gate::Result::accepted && tf3boundary::ConfirmByteRestored(reheld.gate.boundary_generation)==inprocess_gate::Result::accepted;
  if(!det) Fail(8);
  if(!Until(inprocess_gate::State::detached)) Fail(9);
  worker.join();
  const auto end=tf3boundary::Read(); RemoveVectoredExceptionHandler(veh);
  const bool pass=det && end.gate.state==inprocess_gate::State::detached &&
      !end.gate.owner_in_gate && a==0x10;
  std::cout<<std::boolalpha<<"{\"scope\":\"production-boundary-adapter-owned\",\"activationPermitted\":false,\"tf3Qualified\":false,\"passed\":"<<pass<<",\"exclusiveBreakpointOwnership\":"<<held.owns_breakpoint_byte<<",\"externalXstateAligned\":"<<held.external_xstate_aligned<<",\"fullXstateEnabled\":"<<held.full_xstate_enabled<<",\"xcr0\":"<<held.xcr0<<",\"xstateBytes\":"<<held.xstate_bytes<<",\"helperOutsideVeh\":"<<reheld.helper_outside_veh<<",\"releaseReturnConfirmed\":"<<(reheld.gate.release_applied_generation==held.gate.boundary_generation)<<",\"detachReturnConfirmed\":"<<(end.gate.state==inprocess_gate::State::detached)<<"}\n";
  return pass?0:8;
}
