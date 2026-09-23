import test from 'node:test';
import assert from 'node:assert/strict';
import {liveHostUpdateCount} from '../src/live-host-clock.mjs';

test('host scheduling uses only a live bounded game update',()=>{
  let status={available:true,sample:{updateCount:381}};
  const bridge={connected:true,get engineObservation(){return status;}};
  assert.equal(liveHostUpdateCount(bridge),381);
  status={available:false,sample:{updateCount:381}};
  assert.ok(Number.isNaN(liveHostUpdateCount(bridge)));
  status={available:true,sample:{updateCount:382}};
  bridge.connected=false;
  assert.ok(Number.isNaN(liveHostUpdateCount(bridge)));
  bridge.connected=true;
  status={available:true,sample:{updateCount:2147483648}};
  assert.ok(Number.isNaN(liveHostUpdateCount(bridge)));
});
