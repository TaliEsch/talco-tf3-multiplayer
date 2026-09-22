// The production native wire now uses a monotonic high-water replay barrier and
// has no 512-request lifetime. This is only a diagnostic guard against a live
// checker accidentally spinning unbounded control traffic.
export const LIVE_CHECK_CONTROL_ID_LIMIT=512;
export const LIVE_CONTROL_POLL_INTERVAL_MS=1000;
export const LIVE_CONTROL_WAIT_WINDOW_MS=180000;

// One bind, the initial observer ping, both worst-case polling windows (the
// bridge window has one initial sample), seven gate-check controls, and the
// final shutdown. The handshake is not a control and is not retained by the
// native server's duplicate-ID set.
export const MAX_ADVERTISED_LIVE_CONTROL_IDS=1+1
  +Math.ceil(LIVE_CONTROL_WAIT_WINDOW_MS/LIVE_CONTROL_POLL_INTERVAL_MS)
  +1+Math.ceil(LIVE_CONTROL_WAIT_WINDOW_MS/LIVE_CONTROL_POLL_INTERVAL_MS)
  +7+1;

if(MAX_ADVERTISED_LIVE_CONTROL_IDS>LIVE_CHECK_CONTROL_ID_LIMIT){
  throw new Error('LIVE_CHECK_CONTROL_ID_BUDGET_EXCEEDS_DIAGNOSTIC_LIMIT');
}

export const createLiveControlIdBudget=(limit=LIVE_CHECK_CONTROL_ID_LIMIT)=>{
  if(!Number.isSafeInteger(limit)||limit<1)throw new TypeError('INVALID_LIVE_CONTROL_ID_LIMIT');
  let used=0;
  return Object.freeze({
    issue(operation){
      if(typeof operation!=='function')throw new TypeError('INVALID_LIVE_CONTROL_OPERATION');
      if(used>=limit)throw new Error('LIVE_CHECK_CONTROL_ID_BUDGET_EXHAUSTED');
      used++;
      return operation();
    },
    get used(){return used;},
    get remaining(){return limit-used;},
  });
};
