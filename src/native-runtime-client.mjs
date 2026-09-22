import {EventEmitter} from 'node:events';
import {randomBytes} from 'node:crypto';
import net from 'node:net';

const MAGIC=0x54463349, VERSION=1, HEADER=36, MAX=4096;
const TYPES=Object.freeze({hello:1,helloAck:2,control:3,receipt:4,event:5,error:6});
// Capability strings are a compatibility contract, not an assertion that this
// build implements them.  Host/Join must require each one immediately before
// using the corresponding path.  V1 native host advertises only transportHealth.
export const NATIVE_RUNTIME_CAPABILITIES=Object.freeze({
  transportHealth:'transport.health',
  sessionBinding:'session.bind',
  continuousObservation:'world.observe.v1',
  simulationHold:'simulation.hold',
  engineHalt:'engine.halt',
  engineDetach:'engine.detach',
  gateReceipts:'simulation.gate-receipts.v1',
  passiveVehicleActionDiagnostics:'diagnostic.passive-vehicle-action.v1',
  vehiclePrepare:'vehicle.prepare.v1',
  vehicleExecute:'vehicle.execute.v1',
});
const uint64Text=value=>typeof value==='string'&&/^(?:0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<=0xffffffffffffffffn;
// Native counters must remain decimal strings: JSON Numbers cannot carry a
// uint64_t safely. This validates the complete pointer-free snapshot before a
// coordinator can treat it as diagnostic evidence.
export const validatePassiveVehicleActionObservation=receipt=>{
  const keys=['passiveVehicleFactoryHits','passiveVehicleAdmissionHits','passiveVehicleCorrelatedHits','passiveVehicleDroppedCandidates','passiveVehicleThread','passiveVehicleLatestEntity','passiveVehicleLatestStopped','passiveVehicleLatestValid','passiveVehicleLatestEntryResultZero','passiveVehicleLatestCallbackShapeMatches','passiveVehicleActive','passiveVehicleCrossThread','passiveVehicleSaturated'];
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||keys.some(key=>!Object.hasOwn(receipt,key))
    ||Object.keys(receipt).some(key=>key.startsWith('passiveVehicle')&&!keys.includes(key))
    ||!uint64Text(receipt.passiveVehicleFactoryHits)||!uint64Text(receipt.passiveVehicleAdmissionHits)||!uint64Text(receipt.passiveVehicleCorrelatedHits)||!uint64Text(receipt.passiveVehicleDroppedCandidates)
    ||!Number.isInteger(receipt.passiveVehicleThread)||receipt.passiveVehicleThread<0||receipt.passiveVehicleThread>0xffffffff
    ||!Number.isInteger(receipt.passiveVehicleLatestEntity)||receipt.passiveVehicleLatestEntity< -2147483648||receipt.passiveVehicleLatestEntity>2147483647
    ||![0,1].includes(receipt.passiveVehicleLatestStopped)
    ||['passiveVehicleLatestValid','passiveVehicleLatestEntryResultZero','passiveVehicleLatestCallbackShapeMatches','passiveVehicleActive','passiveVehicleCrossThread','passiveVehicleSaturated'].some(key=>typeof receipt[key]!=='boolean'))throw new TypeError('INVALID_PASSIVE_VEHICLE_ACTION_OBSERVATION');
  if(!receipt.passiveVehicleActive||(!receipt.passiveVehicleLatestValid&&receipt.passiveVehicleLatestEntity!==0))throw new TypeError('INVALID_PASSIVE_VEHICLE_ACTION_OBSERVATION');
  return Object.freeze({factoryHits:receipt.passiveVehicleFactoryHits,admissionHits:receipt.passiveVehicleAdmissionHits,correlatedHits:receipt.passiveVehicleCorrelatedHits,droppedCandidates:receipt.passiveVehicleDroppedCandidates,
    ownerThread:receipt.passiveVehicleThread,latestEntity:receipt.passiveVehicleLatestEntity,latestStopped:receipt.passiveVehicleLatestStopped,
    latestValid:receipt.passiveVehicleLatestValid,latestEntryResultZero:receipt.passiveVehicleLatestEntryResultZero,
    latestCallbackShapeMatches:receipt.passiveVehicleLatestCallbackShapeMatches,
    active:receipt.passiveVehicleActive,crossThread:receipt.passiveVehicleCrossThread,saturated:receipt.passiveVehicleSaturated});
};
const gateControls=Object.freeze({
  hold:NATIVE_RUNTIME_CAPABILITIES.simulationHold,
  release:NATIVE_RUNTIME_CAPABILITIES.simulationHold,
  halt:NATIVE_RUNTIME_CAPABILITIES.engineHalt,
  detach:NATIVE_RUNTIME_CAPABILITIES.engineDetach,
});
// A production boundary must echo these exact identifiers.  Decimal strings
// avoid JavaScript's lossy Number conversion for native uint64_t generations.
export const validateNativeGateCommand=request=>{
  if(!request||typeof request!=='object'||Array.isArray(request)
    ||!Object.hasOwn(gateControls,request.control)||!uint64Text(request.epoch)||!uint64Text(request.generation)
    ||Object.keys(request).some(key=>!['control','epoch','generation'].includes(key)))throw new TypeError('INVALID_NATIVE_GATE_COMMAND');
  return Object.freeze({control:request.control,epoch:request.epoch,generation:request.generation});
};
export const validateNativeGateReceipt=(receipt,request)=>{
  const command=validateNativeGateCommand(request);
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.control!==command.control
    ||receipt.epoch!==command.epoch||receipt.generation!==command.generation)throw new Error('NATIVE_GATE_RECEIPT_CORRELATION_MISMATCH');
  const expected={hold:'held',release:'permit_consumed',halt:'halt_requested',detach:'detach_prepared'}[command.control];
  if(receipt.status!==expected)throw new Error('NATIVE_GATE_RECEIPT_PHASE_INVALID');
  const generationField=command.control==='release'?'permitConsumedGeneration':command.control==='hold'?'heldGeneration':command.control==='detach'?'detachGeneration':'haltGeneration';
  if(receipt[generationField]!==command.generation)throw new Error('NATIVE_GATE_RECEIPT_GENERATION_INVALID');
  return Object.freeze({...receipt});
};
export const validateNativeGateEvent=(event,request)=>{
  const command=validateNativeGateCommand(request);
  if(!event||typeof event!=='object'||Array.isArray(event)||event.epoch!==command.epoch||event.generation!==command.generation)throw new Error('NATIVE_GATE_EVENT_CORRELATION_MISMATCH');
  const expected={release:['boundary_applied','releaseAppliedGeneration'],halt:['terminal_parked','haltGeneration'],detach:['detached','detachGeneration']}[command.control];
  if(!expected||event.event!==expected[0]||event[expected[1]]!==command.generation)throw new Error('NATIVE_GATE_EVENT_PHASE_INVALID');
  return Object.freeze({...event});
};
const safePipe=name=>typeof name==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(name);
const safeToken=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);
const encode=(type,id,session,payload)=>{
  const body=Buffer.from(JSON.stringify(payload));
  if(body.length>MAX)throw new RangeError('NATIVE_RUNTIME_IPC_PAYLOAD_TOO_LARGE');
  const out=Buffer.alloc(HEADER+body.length); out.writeUInt32LE(MAGIC,0);out.writeUInt16LE(VERSION,4);out.writeUInt16LE(type,6);out.writeUInt32LE(body.length,8);out.writeBigUInt64LE(BigInt(id),12);session.copy(out,20);body.copy(out,HEADER);return out;
};
export const createRuntimeIpcCredentials=()=>Object.freeze({pipe:`tf3mp_${randomBytes(12).toString('hex')}`,token:randomBytes(32).toString('hex')});

