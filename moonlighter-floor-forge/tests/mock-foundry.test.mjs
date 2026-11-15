/** Integration smoke test against a minimal mocked Foundry document API.
 * Not a substitute for a real Foundry v13 runtime test.
 */
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {buildLayout,renderLayout,normalizeRoom} from '../scripts/room-core.mjs';
import {buildGridLayout,gridPortals} from '../scripts/grid-core.mjs';
import {assignRoomTypes,safeItemData} from '../scripts/adventure-core.mjs';
const moduleFile=new URL('../scripts/main.js',import.meta.url);
const program=readFileSync(moduleFile,'utf8').replace(/^import .*\n/gm,'')+'\nglobalThis.mffTest={generate,generateExpedition,renderForm};\n';
let sceneId=0;
class FakeScene {
  constructor(data){Object.assign(this,data);this.id='scene-'+(++sceneId);this.flags??={};this.drawings={contents:[]};this.walls={contents:[]};this.grid={...(data.grid||{}),type:1};this.dimensions={sceneX:0,sceneY:0};this.embedded={};}
  getFlag(namespace,key){return this.flags[namespace]?.[key];}
  async setFlag(ns,key,value){(this.flags[ns]??={})[key]=value;return this;}
  async createEmbeddedDocuments(kind,data){this.embedded[kind]??=[];this.embedded[kind].push(...data);
    if(kind==='Wall') this.walls.contents.push(...data);
    return data;
  }
  async view(){this.viewed=true;}
  static async create(data){const s=new FakeScene(data);worldScenes.push(s);return s;}
}
const worldScenes=[
  {id:'template-1',name:'Room A',getFlag:(ns,key)=>ns==='moonlighter-floor-forge'&&key==='room'?{
    cols:7,rows:7,image:'assets/a.webp',doors:[{side:'N',index:3},{side:'E',index:3},{side:'S',index:3},{side:'W',index:3}],
    covers:[{x:2,y:2,w:1,h:1}],pits:[{x:5,y:2,w:1,h:1}],walls:[{x1:1,y1:1,x2:2,y2:1}],zones:[]}:undefined},
  {id:'template-2',name:'Room B',getFlag:(ns,key)=>ns==='moonlighter-floor-forge'&&key==='room'?{
    cols:8,rows:6,image:'assets/b.webp',doors:[{side:'E',index:2},{side:'N',index:3},{side:'S',index:4},{side:'W',index:2}],
    covers:[],pits:[],walls:[],zones:[]}:undefined}
];
const actor={id:'npc-1',type:'npc',name:'Goblin',folder:null,system:{details:{cr:1}},prototypeToken:{width:1,height:1},
  async getTokenDocument(p){return {toObject(){return {x:p.x,y:p.y,name:'Goblin',flags:{}};}};}};
