import assert from "node:assert/strict";
import {buildGolemShowcase} from "../scripts/golem-showcase.mjs";
import {findTeleport} from "../scripts/grid-portals.mjs";

const img="data/maps/golem-room.webp";
const single=buildGolemShowcase(img,{twoRooms:false});
assert.equal(single.width,1200);
assert.equal(single.height,800);
assert.equal(single.tileDocs.length,1);
assert.equal(single.portals.length,0);
const demo=buildGolemShowcase(img);
assert.equal(demo.width,2800);
assert.equal(demo.rooms.length,2);
assert.equal(demo.tileDocs.length,2);
assert.equal(demo.portals.length,4);
assert.equal(demo.hazards.length,4);
assert.equal(demo.gridSize,100);
assert.ok(demo.wallDocs.length>70);
assert.ok(demo.wallDocs.every(w=>w.c.length===4&&w.c.every(Number.isInteger)));
const sides0=new Set(demo.portals.map(p=>p.a.side));
const sides1=new Set(demo.portals.map(p=>p.b.side));
assert.deepEqual([...sides0].sort(),["E","N","S","W"]);
assert.deepEqual([...sides1].sort(),["E","N","S","W"]);
const adventure={
  rooms:demo.rooms,statuses:{"0":"cleared","1":"cleared"},
  gridPortals:demo.portals,portalMode:"procedural",
  hazards:demo.hazards
};
const scene={walls:{contents:demo.wallDocs},tokens:{contents:[]}};
for(const gate of demo.portals){
  const start=gate.a;
  const token={id:"test-token-"+gate.key,x:start.x-50,y:start.y-50,width:1,height:1};
  scene.tokens.contents=[token];
  const result=findTeleport(adventure,scene,token,100);
  assert.ok(result,gate.a.side+" exit must teleport without landing in a pit, wall or statue");
  assert.equal(result.to,1);
  assert.ok(result.land.x>=demo.rooms[1].x);
  assert.ok(result.land.x+100<=demo.rooms[1].x+demo.rooms[1].w);
}
assert.throws(()=>buildGolemShowcase(""),/изображение/);
console.log("PASS: Golem image showcase, geometry, all four paired doors, safe destination points");
