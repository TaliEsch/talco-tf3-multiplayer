import { randomBytes } from "node:crypto";
import { lstat, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { parseFlatDataFile, requirePlainDirectory } from "./userdata-ipc.mjs";
import { CommandQueue } from "./lockstep.mjs";
import { decodeCheckpointReceipt } from "./coordinator-checkpoint.mjs";
import { decodeExecutionReceipt } from "./coordinator-execution.mjs";
import { decodeRoadExecutionReceipt } from './coordinator-road-execution.mjs';
import {decodeDepotExecutionReceipt} from './coordinator-depot-execution.mjs';
import { replaceUnpublished } from './unpublished-replace.mjs';
import { decodeRoadStopFlat, encodeRoadStopFlat } from './road-stop-order-payload.mjs';
import {decodeDepotBuildFlat,encodeDepotBuildFlat} from './depot-build-order-payload.mjs';
import {parseVehicleBuyOrderPayload} from './vehicle-buy-order-payload.mjs';
import {decodeVehicleBuyExecutionReceipt} from './coordinator-vehicle-buy-execution.mjs';
import {parseLineCreateOrderPayload} from './line-create-order-payload.mjs';
import {decodeLineCreateExecutionReceipt} from './coordinator-line-create-execution.mjs';

const exact = (p, names) => p && Object.keys(p).sort().join(",") === names.split(",").sort().join(",");
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const ident = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const hash = s => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
// Data-only fixed schema. No eval, paths, arbitrary script or finance payloads.
// Road Stop has a bounded scalar codec and its own held postcondition receipt.
// Development mod consumes bindSession,
// prepare, held checkpoint capture/release, executeHeld and terminal halt under
// a live lease. Engine command cycles remain unverified in TF3.
export function encodeAsyncEngineRequest(r, nonce, {enableDepotBuild=false,enableVehicleBuy=false,
  enableLineCreate=false}={}) {
  if(typeof enableDepotBuild!=='boolean')throw new TypeError('invalid depot capability');
  if(typeof enableVehicleBuy!=='boolean')throw new TypeError('invalid vehicle purchase capability');
  if(typeof enableLineCreate!=='boolean')throw new TypeError('invalid line creation capability');
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
      || !['vehicle.setRunning','road.stop.place',...(enableDepotBuild?['road.depot.build']:[]),...(enableVehicleBuy?['road.vehicle.buy']:[]),...(enableLineCreate?['road.line.create']:[])].includes(c.commandType)
      || !ident(c.originPlayerId) || !ident(c.requestMessageId)
      || ![c.hostSequence,c.scheduledUpdate,c.targetCompanyEntity,c.targetEntity,c.clientSequence].every(uint)) throw new TypeError("invalid bounded command");
    if (!new CommandQueue({enableDepotBuild,enableVehicleBuy,enableLineCreate}).enqueue(c,new Map([[c.originPlayerId,c.targetCompanyEntity]]),() => c.targetCompanyEntity)) throw new TypeError("invalid command sequence");
    Object.assign(p,{hostSequence:c.hostSequence,scheduledUpdate:c.scheduledUpdate,companyEntity:c.targetCompanyEntity,
      entity:c.targetEntity,...(c.commandType==='road.stop.place'
        ?encodeRoadStopFlat(c.payload,c.targetEntity,c.targetCompanyEntity)
        :c.commandType==='road.depot.build'
        ?encodeDepotBuildFlat(c.payload,c.targetCompanyEntity)
        :c.commandType==='road.vehicle.buy'
        ?{model:parseVehicleBuyOrderPayload(c.payload,c.targetCompanyEntity,c.targetEntity).model}
        :c.commandType==='road.line.create'
        ?{stationB:parseLineCreateOrderPayload(c.payload,c.targetCompanyEntity,c.targetEntity).stationB}
        :{running:c.payload.running}),clientSequence:c.clientSequence,
      originPlayerId:c.originPlayerId,requestMessageId:c.requestMessageId,protocolVersion:c.protocolVersion,commandType:c.commandType});
  } else if (r.operation !== "halt" || !exact(r,common)) throw new TypeError("unsupported engine operation");
  const source=`function data()\nreturn {\n${Object.entries(p).map(([k,v]) => ` ${k}=${JSON.stringify(v)},`).join("\n")}\n}\nend\n`;
  parseFlatDataFile(source); return source;
}

// Lossless data-only inverse used to audit the engine-facing wire contract.
// This validates shape/identity, not authorization: the engine must compare
// originPlayerId with its independently established company bindings and live owner.
export function decodeAsyncEngineRequest(source, nonce, {enableDepotBuild=false,enableVehicleBuy=false,
  enableLineCreate=false}={}) {
  if(typeof enableDepotBuild!=='boolean')throw new TypeError('invalid depot capability');
  if(typeof enableVehicleBuy!=='boolean')throw new TypeError('invalid vehicle purchase capability');
  if(typeof enableLineCreate!=='boolean')throw new TypeError('invalid line creation capability');
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
    commandType:p.commandType,payload:p.commandType==='road.stop.place'
      ?decodeRoadStopFlat(p):p.commandType==='road.depot.build'&&enableDepotBuild
      ?decodeDepotBuildFlat(p):p.commandType==='road.vehicle.buy'&&enableVehicleBuy
      ?parseVehicleBuyOrderPayload({companyEntity:p.companyEntity,depotEntity:p.entity,model:p.model},p.companyEntity,p.entity)
      :p.commandType==='road.line.create'&&enableLineCreate
      ?parseLineCreateOrderPayload({companyEntity:p.companyEntity,stationA:p.entity,stationB:p.stationB},p.companyEntity,p.entity)
      :{running:p.running},
    clientSequence:p.clientSequence,requestMessageId:p.requestMessageId,
  };
  const validated=parseFlatDataFile(encodeAsyncEngineRequest(r,nonce,{enableDepotBuild,enableVehicleBuy,enableLineCreate}));
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

