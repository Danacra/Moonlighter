import assert from "node:assert/strict";
import {buildProceduralPlan,renderProceduralPlan,ASSET_ROOT} from "../scripts/procedural-core.mjs";
import {proceduralPortalOpen,findTeleport} from "../scripts/grid-portals.mjs";

const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let seed=1;seed<=50;seed++){
 const plan=buildProceduralPlan({roomCount:12,gridCols:4,roomGap:4,boss:true,secretChance:15},seeded(seed));
 assert.equal(plan.rooms.length,12);
 assert.equal(plan.edges.length,11);
 assert.equal(plan.rooms[0].type,"entrance");
 assert.equal(plan.rooms.at(-1).type,"boss");
 assert.equal(plan.rooms.filter(r=>r.type==="sanctuary").length,1,"A healing sanctuary is mandatory");
 assert.equal(plan.rooms.filter(r=>r.type==="miniboss").length,1,"Every full floor needs a miniboss");
 const bossIdx=plan.rooms.length-1;
 const bossConnection=plan.edges.find(e=>e.a===bossIdx||e.b===bossIdx);
 assert.ok(bossConnection,"Boss room must be connected");
 // The final boss is the farthest room, and the room immediately before it is the sanctuary.
 const sanctuaryIdx=plan.rooms.find(r=>r.type==="sanctuary").index;
 assert.ok(plan.edges.some(e=>(e.a===bossIdx&&e.b===sanctuaryIdx)||(e.b===bossIdx&&e.a===sanctuaryIdx)));

 assert.equal(plan.width,plan.height);
 const cells=new Set();
 for(const r of plan.rooms){
  const cell=r.cellX+","+r.cellY;
  assert.ok(!cells.has(cell));
  cells.add(cell);
  for(const n of [r.x,r.y,r.w,r.h])assert.equal(n,Math.floor(n),"Tile coordinates must use integer cells");
  assert.ok(r.w<=16&&r.h<=12);
  for(const [side,to] of Object.entries(r.links)){
   const opposite={N:"S",E:"W",S:"N",W:"E"}[side];
   assert.equal(plan.rooms[to].links[opposite],r.index,"Doors must be bidirectional");
  }
 }
 for(const [i,a] of plan.rooms.entries())for(const b of plan.rooms.slice(i+1)){
  const intersect=a.x<b.x+b.w+3&&a.x+a.w+3>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;
  assert.ok(!intersect,"All procedural room art must have 3-cell clearance");
 }
 const geo=renderProceduralPlan(plan,100,{hazardDensity:60},seeded(seed+999));
 assert.equal(geo.roomRects.length,12);
 assert.equal(geo.gridPortals.length,11);
 assert.equal(geo.width,geo.height);
 assert.ok(geo.tiles.every(t=>t.texture.src.startsWith(ASSET_ROOT)));
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("floor-stone.svg")));
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("door-arch.svg")));
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("entrance-rune.svg")));
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("boss-rune.svg")));
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("fountain.svg")));
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("miniboss-rune.svg")));
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("brazier.svg")),
   "Rooms must contain varied interactive-looking environmental decor");
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("corner-stone.svg")),
   "Each room must have proper corner stone trim");
 const horizontal=geo.tiles.filter(t=>t.texture.src.endsWith("wall-horizontal.svg"));
 const vertical=geo.tiles.filter(t=>t.texture.src.endsWith("wall-vertical.svg"));
 assert.ok(horizontal.length>0&&vertical.length>0);
 assert.ok(horizontal.every(t=>t.width===100&&t.height===55),
   "Each horizontal wall must be exactly one cell wide, not stretched across the room");
 assert.ok(vertical.every(t=>t.width===55&&t.height===100),
   "Each vertical wall must be exactly one cell tall, not stretched");
 assert.equal(geo.tiles.filter(t=>t.texture.src.endsWith("corner-stone.svg")).length,48,
   "All twelve rooms must have four stone corner joins");

 assert.equal(geo.tiles.filter(t=>t.texture.src.endsWith("portal-glow.svg")).length,22);
 assert.ok(geo.tiles.every(t=>Number.isInteger(t.sort)),"Tile stacking must be deterministic");
 const floorSort=geo.tiles.find(t=>t.texture.src.endsWith("floor-stone.svg")).sort;
 const entranceSort=geo.tiles.find(t=>t.texture.src.endsWith("entrance-rune.svg")).sort;
 assert.ok(entranceSort>floorSort,"The entrance rune must not be painted beneath the floor");
 assert.ok(geo.tiles.some(t=>t.texture.src.endsWith("wall-horizontal.svg")));
 assert.ok(geo.walls.every(w=>w.c.every(v=>Number.isInteger(v))),"Collision wall edges must align to integer grid");
 for(const e of geo.gridPortals){
  assert.notEqual(e.a.room,e.b.room);
  assert.ok(Math.hypot(e.a.x-e.b.x,e.a.y-e.b.y)>200);
 }
 // No pit/cover can occupy the exact marked doorway square in a new room.
 const hazards=geo.blocked.filter(b=>["pit","cover"].includes(b.kind));
 const doors=geo.blocked.filter(b=>b.kind==="door-clearance");
 for(const pit of hazards)for(const door of doors){
  assert.ok(!(pit.x<door.x+door.w&&pit.x+pit.w>door.x&&pit.y<door.y+door.h&&pit.y+pit.h>door.y),"Pits must not block door landings");
 }
}
const plan=buildProceduralPlan({roomCount:9,gridCols:3,roomGap:4,boss:true},seeded(10));
const geo=renderProceduralPlan(plan,100,{hazardDensity:0},seeded(10));
const first=geo.gridPortals.find(p=>p.rooms.includes(0));
const state={
 portalMode:"procedural",rooms:geo.roomRects,gridPortals:geo.gridPortals,revealed:[],
 statuses:Object.fromEntries(geo.roomRects.map(r=>[String(r.index),r.index===0?"cleared":"ready"])),
 hazards:[]
};
assert.ok(proceduralPortalOpen(state,first,0));
const connected=first.rooms.find(i=>i!==0);
assert.equal(proceduralPortalOpen(state,first,connected),!["combat","miniboss","boss"].includes(geo.roomRects[connected].type),"Only combat or boss rooms have locked exits");
state.statuses[String(connected)]="cleared";
assert.ok(proceduralPortalOpen(state,first,connected));
const side=first.a.room===0?first.a:first.b;
const fromRoom=geo.roomRects[0],g=100;
const tx=Math.max(fromRoom.x,Math.min(fromRoom.x+fromRoom.w-g,side.x-(side.side==="W"?-g:0)-g/2));
const ty=Math.max(fromRoom.y,Math.min(fromRoom.y+fromRoom.h-g,side.y-(side.side==="N"?-g:0)-g/2));
const token={id:"hero",actor:{hasPlayerOwner:true},x:tx,y:ty,width:1,height:1};
const scene={walls:{contents:geo.walls},tokens:{contents:[token]}};
const result=findTeleport(state,scene,token,g);
assert.ok(result,"Procedural mode should teleport on approach without requiring a Foundry door icon");
assert.equal(result.to,connected);
console.log("PASS: 50 deterministic tile floors, unified grid, bidirectional links, hazards and icon-free teleports");

