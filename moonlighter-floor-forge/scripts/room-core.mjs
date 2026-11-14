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

/** Door index means a 1-cell span along the specified side. */
export function doorPoint(room, door) {
  switch (door.side) {
    case "N": return {x:door.index+0.5, y:0};
    case "S": return {x:door.index+0.5, y:room.rows};
    case "E": return {x:room.cols, y:door.index+0.5};
    case "W": return {x:0, y:door.index+0.5};
    default: throw Error("Неверная сторона двери");
  }
}
export function rotatedDoors(room, turns) {
  const size = rotatedSize(room, turns);
  return (room.doors || []).map((door, i) => {
    const pt = doorPoint(room, door);
    const p = rotatePoint(pt.x, pt.y, room, turns);
    const side = SIDES[(SIDES.indexOf(door.side) + turns) % 4];
    const index = Math.round((side === "N" || side === "S" ? p.x : p.y) - 0.5);
    const max = (side === "N" || side === "S") ? size.cols : size.rows;
    if (index < 0 || index >= max) throw Error("Дверь вне границы комнаты");
    return {side, index, kind:door.kind === "passage" ? "passage" : "door", originalIndex:i};
  });
}
function placedDoorPoint(p, door) {
  return {x:p.x+(door.side === "W" ? 0 : door.side === "E" ? p.cols : door.index+0.5),
    y:p.y+(door.side === "N" ? 0 : door.side === "S" ? p.rows : door.index+0.5)};
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
        return op.x===point.x && op.y===point.y && od.side===opposite(entry.d.side);
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
          for (const d of shuffle(rotated.filter(d => d.side === opposite(entry.d.side)),rng)) {
            const s=rotatedSize(room,turns);
            const local=placedDoorPoint({x:0,y:0,cols:s.cols,rows:s.rows},d);
            const candidate=newPlacement(room,turns,point.x-local.x,point.y-local.y);
            if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) continue;
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
    const key=`${point.x},${point.y}`;
    const others=byCoordinate.get(key) || [];
    for(const other of others) {
      if (other.d.side !== opposite(d.side) || used.has(doorKey(i,j)) || used.has(doorKey(other.i,other.j))) continue;
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
  const a=`${c[0]},${c[1]}`,b=`${c[2]},${c[3]}`;
  return a<b ? `${a}|${b}`:`${b}|${a}`;
}
function sideSegment(p,side,index) {
  const x=p.x,y=p.y;
  if (side==="N") return [x+index,y,x+index+1,y];
  if (side==="S") return [x+index,y+p.rows,x+index+1,y+p.rows];
  if (side==="W") return [x,y+index,x,y+index+1];
  return [x+p.cols,y+index,x+p.cols,y+index+1];
}
function scaleWall(c,g,extra={}) {
  return {c:c.map(n=>Math.round(n*g)),door:0,move:20,sight:20,light:20,sound:20,...extra};
}

/** Document-shaped geometry and spawn metadata. */
export function renderLayout(layout, grid, roles=[]) {
  const tiles=[],walls=new Map(),drawings=[],zones=[],blocked=[],roomRects=[];
  const connected=new Map();
  for (const [index,link] of layout.connections.entries()) {
    const secret = roles[link.a.room]==="secret" || roles[link.b.room]==="secret";
    const val={kind:link.kind, index, rooms:[link.a.room,link.b.room], secret};
    connected.set(doorKey(link.a.room,link.a.door),val);
    connected.set(doorKey(link.b.room,link.b.door),val);
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
    for(const side of SIDES) {
      const length=(side==="N" || side==="S") ? p.cols : p.rows;
      for (let i=0;i<length;i++) {
        const di=p.doors.findIndex(d=>d.side===side && d.index===i);
        if (di<0) {insertWall(sideSegment(p,side,i));continue;}
        const link=connected.get(doorKey(roomIndex,di));
        if (link?.kind==="passage" && !link.secret) continue;
        const gate=link ? {door:link.secret?2:1,ds:0,
          flags:{"moonlighter-floor-forge":{gateKey:`gate:${link.index}`,gateRooms:link.rooms,secretGate:link.secret}}} : {};
        insertWall(sideSegment(p,side,i),gate);
      }
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
          text:kind==="pit"?"ЯМА":"УКРЫТИЕ",fontSize:Math.max(12,grid*.18),
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
      blocked.push({kind:"door-clearance",x:(point.x-.65)*grid,y:(point.y-.65)*grid,w:1.3*grid,h:1.3*grid});
    }
  }
  return {tiles,walls:[...walls.values()],drawings,zones,blocked,roomRects,width:layout.cols*grid,height:layout.rows*grid};
}

export function normalizeRoom(scene) {
  const room=scene.getFlag("moonlighter-floor-forge","room");
  if (!room || !room.cols || !room.rows || !room.image) return null;
  return {id:scene.id, name:scene.name, ...room};
}
