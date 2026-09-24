import test from 'node:test';
import assert from 'node:assert/strict';
import {hasSoleHostLocalParticipant} from '../src/host-local-participant.mjs';

test('road replay admits only the authenticated local Host in an untouched lobby', () => {
  const players = [{playerId:'local'}];
  const host = {authority:{players:()=>players},coordinator:{phase:'lobby'}};
  const localParticipant = {connection:{playerId:'local'}};
  const nativeGate = {ready:true};
  const allowed = () => hasSoleHostLocalParticipant({host,localParticipant,nativeGate});
  assert.equal(allowed(),true);
  players.push({playerId:'remote'});
  assert.equal(allowed(),false);
  players.pop();
  players[0] = {playerId:'remote'};
  assert.equal(allowed(),false);
  players[0] = {playerId:'local'};
  host.coordinator.phase = 'held';
  assert.equal(allowed(),false);
  host.coordinator.phase = 'lobby';
  nativeGate.ready = false;
  assert.equal(allowed(),false);
  nativeGate.ready = true;
  localParticipant.connection.playerId = undefined;
  assert.equal(allowed(),false);
  localParticipant.connection.playerId = 'local';
  players.pop();
  assert.equal(allowed(),false);
});
