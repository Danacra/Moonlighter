import assert from "node:assert/strict";
import {assignRoomTypes, allPartyInside, countActiveEnemies, roomOfToken, safeItemData} from "../scripts/adventure-core.mjs";
import {changeEncounter, revealSecret, claimChest} from "../scripts/expedition.mjs";
const NS="moonlighter-floor-forge";
const layout={placements:Array.from({length:5},()=>({room:{roomType:"random"}})),connections:[
  {a:{room:0},b:{room:1}}, {a:{room:1},b:{room:2}},
  {a:{room:1},b:{room:3}}, {a:{room:3},b:{room:4}}
]};
const types=assignRoomTypes(layout,{secretChance:100,boss:true},()=>0.01);
assert.deepEqual(types,["entrance","treasure","secret","treasure","boss"]);
const annotated={placements:[{room:{roomType:"random"}},{room:{roomType:"secret"}},{room:{roomType:"combat"}}],connections:[
  {a:{room:0},b:{room:1}},{a:{room:1},b:{room:2}}
]};
assert.equal(assignRoomTypes(annotated,{boss:false,secretChance:100},()=>0.1)[1],"combat","Don't hide a mandatory traversal corridor");
const rooms=[{index:0,x:0,y:0,w:400,h:400},{index:1,x:400,y:0,w:400,h:400},{index:2,x:800,y:0,w:400,h:400,type:"secret"}];
const character={id:"hero",type:"character",name:"Hero",hasPlayerOwner:true,system:{attributes:{hp:{value:10}}},
  async createEmbeddedDocuments(kind,data){assert.equal(kind,"Item");this.gained??=[];this.gained.push(...data);return data;}};
const p={x:450,y:150,width:1,height:1,hidden:false,actor:character};
const npcActor={id:"npc",hasPlayerOwner:false,system:{attributes:{hp:{value:12}}}};
const enemy={x:550,y:150,width:1,height:1,actor:npcActor,flags:{[NS]:{enemy:true,roomIndex:1}}};
assert.equal(roomOfToken(rooms,p,100),1);
assert.equal(allPartyInside([p,enemy],rooms,1,100),true);
assert.equal(countActiveEnemies([p,enemy],1),1);
npcActor.system.attributes.hp.value=0;
assert.equal(countActiveEnemies([p,enemy],1),0);
npcActor.system.attributes.hp.value=12;
const chest={id:"chest-1",label:"1",claimed:false,items:[{name:"Gem",data:{_id:"world-item",name:"Gem",type:"loot",system:{quantity:1}}}]};
const s={rooms:[{...rooms[0],type:"entrance"},{...rooms[1],type:"combat"},{...rooms[2],type:"secret"}],
  statuses:{"0":"ready","1":"ready","2":"ready"},chests:[chest],revealed:[]};
const walls=[{id:"gate1",door:1,ds:0,flags:{[NS]:{gateRooms:[0,1]}}},
 {id:"secret1",door:2,ds:0,flags:{[NS]:{gateRooms:[1,2],secretGate:true}}}];
const scene={id:"scene1",grid:{size:100},walls:{contents:walls},tokens:{contents:[p,enemy]},flags:{[NS]:{adventure:s}},
  getFlag(ns,key){return this.flags[ns]?.[key];},async setFlag(ns,key,value){this.flags[ns][key]=value;},
  async updateEmbeddedDocuments(kind,updates){assert.equal(kind,"Wall");for(const u of updates){Object.assign(walls.find(w=>w.id===u._id),u);}return updates;}};
globalThis.game={user:{isGM:true,id:"gm"},users:{contents:[{id:"gm",isGM:true,active:true}]},actors:{get:id=>id==="hero"?character:null}};
globalThis.ui={notifications:{info(){},error(){},warn(){}}};
assert.equal(await changeEncounter(scene,1,"active"),true);
assert.equal(walls[0].ds,2);
assert.equal(walls[1].door,2,"Secret stays hidden while combat gate locks");
assert.equal(scene.getFlag(NS,"adventure").statuses["1"],"active");
assert.equal(await changeEncounter(scene,1,"cleared"),true);
assert.equal(walls[0].ds,1);
assert.equal(scene.getFlag(NS,"adventure").statuses["1"],"cleared");
assert.equal(await revealSecret(scene,2),true);
assert.equal(walls[1].door,1);
assert.equal(walls[1].ds,1);
assert.equal(await claimChest(scene,"chest-1","hero"),true);
assert.equal(character.gained.length,1);
assert.equal(character.gained[0]._id,undefined);
assert.equal(scene.getFlag(NS,"adventure").chests[0].claimed,true);
await assert.rejects(()=>claimChest(scene,"chest-1","hero"),/уже получен/);
const clean=safeItemData({_id:"test",folder:"here",name:"Potion"});
assert.equal(clean._id,undefined);
assert.equal(clean.name,"Potion");
console.log("PASS: role graph, party gate, secret reveal, door states, persistent chest claim and duplicate protection");