export async function createAsyncEngineMailbox({directory,nonce=randomBytes(16).toString("hex"),requireCheckpointSnapshot=true,
  requireCompleteCheckpointCoverage=false,onCheckpointEvidence=()=>{},onExecutionEvidence=()=>{},enableDepotBuild=false,
  enableVehicleBuy=false,enableLineCreate=false}) {
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new TypeError("invalid mailbox nonce");
  if(typeof requireCheckpointSnapshot!=='boolean'||typeof requireCompleteCheckpointCoverage!=='boolean'
    ||typeof enableDepotBuild!=='boolean'||typeof enableVehicleBuy!=='boolean'
    ||typeof enableLineCreate!=='boolean'
    ||typeof onCheckpointEvidence!=='function'||typeof onExecutionEvidence!=='function') throw new TypeError('invalid checkpoint evidence option');
  directory=await requirePlainDirectory(directory);
  const lockPath=path.join(directory,"coordination.lock"), requestPath=path.join(directory,"coordination_request.lua");
  const lock=await open(lockPath,"wx",0o600);
  let tail=Promise.resolve(), closed=false, halting=false, expectedExecution=null;
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
      try { source=encodeAsyncEngineRequest(request,nonce,{enableDepotBuild,enableVehicleBuy,enableLineCreate}); } catch(e) { return Promise.reject(e); }
      if (halting) return Promise.reject(new Error("mailbox halted; create a new verified session"));
      if(request.operation==='executeHeld')expectedExecution=Object.freeze({
        roundId:request.roundId,operationId:request.operationId,
        hostSequence:request.command.hostSequence,scheduledUpdate:request.command.scheduledUpdate,
        entity:request.command.targetEntity,company:request.command.targetCompanyEntity,
        commandType:request.command.commandType,
        ...(request.command.commandType==='road.line.create'
          ?{stationB:request.command.payload.stationB}:{}),
        ...(request.command.commandType==='vehicle.setRunning'
          ?{stopped:request.command.payload.running===false}:{}),
      });
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
        try {
          const checkpoint=decodeCheckpointReceipt(p);
          onCheckpointEvidence(structuredClone(checkpoint));
          p=requireCompleteCheckpointCoverage&&!checkpoint.coverage.comparisonReady
            ?{...p,status:'unknown'}:checkpoint.receipt;
        } catch {p={...p,status:'unknown'};}
      } else if(requireCheckpointSnapshot&&p.operation==='holdCheckpoint'&&p.status==='ok') {
        p={...p,status:'unknown'}; // Never accept an expected-hash echo from the real adapter.
      }
      if(p.operation==='executeHeld'&&p.status==='ok') {
        try {
          const expected=expectedExecution;
          const decoded=expected?.commandType==='road.stop.place'
          ?decodeRoadExecutionReceipt(p):expected?.commandType==='road.depot.build'
            ?decodeDepotExecutionReceipt(p):expected?.commandType==='road.vehicle.buy'
            ?decodeVehicleBuyExecutionReceipt(p):expected?.commandType==='road.line.create'
            ?decodeLineCreateExecutionReceipt(p):decodeExecutionReceipt(p);
          if(!expected||p.roundId!==expected.roundId||p.operationId!==expected.operationId
            ||p.hostSequence!==expected.hostSequence||p.updateCount!==expected.scheduledUpdate
            ||(expected.commandType==='road.stop.place'
              ?decoded.state.roadStop.sourceRoadEntity!==expected.entity
                ||decoded.state.roadStop.ownerCompanyEntity!==expected.company
              :expected.commandType==='road.depot.build'
              ?expected.entity!==0||decoded.state.depot.ownerCompanyEntity!==expected.company
              :expected.commandType==='road.vehicle.buy'
              ?decoded.state.vehicle.depotEntity!==expected.entity
                ||decoded.state.vehicle.ownerCompanyEntity!==expected.company
                ||decoded.state.depot.ownerCompanyEntity!==expected.company
              :expected.commandType==='road.line.create'
              ?decoded.state.line.stationA!==expected.entity
                ||decoded.state.line.stationB!==expected.stationB
                ||decoded.state.line.ownerCompanyEntity!==expected.company
              :decoded.state.vehicle.entity!==expected.entity
                ||decoded.state.vehicle.ownerCompanyEntity!==expected.company
                ||decoded.state.vehicle.stopped!==expected.stopped))
            throw new Error('EXECUTION_POSTCONDITION_MISMATCH');
          onExecutionEvidence(structuredClone(decoded));
          p=decoded.receipt;
        } catch {p={...p,status:'unknown'};}
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
