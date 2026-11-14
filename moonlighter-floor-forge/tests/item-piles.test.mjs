import assert from 'node:assert/strict';
import {
 isItemPilesAvailable,resolveLootMode,createChestPile,findChestPile,chestPileStatus,
 showChestPile,migrateLegacyChests
} from '../scripts/item-piles.mjs';
const MODULE='moonlighter-floor-forge';
let calls=[];
const gameMods=new Map([['item-piles',{active:true}],['itempilesdnd5e',{active:true}]]);
const scenes=new Map();
globalThis.game={user:{isGM:true},system:{id:'dnd5e'},modules:gameMods,
 itempiles:{pile_types:{CONTAINER:'container'},API:{
   async createItemPile(payload) {
     calls.push(payload);
     const sc=scenes.get(payload.sceneId);
     const n=sc.tokens.contents.length+1;
     const id=`ip-${n}`;
     const token={id,uuid:`Scene.${sc.id}.Token.${id}`,
       flags:payload.tokenOverrides.flags,
       actor:{items:{contents:payload.items.map(x=>structuredClone(x))}}};
     sc.tokens.contents.push(token);
     return {tokenUuid:token.uuid,actorUuid:'Actor.default'};
   },
   isItemPileEmpty(token){return token.actor.items.contents.length===0;},
   renderItemPileInterface(token){return Promise.resolve(`opened ${token.id}`);}
 }} };
function scene(id='s1') {
 const state={chests:[]};
 const s={id,grid:{size:100},tokens:{contents:[],get(id){return this.contents.find(t=>t.id===id);}},
  notes:{contents:[]},tiles:{contents:[]},flags:{[MODULE]:{adventure:state}},
  getFlag(ns,key){return this.flags[ns]?.[key];},
  async setFlag(ns,key,val){(this.flags[ns]??={})[key]=val;},
  async deleteEmbeddedDocuments(kind,ids){const target=kind==='Note'?this.notes.contents:this.tiles.contents;for(const i of ids){const at=target.findIndex(r=>r.id===i);if(at>=0)target.splice(at,1);}}
 };
 scenes.set(id,s);return s;
}
assert.equal(isItemPilesAvailable(),true);
assert.equal(resolveLootMode('auto'),'item-piles');
const s=scene();
const rawItem={_id:'item123',name:'Gem',type:'loot',system:{quantity:2},ownership:{default:0}};
const ret=await createChestPile(s,{chestId:'chest-1',label:'Тайник 1',roomIndex:2,
 pos:{x:220,y:340},items:[rawItem]});
assert.equal(ret.tokenId,'ip-1');
assert.equal(calls.length,1);
assert.equal(calls[0].sceneId,'s1');
assert.equal(calls[0].itemPileFlags.type,'container');
assert.equal(calls[0].itemPileFlags.deleteWhenEmpty,false);
assert.equal(calls[0].items[0]._id,undefined);
assert.equal(calls[0].tokenOverrides.flags[MODULE].chestId,'chest-1');
assert.equal(rawItem._id,'item123'); // no mutations to original
assert.equal((await createChestPile(s,{chestId:'chest-1',label:'Тайник 1',roomIndex:2,pos:{x:0,y:0},items:[rawItem]})).alreadyPresent,true);
assert.equal(calls.length,1);
const c={id:'chest-1',mode:'item-piles',tokenId:ret.tokenId};
assert.equal(findChestPile(s,c).id,'ip-1');
assert.equal(chestPileStatus(s,c),'available');
assert.equal(await showChestPile(s,c),'opened ip-1');
s.tokens.get('ip-1').actor.items.contents=[];
assert.equal(chestPileStatus(s,c),'empty');
// Old v0.3 chest conversion replaces source of truth, removes markers, blocks repeats.
const old=scene('legacy');
old.notes.contents=[{id:'n1',x:500,y:600,flags:{[MODULE]:{stashIndex:0,chestId:'chest-1'}}}];
old.tiles.contents=[{id:'t1',flags:{[MODULE]:{chestId:'chest-1'}}}];
old.flags[MODULE].adventure={chests:[{id:'chest-1',label:'1 (комната 3)',roomIndex:2,claimed:false,
 items:[{data:rawItem,name:'Gem'}]}]};
const moved=await migrateLegacyChests(old);
assert.equal(moved.converted,1);
assert.equal(moved.errors.length,0);
assert.equal(old.notes.contents.length,0);
assert.equal(old.tiles.contents.length,0);
assert.equal(old.flags[MODULE].adventure.chests[0].items.length,0);
assert.equal(old.flags[MODULE].adventure.chests[0].mode,'item-piles');
assert.equal((await migrateLegacyChests(old)).converted,0);
assert.equal(calls.length,2);
gameMods.get('itempilesdnd5e').active=false;
assert.equal(isItemPilesAvailable(),false);
assert.equal(resolveLootMode('auto'),'legacy');
assert.throws(()=>resolveLootMode('item-piles'),/Item Piles/);
assert.equal(chestPileStatus(s,c),'disabled');
console.log('PASS: Item Piles adapter, API payload, de-duplication, migration, empty state, optional fallback');
