/**
 * Moonlighter Floor Forge — deterministic, pure room geometry and layout.
 * Coordinates are expressed in grid cells until a Scene is generated.
 * No Foundry runtime dependencies; tested with Node.js.
 */
export const SIDES = ["N", "E", "S", "W"];
const DIR = {N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0]};
const opposite = side => SIDES[(SIDES.indexOf(side) + 2) % 4];
const randInt = (max, rng) => Math.floor(rng() * max);
const choose = (items, rng) => items[randInt(items.length, rng)];
const shuffle = (items, rng) => {
  const shuffled = [...items];
  for (let i=shuffled.length - 1; i>0; i--) {
    const j = randInt(i+1, rng);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export function rotatedSize(room, turns) {
  return turns % 2 ? {cols: room.rows, rows: room.cols} : {cols: room.cols, rows: room.rows};
}

/** Clockwise quarter-turn transform of a point in room-local cell coordinates. */
export function rotatePoint(x, y, room, turns) {
  const t = ((turns % 4) + 4) % 4;
  if (t === 1) return {x: room.rows - y, y: x};
  if (t === 2) return {x: room.cols - x, y: room.rows - y};
  if (t === 3) return {x: y, y: room.cols - x};
  return {x, y};
}

export function transformRect(rect, room, turns, offsetX=0, offsetY=0) {
  const corners = [
    [rect.x, rect.y], [rect.x+rect.w, rect.y],
    [rect.x, rect.y+rect.h], [rect.x+rect.w, rect.y+rect.h]
  ].map(([x,y]) => rotatePoint(x,y,room,turns));
  const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return {x: minX+offsetX, y: minY+offsetY, w:Math.max(...xs)-minX, h:Math.max(...ys)-minY};
}

/** Sub-cell door centers; existing {side,index} doors stay valid. */
export const doorCenter = d => d.offset === undefined || d.offset === null ? Number(d.index)+.5 : Number(d.offset);
export const doorWidth = d => Math.min(2,Math.max(.25,Number(d.width)||1));
const roundCoord = n => Math.round(n * 1e6) / 1e6;
export function doorPoint(room,door){
  const t=doorCenter(door);
  switch(door.side){
    case "N":return {x:t,y:0};
    case "S":return {x:t,y:room.rows};
    case "E":return {x:room.cols,y:t};
    case "W":return {x:0,y:t};
    default:throw Error("Неверная сторона двери");
  }
}
export function rotatedDoors(room,turns){
  const size=rotatedSize(room,turns);
  return (room.doors||[]).map((door,i)=>{
    const pt=doorPoint(room,door);
    const p=rotatePoint(pt.x,pt.y,room,turns);
    const side=SIDES[(SIDES.indexOf(door.side)+turns)%4];
    const max=(side==="N"||side==="S")?size.cols:size.rows;
    const offset=roundCoord(side==="N"||side==="S"?p.x:p.y);
    const width=doorWidth(door);
    if(offset-width/2 < -1e-5 || offset+width/2>max+1e-5)throw Error("Дверь за пределами комнаты");
    return {side,index:Math.floor(offset),offset,width,
      kind:door.kind==="passage"?"passage":"door",originalIndex:i};
  });
}
function placedDoorPoint(p,door){
  const t=doorCenter(door);
  return {x:roundCoord(p.x+(door.side==="W"?0:door.side==="E"?p.cols:t)),
    y:roundCoord(p.y+(door.side==="N"?0:door.side==="S"?p.rows:t))};
}
function intersect(a,b) {
  return Math.min(a.x+a.cols,b.x+b.cols)-Math.max(a.x,b.x)>1e-6 &&
    Math.min(a.y+a.rows,b.y+b.rows)-Math.max(a.y,b.y)>1e-6;
}
function newPlacement(room, rotation, x=0, y=0) {
  const sz = rotatedSize(room, rotation);
  return {room, rotation, x, y, cols:sz.cols, rows:sz.rows, doors:rotatedDoors(room, rotation)};
}
const doorKey = (i, d) => `${i}:${d}`;

/**
 * Randomly build a connected network of rooms using aligned door centers.
 * Rooms may be reused, rotated in 90-degree increments, and have variable sizes.
 * All placements and door connections are integer-grid aligned.
 */
export function buildLayout(rooms, wanted, rng=Math.random, options={}) {
  const valid = rooms.filter(r => r.cols >= 2 && r.rows >= 2 && r.doors?.length);
  if (!valid.length) throw Error("Для генерации нужна хотя бы одна размеченная комната с дверью.");
  const entrance=valid.filter(r=>r.roomType==="entrance");
  const branching=valid.filter(r=>r.doors.length>=2 && r.roomType!=="boss");
  const candidates=valid.filter(r=>r.roomType!=="boss");
  const first = choose(entrance.length ? entrance : (branching.length ? branching : (candidates.length?candidates:valid)), rng);
  const placements = [newPlacement(first,randInt(4,rng))];
  let tries=0;
  // Growth is bounded; unsuccessful frontier doors are skipped, never retried forever.
  while (placements.length < wanted && tries++ < wanted * 100) {
    const frontier = shuffle(placements.flatMap((p,i) => p.doors.map((d,j) => ({p,i,j,d}))),rng);
    let found = null;
    for (const entry of frontier) {
      const point=placedDoorPoint(entry.p,entry.d);
      // Openings already connected to another room are not growth candidates.
      if (placements.some((other,k)=>k!==entry.i && other.doors.some(od=>{
        const op=placedDoorPoint(other,od);
        return Math.abs(op.x-point.x)<1e-5 && Math.abs(op.y-point.y)<1e-5 && od.side===opposite(entry.d.side) && Math.abs(doorWidth(od)-doorWidth(entry.d))<1e-5;
      }))) continue;
      const regular=valid.filter(r=>!["entrance","boss"].includes(r.roomType));
      const bossRooms=valid.filter(r=>r.roomType==="boss");
      const isLast=placements.length===wanted-1;
      const ordered=isLast && options.boss && bossRooms.length
        ? [...shuffle(bossRooms,rng),...shuffle(regular,rng)]
        : (regular.length ? shuffle(regular,rng) : shuffle(valid,rng));
      for (const room of ordered) {
        for (const turns of shuffle([0,1,2,3],rng)) {
          const rotated=rotatedDoors(room,turns);
          for (const d of shuffle(rotated.filter(d => d.side === opposite(entry.d.side) && Math.abs(doorWidth(d)-doorWidth(entry.d))<1e-5),rng)) {
            const s=rotatedSize(room,turns);
            const local=placedDoorPoint({x:0,y:0,cols:s.cols,rows:s.rows},d);
            const candidate=newPlacement(room,turns,roundCoord(point.x-local.x),roundCoord(point.y-local.y));
            if (placements.every(p=>!intersect(candidate,p))) { found=candidate; break; }
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) break;
    placements.push(found);
  }
  // Make all coordinates positive and add a two-cell gutter around the floor.
  const xmin=Math.min(...placements.map(p=>p.x)), ymin=Math.min(...placements.map(p=>p.y));
  const xmax=Math.max(...placements.map(p=>p.x+p.cols)), ymax=Math.max(...placements.map(p=>p.y+p.rows));
  for(const p of placements) {p.x += 2-xmin; p.y += 2-ymin;}
  const byCoordinate=new Map();
  const connections=[];
  const used=new Set();
  for(const [i,p] of placements.entries()) for(const [j,d] of p.doors.entries()) {
    const point=placedDoorPoint(p,d);
    const key=`${roundCoord(point.x)},${roundCoord(point.y)}`;
    const others=byCoordinate.get(key) || [];
    for(const other of others) {
      if (other.d.side !== opposite(d.side) || Math.abs(doorWidth(other.d)-doorWidth(d))>1e-5 || used.has(doorKey(i,j)) || used.has(doorKey(other.i,other.j))) continue;
      used.add(doorKey(i,j)); used.add(doorKey(other.i,other.j));
      connections.push({a:{room:i,door:j},b:{room:other.i,door:other.j},
        kind:d.kind==="passage" && other.d.kind==="passage" ? "passage":"door"});
      break;
    }
    others.push({i,j,d}); byCoordinate.set(key,others);
  }
  return {placements, connections, cols:xmax-xmin+4,rows:ymax-ymin+4,requested:wanted};
}

function pointKey(c) {
  const a=`${roundCoord(c[0])},${roundCoord(c[1])}`,b=`${roundCoord(c[2])},${roundCoord(c[3])}`;
  return a<b ? `${a}|${b}`:`${b}|${a}`;
}
function sideSegment(p,side,a,b){
  const x=p.x,y=p.y;
  if(side==="N")return [x+a,y,x+b,y];
  if(side==="S")return [x+a,y+p.rows,x+b,y+p.rows];
  if(side==="W")return [x,y+a,x,y+b];
  return [x+p.cols,y+a,x+p.cols,y+b];
}
function scaleWall(c,g,extra={}) {
  return {c:c.map(n=>Math.round(n*g)),door:0,move:20,sight:20,light:20,sound:20,...extra};
}

/** Document-shaped geometry and spawn metadata. */
export function renderLayout(layout, grid, roles=[]) {
  const tiles=[],walls=new Map(),drawings=[],zones=[],blocked=[],roomRects=[],portals=[];
  const connected=new Map();
  for (const [index,link] of layout.connections.entries()) {
    const secret = roles[link.a.room]==="secret" || roles[link.b.room]==="secret";
    const val={kind:link.kind, index, rooms:[link.a.room,link.b.room], secret};
    connected.set(doorKey(link.a.room,link.a.door),val);
    connected.set(doorKey(link.b.room,link.b.door),val);
    const p=layout.placements[link.a.room], d=p.doors[link.a.door],pt=placedDoorPoint(p,d);
    portals.push({key:"gate:"+index,rooms:[link.a.room,link.b.room],
      x:pt.x*grid,y:pt.y*grid,width:doorWidth(d)*grid,
      orientation:d.side==="N"||d.side==="S"?"horizontal":"vertical",
      kind:link.kind,secret});

  }
  function insertWall(c, extra={}) {
    const key=pointKey(c), existing=walls.get(key);
    if (existing) {
      if(extra.door===1 || extra.door===2) walls.set(key,scaleWall(c,grid,extra));
      return;
    }
    walls.set(key,scaleWall(c,grid,extra));
  }
  for(const [roomIndex,p] of layout.placements.entries()) {
    const room=p.room, r=p.rotation;
    roomRects.push({index:roomIndex,type:roles[roomIndex]||"combat",name:room.name,x:p.x*grid,y:p.y*grid,w:p.cols*grid,h:p.rows*grid});
    const tileWidth=room.cols*grid, tileHeight=room.rows*grid;
    // Foundry rotates tiles about their centers; compensate the 90-degree bbox swap.
    const tileX=(p.x+(p.cols-room.cols)/2)*grid;
    const tileY=(p.y+(p.rows-room.rows)/2)*grid;
    tiles.push({x:tileX,y:tileY,width:tileWidth,height:tileHeight,rotation:r*90,
      texture:{src:room.image},locked:true,hidden:false,
      flags:{"moonlighter-floor-forge":{roomTemplate:room.id,roomNumber:roomIndex+1}}});
    // Real Foundry wall segments may start/end between grid lines.
    for(const side of SIDES) {
      const length=(side==="N"||side==="S")?p.cols:p.rows;
      const openings=p.doors.map((d,j)=>({...d,j})).filter(d=>d.side===side)
        .sort((a,b)=>doorCenter(a)-doorCenter(b));
      let cursor=0;
      for(const d of openings){
        const left=roundCoord(doorCenter(d)-doorWidth(d)/2);
        const right=roundCoord(doorCenter(d)+doorWidth(d)/2);
        if(left<cursor-1e-5)throw Error("Дверные проёмы пересекаются");
        if(left>cursor+1e-5 && room.autoPerimeterWalls!==false)insertWall(sideSegment(p,side,cursor,left));
        const link=connected.get(doorKey(roomIndex,d.j));
        if(!(link?.kind==="passage" && !link.secret)){
          const gate=link?{door:link.secret?2:1,ds:0,
            flags:{"moonlighter-floor-forge":{gateKey:"gate:"+link.index,gateRooms:link.rooms,secretGate:link.secret}}}:{};
          insertWall(sideSegment(p,side,left,right),gate);
        }
        cursor=right;
      }
      if(cursor<length-1e-5 && room.autoPerimeterWalls!==false)insertWall(sideSegment(p,side,cursor,length));
    }
    for(const w of room.walls || []) {
      const a=rotatePoint(w.x1,w.y1,room,r), b=rotatePoint(w.x2,w.y2,room,r);
      const seg=[p.x+a.x,p.y+a.y,p.x+b.x,p.y+b.y];
      if (seg[0]!==seg[2] || seg[1]!==seg[3]) insertWall(seg);
    }
    for(const [kind,collection] of [["cover",room.covers||[]],["pit",room.pits||[]]]) {
      for (const raw of collection) {
        const box=transformRect(raw,room,r,p.x,p.y);
        blocked.push({kind,x:box.x*grid,y:box.y*grid,w:box.w*grid,h:box.h*grid});
        drawings.push({x:box.x*grid,y:box.y*grid,shape:{type:"r",width:box.w*grid,height:box.h*grid},
          fillType:1,fillColor:kind==="pit"?"#0d1018":"#b1814d",fillAlpha:kind==="pit"?.55:.24,
          strokeWidth:2,strokeColor:kind==="pit"?"#a84646":"#f4c679",strokeAlpha:.8,
          hidden:true,locked:true,text:"",fontSize:Math.max(12,grid*.18),
          flags:{"moonlighter-floor-forge":{kind}}});
        if (kind==="cover") {
          // Low obstacle: movement blocked, limited sight, but cover bonuses are GM-adjudicated.
          const {x,y,w,h}=box;
          for(const seg of [[x,y,x+w,y],[x+w,y,x+w,y+h],[x+w,y+h,x,y+h],[x,y+h,x,y]])
            insertWall(seg,{move:20,sight:10,light:10,sound:10});
        }
      }
    }
    const ownZones=(room.zones||[]).map(z=>({kind:z.kind,...transformRect(z,room,r,p.x,p.y)}));
    const interior={x:p.x+Math.min(0.6,p.cols/5),y:p.y+Math.min(0.6,p.rows/5),
      w:p.cols-Math.min(1.2,p.cols*2/5),h:p.rows-Math.min(1.2,p.rows*2/5)};
    for(const kind of ["SPAWN","LOOT"]) {
      const chosen=ownZones.filter(z=>z.kind===kind);
      for(const z of chosen.length ? chosen:[{kind,...interior}]) zones.push({kind,roomIndex,x:z.x*grid,y:z.y*grid,width:z.w*grid,height:z.h*grid});
    }
    if(roomIndex===layout.placements.length-1) {
      const bossZones=ownZones.filter(z=>z.kind==="BOSS");
      for(const z of bossZones.length ? bossZones:[{kind:"BOSS",...interior}])
        zones.push({kind:"BOSS",roomIndex,x:z.x*grid,y:z.y*grid,width:z.w*grid,height:z.h*grid});
    }
    // Keep spawn positions off the door cells, including their neighboring space.
    for(const d of p.doors) {
      const point=placedDoorPoint(p,d);
      const radius=Math.max(.65,doorWidth(d)/2+.15);
      blocked.push({kind:"door-clearance",x:(point.x-radius)*grid,y:(point.y-radius)*grid,w:2*radius*grid,h:2*radius*grid});
    }
  }
  return {tiles,walls:[...walls.values()],drawings,zones,blocked,roomRects,portals,width:layout.cols*grid,height:layout.rows*grid};
}

export function normalizeRoom(scene) {
  const room=scene.getFlag("moonlighter-floor-forge","room");
  if (!room || !room.cols || !room.rows || !room.image) return null;
  return {id:scene.id, name:scene.name, ...room};
}
