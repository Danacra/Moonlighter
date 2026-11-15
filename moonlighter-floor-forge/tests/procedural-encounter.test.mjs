import assert from "node:assert/strict";
import {activateProceduralRoom,changeEncounter} from "../scripts/expedition.mjs";
import {proceduralPortalOpen} from "../scripts/grid-portals.mjs";

const ID="moonlighter-floor-forge";
let created=0,saved=0;
const entrance={index:0,name:"Entrance",type:"entrance",x:0,y:0,w:1000,h:700};
const combat={index:1,name:"Combat",type:"combat",x:2000,y:0,w:1000,h:700};
const boss={index:2,name:"Boss",type:"boss",x:4000,y:0,w:1000,h:700};
const pending=[{actorId:"skeleton",x:2500,y:300,width:1,height:1,
 flags:{[ID]:{enemy:true,roomIndex:1}}},{actorId:"skeleton",x:2600,y:400,width:1,height:1,
 flags:{[ID]:{enemy:true,roomIndex:1}}}];
const state={spawnOnEntry:true,portalMode:"procedural",
 rooms:[entrance,combat,boss],chests:[],
 statuses:{"0":"cleared","1":"ready","2":"ready"},
 pendingSpawns:{"1":pending,"2":[{actorId:"dragon",flags:{[ID]:{enemy:true,roomIndex:2}}}]}};
const scene={id:"mock-scene",flags:{[ID]:{adventure:state}},
 tokens:{contents:[]},walls:{contents:[]},
 getFlag(ns,key){return this.flags[ns]?.[key];},
 async setFlag(ns,key,val){saved++;this.flags[ns][key]=val;},
 async createEmbeddedDocuments(kind,arr){
  assert.equal(kind,"Token");
  created+=arr.length;
  this.tokens.contents.push(...arr.map((t,i)=>({...t,id:"spawn-"+created+"-"+i,
    actor:{system:{attributes:{hp:{value:12}}}}})));
  return arr;
 }};
globalThis.game={user:{isGM:true,id:"gm"},users:{contents:[{id:"gm",isGM:true,active:true}]}};
globalThis.ui={notifications:{info(){},warn(){},error(){}}};
const portal={key:"proc:0",rooms:[0,1],kind:"passage",secret:false};
assert.ok(proceduralPortalOpen(scene.getFlag(ID,"adventure"),portal,0));
assert.ok(!proceduralPortalOpen(scene.getFlag(ID,"adventure"),portal,1));
assert.equal(scene.tokens.contents.length,0,"Never spawn before entering");
const first=await Promise.all([
 activateProceduralRoom(scene,1,{quiet:true}),
 activateProceduralRoom(scene,1,{quiet:true})
]);
assert.ok(first.includes(true));
assert.equal(created,2,"First visit can create NPCs exactly once");
assert.equal(scene.getFlag(ID,"adventure").statuses["1"],"active");
assert.equal(scene.getFlag(ID,"adventure").pendingSpawns["1"],undefined);
assert.equal(await activateProceduralRoom(scene,1,{quiet:true}),false);
assert.ok(!proceduralPortalOpen(scene.getFlag(ID,"adventure"),portal,1),"Combat gates remain sealed");
await changeEncounter(scene,1,"cleared",{quiet:true});
assert.equal(scene.getFlag(ID,"adventure").statuses["1"],"cleared");
assert.ok(proceduralPortalOpen(scene.getFlag(ID,"adventure"),portal,1));
assert.equal(await activateProceduralRoom(scene,1,{quiet:true}),false);
assert.equal(scene.tokens.contents.length,2);
assert.equal(scene.getFlag(ID,"adventure").pendingSpawns["2"].length,1,"Unvisited boss stays queued");
assert.ok(saved>=2);
console.log("PASS: enemy wave is created on first entry only, exits lock and clear, boss remains unspawned");
