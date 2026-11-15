/**
 * Grid Rooms runtime: transfer a player-owned token between isolated room slots.
 * Never transfers other party members and never changes the token's scene.
 */
import {roomOfToken} from "./adventure-core.mjs";
const ID="moonlighter-floor-forge";
const transit=new Set(), hold=new Map(), sync=new Set(), previousPositions=new Map();
const leader=()=>{
  if(!game.user?.isGM)return false;
  const gms=(game.users?.contents||[game.user]).filter(u=>u.isGM&&u.active!==false)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return game.user.id===(gms[0]?.id??game.user.id);
};
const point=(token,g)=>({x:Number(token.x)+(Number(token.width)||1)*g/2,
  y:Number(token.y)+(Number(token.height)||1)*g/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const isAdventurer=token=>Boolean(token.actor && !token.flags?.[ID]?.enemy &&
  (token.actor.hasPlayerOwner || (game.user?.isGM &&
    (token.actor.type==="character" || globalThis.canvas?.tokens?.controlled?.some(p=>p.document?.id===token.id)))));
function segmentDistance(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  if(!len)return dist(p,b);
  const u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len));
  return dist(p,{x:a.x+dx*u,y:a.y+dy*u});
}
const intersect=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const nearWall=(land,walls)=>{
  const p={x:land.x+land.w/2,y:land.y+land.h/2};
  const clearance=Math.min(land.w,land.h)*.48;
  return walls.some(w=>{
    if(!Array.isArray(w.c)||w.c.length!==4||Number(w.move||0)===0)return false;
    if(w.door===1 && w.ds===1)return false;
    const [ax,ay,bx,by]=w.c,dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
    if(!len)return false;
    const t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.y-ay)*dy)/len));
    return Math.hypot(p.x-ax-t*dx,p.y-ay-t*dy)<clearance;
  });
};

export function landingSpot(endpoint,room,g,w=1,h=1){
  const halfW=Number(w)*g/2,halfH=Number(h)*g/2;
  const offset=.9*g,limit=(v,a,b)=>Math.max(a,Math.min(b,v));
  let centerX=endpoint.x,centerY=endpoint.y;
  switch(endpoint.side){
    case "N":centerY+=halfH+offset;break;
    case "S":centerY-=halfH+offset;break;
    case "W":centerX+=halfW+offset;break;
    case "E":centerX-=halfW+offset;break;
    default:return null;
  }
  const loX=room.x+halfW+.2*g,hiX=room.x+room.w-halfW-.2*g;
  const loY=room.y+halfH+.2*g,hiY=room.y+room.h-halfH-.2*g;
  if(loX>hiX||loY>hiY)return null;
  centerX=limit(centerX,loX,hiX);centerY=limit(centerY,loY,hiY);
  return {x:Math.round((centerX-halfW)*100)/100,
    y:Math.round((centerY-halfH)*100)/100,w:Number(w)*g,h:Number(h)*g};
}
export function approach(endpoint,center,g){
  const along=endpoint.side==="N"||endpoint.side==="S"?Math.abs(center.x-endpoint.x):Math.abs(center.y-endpoint.y);
  const across=endpoint.side==="N"||endpoint.side==="S"?Math.abs(center.y-endpoint.y):Math.abs(center.x-endpoint.x);
  return along<endpoint.width/2+g*.45&&across<=g*1.75;
}
export function gateOpen(portal,endpoint,walls){
  if(portal.kind==="passage"&&!portal.secret)return true;
  // Secret gates are traversable after RevealSecret turns their Foundry wall into an open door.
  return walls.some(w=>w.flags?.[ID]?.gateKey===portal.key &&
    Number(w.door)===1&&Number(w.ds)===1&&Array.isArray(w.c)&&
    (endpoint.side==="N"||endpoint.side==="S"
      ? Math.abs((w.c[1]+w.c[3])/2-endpoint.y)<3
      : Math.abs((w.c[0]+w.c[2])/2-endpoint.x)<3));
}
/** Procedural portals are independent of Foundry door-wall controls.
 * In combat rooms all exits lock until the encounter is cleared.
 */
