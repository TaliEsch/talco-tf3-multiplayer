import {parseRoadStopCaptureEnvelope} from './road-stop-capture-envelope.mjs';
import {parseRoadStopCapture} from './road-stop-capture.mjs';
import {canonicalJson,sha256Canonical} from './canonical.mjs';

// Offline experiment artifact, NOT gameplay admission. The checkpoint identity
// must be recorded before placement; a matching file hash cannot prove that the
// game actually loaded it, or that its current simulation state is unchanged.
// The v2 capture envelope carries copied model-resource metadata. It remains
// offline evidence only and does not qualify that model or any real execution.
export const ROAD_STOP_REPLAY_CASE_MAX_BYTES=384*1024;
const fail=()=>{throw new TypeError('INVALID_ROAD_STOP_REPLAY_CASE');};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function keys(value,expected){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).length!==expected.length
    ||Object.keys(value).sort().join(',')!==[...expected].sort().join(','))fail();
}
function checkpoint(value){
  keys(value,['saveSha256','gameSha256','modManifestSha256']);
  if(!Object.values(value).every(hash))fail();
  return {...value};
}
function modelResource(value){
  keys(value,['modelId','resourceName']);
  if(!Number.isInteger(value.modelId)||value.modelId<0||value.modelId>2147483647
    ||typeof value.resourceName!=='string'||Buffer.byteLength(value.resourceName,'utf8')>1024
    ||!/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*\.mdl$/.test(value.resourceName))fail();
  return {...value};
}
function payload(value){
  keys(value,['schemaVersion','kind','checkpoint','companyEntity','modelResource','captureDigest','capture']);
  if(value.schemaVersion!==2||value.kind!=='road_stop_reload_replay'
    ||!Number.isInteger(value.companyEntity)||value.companyEntity<=0||value.companyEntity>2147483647)fail();
  const parsed=parseRoadStopCapture(JSON.stringify(value.capture));
  if(!hash(value.captureDigest)||parsed.digest!==value.captureDigest
    ||parsed.capture.proposal.street.edgeObjectsToAdd[0].playerEntity!==value.companyEntity
    ||modelResource(value.modelResource).modelId!==parsed.capture.proposal.street.edgeObjectsToAdd[0].modelInstance.modelId)fail();
  // Do not rewrite segment owners to the stop owner's company: shared/public
  // roads can have a different owner. Preserve all source fields unchanged.
  return {schemaVersion:2,kind:value.kind,checkpoint:checkpoint(value.checkpoint),
    companyEntity:value.companyEntity,modelResource:modelResource(value.modelResource),captureDigest:parsed.digest,capture:parsed.capture};
}
function finish(value){
  const normalized=payload(value),digest=sha256Canonical(normalized);
  const canonical=canonicalJson({...normalized,digest});
  if(Buffer.byteLength(canonical,'utf8')>ROAD_STOP_REPLAY_CASE_MAX_BYTES)fail();
  return {case:normalized,digest,canonical,executionAuthorized:false,loadedCheckpointVerified:false};
}
export function createRoadStopReplayCase(input){
  const {applyEnvelope,checkpoint:identity,companyEntity}=input??{};
  const parsed=parseRoadStopCaptureEnvelope(applyEnvelope);
  if(parsed.stage!=='apply')fail(); // preview/cancel is not the committed source action
  if(!parsed.modelResource)fail(); // v1 remains diagnostic-only and cannot form a replay case
  const resource=modelResource(parsed.modelResource);
  if(Object.hasOwn(input,'modelResource')){
    const supplied=modelResource(input.modelResource);
    if(supplied.modelId!==resource.modelId||supplied.resourceName!==resource.resourceName)fail();
  }
  return finish({schemaVersion:2,kind:'road_stop_reload_replay',checkpoint:identity,
    companyEntity,modelResource:resource,captureDigest:parsed.digest,capture:parsed.capture});
}
export function parseRoadStopReplayCase(source){
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>ROAD_STOP_REPLAY_CASE_MAX_BYTES)fail();
  let value;try{value=JSON.parse(source);}catch{fail();}
  keys(value,['schemaVersion','kind','checkpoint','companyEntity','modelResource','captureDigest','capture','digest']);
  const {digest,...body}=value;
  const parsed=finish(body);
  if(!hash(digest)||digest!==parsed.digest)fail();
  return parsed;
}
export function checkRoadStopReplayIdentity(source,current){
  const parsed=parseRoadStopReplayCase(source),actual=checkpoint(current);
  if(Object.keys(actual).some(key=>actual[key]!==parsed.case.checkpoint[key]))
    throw new Error('REPLAY_CHECKPOINT_OR_COMPATIBILITY_MISMATCH');
  return {caseDigest:parsed.digest,identityMatches:true,
    loadedCheckpointVerified:false,executionAuthorized:false};
}
export function checkRoadStopReplayResource(source,currentResource){
  const parsed=parseRoadStopReplayCase(source),actual=modelResource(currentResource);
  if(actual.modelId!==parsed.case.modelResource.modelId||actual.resourceName!==parsed.case.modelResource.resourceName)
    throw new Error('REPLAY_MODEL_RESOURCE_MISMATCH');
  return {caseDigest:parsed.digest,resourceIdentityMatches:true,
    loadedCheckpointVerified:false,executionAuthorized:false};
}
