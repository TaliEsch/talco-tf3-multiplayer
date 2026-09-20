// Synthetic declared-field data, not a captured or replay-qualified TF3 action.
export function roadStopCaptureFixture(){
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,4,5,6,1];
  const lane={speed:20,width:3,height:0,forward:true,transportModes:[['BUS',true],['CAR',false]],offset:0};
  const comp={type:'NORMAL',typeIndex:0,objects:[[4,'STOP_LEFT']],laneConfigs:[lane],roadDevelopmentLocked:false,
    node0:1,node1:2,position0:[0,0,0],position1:[10,0,0],tangent0:[1,0,0],tangent1:[1,0,0],laneConfig:[lane],
    edgeDecorations:[[8,true]],distance:10,roadType:'STREET',roadTemplate:'street/standard',roadStyle:'standard'};
  const segment={entity:-3,comp,type:0,streetEdge:{precedenceNode0:'AUTO',precedenceNode1:'YES'},
    emissionEmitter:{position:[1,2,3],radius:0,noisePower:1,pollutionPower:2},playerOwned:{player:10}};
  return structuredClone({schemaVersion:1,builderId:'streetTerminalBuilder',proposal:{street:{
    addedNodes:[{entity:-1,comp:{position:[0,0,0]}}],removedNodes:[],addedSegments:[segment],
    removedSegments:[{...segment,entity:22,emissionEmitter:null,playerOwned:null}],
    edgeObjectsToAdd:[{resultEntity:-4,category:0,modelInstance:{modelId:7,transf0:matrix,transf:matrix,transformator:-1},playerEntity:10,left:true}],
    new2oldEdgeObjects:[[9,[5,3]],[2,[]]],old2newEdgeObjects:[[9,[3]]],nodeConfigsToAdd:[],nodeConfigsToRemove:[]},
    toRemove:[22],old2new:[[22,-3]],toAdd:[],terrain:{baseHeightMod:{x0:-10,y0:7,width:0,height:0}}}});
}
