import assert from "node:assert/strict";
import {buildGridLayout,gridPortals} from "../scripts/grid-core.mjs";
import {renderLayout} from "../scripts/room-core.mjs";
const rng=(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const common={id:"cross",name:"Test cross",image:"test.webp",cols:10,rows:8,roomType:"combat",
 doors:[{side:"N",offset:5,width:1},{side:"S",offset:5,width:1},{side:"W",offset:4,width:1},{side:"E",offset:4,width:1}],
 walls:[],covers:[],pits:[],zones:[]};
const entrance={...common,id:"entry",roomType:"entrance"};
const boss={...common,id:"boss",roomType:"boss"};
for(let seed=1;seed<=40;seed++){
  const plan=buildGridLayout([entrance,common,boss],{roomCount:12,gridCols:4,gap:3,boss:true},rng(seed));
  assert.equal(plan.grid.cols,4);
  assert.equal(plan.placements.length,12);
  assert.equal(plan.connections.length,11);
  assert.equal(plan.placements[0].room.id,"entry");
  assert.equal(plan.placements.at(-1).room.id,"boss");
  assert.equal(plan.cols,plan.rows,"Floor is square");
  const cells=new Set();
  for(const room of plan.placements){
    const cell=room.cellX+","+room.cellY;
    assert.ok(!cells.has(cell),"Each grid slot is unique");
    cells.add(cell);
    assert.ok(room.x>0&&room.y>0);
    assert.ok(room.x+room.cols<plan.cols&&room.y+room.rows<plan.rows);
  }
  for(let i=0;i<plan.placements.length;i++)for(let j=0;j<i;j++){
    const a=plan.placements[i],b=plan.placements[j];
    const xGap=Math.max(a.x-(b.x+b.cols),b.x-(a.x+a.cols));
    const yGap=Math.max(a.y-(b.y+b.rows),b.y-(a.y+a.rows));
    assert.ok(xGap>=3-.0001||yGap>=3-.0001,"Rooms keep their clearance");
  }
  for(const l of plan.connections){
    const a=plan.placements[l.a.room],b=plan.placements[l.b.room];
    assert.equal(Math.abs(a.cellX-b.cellX)+Math.abs(a.cellY-b.cellY),1,"Logical graph joins neighboring slots");
  }
  const rendered=renderLayout(plan,100);
  assert.equal(rendered.tiles.length,12);
  assert.equal(rendered.walls.filter(w=>w.door===1).length,22,"Both portal ends have walls");
  const ports=gridPortals(plan,100);
  assert.equal(ports.length,11);
  for(const pt of ports){
    assert.equal(pt.a.room,pt.rooms[0]);
    assert.equal(pt.b.room,pt.rooms[1]);
    assert.ok(Math.hypot(pt.a.x-pt.b.x,pt.a.y-pt.b.y)>=300);
  }
}
assert.throws(()=>buildGridLayout([common],{roomCount:18,gridCols:4}),/мала/);
console.log("PASS: 40 seeded square-slot layouts, room clearance, linked doors and real Foundry walls");
