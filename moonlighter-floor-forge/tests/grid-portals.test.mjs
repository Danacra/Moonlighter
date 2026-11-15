import assert from "node:assert/strict";
import {landingSpot,approach,gateOpen,findTeleport} from "../scripts/grid-portals.mjs";
const ID="moonlighter-floor-forge",g=100;
const rooms=[
 {index:0,type:"entrance",x:200,y:200,w:1000,h:800},
 {index:1,type:"combat",x:1600,y:200,w:1000,h:800}
];
const portal={key:"gate:0",rooms:[0,1],a:{room:0,side:"E",x:1200,y:600,width:100},
 b:{room:1,side:"W",x:1600,y:600,width:100},kind:"door",secret:false};
const wall=(x,ds=1)=>({id:String(x),door:1,ds,c:[x,550,x,650],flags:{[ID]:{gateKey:"gate:0"}}});
const tok={id:"player",x:1050,y:550,width:1,height:1};
const scene={walls:{contents:[wall(1200),wall(1600)]},tokens:{contents:[tok]}};
const adv={rooms,gridPortals:[portal],hazards:[]};
assert.ok(approach(portal.a,{x:1100,y:600},g));
assert.ok(!approach(portal.a,{x:800,y:600},g));
assert.ok(gateOpen(portal,portal.a,scene.walls.contents));
assert.ok(!gateOpen(portal,portal.a,[wall(1200,0),wall(1600)]));
assert.ok(!gateOpen(portal,portal.a,[wall(1200,2),wall(1600)]));
const move=findTeleport(adv,scene,tok,g);
assert.ok(move);
assert.equal(move.to,1);
assert.ok(move.land.x>1600 && move.land.x<2500);
assert.ok(move.land.y>=200 && move.land.y<1000);
const backwards=findTeleport(adv,scene,{...tok,x:1630},g);
assert.ok(backwards && backwards.to===0);
const pit={x:move.land.x,y:move.land.y,w:120,h:120};
assert.equal(findTeleport({...adv,hazards:[pit]},scene,tok,g),null);
const blocker={id:"npc",x:move.land.x,y:move.land.y,width:1,height:1};
assert.equal(findTeleport(adv,{...scene,tokens:{contents:[tok,blocker]}},tok,g),null);
assert.equal(landingSpot(portal.b,rooms[1],g,50,1),null);
assert.equal(gateOpen({...portal,secret:true},portal.a,[{...wall(1200),door:2}]),false);
console.log("PASS: Grid teleport proximity, source gate state, target landing and hazard/occupancy rejection");
