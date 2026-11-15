/** Pure, testable helpers for free-placement portal editing. */
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const centerOf=d=>Number(d.offset??(Number(d.index)+.5));
export const widthOf=d=>clamp(Number(d.width)||1,.25,2);
export function closestSide(point,cols,rows){
  const candidates=[["N",point.y],["E",cols-point.x],["S",rows-point.y],["W",point.x]];
  candidates.sort((a,b)=>a[1]-b[1]);
  return candidates[0][0];
}
export function placeDoor(point,cols,rows,kind="door",width=1,free=true){
  const side=closestSide(point,cols,rows);
  const max=side==="N"||side==="S"?cols:rows;
  const w=clamp(Number(width)||1,.25,Math.min(2,max));
  const coord=side==="N"||side==="S"?point.x:point.y;
  const offset=clamp(free?Math.round(coord*100)/100:Math.floor(coord)+.5,w/2,max-w/2);
  return {side,index:Math.floor(offset),offset,width:w,kind:kind==="passage"?"passage":"door"};
}
export function overlaps(doors,candidate,except=-1){
  return doors.some((d,i)=>i!==except && d.side===candidate.side &&
    Math.abs(centerOf(d)-centerOf(candidate)) < (widthOf(d)+widthOf(candidate))/2-.0001);
}
export function hitDoor(doors,point,cols,rows,radius=.75){
  let best=-1, distance=Infinity;
  for(let i=0;i<doors.length;i++){
    const d=doors[i], t=centerOf(d);
    const handle=d.side==="N"?{x:t,y:.3}:d.side==="S"?{x:t,y:rows-.3}
      :d.side==="E"?{x:cols-.3,y:t}:{x:.3,y:t};
    const dist=Math.hypot(handle.x-point.x,handle.y-point.y);
    if(dist<radius&&dist<distance){distance=dist;best=i;}
  }
  return best;
}