export function proceduralPortalOpen(adventure,portal,from){
  const room=(adventure.rooms||[]).find(q=>q.index===from);
  if(!room)return false;
  if(portal.secret && !(adventure.revealed||[]).some(index=>
    portal.rooms.includes(index) && adventure.rooms.find(r=>r.index===index)?.type==="secret"))return false;
  const status=adventure.statuses?.[String(from)]||"ready";
  if((room.type==="combat"||room.type==="boss")&&status!=="cleared")return false;
  return true;
}
export function findTeleport(adventure,scene,token,g,previous=null){
  const rooms=adventure.rooms||[],gridPortals=adventure.gridPortals||[];
  const from=(previous?roomOfToken(rooms,previous,g):null)??roomOfToken(rooms,token,g);
  if(from===null)return null;
  const current=point(token,g);
  const oldCenter=previous?point(previous,g):null;
  for(const portal of gridPortals){
    let src,dst,to;
    if(portal.a.room===from){src=portal.a;dst=portal.b;to=portal.b.room;}
    else if(portal.b.room===from){src=portal.b;dst=portal.a;to=portal.a.room;}
    else continue;
    // A token can cross the open doorway in a single drag. Its post-move centre
    // may then be outside BOTH rooms. Test the whole movement segment.
    const swept=oldCenter && segmentDistance({x:src.x,y:src.y},oldCenter,current) <= g*1.55;
    if(!approach(src,current,g)&&!swept)continue;
    const enabled=adventure.portalMode==="procedural"
      ?proceduralPortalOpen(adventure,portal,from)
      :gateOpen(portal,src,scene.walls?.contents||[]);
    if(!enabled)continue;
    const room=rooms.find(r=>r.index===to);
    if(!room)continue;
    const land=landingSpot(dst,room,g,Number(token.width)||1,Number(token.height)||1);
    if(!land)continue;
    const occupied=(scene.tokens?.contents||[]).some(other=>other.id!==token.id&&
      intersect(land,{x:Number(other.x),y:Number(other.y),
        w:Number(other.width||1)*g,h:Number(other.height||1)*g}));
    if(occupied)continue;
    const hazardous=(adventure.hazards||[]).some(rect=>intersect(land,rect));
    if(hazardous)continue;
    if(nearWall(land,scene.walls?.contents||[]))continue;
    return {portal,src,dst,land,from,to};
  }
  return null;
}
async function moved(token,change){
  if(!leader()||(!("x" in change)&&!("y" in change)))return;
  if(token.hidden||!isAdventurer(token))return;
  const scene=token.parent,adventure=scene?.getFlag?.(ID,"adventure");
  if(!adventure?.gridPortals?.length||adventure.portalTeleport===false)return;
  const g=Number(scene.grid?.size||100);
  const id=scene.id+":"+token.id;
  if(transit.has(id))return;
  const h=hold.get(id);
  if(h){
    const ep=h.endpoint;
    if(dist(point(token,g),ep)<g*2.6)return;
    hold.delete(id);
  }
  const found=findTeleport(adventure,scene,token,g,previousPositions.get(id));
  previousPositions.delete(id);
  if(!found)return;
  transit.add(id);
  hold.set(id,{key:found.portal.key,endpoint:found.dst});
  try{
    await token.update({x:found.land.x,y:found.land.y},{animate:false});
  }catch(error){
    hold.delete(id);throw error;
  }finally{transit.delete(id);}
}
async function syncTwinDoor(wall,change){
  if(!leader()||!Object.hasOwn(change,"ds"))return;
  const scene=wall.parent,flag=wall.flags?.[ID],key=flag?.gateKey;
  if(!scene?.getFlag?.(ID,"adventure")?.gridPortals?.length||!key||sync.has(scene.id+":"+key))return;
  const peers=(scene.walls?.contents||[]).filter(w=>w.id!==wall.id&&w.flags?.[ID]?.gateKey===key &&
    w.door===1&&w.ds!==wall.ds);
  if(!peers.length)return;
  const id=scene.id+":"+key;sync.add(id);
  try{await scene.updateEmbeddedDocuments("Wall",peers.map(p=>({_id:p.id,ds:wall.ds})));}
  finally{sync.delete(id);}
}
export function registerGridPortalHooks(){
  Hooks.on("preUpdateToken",(token,change)=>{
    if(!leader()||(!("x" in change)&&!("y" in change)))return;
    previousPositions.set(token.parent.id+":"+token.id,{
      x:Number(token.x),y:Number(token.y),width:Number(token.width||1),height:Number(token.height||1)
    });
  });
  Hooks.on("updateToken",(token,change)=>{void moved(token,change).catch(e=>console.error("[Moonlighter grid-portal]",e));});
  Hooks.on("updateWall",(wall,change)=>{void syncTwinDoor(wall,change).catch(e=>console.error("[Moonlighter twin-door]",e));});
}
