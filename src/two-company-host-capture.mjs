// Stage-6 admission from the saved, engine-inspected two-company fixture.
// This performs no company creation or gameplay command and has one attempt
// per helper. Both engine adapters still recheck the roster at bindSession.
export function createTwoCompanyHostCapture({host,bridge,nativeGate,hostLocal}) {
  if(!host||typeof host.ensureCaptureReady!=='function'||typeof host.beginCapture!=='function'
    ||!host.authority||typeof host.authority.bindCompanyEntity!=='function'
    ||!bridge||typeof bridge.discoverHostCompanyPair!=='function'||!nativeGate||!hostLocal)
    throw new TypeError('INVALID_TWO_COMPANY_CAPTURE_OPTIONS');
  let attempted=false;
  return Object.freeze({
    get attempted(){return attempted;},
    async start(){
      if(attempted)throw new Error('TWO_COMPANY_CAPTURE_ALREADY_ATTEMPTED');
      attempted=true;
      if(nativeGate.ready!==true||bridge.connected!==true||bridge.engineObservation?.available!==true)
        throw new Error('TWO_COMPANY_CAPTURE_GATE_UNAVAILABLE');
      host.ensureCaptureReady();
      const initial=host.authority.players();
      const hostId=hostLocal.connection?.playerId;
      if(initial.length!==2||typeof hostId!=='string'||!initial.some(p=>p.playerId===hostId)
        ||initial.some(p=>p.companyEntity!==null))throw new Error('TWO_COMPANY_CAPTURE_ROSTER_REQUIRED');
      const remoteId=initial.find(p=>p.playerId!==hostId).playerId;
      const proof=await bridge.discoverHostCompanyPair();
      const observation=bridge.engineObservation;
      const current=host.authority.players();
      if(nativeGate.ready!==true||bridge.connected!==true||observation?.available!==true
        ||observation.sample?.speedup!==0||observation.sample.companyEntity!==proof.hostCompanyEntity
        ||observation.sample.updateCount!==proof.updateCount
        ||!Number.isSafeInteger(proof.secondCompanyEntity)||proof.secondCompanyEntity<=0
        ||proof.secondCompanyEntity===proof.hostCompanyEntity
        ||current.length!==2||current.some(p=>p.companyEntity!==null)
        ||!current.some(p=>p.playerId===hostId)||!current.some(p=>p.playerId===remoteId))
        throw new Error('TWO_COMPANY_CAPTURE_PROOF_LOST');
      host.ensureCaptureReady();
      host.authority.bindCompanyEntity(hostId,proof.hostCompanyEntity);
      host.authority.bindCompanyEntity(remoteId,proof.secondCompanyEntity);
      host.beginCapture({updateCount:proof.updateCount});
      return Object.freeze({hostPlayerId:hostId,remotePlayerId:remoteId,
        hostCompanyEntity:proof.hostCompanyEntity,remoteCompanyEntity:proof.secondCompanyEntity,
        updateCount:proof.updateCount});
    },
  });
}
