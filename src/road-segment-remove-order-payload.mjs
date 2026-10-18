// Identity-only descriptor for one owned street edge. Parsing does not grant
// execution authority; the held executor must revalidate graph and ownership.
const entity=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
const int32=v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647&&!Object.is(v,-0);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,names)=>plain(v)&&Object.getOwnPropertySymbols(v).length===0
  &&Object.keys(v).sort().join(',')===names.split(',').sort().join(',');
const fail=()=>{throw new TypeError('INVALID_ROAD_SEGMENT_REMOVE_PAYLOAD');};
const vector=v=>Array.isArray(v)&&v.length===3
  &&Object.keys(v).sort().join(',')==='0,1,2'&&v.every(n=>typeof n==='number'
    &&Number.isFinite(n)&&Math.abs(n)<=1_000_000&&!Object.is(n,-0));
const resource=(v,suffix)=>typeof v==='string'&&Buffer.byteLength(v,'utf8')<=256
  &&v.startsWith('::/infrastructure/street/')&&v.endsWith(suffix)
  &&/^::\/[A-Za-z0-9_./-]+$/.test(v)&&!v.includes('..')&&!v.includes('//');
const clone=v=>Object.freeze([...v]);
const fields='schemaVersion,companyEntity,node0Position,node1Position,tangent0,tangent1,roadTemplate,roadStyle,type,typeIndex,roadType,roadDevelopmentLocked';
const coords=['node0Position','node1Position','tangent0','tangent1'];
const axes='XYZ';

export function parseRoadSegmentRemoveOrderPayload(value,companyEntity) {
  if(!exact(value,fields)||value.schemaVersion!==1||!entity(companyEntity)
    ||value.companyEntity!==companyEntity||!coords.every(key=>vector(value[key]))
    ||!resource(value.roadTemplate,'.street_template')||!resource(value.roadStyle,'.street')
    ||value.type!==0
    ||!int32(value.typeIndex)||!int32(value.roadType)
    ||typeof value.roadDevelopmentLocked!=='boolean')fail();
  return Object.freeze({schemaVersion:1,companyEntity,
    node0Position:clone(value.node0Position),node1Position:clone(value.node1Position),
    tangent0:clone(value.tangent0),tangent1:clone(value.tangent1),
    roadTemplate:value.roadTemplate,roadStyle:value.roadStyle,
    type:0,typeIndex:value.typeIndex,roadType:value.roadType,
    roadDevelopmentLocked:value.roadDevelopmentLocked});
}

// Geometry travels as exact canonical JS number text and resources as bounded
// lowercase UTF-8 hex chunks. Local entity IDs are deliberately absent.
export function encodeRoadSegmentRemoveFlat(value,companyEntity) {
  const p=parseRoadSegmentRemoveOrderPayload(value,companyEntity);
  const out={segmentRemoveVersion:1,type:p.type,typeIndexText:String(p.typeIndex),roadTypeText:String(p.roadType),
    roadDevelopmentLocked:p.roadDevelopmentLocked};
  for(const key of coords)p[key].forEach((n,i)=>{out[`${key}${axes[i]}Text`]=String(n);});
  for(const [field,prefix] of [['roadTemplate','resourceTemplate'],['roadStyle','resourceStyle']]){
    const chunks=Buffer.from(p[field],'utf8').toString('hex').match(/.{1,128}/g);
    out[`${prefix}Count`]=chunks.length;
    chunks.forEach((chunk,i)=>{out[`${prefix}${i+1}`]=chunk;});
  }
  return Object.freeze(out);
}

export function decodeRoadSegmentRemoveFlat(value,companyEntity) {
  if(!plain(value)||Object.getOwnPropertySymbols(value).length!==0||value.segmentRemoveVersion!==1
    ||value.type!==0
    ||typeof value.roadDevelopmentLocked!=='boolean')fail();
  const numberText=key=>{
    const text=value[key];
    if(typeof text!=='string'||!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/.test(text))fail();
    const n=Number(text);if(!Number.isFinite(n)||Object.is(n,-0)||String(n)!==text)fail();return n;
  };
  const signedIntText=key=>{
    const text=value[key];
    if(typeof text!=='string'||!/^-(?:[1-9][0-9]*)$|^(?:0|[1-9][0-9]*)$/.test(text))fail();
    const n=Number(text);if(!int32(n)||String(n)!==text)fail();return n;
  };
  const readResource=prefix=>{
    const count=value[`${prefix}Count`];
    if(!Number.isInteger(count)||count<1||count>4)fail();
    let hex='';
    for(let i=1;i<=count;i++){
      const chunk=value[`${prefix}${i}`];
      if(typeof chunk!=='string'||!/^[a-f0-9]{2,128}$/.test(chunk)||chunk.length%2!==0
        ||i<count&&chunk.length!==128)fail();
      hex+=chunk;
    }
    const text=Buffer.from(hex,'hex').toString('utf8');
    if(Buffer.from(text,'utf8').toString('hex')!==hex)return fail();
    return text;
  };
  const payload={schemaVersion:1,companyEntity,
    node0Position:axes.split('').map(axis=>numberText(`node0Position${axis}Text`)),
    node1Position:axes.split('').map(axis=>numberText(`node1Position${axis}Text`)),
    tangent0:axes.split('').map(axis=>numberText(`tangent0${axis}Text`)),
    tangent1:axes.split('').map(axis=>numberText(`tangent1${axis}Text`)),
    roadTemplate:readResource('resourceTemplate'),roadStyle:readResource('resourceStyle'),
    type:value.type,typeIndex:signedIntText('typeIndexText'),roadType:signedIntText('roadTypeText'),
    roadDevelopmentLocked:value.roadDevelopmentLocked};
  const parsed=parseRoadSegmentRemoveOrderPayload(payload,companyEntity);
  const canonical=encodeRoadSegmentRemoveFlat(parsed,companyEntity);
  if(Object.keys(value).sort().join(',')!==Object.keys(canonical).sort().join(',')
    ||Object.keys(canonical).some(key=>value[key]!==canonical[key]))fail();
  return parsed;
}
