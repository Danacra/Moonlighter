/** Golem Dungeon art QA scene: 1 or 2 curated hand-measured 12x8 rooms.
 * This is intentionally NOT a reusable procedural tileset. Players can test
 * portal travel, outer walls, four pillars and illustrated pit collisions.
 * The approved background image is uploaded separately with Foundry FilePicker.
 */
const MOD="moonlighter-floor-forge";
export const GOLEM_WIDTH=1200,GOLEM_HEIGHT=800,GOLEM_GRID=100,GOLEM_SPACING=400;
const POINTS={
  N:{x:600,y:164,side:"N"}, S:{x:600,y:647,side:"S"},
  W:{x:180,y:375,side:"W"}, E:{x:990,y:375,side:"E"}
};
const border=[
  [90,119,546,119],[654,119,1110,119],
  [90,689,546,689],[654,689,1110,689],
  [90,119,90,350],[90,455,90,689],
  [1110,119,1110,350],[1110,455,1110,689]
];
const box=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const holes=[
  [[714,161],[912,161],[912,212],[976,212],[976,296],[810,296],[810,247],[714,247]],
  [[245,437],[338,437],[338,516],[429,516],[429,630],[270,630],[270,575],[206,575],[206,486],[245,486]]
];
const solids=[
  box(180,103,96,143),box(486,259,50,96),box(664,258,52,98),
  box(486,415,50,99),box(666,413,52,102),box(557,323,95,95),
  box(938,355,58,103),box(132,573,72,76)
];
function line(p,shift,kind){
  return {c:[p[0]+shift,p[1],p[2]+shift,p[3]],
    move:20,sight:kind==="exterior"?20:0,light:kind==="exterior"?20:0,sound:0,door:0,
    flags:{[MOD]:{golemPrototype:true,kind}}};
}
function around(points,shift,kind){
  return points.map((pt,i)=>{
    const next=points[(i+1)%points.length];
    return line([pt[0],pt[1],next[0],next[1]],shift,kind);
  });
}
export function buildGolemShowcase(imagePath,{twoRooms=true}={}){
  if(typeof imagePath!=="string"||!imagePath.trim())
    throw new Error("Выбери изображение эталонной комнаты Golem Dungeon.");
  const shifts=twoRooms?[0,GOLEM_WIDTH+GOLEM_SPACING]:[0];
  const rooms=shifts.map((shift,index)=>({
    index,name:"Golem — зал "+(index+1),type:"entrance",
    x:shift+90,y:119,w:1020,h:570
  }));
  const tileDocs=[],wallDocs=[];
  for(let index=0;index<shifts.length;index++){
    const shift=shifts[index];
    tileDocs.push({x:shift,y:0,width:GOLEM_WIDTH,height:GOLEM_HEIGHT,
      texture:{src:imagePath},locked:true,hidden:false,sort:0,
      flags:{[MOD]:{golemPrototype:true,roomIndex:index,kind:"painted-art"}}});
    wallDocs.push(...border.map(p=>line(p,shift,"exterior")));
    for(const shape of holes)wallDocs.push(...around(shape,shift,"pit"));
    for(const shape of solids)wallDocs.push(...around(shape,shift,"cover"));
  }
  const portals=[];
  if(twoRooms){
    for(const [i,[aSide,bSide]] of [["E","W"],["W","E"],["N","S"],["S","N"]].entries()){
      const a=POINTS[aSide],b=POINTS[bSide];
      portals.push({
        key:"golem-demo:"+i,kind:"passage",secret:false,rooms:[0,1],
        a:{room:0,side:a.side,x:a.x,y:a.y,width:170},
        b:{room:1,side:b.side,x:GOLEM_WIDTH+GOLEM_SPACING+b.x,y:b.y,width:170}
      });
    }
  }
  const hazards=shifts.flatMap(shift=>holes.map(shape=>{
    const xs=shape.map(p=>p[0]),ys=shape.map(p=>p[1]);
    const minX=Math.min(...xs),minY=Math.min(...ys);
    return {kind:"pit",x:shift+minX,y:minY,
      w:Math.max(...xs)-minX,h:Math.max(...ys)-minY};
  }));
  return {
    width:shifts.length*GOLEM_WIDTH+(shifts.length-1)*GOLEM_SPACING,
    height:GOLEM_HEIGHT,gridSize:GOLEM_GRID,tileDocs,wallDocs,
    rooms,portals,hazards,initial:{x:600,y:400,scale:twoRooms?.7:.9}
  };
}
export async function createGolemShowcaseScene(imagePath,{name="Golem Dungeon — эталонная комната",twoRooms=true}={}){
  if(!game.user?.isGM)throw new Error("Демонстрацию может создать только ведущий.");
  const geo=buildGolemShowcase(imagePath,{twoRooms});
  const scene=await Scene.create({
    name,active:false,navigation:false,padding:0,
    width:geo.width,height:geo.height,backgroundColor:"#101621",
    grid:{type:1,size:geo.gridSize,distance:5,units:"ft",alpha:.08},
    initial:geo.initial,
    flags:{[MOD]:{generated:true,golemPrototype:true,createdAt:Date.now()}}
  });
  if(!scene)throw new Error("Foundry не смог создать эталонную сцену.");
  await scene.createEmbeddedDocuments("Tile",geo.tileDocs);
  await scene.createEmbeddedDocuments("Wall",geo.wallDocs);
  await scene.setFlag(MOD,"adventure",{
    rooms:geo.rooms,statuses:Object.fromEntries(geo.rooms.map(r=>[String(r.index),"cleared"])),
    portalMode:"procedural",portalTeleport:true,gridPortals:geo.portals,
    hazards:geo.hazards,chests:[],pendingSpawns:{},spawnOnEntry:false,autoLock:false,
    golemPrototype:true
  });
  await scene.setFlag(MOD,"golemArtQA",{
    imagePath,roomCount:geo.rooms.length,pairedPortals:geo.portals.length,
    note:"Изображение — цельная иллюстрация. Нарисованный на ней сундук пока не интерактивен."
  });
  return {scene,geo};
}
