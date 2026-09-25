// Read-only diagnostics. Events may be previews or post-apply notifications;
// they never certify command capture, veto, replay or cross-game correctness.
const factCounts=['addedNodes','addedSegments','removedNodes','removedSegments','edgeObjects','constructions','removals','resultCount'];
function readProposalFacts(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schemaVersion!==1)return null;
  if(['unavailable','bounds'].includes(value.code)){
    if(Object.keys(value).length===2)return {schemaVersion:1,code:value.code};
    if(Object.keys(value).length===3&&['street',...factCounts,'cost','critical','ownerCompany','resource'].includes(value.field))
      return {schemaVersion:1,code:value.code,field:value.field};
    return null;
  }
  if(value.code==='constructionReadable'){
    const keys=['schemaVersion','code','constructions','removals','resultCount','ownerCompany','resource','cost','critical'];
    if(Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))
      ||value.constructions!==1||!['removals','resultCount'].every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=64)
      ||!Number.isInteger(value.ownerCompany)||value.ownerCompany<1||value.ownerCompany>2147483647
      ||typeof value.resource!=='string'||value.resource.length<1||value.resource.length>256
      ||!/^[A-Za-z0-9_./:%-]+$/.test(value.resource)
      ||!Number.isSafeInteger(value.cost)||value.cost<0||typeof value.critical!=='boolean')return null;
    return Object.fromEntries(keys.map(k=>[k,value[k]]));
  }
  const keys=['schemaVersion','code',...factCounts,'cost','critical','ownerCompany'];
  if(value.code!=='readable'||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))
    ||!factCounts.every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=64)
    ||!Number.isSafeInteger(value.cost)||value.cost<0||typeof value.critical!=='boolean'
    ||!Number.isInteger(value.ownerCompany)||value.ownerCompany<0||value.ownerCompany>2147483647
    ||((value.edgeObjects+value.constructions)>0&&value.ownerCompany===0))return null;
  return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
export function summarizeNativePlacementLog(text) {
  if(typeof text!=='string'||Buffer.byteLength(text)>32*1024*1024) throw new Error('LOG_TOO_LARGE_OR_INVALID');
  const runs=[];let current=null;
  for(const line of text.split(/\r?\n/)) {
    const start=line.indexOf('{"event":"native_placement_');
    if(start<0||line.length-start>2048)continue;
    let item;try{item=JSON.parse(line.slice(start));}catch{continue;}
    if(![1,2,3,4,5,6,7].includes(item.observerRevision)||item.passive!==true||item.gameplayVerified!==false)continue;
    if(item.event==='native_placement_observer_ready'){
      if(runs.length>=100)throw new Error('TOO_MANY_OBSERVER_RUNS');
      current={revision:item.observerRevision,samples:[],rejectedRecords:0,observerErrors:0,selfTestDelivered:null,selfTestCallSucceeded:null};runs.push(current);continue;
    }
    if(!current||item.observerRevision!==current.revision)continue;
    if(item.event==='native_placement_observer_error'){current.observerErrors++;continue;}
    if(item.event==='native_placement_observer_selftest'){
      if(current.revision>=4){
        if(item.synthetic!==true||typeof item.delivered!=='boolean'||typeof item.callSucceeded!=='boolean'
          ||!Number.isInteger(item.attempt)||item.attempt<1||item.attempt>12
          ||item.attempt<=(current.selfTestAttempt??0)||current.selfTestFinal===true
          ||typeof item.final!=='boolean'||item.final!==(item.delivered||item.attempt===12)
          ||typeof item.controlDelivered!=='boolean'
          ||!['nil','table','userdata','number','string','boolean','function','thread'].includes(item.returnType)){
          current.rejectedRecords++;continue;
        }
        current.selfTestAttempt=item.attempt;current.selfTestFinal=item.final;
        current.selfTestReturnType=item.returnType;current.controlDelivered=item.controlDelivered;
      }
      if(item.synthetic===true&&typeof item.delivered==='boolean')current.selfTestDelivered=item.delivered;
      if(item.synthetic===true&&typeof item.callSucceeded==='boolean')current.selfTestCallSucceeded=item.callSucceeded;
      continue;
    }
    if(item.event!=='native_placement_observed')continue;
    const shapeValid=current.revision<5||(typeof item.shapeInspected==='boolean'
      &&['nil','table','userdata','number','string','boolean','function','thread'].includes(item.payloadType)
      &&(!item.shapeInspected||item.payloadType==='table')
      &&(item.shapeInspected||['proposalType','dataType','resultType'].every(key=>item[key]==='nil')));
    const valid=shapeValid&&['create','apply'].includes(item.stage)&&typeof item.builderId==='string'&&/^[A-Za-z0-9_.-]{1,64}$/.test(item.builderId)
      &&Number.isInteger(item.sequence)&&item.sequence>=1&&item.sequence<=16
      &&Number.isInteger(item.sample)&&item.sample>=1&&item.sample<=8
      &&['tickCount','updateCount'].every(key=>Number.isInteger(item[key])&&item[key]>=-1&&item[key]<=2147483647)
      &&['proposalType','dataType','resultType'].every(key=>['nil','table','userdata','number','string','boolean','function','thread'].includes(item[key]));
    if(!valid||current.samples.length>=16||current.samples.some(x=>x.sequence===item.sequence)){current.rejectedRecords++;continue;}
    const {stage,builderId,sequence,sample,tickCount,updateCount,proposalType,dataType,resultType}=item;
    const shape=current.revision>=5?{payloadType:item.payloadType,shapeInspected:item.shapeInspected}:{};
    let facts={};
    if(current.revision>=6){
      const value=readProposalFacts(item.proposalFacts);
      if(!value||(value.code==='constructionReadable'&&builderId!=='constructionBuilder'))current.rejectedRecords++;
      facts={proposalFacts:value&&!(value.code==='constructionReadable'&&builderId!=='constructionBuilder')
        ?value:{schemaVersion:1,code:'invalid'}};
    }
    current.samples.push({stage,builderId,sequence,sample,tickCount,updateCount,proposalType,dataType,resultType,...shape,...facts});
  }
  const latest=runs.at(-1);
  const createObserved=latest?.samples.some(x=>x.stage==='create')??false;
  const applyObserved=latest?.samples.some(x=>x.stage==='apply')??false;
  return {observerReady:!!latest,observerRuns:runs.length,observerRevision:latest?.revision??null,
    selfTestDelivered:latest?.selfTestDelivered??null,selfTestCallSucceeded:latest?.selfTestCallSucceeded??null,
    selfTestAttempt:latest?.selfTestAttempt??null,selfTestFinal:latest?.selfTestFinal??null,
    selfTestReturnType:latest?.selfTestReturnType??null,controlDelivered:latest?.controlDelivered??null,
    observerErrors:latest?.observerErrors??0,createObserved,applyObserved,
    outcome:!latest?'OBSERVER_NOT_SEEN':latest.observerErrors?'OBSERVER_CALLBACK_FAILED':
      latest.revision>=4&&latest.selfTestFinal!==true?'GUI_ROUTE_PENDING':
      latest.selfTestDelivered===false?'GUI_SELFTEST_NOT_DELIVERED':!createObserved&&!applyObserved?'NO_PLACEMENT_EVENTS_SEEN':
      createObserved&&applyObserved?'CREATE_AND_APPLY_OBSERVED':'PARTIAL_EVENT_OBSERVATION',
    samples:latest?.samples??[],rejectedRecords:latest?.rejectedRecords??0,
    interceptionVerified:false,replayVerified:false,gameplayVerified:false};
}
