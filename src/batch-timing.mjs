// Helper-observed intervals, NOT engine execution or one-way network latency.
// User thinking time is deliberately excluded from command measurements.
export function summarizeBatchTiming(events) {
  const samples=[];
  const pairs=[
    ["engine_probe", "engine_probe_started", "engine_probe_succeeded"],
    ["hold_and_confirmation", "pause_test_started", "pause_test_held"],
    ["held_vehicle", "vehicle_test_accepted", "vehicle_test_applied"],
    ["release_and_progress", "pause_test_releasing", "pause_test_passed"],
  ];
  const finite=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
  for(const [operation,startName,endName] of pairs) {
    let start=null;
    for(const event of events) {
      if(event.event===startName) start=event;
      if(event.event!==endName||!start) continue;
      const begin=start; start=null; // A receipt is never counted twice.
      if(!finite(begin.elapsedMs)||!finite(event.elapsedMs)||event.elapsedMs<begin.elapsedMs) continue;
      if(operation==="held_vehicle" && (!Number.isSafeInteger(begin.hostSequence)||begin.hostSequence!==event.hostSequence)) continue;
      if(["hold_and_confirmation","held_vehicle","release_and_progress"].includes(operation)
        && (!Number.isSafeInteger(begin.scheduledUpdate)||begin.scheduledUpdate!==event.scheduledUpdate)) continue;
      const sample={operation,observedDurationMs:event.elapsedMs-begin.elapsedMs};
      if(Number.isSafeInteger(begin.scheduledUpdate)) sample.scheduledUpdate=begin.scheduledUpdate;
      if(Number.isSafeInteger(event.updateCount)) sample.observedUpdate=event.updateCount;
      if(Number.isSafeInteger(event.heldUpdate)) sample.heldUpdate=event.heldUpdate;
      samples.push(sample);
    }
  }
  const failures=events.filter(e=> /(_failed|_rejected|_timeout)$/.test(e.event??""));
  return {scope:"helper_observed_intervals",clock:"monotonic",samples,
    lateReceiptCount:failures.filter(e=>e.code==="late").length,
    timeoutCount:failures.filter(e=>/timeout/i.test(e.event??"")||/timeout/i.test(e.code??"")).length,
    // Absence of a failure log is not proof that no deadline was missed.
    inferredEngineLatency:false,automaticallyTunedLead:false};
}
