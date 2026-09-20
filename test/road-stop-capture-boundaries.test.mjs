import test from 'node:test';
import assert from 'node:assert/strict';
import {roadStopCaptureFixture as fixture} from './fixtures/road-stop-capture.mjs';
import {parseRoadStopCapture as parse} from '../src/road-stop-capture.mjs';
const encode=v=>parse(JSON.stringify(v));

test('every copied object field is mandatory, not implicitly defaulted',()=>{
  const paths=[];
  function walk(v,path=[]){
    if(v===null || typeof v!=='object')return;
    for(const key of Object.keys(v)){
      if(!Array.isArray(v))paths.push([...path,key]);
      walk(v[key],[...path,key]);
    }
  }
  walk(fixture());
  for(const path of paths){
    const value=fixture();let at=value;
    for(const key of path.slice(0,-1))at=at[key];
    delete at[path.at(-1)];assert.throws(()=>encode(value),/ROAD_STOP_CODEC_UNSUPPORTED/,path.join('.'));
  }
});

test('map order normalizes but reference-list order and geometry remain significant',()=>{
  const value=fixture(),baseline=encode(value).digest;
  value.proposal.street.new2oldEdgeObjects.reverse();
  value.proposal.street.addedSegments[0].comp.laneConfigs[0].transportModes.reverse();
  assert.equal(encode(value).digest,baseline);
  value.proposal.street.new2oldEdgeObjects[0][1].reverse();
  // First entry after reversal is key 2 with empty list; alter the nonempty map.
  value.proposal.street.new2oldEdgeObjects.find(([key])=>key===9)[1].reverse();
  assert.notEqual(encode(value).digest,baseline);
  const geometry=fixture();geometry.proposal.street.addedSegments[0].comp.position1[0]+=0.25;
  assert.notEqual(encode(geometry).digest,baseline);
});

test('inconsistent road kinds, unknown enums and numeric overflow cannot be captured',()=>{
  for(const mutate of [
    v=>v.proposal.street.addedSegments[0].comp.roadType='TRACK',
    v=>v.proposal.street.addedSegments[0].streetEdge.precedenceNode0='UNKNOWN',
    v=>v.proposal.street.edgeObjectsToAdd[0].playerEntity=0,
    v=>v.proposal.street.edgeObjectsToAdd[0].modelInstance.transf.pop(),
    v=>v.proposal.street.addedSegments[0].comp.laneConfigs[0].transportModes.push(['BUS',false]),
  ]){const value=fixture();mutate(value);assert.throws(()=>encode(value),/ROAD_STOP_CODEC_UNSUPPORTED/);}
  assert.throws(()=>parse(JSON.stringify(fixture()).replace('"distance":10','"distance":1e400')),/finite/);
});
