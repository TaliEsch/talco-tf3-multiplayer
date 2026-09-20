import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBatchTiming } from "../src/batch-timing.mjs";
const event=(event,elapsedMs,extra={})=>({event,elapsedMs,...extra});
test("timing separates user wait from accepted command and deduplicates receipts",()=>{
  const result=summarizeBatchTiming([
    event("combined_test_select_vehicle",100),
    event("vehicle_test_accepted",10000,{hostSequence:1,scheduledUpdate:55}),
    event("vehicle_test_applied",11000,{hostSequence:1,scheduledUpdate:55,updateCount:55}),
    event("vehicle_test_applied",12000,{hostSequence:1,scheduledUpdate:55,updateCount:55}),
  ]);
  assert.deepEqual(result.samples,[{operation:"held_vehicle",observedDurationMs:1000,scheduledUpdate:55,observedUpdate:55}]);
  assert.equal(result.inferredEngineLatency,false);
  assert.equal(result.automaticallyTunedLead,false);
});
test("timing cannot pair different operations or targets",()=>{
  for(const extra of [{hostSequence:2,scheduledUpdate:55},{hostSequence:1,scheduledUpdate:56}]) {
    assert.deepEqual(summarizeBatchTiming([
      event("vehicle_test_accepted",100,{hostSequence:1,scheduledUpdate:55}),
      event("vehicle_test_applied",200,extra),
    ]).samples,[]);
  }
});
test("missing or invalid monotonic samples are unavailable, not zero latency",()=>{
  for(const elapsedMs of [undefined,NaN,Infinity,-1,99]) {
    assert.deepEqual(summarizeBatchTiming([event("engine_probe_started",100),event("engine_probe_succeeded",elapsedMs)]).samples,[]);
  }
});
test("records explicit late receipts and timeouts without classifying unrelated failures",()=>{
  const result=summarizeBatchTiming([
    event("pause_test_failed",10,{code:"late"}),
    event("engine_probe_timeout",20),
    event("pause_test_failed",30,{code:"TIMEOUT_RESUME_MANUALLY"}),
    event("vehicle_test_rejected",40,{code:"context_changed"}),
  ]);
  assert.equal(result.lateReceiptCount,1);
  assert.equal(result.timeoutCount,2);
});
