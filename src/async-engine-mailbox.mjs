import { randomBytes } from "node:crypto";
import { lstat, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { parseFlatDataFile, requirePlainDirectory } from "./userdata-ipc.mjs";
import { CommandQueue } from "./lockstep.mjs";
import { decodeCheckpointReceipt } from "./coordinator-checkpoint.mjs";
import { decodeExecutionReceipt } from "./coordinator-execution.mjs";
import { replaceUnpublished } from './unpublished-replace.mjs';

const exact = (p, names) => p && Object.keys(p).sort().join(",") === names.split(",").sort().join(",");
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const ident = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const hash = s => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
// Data-only fixed schema. No eval, network strings, paths, arbitrary script,
// construction or finance payloads. Development mod consumes bindSession,
// prepare, held checkpoint capture/release, executeHeld and terminal halt under
// a live lease. Engine command cycles remain unverified in TF3.
export function encodeAsyncEngineRequest(r, nonce) {
  if (!/^[0-9a-f]{32}$/.test(nonce) || !r || r.schemaVersion !== 1 || !ident(r.roundId) || !ident(r.operationId)) throw new TypeError("invalid engine request identity");
  const common = "schemaVersion,roundId,operationId,operation";
  let p = {schemaVersion:1,nonce,roundId:r.roundId,operationId:r.operationId,operation:r.operation};
  if (r.operation === "bindSession") {
    if (!exact(r,common+",localPlayerId,players") || !ident(r.localPlayerId) || !Array.isArray(r.players)
      || r.players.length < 2 || r.players.length > 4
      || r.players.some(v=>!exact(v,"playerId,companyEntity") || !ident(v.playerId) || !uint(v.companyEntity))
      || new Set(r.players.map(v=>v.playerId)).size !== r.players.length
      || new Set(r.players.map(v=>v.companyEntity)).size !== r.players.length
      || !r.players.some(v=>v.playerId===r.localPlayerId)) throw new TypeError("invalid engine company binding");
    Object.assign(p,{localPlayerId:r.localPlayerId,playerCount:r.players.length});
    r.players.forEach((v,i)=>Object.assign(p,{[`player${i+1}`]:v.playerId,[`company${i+1}`]:v.companyEntity}));
  } else if (r.operation === "holdCheckpoint") {
    const expected=Object.hasOwn(r,'checkpointHash');
    if (!exact(r,common+",updateCount"+(expected?",checkpointHash":"")) || !uint(r.updateCount) || expected&&!hash(r.checkpointHash)) throw new TypeError("invalid checkpoint request");
    Object.assign(p,{updateCount:r.updateCount,...(expected?{checkpointHash:r.checkpointHash}:{})});
  } else if (r.operation === "release") {
    const speed=Object.hasOwn(r,'speedup');
    if (!exact(r,common+",updateCount"+(speed?',speedup':'')) || !uint(r.updateCount) || speed&&![1,2,4].includes(r.speedup)) throw new TypeError("invalid release request");
    p.updateCount = r.updateCount;
    if(speed)p.speedup=r.speedup;
  } else if (["prepare","executeHeld"].includes(r.operation)) {
    const c=r.command;
    if (!exact(r,common+",command") || !exact(c,"protocolVersion,hostSequence,scheduledUpdate,originPlayerId,targetCompanyEntity,targetEntity,commandType,payload,clientSequence,requestMessageId")
      || c.commandType !== "vehicle.setRunning" || !ident(c.originPlayerId) || !ident(c.requestMessageId)
      || ![c.hostSequence,c.scheduledUpdate,c.targetCompanyEntity,c.targetEntity,c.clientSequence].every(uint)) throw new TypeError("invalid bounded command");
    if (!new CommandQueue().enqueue(c,new Map([[c.originPlayerId,c.targetCompanyEntity]]),() => c.targetCompanyEntity)) throw new TypeError("invalid command sequence");
    Object.assign(p,{hostSequence:c.hostSequence,scheduledUpdate:c.scheduledUpdate,companyEntity:c.targetCompanyEntity,
      entity:c.targetEntity,running:c.payload.running,clientSequence:c.clientSequence,
      originPlayerId:c.originPlayerId,requestMessageId:c.requestMessageId,protocolVersion:c.protocolVersion,commandType:c.commandType});
  } else if (r.operation !== "halt" || !exact(r,common)) throw new TypeError("unsupported engine operation");
  const source=`function data()\nreturn {\n${Object.entries(p).map(([k,v]) => ` ${k}=${JSON.stringify(v)},`).join("\n")}\n}\nend\n`;
  parseFlatDataFile(source); return source;
}

// Lossless data-only inverse used to audit the engine-facing wire contract.
// This validates shape/identity, not authorization: the engine must compare
// originPlayerId with its independently established company bindings and live owner.
export function decodeAsyncEngineRequest(source, nonce) {
  const p=parseFlatDataFile(source);
  if(p.nonce!==nonce) throw new TypeError("engine request nonce mismatch");
  const r={schemaVersion:p.schemaVersion,roundId:p.roundId,operationId:p.operationId,operation:p.operation};
  if(p.operation==="bindSession") {
    if(!Number.isInteger(p.playerCount)||p.playerCount<2||p.playerCount>4) throw new TypeError("invalid engine company count");
    Object.assign(r,{localPlayerId:p.localPlayerId,players:Array.from({length:p.playerCount},(_,i)=>({playerId:p[`player${i+1}`],companyEntity:p[`company${i+1}`]}))});
  } else if(p.operation==="holdCheckpoint") Object.assign(r,{updateCount:p.updateCount,...(Object.hasOwn(p,'checkpointHash')?{checkpointHash:p.checkpointHash}:{})});
  else if(p.operation==="release") Object.assign(r,{updateCount:p.updateCount,...(Object.hasOwn(p,'speedup')?{speedup:p.speedup}:{})});
  else if(["prepare","executeHeld"].includes(p.operation)) r.command={
    protocolVersion:p.protocolVersion,hostSequence:p.hostSequence,scheduledUpdate:p.scheduledUpdate,
    originPlayerId:p.originPlayerId,targetCompanyEntity:p.companyEntity,targetEntity:p.entity,
    commandType:p.commandType,payload:{running:p.running},clientSequence:p.clientSequence,requestMessageId:p.requestMessageId,
  };
  const validated=parseFlatDataFile(encodeAsyncEngineRequest(r,nonce));
  if(Object.keys(p).sort().join(",")!==Object.keys(validated).sort().join(",")
    ||Object.keys(validated).some(key=>p[key]!==validated[key])) throw new TypeError("noncanonical engine request fields");
  return r;
}

export async function isUnpublishedEngineSource(temporary,source) {
  if(typeof source!=='string'||Buffer.byteLength(source)>4096)return false;
  const before=await lstat(temporary,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size!==BigInt(Buffer.byteLength(source)))return false;
  const pending=await open(temporary,'r');
  try {
    const actual=await pending.stat({bigint:true});
    // Windows lstat may report dev=0 while fstat supplies a volume serial.
    // Compare available device identities and exact bigint file IDs, not rounded numbers.
    if(!actual.isFile()||actual.nlink!==1n||actual.ino!==before.ino||actual.size!==before.size
      ||before.dev!==0n&&actual.dev!==0n&&actual.dev!==before.dev)return false;
    const bytes=Buffer.alloc(4097);
    const {bytesRead}=await pending.read(bytes,0,bytes.length,0);
    return bytesRead===Buffer.byteLength(source)&&bytes.subarray(0,bytesRead).equals(Buffer.from(source));
  }finally{await pending.close();}
}

export async function createAsyncEngineMailbox({directory,nonce=randomBytes(16).toString("hex"),requireCheckpointSnapshot=true}) {
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new TypeError("invalid mailbox nonce");
  if(typeof requireCheckpointSnapshot!=='boolean') throw new TypeError('invalid checkpoint evidence option');
  directory=await requirePlainDirectory(directory);
  const lockPath=path.join(directory,"coordination.lock"), requestPath=path.join(directory,"coordination_request.lua");
  const lock=await open(lockPath,"wx",0o600);
  let tail=Promise.resolve(), closed=false, halting=false;
  async function regularOrAbsent(filename) {
    try { const s=await lstat(filename); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) throw new Error("unsafe mailbox file"); }
    catch(e) { if (e.code !== "ENOENT") throw e; }
  }
  return {
    nonce,
    publish(request) {
      if (closed) return Promise.reject(new Error("mailbox closed"));
      // Validate and snapshot before entering the serialized I/O queue.
      let source;
      try { source=encodeAsyncEngineRequest(request,nonce); } catch(e) { return Promise.reject(e); }
      if (halting) return Promise.reject(new Error("mailbox halted; create a new verified session"));
      const halt = request.operation === "halt";
      if (halt) halting=true; // Latch before any queued publication can run.
      let publicationStage = 'queued';
      const operation=tail.then(async () => {
        const cancelled = () => { if(closed || halting && !halt) throw new Error("engine request cancelled before publication"); };
        cancelled();
        publicationStage='path_check';
        await requirePlainDirectory(directory); await regularOrAbsent(requestPath);
        cancelled();
        const temporary=path.join(directory,`.coordination-${randomBytes(12).toString("hex")}.tmp`);
        try {
          publicationStage='temporary_open';
          const h=await open(temporary,"wx",0o600);
          try {
            publicationStage='temporary_write';await h.writeFile(source);
            publicationStage='temporary_sync';await h.sync();
          } finally { await h.close(); }
          cancelled();
          publicationStage='replace';
          await replaceUnpublished({
            assertActive:cancelled,
            replace:async()=>{
              await requirePlainDirectory(directory);await regularOrAbsent(requestPath);
              cancelled();await rename(temporary,requestPath);
            },
            verifyUnpublished:()=>isUnpublishedEngineSource(temporary,source),
          });
        } finally { await unlink(temporary).catch(() => {}); }
      }).catch(error=>{
        // Preserve a stage/code for allowlisted diagnostics, not paths or source.
        // Unknown/terminal publication still fails once: no gameplay retry.
        error.publicationStage=publicationStage;
        throw error;
      });
      tail=operation.catch(() => {}); return operation;
    },
    async poll(participant) {
      if (closed) return false;
      await requirePlainDirectory(directory);
      const filename=path.join(directory,"coordination_receipt.lua");
      await regularOrAbsent(filename);
      let h;
      try { h=await open(filename,"r"); } catch(e) { if(e.code === "ENOENT") return false; throw e; }
      let source;
      try {
        const stat=await h.stat(); if(!stat.isFile() || stat.size>4096) throw new Error("oversized engine receipt");
        const b=Buffer.alloc(4097); const {bytesRead}=await h.read(b,0,b.length,0);
        if(bytesRead>4096) throw new Error("oversized engine receipt"); source=b.subarray(0,bytesRead).toString("utf8");
      } finally { await h.close(); }
      let p;
      try { p=parseFlatDataFile(source); } catch { return false; } // partial receipt never acknowledges work
      if(p.nonce!==nonce) return false;
      // Raw selected-state fields come from the engine, never from the expected
      // request hash. A malformed active receipt is forwarded as failure.
      if(p.operation==='holdCheckpoint'&&p.status==='ok'&&p.snapshotVersion!==undefined) {
        try {p=decodeCheckpointReceipt(p).receipt;} catch {p={...p,status:'unknown'};}
      } else if(requireCheckpointSnapshot&&p.operation==='holdCheckpoint'&&p.status==='ok') {
        p={...p,status:'unknown'}; // Never accept an expected-hash echo from the real adapter.
      }
      if(p.operation==='executeHeld'&&p.status==='ok') {
        try {p=decodeExecutionReceipt(p).receipt;} catch {p={...p,status:'unknown'};}
      }
      delete p.nonce; return participant.receiveEngine(p);
    },
    async close() {
      if(closed) return; closed=true; await tail;
      try { await regularOrAbsent(requestPath); await unlink(requestPath).catch(e => {if(e.code!=="ENOENT") throw e;}); }
      finally { await lock.close(); await unlink(lockPath); }
    },
  };
}