export class NativeRuntimeClient extends EventEmitter {
  #socket;#buffer=Buffer.alloc(0);#session=Buffer.alloc(16);#pending=new Map();#next=1n;#closed=false;#disconnectNotified=false;#connected=false;#bound=false;#binding=null;
  constructor({pipe,token,timeoutMs=3000}){super();if(!safePipe(pipe)||!safeToken(token)||!Number.isInteger(timeoutMs)||timeoutMs<50||timeoutMs>30000)throw new TypeError('INVALID_NATIVE_RUNTIME_IPC_OPTIONS');this.pipe=pipe;this.token=token;this.timeoutMs=timeoutMs;}
  static async connect(options){const c=new NativeRuntimeClient(options);try{await c.#connect();return c;}catch(error){c.close();throw error;}}
  async #connect(){
    await new Promise((resolve,reject)=>{const s=this.#socket=net.createConnection({path:`\\\\.\\pipe\\${this.pipe}`});const fail=e=>{s.destroy();reject(e);};s.once('error',fail);s.once('connect',()=>{s.off('error',fail);resolve();});});
    this.#socket.on('data',chunk=>this.#onData(chunk));this.#socket.on('error',()=>this.#disconnect('NATIVE_RUNTIME_IPC_DISCONNECTED'));this.#socket.on('close',()=>this.#disconnect('NATIVE_RUNTIME_IPC_DISCONNECTED'));
    const reply=await this.#request(TYPES.hello,{token:this.token},false);
    const handshake=reply.payload;
    if(reply.type!==TYPES.helloAck||this.#session.equals(Buffer.alloc(16))||typeof handshake?.engineObserver!=='boolean'
      ||!Array.isArray(handshake.capabilities)||handshake.capabilities.some(value=>typeof value!=='string'||value.length<1||value.length>64)
      ||['productionQualified','guiFreezes'].some(key=>Object.hasOwn(handshake,key)&&typeof handshake[key]!=='boolean')
      ||(Object.hasOwn(handshake,'observerStartStatus')&&(!Number.isInteger(handshake.observerStartStatus)||handshake.observerStartStatus<1||handshake.observerStartStatus>255)))throw new Error('NATIVE_RUNTIME_IPC_HANDSHAKE_REJECTED');
    const metadata={engineObserver:handshake.engineObserver};
    for(const key of ['productionQualified','guiFreezes'])if(Object.hasOwn(handshake,key))metadata[key]=handshake[key];
    if(Object.hasOwn(handshake,'observerStartStatus'))metadata.observerStartStatus=handshake.observerStartStatus;
    this.handshake=Object.freeze(metadata);
    this.capabilities=Object.freeze([...new Set(handshake.capabilities)]);this.#connected=true;
  }
  #onData(chunk){this.#buffer=Buffer.concat([this.#buffer,chunk]);while(this.#buffer.length>=HEADER){const magic=this.#buffer.readUInt32LE(0),version=this.#buffer.readUInt16LE(4),type=this.#buffer.readUInt16LE(6),size=this.#buffer.readUInt32LE(8);if(magic!==MAGIC||version!==VERSION||size>MAX||!Object.values(TYPES).includes(type)){this.#socket.destroy();this.#disconnect('NATIVE_RUNTIME_IPC_MALFORMED_FRAME');return;}if(this.#buffer.length<HEADER+size)return;const frame=this.#buffer.subarray(0,HEADER+size);this.#buffer=this.#buffer.subarray(HEADER+size);let payload;try{payload=JSON.parse(frame.subarray(HEADER).toString('utf8'));}catch{this.#socket.destroy();this.#disconnect('NATIVE_RUNTIME_IPC_MALFORMED_FRAME');return;}const id=frame.readBigUInt64LE(12);const session=frame.subarray(20,36);if(type===TYPES.helloAck){this.#session=Buffer.from(session);} else if(!session.equals(this.#session)){this.#socket.destroy();this.#disconnect('NATIVE_RUNTIME_IPC_SESSION_MISMATCH');return;}const key=id.toString();const pending=this.#pending.get(key);if(pending){this.#pending.delete(key);clearTimeout(pending.timer);pending.resolve({type,payload,id});}else if(type===TYPES.event)this.emit('event',Object.freeze({payload,id}));else this.emit('unknownOutcome',Object.freeze({type,payload,id}));}}
  #request(type,payload,sessionRequired=true){if(this.#closed)return Promise.reject(new Error('NATIVE_RUNTIME_IPC_CLOSED'));const id=this.#next++;if(id===0n||id>0xffffffffffffffffn)return Promise.reject(new Error('NATIVE_RUNTIME_IPC_ID_EXHAUSTED'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.#pending.delete(id.toString());this.emit('unknownOutcome',Object.freeze({id,reason:'timeout'}));reject(new Error('NATIVE_RUNTIME_IPC_TIMEOUT'));},this.timeoutMs);this.#pending.set(id.toString(),{resolve,reject,timer});try{this.#socket.write(encode(type,id,sessionRequired?this.#session:Buffer.alloc(16),payload));}catch(error){clearTimeout(timer);this.#pending.delete(id.toString());reject(error);}});}
  async control(control){if(!this.#connected)throw new Error('NATIVE_RUNTIME_IPC_NOT_CONNECTED');if(!['ping','hold','release','halt','shutdown'].includes(control))throw new TypeError('INVALID_NATIVE_RUNTIME_CONTROL');const reply=await this.#request(TYPES.control,{control});if(reply.type===TYPES.error)throw new Error(`NATIVE_RUNTIME_IPC_${reply.payload?.code??'ERROR'}`);if(reply.type!==TYPES.receipt||reply.payload?.status!=='accepted')throw new Error('NATIVE_RUNTIME_IPC_INVALID_RECEIPT');return Object.freeze(reply.payload);}
  passiveVehicleActionObservation(receipt){this.requireCapability(NATIVE_RUNTIME_CAPABILITIES.passiveVehicleActionDiagnostics);return validatePassiveVehicleActionObservation(receipt);}
  // V1 currently has no typed gate-control wire contract. This method is
  // intentionally capability-gated so it cannot accidentally downgrade to the
  // diagnostic {control:"hold"} fixture request above.
  async gateControl(request){
    if(!this.#connected)throw new Error('NATIVE_RUNTIME_IPC_NOT_CONNECTED');
    const command=validateNativeGateCommand(request);
    this.requireCapability(gateControls[command.control]);
    this.requireCapability(NATIVE_RUNTIME_CAPABILITIES.gateReceipts);
    const reply=await this.#request(TYPES.control,command);
    if(reply.type===TYPES.error)throw new Error(`NATIVE_RUNTIME_IPC_${reply.payload?.code??'ERROR'}`);
    if(reply.type!==TYPES.receipt)return Promise.reject(new Error('NATIVE_GATE_RECEIPT_MISSING'));
    return validateNativeGateReceipt(reply.payload,command);
  }
  // Bind is a distinct authenticated control request, intentionally not a
  // generic control string. Native hosts must reject a second/different bind
  // and return an accepted receipt containing the same sessionId and role.
  async bindSession({sessionId,role}={}){
    if(!this.#connected)throw new Error('NATIVE_RUNTIME_IPC_NOT_CONNECTED');
    if(this.#bound)throw new Error('NATIVE_RUNTIME_SESSION_ALREADY_BOUND');
    if(typeof sessionId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(sessionId)||!['host','participant'].includes(role))throw new TypeError('INVALID_NATIVE_RUNTIME_SESSION_BINDING');
    this.requireCapability(NATIVE_RUNTIME_CAPABILITIES.sessionBinding);
    const reply=await this.#request(TYPES.control,{control:'bind',sessionId,role});
    if(reply.type===TYPES.error)throw new Error(`NATIVE_RUNTIME_IPC_${reply.payload?.code??'ERROR'}`);
    // The controller owns the binding and reports its persistent binding names.
    // Do not invent a game-world receipt from this transport acknowledgement.
    const boundSessionId=reply.payload?.boundSessionId??reply.payload?.sessionId;
    const boundRole=reply.payload?.boundRole??reply.payload?.role;
    if(reply.type!==TYPES.receipt||reply.payload?.status!=='accepted'||boundSessionId!==sessionId||boundRole!==role)throw new Error('NATIVE_RUNTIME_IPC_INVALID_BIND_RECEIPT');
    this.#bound=true;
    this.#binding=Object.freeze({sessionId,role,receipt:Object.freeze(reply.payload)});
    return this.#binding.receipt;
  }
  get binding(){return this.#binding;}
  hasCapability(capability){return typeof capability==='string'&&this.capabilities?.includes(capability)===true;}
  requireCapability(capability){if(!this.hasCapability(capability))throw new Error(`NATIVE_RUNTIME_CAPABILITY_UNAVAILABLE:${capability}`);}
  close(){if(this.#closed)return;this.#closed=true;this.#socket?.destroy();this.#disconnect('NATIVE_RUNTIME_IPC_CLOSED');}
  #disconnect(reason){
    this.#closed=true;
    for(const [id,p] of this.#pending){clearTimeout(p.timer);p.reject(new Error(reason));}
    this.#pending.clear();
    // Explicit close is a lifecycle event too. Socket close/error can follow it,
    // but must never produce a second notification.
    if(this.#disconnectNotified)return;
    this.#disconnectNotified=true;this.emit('disconnect',reason);
  }
}
export const NATIVE_RUNTIME_IPC_TYPES=TYPES;
