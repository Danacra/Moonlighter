/**
 * Grid Rooms v0.6: build a connected room graph inside equal-size square slots.
 * Pure layout module: no Foundry dependencies.
 * Existing room images/annotations and Foundry scene templates are not mutated.
 */
import {rotatedSize,rotatedDoors,doorCenter,doorWidth} from "./room-core.mjs";

const SIDE_OFFSETS={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
const OPPOSITE={N:"S",E:"W",S:"N",W:"E"};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=(x,y)=>x+","+y;
const pick=(list,rng)=>list[Math.floor(rng()*list.length)];
const shuffle=(items,rng)=>{
  const a=[...items];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
};
const doorCompatible=(a,b)=>a.side===OPPOSITE[b.side] &&
  Math.abs(doorWidth(a)-doorWidth(b))<.001;
function optionsFor(room,requiredSide=null,requiredWidth=null){
  const out=[];
  for(let rotation=0;rotation<4;rotation++){
    const doors=rotatedDoors(room,rotation);
    for(let i=0;i<doors.length;i++){
      const d=doors[i];
      if(requiredSide && d.side!==requiredSide)continue;
      if(requiredWidth!==null&&Math.abs(doorWidth(d)-requiredWidth)>.001)continue;
      out.push({room,rotation,doors,cols:rotatedSize(room,rotation).cols,
        rows:rotatedSize(room,rotation).rows,doorIndex:i});
    }
  }
  return out;
}

/** A room slot cannot contain an image larger than the global square content area. */
export function buildGridLayout(templates,options={},rng=Math.random){
  const rooms=templates.filter(r=>r && r.cols>=2 && r.rows>=2 && r.doors?.length);
  if(!rooms.length)throw Error("Для Grid Rooms нужна хотя бы одна размеченная комната с дверью.");
  const requested=clamp(Math.floor(Number(options.roomCount)||8),2,100);
  const side=clamp(Math.floor(Number(options.gridCols)||Math.ceil(Math.sqrt(requested*1.25))),2,12);
  if(side*side<requested)throw Error("Сетка "+side+"×"+side+" мала для "+requested+" комнат. Увеличьте число слотов.");
  const gap=clamp(Math.floor(Number(options.gap)||3),1,12);
  const maxImageSize=Math.max(...rooms.flatMap(r=>[r.cols,r.rows]));
  const slotSize=maxImageSize+gap;
  const pad=2;
  const firstPool=rooms.filter(r=>r.roomType==="entrance");
  const regular=rooms.filter(r=>!["boss","entrance","secret"].includes(r.roomType));
  const bossPool=rooms.filter(r=>r.roomType==="boss");
  const first=pick(firstPool.length?firstPool:regular.length?regular:rooms,rng);
  const firstRotation=Math.floor(rng()*4);
  const firstSize=rotatedSize(first,firstRotation);
  const center=Math.floor((side-1)/2);
  const nodes=[{room:first,rotation:firstRotation,doors:rotatedDoors(first,firstRotation),
    cols:firstSize.cols,rows:firstSize.rows,cellX:center,cellY:center}];
  const occupied=new Map([[key(center,center),0]]);
  const usedDoors=new Set();
  const connections=[];
  let failed=0;
  while(nodes.length<requested && failed<requested*100){
    const frontier=[];
    for(const [i,p] of nodes.entries()){
      for(const [j,d] of p.doors.entries()){
        if(usedDoors.has(i+":"+j))continue;
        const dir=SIDE_OFFSETS[d.side];
        const x=p.cellX+dir[0],y=p.cellY+dir[1];
        if(x<0||y<0||x>=side||y>=side||occupied.has(key(x,y)))continue;
        frontier.push({i,j,d,x,y});
      }
    }
    if(!frontier.length)break;
    let result=null;
    for(const entrance of shuffle(frontier,rng)){
      const last=nodes.length===requested-1;
      const candidates=last && options.boss && bossPool.length
        ? [...shuffle(bossPool,rng),...shuffle(regular,rng)]
        : shuffle(regular.length?regular:rooms.filter(r=>r.roomType!=="boss"),rng);
      for(const room of candidates){
        const variants=shuffle(optionsFor(room,OPPOSITE[entrance.d.side],doorWidth(entrance.d)),rng);
        for(const variant of variants){
          // Avoid assigning a gate onto a side already occupied by another room
          // unless that gate is deliberately connected via this tree edge.
          result={entrance,variant};
          break;
        }
        if(result)break;
      }
      if(result)break;
    }
    if(!result){failed++;break;}
    const {entrance,variant}=result;
    const index=nodes.length;
    const node={room:variant.room,rotation:variant.rotation,doors:variant.doors,
      cols:variant.cols,rows:variant.rows,cellX:entrance.x,cellY:entrance.y};
    nodes.push(node);
    occupied.set(key(node.cellX,node.cellY),index);
    usedDoors.add(entrance.i+":"+entrance.j);
    usedDoors.add(index+":"+variant.doorIndex);
    connections.push({a:{room:entrance.i,door:entrance.j},
      b:{room:index,door:variant.doorIndex},kind:
      entrance.d.kind==="passage"&&variant.doors[variant.doorIndex].kind==="passage"?"passage":"door"});
    failed=0;
  }
  for(const n of nodes){
    // Every room stays within its square slot; the gap is always preserved.
    n.x=pad+n.cellX*slotSize+(slotSize-n.cols)/2;
    n.y=pad+n.cellY*slotSize+(slotSize-n.rows)/2;
  }
  const dimension=pad*2+side*slotSize;
  return {placements:nodes,connections,cols:dimension,rows:dimension,
    requested,grid:{cols:side,rows:side,slotSize,gap,pad}};
}

function endpoint(p,door,grid){
  const t=doorCenter(door), w=doorWidth(door);
  const x=p.x+(door.side==="W"?0:door.side==="E"?p.cols:t);
  const y=p.y+(door.side==="N"?0:door.side==="S"?p.rows:t);
  return {side:door.side,x:x*grid,y:y*grid,width:w*grid};
}

/** Portals connect *different coordinates*; the old adjacency-based portal list does not. */
export function gridPortals(layout,gridSize){
  return layout.connections.map((link,i)=>{
    const pa=layout.placements[link.a.room],pb=layout.placements[link.b.room];
    const a=endpoint(pa,pa.doors[link.a.door],gridSize);
    const b=endpoint(pb,pb.doors[link.b.door],gridSize);
    return {key:"gate:"+i,rooms:[link.a.room,link.b.room],a:{...a,room:link.a.room},
      b:{...b,room:link.b.room},kind:link.kind,secret:false};
  });
}
