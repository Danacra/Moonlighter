/**
 * Procedural Tiles v0.8.0
 * Self-contained room graph + Foundry-friendly document geometry.
 * Coordinates are ALWAYS integral grid cells; no image-room transforms.
 * All sprites are original module-local graphics.
 */
export const ASSET_ROOT="modules/moonlighter-floor-forge/assets/";
const CELL_DIRECTIONS={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
const OPP={N:"S",E:"W",S:"N",W:"E"};
const SIDES=["N","E","S","W"];
const floorChoices=[[12,8],[12,12],[16,8],[16,12]];
const nClamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,Number(n)||lo));
const pick=(xs,r)=>xs[Math.min(xs.length-1,Math.floor(r()*xs.length))];
const key=(a,b)=>a+","+b;
function rectOverlap(a,b,pad=0) {
  return a.x < b.x+b.w+pad && a.x+a.w+pad>b.x &&
    a.y < b.y+b.h+pad && a.y+a.h+pad>b.y;
}
const rectToPixels=(rect,g)=>({x:rect.x*g,y:rect.y*g,w:rect.w*g,h:rect.h*g});
const wall=(c,g)=>({c:c.map(v=>Math.round(v*g)),move:20,sight:20,light:20,sound:20,door:0});
function sideCoords(room,side,start,end){
  const x=room.x,y=room.y,w=room.w,h=room.h;
  if(side==="N")return [x+start,y,x+end,y];
  if(side==="S")return [x+start,y+h,x+end,y+h];
  if(side==="W")return [x,y+start,x,y+end];
  return [x+w,y+start,x+w,y+end];
}
function endpoint(room,side,g){
  return {
    room:room.index,side,
    x:(room.x+(side==="W"?0:side==="E"?room.w:room.w/2))*g,
    y:(room.y+(side==="N"?0:side==="S"?room.h:room.h/2))*g,
    width:2*g
  };
}
function excludeRadius(p,portals){return portals.some(portal=>
  Math.hypot(p.x-(portal.x),p.y-portal.y)<2.5
);}
function obstacles(room,links,rng,density=35){
  if(["entrance","rest","treasure","secret"].includes(room.type))return {pits:[],covers:[]};
  const pits=[],covers=[],wantPits=Math.floor((rng()*3)*density/100),
    wantCovers=Math.floor((rng()*4)*density/100);
  const entries=Object.keys(links).filter(s=>links[s]!==undefined).map(side=>{
    const at=endpoint(room,side,1);return {x:at.x,y:at.y};
  });
  const taken=[];
  function place(w,h) {
    for(let i=0;i<70;i++){
      const x=room.x+3+Math.floor(rng()*(room.w-w-5));
      const y=room.y+3+Math.floor(rng()*(room.h-h-5));
      const v={x,y,w,h};
      if(taken.some(t=>rectOverlap(t,v,1)))continue;
      if(entries.some(t=>Math.abs(x+w/2-t.x)<2.5&&Math.abs(y+h/2-t.y)<2.5))continue;
      taken.push(v);return v;
    }
    return null;
  }
  for(let i=0;i<wantPits;i++){const p=place(2,2);if(p)pits.push(p);}
  for(let i=0;i<wantCovers;i++){const p=place(1,1);if(p)covers.push(p);}
  return {pits,covers};
}
/** Connected tree of distinct square slots with exactly two opposing door endpoints per edge. */
export function buildProceduralPlan(settings={},rng=Math.random){
  const slots=Math.floor(nClamp(settings.gridCols??4,3,8));
  const wanted=Math.floor(nClamp(settings.roomCount??12,2,Math.min(35,slots*slots)));
  const gap=Math.floor(nClamp(settings.roomGap??4,2,10));
  const slotSize=18+gap; // all positions remain integral, rooms 12/16 × 8/12
  const pad=2,coord=new Map(),nodes=[],edges=[];
  const first={cellX:Math.floor((slots-1)/2),cellY:Math.floor((slots-1)/2)};
  nodes.push(first);coord.set(key(first.cellX,first.cellY),0);
  for(let i=1;i<wanted;i++){
    const frontier=[];
    for(let a=0;a<nodes.length;a++){
      const p=nodes[a];
      for(const [side,[dx,dy]] of Object.entries(CELL_DIRECTIONS)){
        const x=p.cellX+dx,y=p.cellY+dy;
        if(x<0||y<0||x>=slots||y>=slots||coord.has(key(x,y)))continue;
        frontier.push({from:a,side,x,y});
      }
    }
    if(!frontier.length)throw Error("Не удалось построить связный этаж");
    const choice=pick(frontier,rng),index=nodes.length;
    nodes.push({cellX:choice.x,cellY:choice.y});
    coord.set(key(choice.x,choice.y),index);
    edges.push({a:choice.from,b:index,aSide:choice.side,bSide:OPP[choice.side]});
  }
  const links=nodes.map(()=>({}));
  for(const e of edges){links[e.a][e.aSide]=e.b;links[e.b][e.bSide]=e.a;}
  const rooms=nodes.map((p,i)=>{
    const [w,h]=pick(floorChoices,rng);
    const type=i===0?"entrance":i===nodes.length-1&&settings.boss?"boss":null;
    const degree=Object.keys(links[i]).length;
    const r=rng();
    const role=type || (degree===1&&r<Number(settings.secretChance||0)/100?"secret"
      :r<.14?"treasure":r<.23?"rest":"combat");
    return {index:i,name:"Комната "+(i+1),type:role,
      cellX:p.cellX,cellY:p.cellY,w,h,
      x:pad+p.cellX*slotSize+Math.floor((slotSize-w)/2),
      y:pad+p.cellY*slotSize+Math.floor((slotSize-h)/2),
      links:links[i]};
  });
  const width=slots*slotSize+pad*2,height=width;
  return {rooms,edges,slots,gap,slotSize,width,height,requested:wanted};
}
/** Creates economical scene documents: each room has 4x4 stone tiles and 4 wall strokes. */
export function renderProceduralPlan(plan,grid=100,settings={},rng=Math.random){
  const tiles=[],walls=[],blocked=[],zones=[],portals=[],roomRects=[];
  const wallSegments=new Set();
  const drawWall=coords=>{
    const c=coords.map(v=>Math.round(v*grid));
    const signature=c[0]+","+c[1]+","+c[2]+","+c[3];
    if(!wallSegments.has(signature)){wallSegments.add(signature);walls.push(wall(coords,grid));}
  };
  const tile=(src,x,y,w,h,flags={})=>({x:Math.round(x*grid),y:Math.round(y*grid),
    width:Math.round(w*grid),height:Math.round(h*grid),texture:{src:ASSET_ROOT+src},
    locked:true,hidden:false,flags:{"moonlighter-floor-forge":{procedural:true,...flags}}});
  for(const room of plan.rooms){
    roomRects.push({index:room.index,type:room.type,name:room.name,
      x:room.x*grid,y:room.y*grid,w:room.w*grid,h:room.h*grid});
    // Ground markers visibly distinguish the first room and boss destination.
    if(room.type==="entrance"){
      tiles.push(tile("entrance-rune.svg",room.x+room.w/2-1.5,
        room.y+room.h/2-1.5,3,3,{roomIndex:room.index,role:"entrance"}));
    }
    if(room.type==="boss"){
      tiles.push(tile("boss-rune.svg",room.x+room.w/2-1.5,
        room.y+room.h/2-1.5,3,3,{roomIndex:room.index,role:"boss"}));
    }
    // Each SVG is an original 4x4-cell repeating stone pattern.
    for(let j=0;j<room.h;j+=4)for(let i=0;i<room.w;i+=4)
      tiles.push(tile(room.type==="boss"?"floor-boss.svg":"floor-stone.svg",
        room.x+i,room.y+j,4,4,{roomIndex:room.index,layer:"floor"}));
    for(const side of SIDES){
      const n=(side==="N"||side==="S")?room.w:room.h;
      const edge=room.links[side]!==undefined;
      const center=n/2,half=1,stops=edge?[[0,center-half],[center+half,n]]:[[0,n]];
      for(const [start,end] of stops){
        if(end<=start)continue;
        drawWall(sideCoords(room,side,start,end));
        const horizontal=side==="N"||side==="S";
        tiles.push(tile(horizontal?"wall-horizontal.svg":"wall-vertical.svg",
          horizontal?room.x+start:room.x+(side==="W"?-.25:room.w-.25),
          horizontal?room.y+(side==="N"?-.25:room.h-.25):room.y+start,
          horizontal?end-start:.5,horizontal?.5:end-start,
          {roomIndex:room.index,layer:"wall"}));
      }
      if(edge){
        const hor=side==="N"||side==="S";
        // Put a bright two-cell portal sigil INSIDE the room, not over a wall.
        const ix=hor?room.x+center-1:side==="W"?room.x:room.x+room.w-2;
        const iy=hor?(side==="N"?room.y:room.y+room.h-2):room.y+center-1;
        tiles.push(tile("portal-glow.svg",ix,iy,2,2,
          {roomIndex:room.index,portalSide:side,layer:"portal-glow"}));
        tiles.push(tile(hor?"door-arch.svg":"door-arch-v.svg",
          hor?room.x+center-1:room.x+(side==="W"?-.45:room.w-.45),
          hor?room.y+(side==="N"?-.45:room.h-.45):room.y+center-1,
          hor?2:.9,hor?.9:2,{roomIndex:room.index,layer:"portal"}));
      }
    }
    const obs=obstacles(room,room.links,rng,settings.hazardDensity??35);
    for(const p of obs.pits){
      const shape=rectToPixels(p,grid);
      blocked.push({kind:"pit",x:shape.x,y:shape.y,w:shape.w,h:shape.h});
      tiles.push(tile("pit.svg",p.x,p.y,p.w,p.h,{roomIndex:room.index,hazard:"pit"}));
    }
    for(const p of obs.covers){
      const shape=rectToPixels(p,grid);
      blocked.push({kind:"cover",x:shape.x,y:shape.y,w:shape.w,h:shape.h});
      tiles.push(tile("pillar.svg",p.x,p.y,p.w,p.h,{roomIndex:room.index,hazard:"cover"}));
      const x=p.x,y=p.y,w=p.w,h=p.h;
      for(const c of [[x,y,x+w,y],[x+w,y,x+w,y+h],[x+w,y+h,x,y+h],[x,y+h,x,y]])
        drawWall(c);
    }
    const inner={x:(room.x+2)*grid,y:(room.y+2)*grid,
      width:(room.w-4)*grid,height:(room.h-4)*grid,roomIndex:room.index};
    for(const kind of ["SPAWN","LOOT","BOSS"])zones.push({kind,...inner});
    // Reserve the center of each doorway as a safe arrival/spawn region.
    for(const side of Object.keys(room.links)){
      const pt=endpoint(room,side,grid);
      blocked.push({kind:"door-clearance",x:pt.x-1.75*grid,y:pt.y-1.75*grid,
        w:3.5*grid,h:3.5*grid});
    }
  }
  for(const [i,e] of plan.edges.entries()){
    const a=plan.rooms[e.a],b=plan.rooms[e.b];
    portals.push({key:"proc:"+i,rooms:[e.a,e.b],
      a:endpoint(a,e.aSide,grid),b:endpoint(b,e.bSide,grid),
      kind:"passage",secret:a.type==="secret"||b.type==="secret"});
  }
  return {tiles,walls,blocked,zones,roomRects,gridPortals:portals,
    width:plan.width*grid,height:plan.height*grid,actualRooms:plan.rooms.length};
}
