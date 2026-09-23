// Host actions must not have a privileged shortcut around HostAuthority or the
// coordinator.  This composition uses an authenticated loopback client, then
// attaches a caller-provided real engine adapter after admission.  It has no
// default adapter and cannot manufacture receipts or checkpoint evidence.
import {companiesFromCapture} from './authenticated-engine-session.mjs';

const FORWARDED = new Set([
  'coordination_capture', 'coordination_prepare', 'coordination_ready',
  'coordination_heartbeat', 'command_prepare', 'command_commit',
  'command_completed', 'session_halted', 'session_ended', 'transport_error',
  'error', 'peer_left',
]);

export function connectHostLocalParticipant({ host, displayName, engineBinding,
  createAdapter, onMessage = () => {}, verifiedSave = null, pollIntervalMs = 25,
  deferAdapterUntilCapture = false } = {}) {
  if (!host || typeof host.connectLocalTransport !== 'function' || typeof host.registerLocalParticipant !== 'function'
    || typeof displayName !== 'string' || !displayName.length || typeof createAdapter !== 'function'
    || !engineBinding || (typeof engineBinding !== 'object' && typeof engineBinding !== 'function')
    || typeof onMessage !== 'function' || typeof deferAdapterUntilCapture !== 'boolean' || !Number.isSafeInteger(pollIntervalMs)
    || pollIntervalMs < 10 || pollIntervalMs > 1000) throw new TypeError('INVALID_HOST_LOCAL_PARTICIPANT_OPTIONS');
  if (verifiedSave !== null && (!verifiedSave || !Number.isSafeInteger(verifiedSave.bytes) || verifiedSave.bytes < 0
    || typeof verifiedSave.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(verifiedSave.sha256))) throw new TypeError('INVALID_VERIFIED_SAVE');

  let connection, adapter = null, detach = null, closed = false, attaching = null, closing = null;
  let admittedPlayer=null;
  const queued=[];
  let settleAttachment;
  const attachmentReady=new Promise(resolve=>{settleAttachment=resolve;});
  let pollTimer = null, pollInFlight = null;
  const stopPolling = () => {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
  };
  const schedulePoll = () => {
    if (closed || !adapter || pollTimer !== null || pollInFlight) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      if (closed || !adapter || pollInFlight) return;
      pollInFlight = Promise.resolve().then(() => adapter.poll()).catch(() => void close()).finally(() => {
        pollInFlight = null;
        schedulePoll();
      });
    }, pollIntervalMs);
    pollTimer.unref?.();
  };
  const attachment = {
    attached: false,
    captureReady: deferAdapterUntilCapture,
    receive(kind, payload) {
      if(closed)return;
      if(!adapter&&deferAdapterUntilCapture){
        if(queued.length>=16){void close();return;}
        if(kind==='coordination_capture'&&!attaching){
          let companies;
          try{companies=companiesFromCapture(payload,admittedPlayer.playerId);}catch{void close();return;}
          startAttachment(admittedPlayer,companies,{kind,payload});
        } else queued.push({kind,payload});
        return;
      }
      if (!adapter) { void close(); return; }
      try { if (adapter.receive(kind, payload) === false) void close(); } catch { void close(); }
    },
  };
  const verifySave=save=>{
    if(!save)return;
    if(!verifiedSave||verifiedSave.bytes!==save.bytes||verifiedSave.sha256!==save.sha256)
      throw new Error('LOCAL_SAVE_VERIFICATION_REQUIRED');
    connection.send('save_ready',verifiedSave);
  };
  const startAttachment=(player,companies,initialFrame=null,save=null)=>{
    const input=Object.freeze({
      engineBinding,player,playerId:player.playerId,sessionId:host.sessionId,companies,
      send:(kind,payload)=>connection.send(kind,payload),
      disconnect:()=>void close(),subscribe:observer=>connection.subscribe(observer),
    });
    attaching=Promise.resolve().then(()=>createAdapter(input)).then(async result=>{
      if(!result||typeof result.receive!=='function'||typeof result.poll!=='function'||typeof result.close!=='function')
        throw new TypeError('INVALID_HOST_LOCAL_ENGINE_ADAPTER');
      if(closed){await result.close();return;}
      adapter=result;
      if(initialFrame&&adapter.receive(initialFrame.kind,initialFrame.payload)===false)
        throw new Error('HOST_LOCAL_CAPTURE_REJECTED');
      for(const frame of queued.splice(0))
        if(adapter.receive(frame.kind,frame.payload)===false)throw new Error('HOST_LOCAL_FRAME_REJECTED');
      verifySave(save);
      attachment.attached=true;
      schedulePoll();
    }).catch(()=>void close()).finally(()=>settleAttachment());
  };
  const close = async () => {
    if (closing) return closing;
    closed = true;
    attachment.captureReady=false;
    stopPolling();
    // Keep the pending registration until the authenticated socket close is
    // observed by the host.  Removing it first would leave a brief interval in
    // which a still-admitted local player could evade the coordination gate.
    closing = (async () => {
      try { connection?.socket.destroy(); } catch { /* transport closure is best effort */ }
      try { await pollInFlight; } catch { /* rejected poll already closes transport */ }
      try { await adapter?.close(); } catch { /* failed adapter teardown cannot retain authority */ }
      if(!attaching)settleAttachment();
    })();
    return closing;
  };
  const deliver = (message, context) => {
    if(closed)return;
    if (message.kind === 'admitted' && !admittedPlayer) {
      const player = message.payload?.player;
      if (!player || typeof player.playerId !== 'string') { void close(); return; }
      // Register the pending attachment before awaiting user code.  This makes
      // beginCoordination fail closed during an asynchronous adapter setup.
      try { detach = host.registerLocalParticipant(player.playerId, attachment); }
      catch { void close(); return; }
      admittedPlayer=player;
      if(deferAdapterUntilCapture){
        try{verifySave(message.payload?.save);}catch{void close();return;}
      } else startAttachment(player,undefined,null,message.payload?.save);
      // Internal admission registration is deliberately complete before an
      // observer can call beginCoordination from its admitted callback.
      try { onMessage(message, context); } catch { /* UI observer cannot affect protocol */ }
      return;
    }
    try { onMessage(message, context); } catch { /* UI observer cannot affect protocol */ }
    if (FORWARDED.has(message.kind) && detach) attachment.receive(message.kind, message.payload);
    if (message.kind === 'session_ended') void close();
  };
  connection = host.connectLocalTransport({ displayName, onMessage: deliver });
  return Object.freeze({
    get connection() { return connection; },
    get adapter() { return adapter; },
    get ready() { return adapter !== null && detach !== null && !closed; },
    get attachment() { return attachmentReady; },
    close,
  });
}
