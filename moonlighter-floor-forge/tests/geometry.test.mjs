import assert from 'node:assert/strict';
import {buildLayout,renderLayout,rotatedDoors,doorPoint,rotatePoint,transformRect} from '../scripts/room-core.mjs';
const rooms=[
 {id:'a',name:'A',image:'a.webp',cols:8,rows:6,doors:[{side:'N',index:2},{side:'S',index:5},{side:'E',index:3},{side:'W',index:2}],walls:[{x1:1,y1:1,x2:2,y2:1}],covers:[{x:1,y:1,w:1,h:1}],pits:[{x:4,y:2,w:2,h:1}],zones:[]},
 {id:'b',name:'B',image:'b.webp',cols:6,rows:9,doors:[{side:'N',index:2},{side:'E',index:6},{side:'W',index:4},{side:'S',index:2}],walls:[],covers:[],pits:[],zones:[]},
 {id:'c',name:'C',image:'c.webp',cols:9,rows:7,doors:[{side:'W',index:3},{side:'E',index:3},{side:'N',index:5},{side:'S',index:5}],walls:[],covers:[],pits:[],zones:[]}
];
const seeded = (init=0x1234abcd) => { let s=init;return ()=> {s=(Math.imul(s,1664525)+1013904223)>>>0; return s/2**32;};};
for(const r of rooms) for(let t=0;t<4;t++) {
  for(const [i,d] of r.doors.entries()) {
    const p=doorPoint(r,d),rp=rotatePoint(p.x,p.y,r,t);
    const out=rotatedDoors(r,t)[i];
    const rd=doorPoint(t%2?{cols:r.rows,rows:r.cols}:r,out);
    assert.deepEqual(rp,rd,`Rotated door point ${r.id} ${t}`);
  }
  const rr=transformRect({x:1,y:1,w:2,h:3},r,t);
  assert.ok(rr.w>0&&rr.h>0);
}
const opposite={N:'S',E:'W',S:'N',W:'E'};
const centers=(p,d)=>({x:p.x+(d.side==='W'?0:d.side==='E'?p.cols:d.index+.5),y:p.y+(d.side==='N'?0:d.side==='S'?p.rows:d.index+.5)});
for(let seed=0;seed<20;seed++){
  const layout=buildLayout(rooms,18,seeded(seed));
  assert.equal(layout.placements.length,18,`18 connected rooms for seed ${seed}`);
  assert.ok(layout.connections.length>=17);
  for (let i=0;i<layout.placements.length;i++)for(let j=0;j<i;j++) {
    const a=layout.placements[i],b=layout.placements[j];
    assert.ok(!(Math.min(a.x+a.cols,b.x+b.cols)>Math.max(a.x,b.x)&&Math.min(a.y+a.rows,b.y+b.rows)>Math.max(a.y,b.y)),`No overlap seed ${seed}`);
  }
  for(const {a,b} of layout.connections){
    const pa=layout.placements[a.room],pb=layout.placements[b.room];
    const da=pa.doors[a.door],db=pb.doors[b.door];
    assert.equal(da.side,opposite[db.side]);
    assert.deepEqual(centers(pa,da),centers(pb,db));
  }
  const rendered=renderLayout(layout,100);
  assert.equal(rendered.tiles.length,18);
  assert.ok(rendered.walls.length>0);
  assert.ok(rendered.zones.some(z=>z.kind==='BOSS'));
  assert.ok(rendered.blocked.some(z=>z.kind==='door-clearance'));
  assert.ok(rendered.width>0 && rendered.height>0);
  assert.equal(rendered.walls.filter(w=>w.door===1).length,layout.connections.length);
}
// Single-entry room: generator should not invent connections beyond two rooms.
const isolated=[{id:'deadend',name:'Dead end',image:'dead.webp',cols:5,rows:5,doors:[{side:'E',index:2}],walls:[],covers:[],pits:[],zones:[]}];
const plan=buildLayout(isolated,15,seeded(30));
assert.equal(plan.placements.length,2);
assert.equal(plan.connections.length,1);
// Passage-to-passage should remain open, not spawn an interactive door.
const hallway=[{id:'pass',image:'pass.webp',cols:5,rows:5,doors:[{side:'E',index:2,kind:'passage'},{side:'W',index:2,kind:'passage'}],walls:[],covers:[],pits:[],zones:[]}];
const passLayout=buildLayout(hallway,3,seeded(3));
assert.equal(passLayout.placements.length,3);
assert.equal(renderLayout(passLayout,100).walls.filter(w=>w.door===1).length,0);
// Secret room doors must be hidden in Foundry, and never reclassified as regular gates.
const secretGeometry=renderLayout(plan,100,["entrance","secret"]);
assert.ok(secretGeometry.walls.some(w=>w.door===2 && w.flags?.["moonlighter-floor-forge"]?.secretGate));
const bossRooms=[
 {...rooms[0],id:'entry',name:'Entrance',roomType:'entrance'},
 {...rooms[1],id:'middle',name:'Combat',roomType:'combat'},
 {...rooms[2],id:'boss',name:'Boss',roomType:'boss'}
];
const withBoss=buildLayout(bossRooms,8,seeded(117),{boss:true});
assert.equal(withBoss.placements[0].room.roomType,'entrance');
assert.equal(withBoss.placements.at(-1).room.roomType,'boss');
console.log('PASS: rotation, collisions, 20 seeds, secret doors, boss/end preference and tagged geometry');

const freeRoom={id:"precise",name:"Precise doors",image:"precise.webp",cols:10,rows:8,
  doors:[{side:"E",offset:3.25,width:.5,kind:"door"},{side:"W",offset:5.75,width:.5,kind:"door"}],
  walls:[{x1:2.2,y1:1.4,x2:8.1,y2:1.4}],covers:[],
  pits:[{x:5,y:5,w:2,h:2}],zones:[]};
assert.equal(doorPoint(freeRoom,freeRoom.doors[0]).y,3.25);
for(let t=0;t<4;t++){
  const doors=rotatedDoors(freeRoom,t);
  const size=t%2?{cols:freeRoom.rows,rows:freeRoom.cols}:freeRoom;
  for(const [i,d] of doors.entries()) {
    const a=doorPoint(freeRoom,freeRoom.doors[i]);
    assert.deepEqual(doorPoint(size,d),rotatePoint(a.x,a.y,freeRoom,t));
  }
}
const fractional=buildLayout([freeRoom],2,seeded(21));
assert.equal(fractional.placements.length,2);
const fineWalls=renderLayout(fractional,100);
assert.equal(fineWalls.walls.filter(w=>w.door===1).length,1);
assert.ok(fineWalls.walls.some(w=>w.c.some(n=>n%50!==0)), "Sub-grid wall coordinates preserved");
assert.ok(fineWalls.drawings.every(d=>d.hidden===true && d.text===""), "GM hazards must not be labeled to players");
console.log("PASS: continuous doorway centers, free placement and GM-hidden annotations");
