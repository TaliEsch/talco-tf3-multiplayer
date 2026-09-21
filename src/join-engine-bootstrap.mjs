import { attachAuthenticatedEngineSession } from './authenticated-engine-session.mjs';
import { loadJoinEngineFactory } from './join-engine-cli-seam.mjs';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exactSave = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === 'bytes,sha256'
  && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && hash(value.sha256);

function failClosed(connection, attachment, onFailure, error) {
  try { onFailure(error); } catch { /* reporting cannot retain an unsafe session */ }
  void attachment?.close?.();
  try { connection.socket.destroy(); } catch { /* socket closure is best effort */ }
}

// A save-gated admission is deliberately required here.  Without that gate the
// host can begin coordination as soon as it sends `admitted`, before an async
// provider is loaded and subscribed; silently accepting that race would lose
// the authoritative capture frame.  A no-save session needs a distinct host
// readiness barrier before it can use a real join adapter.
export function createJoinEngineBootstrap({ connection, modulePath, bridge, nativeGate,
  sessionId, buildHash, modManifestHash, downloadSave, onAdapter = () => {},
  onFailure = () => {}, logger = () => {}, loadFactory = loadJoinEngineFactory } = {}) {
  if (!connection || typeof connection.subscribe !== 'function' || typeof connection.send !== 'function'
    || !connection.socket || typeof downloadSave !== 'function' || typeof onAdapter !== 'function'
    || typeof onFailure !== 'function' || typeof loadFactory !== 'function') {
    throw new TypeError('INVALID_JOIN_ENGINE_BOOTSTRAP_OPTIONS');
  }
  let started = false, failed = false, attachment = null;
  const fail = error => {
    if (failed) return;
    failed = true;
    failClosed(connection, attachment, onFailure, error);
  };

  const admitted = async message => {
    if (started) throw new Error('JOIN_ENGINE_BOOTSTRAP_ALREADY_STARTED');
    started = true;
    try {
      if (message?.kind !== 'admitted' || !exactSave(message.payload?.save)) {
        throw new Error('JOIN_ENGINE_BOOTSTRAP_SAVE_GATE_REQUIRED');
      }
      if (typeof connection.playerId !== 'string' || connection.playerId.length === 0) {
        throw new Error('AUTHENTICATED_PLAYER_ID_REQUIRED');
      }
      const requiredSave = Object.freeze({ ...message.payload.save });
      const downloaded = await downloadSave(requiredSave);
      if (!exactSave(downloaded) || downloaded.bytes !== requiredSave.bytes
        || downloaded.sha256 !== requiredSave.sha256) {
        throw new Error('JOIN_DOWNLOADED_SAVE_MISMATCH');
      }
      const factory = await loadFactory({ modulePath, bridge, nativeGate, sessionId,
        buildHash, modManifestHash, requiredSave, verifiedSave: downloaded,
        engineSessionDirectory: bridge?.directory, logger });
      if (!factory || typeof factory.createAdapter !== 'function' || !exactSave(factory.verifiedSave)
        || factory.verifiedSave.bytes !== requiredSave.bytes || factory.verifiedSave.sha256 !== requiredSave.sha256) {
        throw new Error('JOIN_ENGINE_FACTORY_REQUIRED');
      }
      attachment = attachAuthenticatedEngineSession({ connection,
        createAdapter: factory.createAdapter,
        onAdapter,
        onFailure: fail,
      });
      // This is intentionally after adapter-provider qualification and the
      // authenticated subscription.  The host may now release coordination.
      connection.send('save_ready', requiredSave);
      return attachment;
    } catch (error) {
      fail(error);
      throw error;
    }
  };

  return Object.freeze({
    admitted,
    get attachment() { return attachment; },
    get started() { return started; },
    get failed() { return failed; },
  });
}
