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
assert.ok(!proceduralPortalOpen(state,first,connected),"Combat room must keep doors locked until cleared");
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
