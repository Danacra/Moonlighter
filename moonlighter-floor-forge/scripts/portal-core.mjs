/** Safe, Foundry-independent portal geometry for procedurally assembled rooms. */
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function portalPoint(p,side,index,width=1){
  const c=Number(index);
  return {x:p.x+(side==="W"?0:side==="E"?p.cols:c),
    y:p.y+(side==="N"?0:side==="S"?p.rows:c)};
}
export function isOpenPortal(portal,walls=[]){
  if(portal.kind==="passage"&&!portal.secret)return true;
  const w=walls.find(x=>x.flags?.["moonlighter-floor-forge"]?.gateKey===portal.key);
  return Boolean(w && w.door===1 && w.ds===1);
}
export function teleportDestination(portal,from,rooms,center,g,tokenWidth=1,tokenHeight=1){
  if(!portal?.rooms?.includes(from))return null;
  const src=rooms.find(r=>r.index===from);
  const to=rooms.find(r=>r.index===portal.rooms.find(x=>x!==from));
  if(!src||!to)return null;
  const horizontal=portal.orientation==="horizontal";
  const footW=Math.max(.5,Number(tokenWidth)||1)*g;
  const footH=Math.max(.5,Number(tokenHeight)||1)*g;
  const halfW=footW/2,halfH=footH/2;
  // Collision proximity: require that the token approaches the correct side.
  const perp=horizontal?Math.abs(center.y-portal.y):Math.abs(center.x-portal.x);
  const along=horizontal?Math.abs(center.x-portal.x):Math.abs(center.y-portal.y);
  if(perp>g*1.65 || along>portal.width/2+g*.4)return null;
  const srcCenter=horizontal?src.y+src.h/2:src.x+src.w/2;
  const dstCenter=horizontal?to.y+to.h/2:to.x+to.w/2;
  const boundary=horizontal?portal.y:portal.x;
  const direction=dstCenter>boundary?1:-1;
  const pad=g*.65;
  let x,y;
  if(horizontal){
    const lower=to.x+halfW+g*.15,upper=to.x+to.w-halfW-g*.15;
    if(upper<lower)return null;
    x=Math.max(lower,Math.min(upper,portal.x));
    y=boundary+direction*(halfH+pad);
  }else{
    const lower=to.y+halfH+g*.15,upper=to.y+to.h-halfH-g*.15;
    if(upper<lower)return null;
    y=Math.max(lower,Math.min(upper,portal.y));
    x=boundary+direction*(halfW+pad);
  }
  if(x-halfW<to.x||x+halfW>to.x+to.w||y-halfH<to.y||y+halfH>to.y+to.h)return null;
  return {x:Math.round((x-halfW)*100)/100,y:Math.round((y-halfH)*100)/100,room:to.index};
}