const crossingRooms=[{index:0,type:"entrance",x:0,y:0,w:1000,h:800},
 {index:1,type:"combat",x:1300,y:0,w:1000,h:800}];
const crossingPortal={key:"proc:cross",rooms:[0,1],kind:"passage",secret:false,
 a:{room:0,side:"E",x:1000,y:400,width:200},
 b:{room:1,side:"W",x:1300,y:400,width:200}};
const crossingState={rooms:crossingRooms,gridPortals:[crossingPortal],
 portalMode:"procedural",statuses:{"0":"cleared","1":"ready"},hazards:[]};
const crossingToken={id:"hero",x:1060,y:350,width:1,height:1};
const crossingPrevious={x:885,y:350,width:1,height:1};
assert.equal(findTeleport(crossingState,{tokens:{contents:[crossingToken]},walls:{contents:[]}},
 crossingToken,100),null,"After crossing a door the new position is outside both rooms");
const recovered=findTeleport(crossingState,{tokens:{contents:[crossingToken]},walls:{contents:[]}},
 crossingToken,100,crossingPrevious);
assert.ok(recovered&&recovered.to===1,"Swept collision must recover teleport when a single drag crosses the doorway");
console.log("PASS: glowing entrance/portal graphics, tile ordering and swept doorway movement");
