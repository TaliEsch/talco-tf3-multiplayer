// Attach a real engine adapter only after the authenticated client decoder has
// admitted a player.  The coordinator's capture frame is the first frame that
// carries the authoritative, per-game company roster; do not make a provider
// guess that roster from native IPC or bridge telemetry.
const FORWARDED = new Set([
  'coordination_capture', 'coordination_prepare', 'coordination_ready',
  'coordination_heartbeat', 'command_prepare', 'command_commit',
  'command_completed', 'session_halted', 'transport_error', 'peer_left',
]);
const ident = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const entity = value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;

function companiesFromCapture(payload, playerId) {
  const players = payload?.players;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4
    || players.some(player => !player || Object.keys(player).sort().join(',') !== 'companyEntity,playerId'
      || !ident(player.playerId) || !entity(player.companyEntity))) {
    throw new TypeError('INVALID_AUTHENTICATED_CAPTURE_ROSTER');
  }
  const ids = new Set(players.map(player => player.playerId));
  const companies = new Set(players.map(player => player.companyEntity));
  if (ids.size !== players.length || companies.size !== players.length || !ids.has(playerId)) {
    throw new TypeError('INVALID_AUTHENTICATED_CAPTURE_ROSTER');
  }
  return new Map(players.map(player => [player.playerId, player.companyEntity]));
}

// `connection.subscribe` is deliberately provided by client.mjs only after it
// authenticates, decodes, orders and session-checks a server frame. This helper
// adds no transport, native-control, or production-qualification assertion.
export function attachAuthenticatedEngineSession({ connection, createAdapter,
  onAdapter = () => {}, onFailure = () => {} } = {}) {
  if (!connection || typeof connection.subscribe !== 'function' || typeof connection.send !== 'function'
    || !connection.socket || typeof createAdapter !== 'function'
    || typeof onAdapter !== 'function' || typeof onFailure !== 'function') {
    throw new TypeError('INVALID_AUTHENTICATED_ENGINE_SESSION_OPTIONS');
  }
  const playerId = connection.playerId;
  if (!ident(playerId)) throw new Error('AUTHENTICATED_PLAYER_ID_REQUIRED');

  let adapter = null, attaching = null, closed = false, detach = null;
  const queued = [];
  const close = async () => {
    if (closed) return;
    closed = true;
    detach?.();
    try { connection.socket.destroy(); } catch { /* transport closure is best effort */ }
    try { await adapter?.close?.(); } catch { /* lost engine control cannot retain authority */ }
  };
  const fail = error => {
    if (closed) return;
    try { onFailure(error); } catch { /* diagnostics cannot affect fail-closed cleanup */ }
    void close();
  };
  const deliver = message => {
    if (closed) return;
    if (message.kind === 'session_ended') { void close(); return; }
    if (!FORWARDED.has(message.kind)) return;
    if (!adapter) {
      if (attaching || message.kind !== 'coordination_capture') {
        if (queued.length >= 16) fail(new Error('AUTHENTICATED_FRAME_BACKLOG')); else queued.push(message);
        return;
      }
      let companies;
      try { companies = companiesFromCapture(message.payload, playerId); }
      catch (error) { fail(error); return; }
      attaching = Promise.resolve(createAdapter(Object.freeze({
        playerId, companies, send: connection.send,
        disconnect: () => void close(), connection,
      }))).then(async result => {
        if (!result || typeof result.receive !== 'function') throw new TypeError('INVALID_AUTHENTICATED_ENGINE_ADAPTER');
        if (closed) { await result.close?.(); return; }
        adapter = result;
        try { onAdapter(result); } catch { /* observers cannot change transport authority */ }
        const pending = [message, ...queued.splice(0)];
        for (const frame of pending) {
          if (closed || adapter.receive(frame.kind, frame.payload) === false) {
            throw new Error('AUTHENTICATED_COORDINATOR_FRAME_REJECTED');
          }
        }
      }).catch(fail);
      return;
    }
    try {
      if (adapter.receive(message.kind, message.payload) === false) fail(new Error('AUTHENTICATED_COORDINATOR_FRAME_REJECTED'));
    } catch (error) { fail(error); }
  };
  try { detach = connection.subscribe(deliver); }
  catch (error) { throw new Error(`AUTHENTICATED_FRAME_SUBSCRIPTION_FAILED:${error?.message ?? 'UNKNOWN'}`); }
  return Object.freeze({
    get adapter() { return adapter; },
    get ready() { return adapter !== null && !closed; },
    get attachment() { return attaching; },
    close,
  });
}
