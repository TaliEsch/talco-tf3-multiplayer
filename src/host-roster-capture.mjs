import {validateCompanyRoster} from './roster-inspection.mjs';

// One immutable, engine-inspected capture for 2-4 separate companies. Signed
// Join claims are proposals only; the Host's live TF3 roster receipt and each
// participant's bindSession are the authority for engine company identities.
export function createHostRosterCapture({host,bridge,nativeGate,hostLocal}){
  if(!host||typeof host.ensureCaptureReady!=='function'||typeof host.beginCapture!=='function'
    ||typeof host.companyClaims!=='function'||!host.authority
    ||typeof host.authority.players!=='function'||typeof host.authority.bindCompanyEntity!=='function'
    ||!bridge||typeof bridge.discoverHostCompanyRoster!=='function'||!nativeGate||!hostLocal)
    throw new TypeError('INVALID_HOST_ROSTER_CAPTURE_OPTIONS');
  let attempted=false;
  return Object.freeze({
    get attempted(){return attempted;},
    async start(){
      if(attempted)throw new Error('HOST_ROSTER_CAPTURE_ALREADY_ATTEMPTED');
      attempted=true;
      if(nativeGate.ready!==true||bridge.connected!==true||bridge.engineObservation?.available!==true)
        throw new Error('HOST_ROSTER_CAPTURE_GATE_UNAVAILABLE');
      host.ensureCaptureReady();
      const initial=host.authority.players();
      const hostId=hostLocal.connection?.playerId;
      const sample=bridge.engineObservation.sample;
      if(initial.length<2||initial.length>4||typeof hostId!=='string'
        ||initial.filter(player=>player.playerId===hostId).length!==1
        ||initial.some(player=>player.companyEntity!==null)
        ||sample?.speedup!==0)throw new Error('HOST_ROSTER_CAPTURE_ROSTER_REQUIRED');
      const remote=initial.filter(player=>player.playerId!==hostId);
      const claims=host.companyClaims();
      if(claims.length!==remote.length||new Set(claims.map(claim=>claim.playerId)).size!==claims.length
        ||remote.some(player=>claims.filter(claim=>claim.playerId===player.playerId).length!==1))
        throw new Error('HOST_ROSTER_CAPTURE_CLAIMS_REQUIRED');
      const proposed=new Map([[hostId,sample.companyEntity],
        ...claims.map(claim=>[claim.playerId,claim.companyEntity])]);
      const companies=validateCompanyRoster([sample.companyEntity,
        ...remote.map(player=>proposed.get(player.playerId))]);
      const proof=await bridge.discoverHostCompanyRoster(companies);
      const observation=bridge.engineObservation;
      const current=host.authority.players();
      const currentClaims=host.companyClaims();
      if(nativeGate.ready!==true||bridge.connected!==true||observation?.available!==true
        ||observation.sample?.speedup!==0||observation.sample.companyEntity!==companies[0]
        ||observation.sample.updateCount!==proof.updateCount
        ||proof.outcome!=='verified'||proof.hostCompanyEntity!==companies[0]
        ||proof.companies.length!==companies.length
        ||proof.companies.some((company,index)=>company!==companies[index])
        ||current.length!==initial.length||current.some((player,index)=>
          player.playerId!==initial[index].playerId||player.companyEntity!==null)
        ||currentClaims.length!==claims.length
        ||currentClaims.some(claim=>proposed.get(claim.playerId)!==claim.companyEntity))
        throw new Error('HOST_ROSTER_CAPTURE_PROOF_LOST');
      host.ensureCaptureReady();
      for(const player of current)host.authority.bindCompanyEntity(player.playerId,proposed.get(player.playerId));
      host.beginCapture({updateCount:proof.updateCount});
      return Object.freeze({players:current.map(player=>Object.freeze({playerId:player.playerId,
        companyEntity:proposed.get(player.playerId)})),updateCount:proof.updateCount});
    },
  });
}