const item={id:'item-1',uuid:'Item.item-1',name:'Coin',type:'loot',folder:null,system:{rarity:'common'}};
let journalId=0;
const context={
  normalizeRoom,buildLayout,renderLayout,buildGridLayout,gridPortals,assignRoomTypes,safeItemData,openDirector(){},registerAdventureHooks(){},
  isItemPilesAvailable(){return false;},resolveLootMode(){return 'legacy';},createChestPile(){throw Error('Not expected');},
  Scene:FakeScene,Math,Array,Object,Promise,Number,String,Set,Map,Date,
  game:{user:{isGM:true},system:{id:'dnd5e'},scenes:{contents:worldScenes,get:id=>worldScenes.find(x=>x.id===id)},
    actors:{contents:[actor],get:id=>id===actor.id?actor:null},items:{contents:[item]},folders:{contents:[]}},
  JournalEntry:{async create(data){return {id:'journal-'+(++journalId),pages:{contents:data.pages.map((p,i)=>({id:`p-${i}`}))}};}},
  Hooks:{on(){},once(){}},foundry:{utils:{randomID:()=>"expedition-test"},applications:{api:{DialogV2:class {}}}},
  ui:{notifications:{info(){},warn(){},error(){}}},console,
  FormData:class {},Image:class {},openRoomLibrary(){}
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(program,context);
const cfg={name:'Test floor',mode:'rooms',roomCount:12,sourceId:'',image:'',gridSize:100,
 enemyCount:5,enemyFolder:'',eliteChance:20,maxCR:3,bossId:'npc-1',
 lootCount:3,lootFolder:'',itemsPerStash:2,quality:0};
const out=await context.mffTest.generate(cfg);
assert.ok(out.scene.viewed);
assert.equal(out.actualRooms,12);
assert.equal(out.scene.embedded.Tile.length,15);
assert.ok(out.scene.embedded.Wall.length>20);
assert.ok(out.scene.embedded.Drawing.length>0);
assert.equal(out.scene.embedded.Token.length,6);
assert.equal(out.scene.embedded.Note.length,3);
assert.equal(out.summary.enemies,5);
assert.equal(out.summary.loot,3);
assert.equal(out.summary.boss,true);
assert.equal(out.scene.embedded.Wall.filter(w=>w.door===1).length,out.scene.getFlag('moonlighter-floor-forge','layout').connectedDoors);
const adventure=out.scene.getFlag('moonlighter-floor-forge','adventure');
assert.equal(adventure.rooms.length,12);
assert.equal(adventure.chests.length,3);
assert.equal(adventure.rooms[0].type,'entrance');
assert.equal(adventure.rooms.at(-1).type,'boss');
assert.match(context.mffTest.renderForm(),/Количество комнат/);
assert.match(context.mffTest.renderForm(),/Собрать из комнат/);
// Simulate the optional Item Piles route: no Notes/Tiles should duplicate a real pile.
context.isItemPilesAvailable=()=>true;
context.resolveLootMode=()=>"item-piles";
let pilesCreated=0;
context.createChestPile=async (scene,{chestId,label,items,roomIndex,pos})=>{
  assert.ok(items.length>0);assert.ok(Number.isFinite(pos.x));
  pilesCreated++;
  return {tokenId:`ip-${pilesCreated}`,tokenUuid:`Scene.${scene.id}.Token.ip-${pilesCreated}`};
};
const withPiles=await context.mffTest.generate({...cfg,name:'Item Piles floor',lootMode:'item-piles'});
assert.equal(withPiles.summary.itemPiles,3);
assert.equal(withPiles.summary.fallbackStashes,0);
assert.equal(withPiles.scene.embedded.Note,undefined);
assert.equal(withPiles.scene.embedded.Tile.length,12); // 12 room images, no chest icons
assert.equal(withPiles.scene.getFlag('moonlighter-floor-forge','adventure').chests[0].mode,'item-piles');
assert.equal(withPiles.scene.getFlag('moonlighter-floor-forge','adventure').chests[0].items.length,0);
assert.match(context.mffTest.renderForm(),/Item Piles/);
// Restore legacy for previously tested multi-floor route.
context.resolveLootMode=()=>"legacy";
const multi=await context.mffTest.generateExpedition({...cfg,name:'Expedition',floorCount:3});
assert.equal(multi.floors,3);
assert.ok(multi.created[0].scene.viewed);
assert.equal(multi.created[0].scene.getFlag('moonlighter-floor-forge','adventure').nextSceneId,multi.created[1].scene.id);
assert.equal(multi.created[2].scene.getFlag('moonlighter-floor-forge','adventure').previousSceneId,multi.created[1].scene.id);
assert.equal(multi.created[0].scene.getFlag('moonlighter-floor-forge','adventure').rooms.at(-1).type === 'boss',false);
assert.equal(multi.created[2].scene.getFlag('moonlighter-floor-forge','adventure').rooms.at(-1).type,'boss');
console.log('PASS: 0.4 legacy fallback, scenes, floors, NPCs, journal and flags (mock)');

const gridConfig={...cfg,mode:"grid",gridCols:4,roomGap:3,roomCount:12,floorCount:1};
const gridFloor=await context.mffTest.generate(gridConfig);
assert.equal(gridFloor.actualRooms,12);
assert.equal(gridFloor.scene.width,gridFloor.scene.height);
assert.equal(gridFloor.scene.embedded.Tile.filter(t=>t.flags?.["moonlighter-floor-forge"]?.roomTemplate).length,12);
const flags=gridFloor.scene.getFlag("moonlighter-floor-forge","adventure");
assert.equal(flags.portalMode,"grid");
assert.equal(flags.portals.length,0,"Do not apply the old contiguous-room portal handler");
assert.equal(flags.gridPortals.length,11);
assert.equal(gridFloor.scene.embedded.Wall.filter(w=>w.door===1).length,flags.gridPortals.length*2);
assert.ok(flags.gridPortals[0].a.x!==flags.gridPortals[0].b.x||
  flags.gridPortals[0].a.y!==flags.gridPortals[0].b.y);
assert.ok(gridFloor.summary.enemies>=4,"Grid rooms support NPC creation");
assert.equal(gridFloor.summary.loot,3);
console.log("PASS: grid mode creates linked, separated scenes with NPCs, treasure and logical portals (mock)");
