import {createHash} from 'node:crypto';

// Static identity for the one TF3 build inspected on 21 September 2026. This
// authorizes analysis only. A future runtime must independently verify mapped
// executable pages before enabling any observation or control capability.
export const KNOWN_TF3_STATIC_PROFILE=Object.freeze({
  profileVersion:1,
  executableSha256:'a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5',
  peTimestamp:1789752802,
  sizeOfImage:70545408,
  candidateCount:12,
  candidateEvidenceSha256:'112ea9e2d0b193f6081be3b12589e14e2c3dffbcaf442510f433d05b1ac122a8',
});

function uint(value){return Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff;}
function digest(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}

export function fingerprintStaticCandidates(candidates){
  if(!Array.isArray(candidates)||candidates.length>256)throw new TypeError('INVALID_STATIC_CANDIDATES');
  const rows=candidates.map(candidate=>{
    if(!candidate||typeof candidate.label!=='string'||candidate.label.length<1||candidate.label.length>64
      ||!uint(candidate.stringRva)||!uint(candidate.referenceInstructionRva)
      ||!uint(candidate.functionRange?.beginRva)||!uint(candidate.functionRange?.endRva)
      ||candidate.functionRange.beginRva>=candidate.functionRange.endRva
      ||!uint(candidate.primaryFunctionRange?.beginRva)||!uint(candidate.primaryFunctionRange?.endRva)
      ||candidate.primaryFunctionRange.beginRva>=candidate.primaryFunctionRange.endRva
      ||!Number.isSafeInteger(candidate.unwindChainDepth)||candidate.unwindChainDepth<0||candidate.unwindChainDepth>32
      ||![1,2].includes(candidate.unwindVersion)||!uint(candidate.unwindFlags)||candidate.unwindFlags>7
      ||(candidate.unwindHandlerRva!==null&&(!uint(candidate.unwindHandlerRva)||candidate.unwindHandlerRva===0))
      ||!digest(candidate.functionRangeSha256)||candidate.evidence!=='static-candidate-only'
      ||candidate.hookReady!==false)throw new TypeError('INVALID_STATIC_CANDIDATE');
    return [candidate.label,candidate.stringRva,candidate.referenceInstructionRva,
      candidate.functionRange.beginRva,candidate.functionRange.endRva,candidate.functionRangeSha256,
      candidate.primaryFunctionRange.beginRva,candidate.primaryFunctionRange.endRva,candidate.unwindChainDepth,
      candidate.unwindVersion,candidate.unwindFlags,candidate.unwindHandlerRva];
  }).sort((a,b)=>a[2]-b[2]||a[0].localeCompare(b[0]));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function evaluateStaticBuildProfile(report,profile=KNOWN_TF3_STATIC_PROFILE){
  const mismatches=[];
  if(!report||!profile)throw new TypeError('INVALID_STATIC_PROFILE_INPUT');
  if(report.sha256!==profile.executableSha256)mismatches.push('executable_sha256');
  if(report.peTimestamp!==profile.peTimestamp)mismatches.push('pe_timestamp');
  if(report.sizeOfImage!==profile.sizeOfImage)mismatches.push('size_of_image');
  if(!Array.isArray(report.candidates)||report.candidates.length!==profile.candidateCount)mismatches.push('candidate_count');
  let candidateEvidenceSha256=null;
  try{candidateEvidenceSha256=fingerprintStaticCandidates(report.candidates);}
  catch{mismatches.push('candidate_shape');}
  if(candidateEvidenceSha256!==profile.candidateEvidenceSha256)mismatches.push('candidate_evidence');
  return Object.freeze({
    profileVersion:profile.profileVersion,
    matched:mismatches.length===0,
    mismatches:Object.freeze([...new Set(mismatches)]),
    candidateEvidenceSha256,
    evidence:'static-profile-only',
    activationPermitted:false,
    requiredNextGate:'independent in-memory executable-page identity and live ABI/thread qualification',
  });
}
