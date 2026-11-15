/**
 * Procedural Tiles v0.9.0
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
  if(["entrance","rest","sanctuary","treasure","secret","empty"].includes(room.type))return {pits:[],covers:[]};
  const pits=[],covers=[],wantPits=room.type==="hazard"?Math.max(2,Math.round(2+density/40)):Math.floor((rng()*3)*density/100),
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
  // The final room is the farthest reachable chamber, not a random neighbor.
  // Keep it last so older tests and scene indexing stay compatible.
  if(settings.boss && nodes.length>3){
    const adjacency=nodes.map(()=>[]);
    for(const e of edges){adjacency[e.a].push(e.b);adjacency[e.b].push(e.a);}
    const distance=nodes.map(()=>Infinity),queue=[0];distance[0]=0;
    for(let i=0;i<queue.length;i++)for(const n of adjacency[queue[i]])
      if(distance[n]===Infinity){distance[n]=distance[queue[i]]+1;queue.push(n);}
    const farthest=distance.reduce((best,d,i)=>d>distance[best]?i:best,0);
    const last=nodes.length-1;
    if(farthest!==last){
      [nodes[farthest],nodes[last]]=[nodes[last],nodes[farthest]];
      for(const e of edges){
        e.a=e.a===farthest?last:e.a===last?farthest:e.a;
        e.b=e.b===farthest?last:e.b===last?farthest:e.b;
      }
    }
  }
  const links=nodes.map(()=>({}));
  for(const e of edges){links[e.a][e.aSide]=e.b;links[e.b][e.bSide]=e.a;}
  // Guarantee a sanctuary immediately before the boss on the unique route.
  const mandatory=new Map([[0,"entrance"]]);
  if(settings.boss && nodes.length>2){
    const bossIndex=nodes.length-1;
    mandatory.set(bossIndex,"boss");
    const adjacency=nodes.map(()=>[]);
    for(const e of edges){adjacency[e.a].push(e.b);adjacency[e.b].push(e.a);}
    const prev=nodes.map(()=>-1),queue=[0],seen=new Set([0]);
    for(let i=0;i<queue.length;i++)for(const next of adjacency[queue[i]]){
      if(seen.has(next))continue;
      seen.add(next);prev[next]=queue[i];queue.push(next);
    }
    const path=[];for(let at=bossIndex;at!==-1;at=prev[at])path.push(at);
    if(path.length>=3)mandatory.set(path[1],"sanctuary");
    const middle=path[Math.min(path.length-2,Math.max(2,Math.floor(path.length/2)))];
    if(middle!==0&&!mandatory.has(middle))mandatory.set(middle,"miniboss");
    if(![...mandatory.values()].includes("miniboss")){
      const fallback=nodes.findIndex((_,i)=>i!==0&&!mandatory.has(i));
      if(fallback>=0)mandatory.set(fallback,"miniboss");
    }
  }
  const rooms=nodes.map((p,i)=>{
    const [w,h]=pick(floorChoices,rng);
    const degree=Object.keys(links[i]).length;
    const roll=rng();
    const role=mandatory.get(i) || (degree===1&&roll<Number(settings.secretChance||0)/100?"secret"
      :roll<.17?"treasure":roll<.30?"empty":roll<.45?"hazard":roll<.53?"rest":"combat");
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
    sort:flags.layer==="floor"?0:flags.role?10:flags.layer==="portal-glow"?20:
      flags.hazard==="pit"?25:flags.layer==="wall"?40:
      flags.layer==="wall-corner"?44:
      flags.layer==="portal"?50:flags.hazard==="cover"?55:30,
    locked:true,hidden:false,flags:{"moonlighter-floor-forge":{procedural:true,...flags}}});
  for(const room of plan.rooms){
    roomRects.push({index:room.index,type:room.type,name:room.name,
      x:room.x*grid,y:room.y*grid,w:room.w*grid,h:room.h*grid});
    // Four-cell repeating floor palettes, each designed for an exact 4x4 footprint.
    const floorSrc=room.type==="boss"||room.type==="miniboss"?"floor-boss.svg":
      room.type==="hazard"?"floor-hazard.svg":
      room.type==="treasure"?"floor-treasure.svg":
      room.type==="rest"||room.type==="sanctuary"?"floor-sanctuary.svg":"floor-stone.svg";
    for(let j=0;j<room.h;j+=4)for(let i=0;i<room.w;i+=4)
      tiles.push(tile(floorSrc,room.x+i,room.y+j,4,4,
        {roomIndex:room.index,layer:"floor"}));
    // Ground markers visibly distinguish the first room and boss destination.
    if(room.type==="entrance"){
      tiles.push(tile("entrance-rune.svg",room.x+room.w/2-1.5,
        room.y+room.h/2-1.5,3,3,{roomIndex:room.index,role:"entrance"}));
    }
    if(room.type==="boss"){
      tiles.push(tile("boss-rune.svg",room.x+room.w/2-1.5,
        room.y+room.h/2-1.5,3,3,{roomIndex:room.index,role:"boss"}));
    }
    if(room.type==="miniboss"){
      tiles.push(tile("miniboss-rune.svg",room.x+room.w/2-1.5,
        room.y+room.h/2-1.5,3,3,{roomIndex:room.index,role:"miniboss"}));
    }
    if(room.type==="sanctuary"){
      tiles.push(tile("fountain.svg",room.x+room.w/2-1.5,
        room.y+room.h/2-1.5,3,3,{roomIndex:room.index,role:"sanctuary",layer:"decor"}));
    }

    for(const side of SIDES){
      const n=(side==="N"||side==="S")?room.w:room.h;
      const edge=room.links[side]!==undefined;
      const center=n/2,half=1,stops=edge?[[0,center-half],[center+half,n]]:[[0,n]];
      for(const [start,end] of stops){
        if(end<=start)continue;
        drawWall(sideCoords(room,side,start,end));
        // Critical: NEVER stretch a single wall texture across a variable-width
        // wall run. Render exactly one 100px art segment per grid cell.
        const horizontal=side==="N"||side==="S";
        for(let k=start;k<end;k++){
          tiles.push(tile(horizontal?"wall-horizontal.svg":"wall-vertical.svg",
            horizontal?room.x+k:room.x+(side==="W"?-.275:room.w-.275),
            horizontal?room.y+(side==="N"?-.275:room.h-.275):room.y+k,
            horizontal?1:.55,horizontal?.55:1,
            {roomIndex:room.index,layer:"wall",wallSide:side,wallCell:k}));
        }
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
    // Purposeful room sets: no repeated random vase spam. Use distinct
    // furnishing vocabularies with protected paths and tactical clearances.
    const decorThemes={
      entrance:["brazier.svg","banner.svg","moss.svg"],
      combat:["brazier.svg","rubble.svg","crate.svg","moss.svg"],
      miniboss:["crystal.svg","banner.svg","altar.svg","rubble.svg"],
      boss:["crystal.svg","altar.svg","rune-carpet.svg","brazier.svg"],
      treasure:["crate.svg","books.svg","rune-carpet.svg","crystal.svg"],
      empty:["rubble.svg","moss.svg","books.svg"],
      hazard:["rubble.svg","fungus.svg","moss.svg"],
      rest:["books.svg","rune-carpet.svg","brazier.svg"],
      sanctuary:["crystal.svg","moss.svg","brazier.svg"],
      secret:["books.svg","crystal.svg","altar.svg"]
    };
    const vocabulary=decorThemes[room.type]||decorThemes.combat;
    const visualOnly=new Set(["moss.svg","rune-carpet.svg"]);
    const props=[];
    const decorCount=room.type==="empty"?2:room.type==="boss"?6:
      room.type==="treasure"||room.type==="sanctuary"?5:room.type==="hazard"?3:4;
    for(let j=0;j<decorCount;j++){
      let placed=false;
      for(let attempt=0;attempt<90&&!placed;attempt++){
        const x=room.x+1+Math.floor(rng()*Math.max(1,room.w-2));
        const y=room.y+1+Math.floor(rng()*Math.max(1,room.h-2));
        const centerDist=Math.hypot(x+.5-room.x-room.w/2,y+.5-room.y-room.h/2);
        const gateDist=Object.keys(room.links).some(side=>{
          const p=endpoint(room,side,1);
          return Math.hypot(x+.5-p.x,y+.5-p.y)<3.25;
        });
        if(centerDist<2.6||gateDist||
           props.some(p=>Math.hypot(p.x-x,p.y-y)<1.8))continue;
        const image=vocabulary[j%vocabulary.length];
        const narrow=image==="banner.svg"||image==="moss.svg"||image==="books.svg";
        const scale=narrow?.82:1;
        tiles.push(tile(image,x+(1-scale)/2,y+(1-scale)/2,scale,scale,
          {roomIndex:room.index,layer:"decor",decor:image}));
        if(!visualOnly.has(image))
          blocked.push({kind:"cover",x:x*grid,y:y*grid,w:grid,h:grid});
        props.push({x,y});
        placed=true;
      }
    }
    // Stone corners cover the seams where the two orthogonal wall runs meet.
    for(const corner of [[room.x,room.y],[room.x+room.w,room.y],
      [room.x,room.y+room.h],[room.x+room.w,room.y+room.h]])
      tiles.push(tile("corner-stone.svg",corner[0]-.375,corner[1]-.375,.75,.75,
        {roomIndex:room.index,layer:"wall-corner"}));
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
