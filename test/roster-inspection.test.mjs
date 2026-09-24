import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRosterInspection,validateCompanyRoster} from '../src/roster-inspection.mjs';

const nonce='a'.repeat(32);
const receipt=(values={})=>`function data()\nreturn {\n${Object.entries({
  schemaVersion:1,kind:'roster_inspection',nonce,requestId:9,outcome:'verified',
  tickCount:104,updateCount:50,companyCount:3,hostCompany:7,
  companyA:7,companyB:8,companyC:9,companyD:0,...values,
}).map(([key,value])=>`  ${key} = ${typeof value==='string'?`"${value}"`:value},`).join('\n')}\n}\nend\n`;
const context={nonce,requestId:9,companies:[7,8,9],issuedUpdate:50};

test('paused exact roster receipt proves three distinct proposed companies',()=>{
  assert.deepEqual(parseRosterInspection(receipt(),context).companies,[7,8,9]);
  assert.deepEqual(validateCompanyRoster([7,8,9,10]),[7,8,9,10]);
});
test('wrong company, update, nonce or extra field cannot establish roster proof',()=>{
  for(const [values,request] of [
    [{companyC:19},context],[{updateCount:51},context],[{nonce:'b'.repeat(32)},context],
    [{extra:1},context],
    [{}, {...context,companies:[7,8,10]}],
  ])assert.throws(()=>parseRosterInspection(receipt(values),request));
  for(const roster of [[7],[7,7],[7,8,9,10,11],[0,8],[7,1.5]])
    assert.throws(()=>validateCompanyRoster(roster));
  assert.equal(parseRosterInspection(receipt({outcome:'company_missing'}),context).outcome,'company_missing');
});
