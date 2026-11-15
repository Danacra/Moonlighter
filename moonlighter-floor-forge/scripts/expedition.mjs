/** Gameplay runtime for generated expeditions. Only the GM writes encounter or loot state. */
import {allPartyInside, countActiveEnemies, roomOfToken, safeItemData, ROOM_TYPES} from "./adventure-core.mjs";
import {isItemPilesAvailable, showChestPile, chestPileStatus, migrateLegacyChests} from "./item-piles.mjs";
import {registerGridPortalHooks} from "./grid-portals.mjs";
import {isOpenPortal,teleportDestination} from "./portal-core.mjs";
const MODULE_ID="moonlighter-floor-forge";
const busy=new Set();
const claiming=new Set();
const pitOccupancy=new Map();
const portalTransit=new Set(),portalHold=new Map(),priorTokenLocation=new Map();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const flags=(doc,key)=>doc?.getFlag?.(MODULE_ID,key) ?? doc?.flags?.[MODULE_ID]?.[key];
const stateFor=scene=>flags(scene,"adventure");
const tokensIn=scene=>scene.tokens?.contents || [];
const roomNumber=(token,scene,adventure)=>roomOfToken(adventure.rooms, token, scene.grid?.size||100);
const isCombatRoom=type=>["combat","miniboss","boss"].includes(type);
const isPlayerCharacter=token=>Boolean(token.actor && !token.flags?.[MODULE_ID]?.enemy &&
  (token.actor.hasPlayerOwner || (game.user?.isGM &&
    (token.actor.type==="character" || globalThis.canvas?.tokens?.controlled?.some(p=>p.document?.id===token.id)))));
const notify=(text)=>ui.notifications.info(text);
const isLeader=()=>{
  if(!game.user?.isGM)return false;
  const gms=(game.users?.contents || [game.user]).filter(u=>u.isGM && u.active!==false).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return game.user.id === (gms[0]?.id ?? game.user.id);
};

async function withBusy(key,fn){if(busy.has(key)) return false;busy.add(key);try{return await fn();}finally{busy.delete(key);}}
function gateWalls(scene, roomIndex){
  return (scene.walls?.contents||[]).filter(w=>{
    const data=w.flags?.[MODULE_ID] || {};
    return (w.door===1 || w.door===2) && Array.isArray(data.gateRooms) && data.gateRooms.includes(roomIndex) && !data.secretGate;
  });
}
/** Unlock only the loot associated with a completed combat room. */
async function revealCombatRewards(scene,roomIndex){
  const old=stateFor(scene);
  const chests=(old?.chests||[]).filter(c=>c.rewardLocked&&c.roomIndex===roomIndex);
  if(!chests.length)return;
  const tokenUpdates=[],tileUpdates=[],noteUpdates=[];
  for(const chest of chests){
    if(chest.mode==="item-piles"&&chest.tokenId)tokenUpdates.push({_id:chest.tokenId,hidden:false});
    for(const tile of scene.tiles?.contents||[])
      if(tile.flags?.[MODULE_ID]?.chestId===chest.id)tileUpdates.push({_id:tile.id,hidden:false});
    for(const note of scene.notes?.contents||[])
      if(note.flags?.[MODULE_ID]?.chestId===chest.id)noteUpdates.push({_id:note.id,hidden:false});
  }
  if(tokenUpdates.length)await scene.updateEmbeddedDocuments("Token",tokenUpdates);
  if(tileUpdates.length)await scene.updateEmbeddedDocuments("Tile",tileUpdates);
  if(noteUpdates.length)await scene.updateEmbeddedDocuments("Note",noteUpdates);
  const fresh=structuredCloneSafe(stateFor(scene));
  for(const c of fresh.chests||[])if(c.roomIndex===roomIndex)c.rewardLocked=false;
  await scene.setFlag(MODULE_ID,"adventure",fresh);
}
async function healAtFountain(scene,token,roomIndex){
  const state=stateFor(scene);
  if(!state?.fountainRooms?.includes(roomIndex)||!token?.actor)return;
  const key=roomIndex+":"+token.actor.id;
  if((state.healedActors||[]).includes(key))return;
  const hp=token.actor.system?.attributes?.hp;
  if(!hp||!Number.isFinite(Number(hp.max)))return;
  const full=Number(hp.max);
  if(Number(hp.value)<full){
    await token.actor.update({"system.attributes.hp.value":full});
    notify("Древний источник полностью восстановил здоровье "+token.actor.name+".");
  }
  const next=structuredCloneSafe(stateFor(scene));
  next.healedActors??=[];
  if(!next.healedActors.includes(key))next.healedActors.push(key);
  await scene.setFlag(MODULE_ID,"adventure",next);
}
export async function changeEncounter(scene, roomIndex, next, {quiet=false}={}) {
  if(!game.user?.isGM)throw Error("Доступно только ведущему.");
  if(next==="active"&&stateFor(scene)?.spawnOnEntry)return activateProceduralRoom(scene,roomIndex,{quiet});
  return withBusy(`encounter:${scene.id}:${roomIndex}`,async()=>{
    const state=stateFor(scene);
    const room=state?.rooms?.find(r=>r.index===roomIndex);
    if(!room)throw Error("Комната не найдена.");
    if(!isCombatRoom(room.type))throw Error("Эта комната не является боевой.");
    const before=state.statuses?.[String(roomIndex)]||"ready";
    // GM clearing a procedural room manually must suppress its pending spawn plan.
    // Never leave delayed enemies scheduled after the room is marked complete.
    if(before===next)return true;
    if(before==="cleared" && next==="active")throw Error("Эта комната уже зачищена.");
    if(!["active","cleared"].includes(next))throw Error("Неверное состояние комнаты.");
    if(next==="active" && countActiveEnemies(tokensIn(scene),roomIndex)===0) {
      if(!quiet)notify("В этой комнате нет живых противников. Пометьте её как пройденную.");
      return false;
    }
    const walls=gateWalls(scene,roomIndex);
    const updates=walls.filter(w=>w.ds!==(next==="active"?2:1)).map(w=>({_id:w.id,ds:next==="active"?2:1}));
    if(updates.length) await scene.updateEmbeddedDocuments("Wall",updates);
    const nextState=structuredCloneSafe(state);
    nextState.statuses??={};nextState.statuses[String(roomIndex)]=next;
    if(state.spawnOnEntry&&next==="cleared")delete nextState.pendingSpawns?.[String(roomIndex)];
    await scene.setFlag(MODULE_ID,"adventure",nextState);
    if(next==="cleared"&&state.spawnOnEntry)await revealCombatRewards(scene,roomIndex);
    if(!quiet)notify(next==="active"?`Бой начался: комната ${roomIndex+1}. Двери заблокированы.`:`Комната ${roomIndex+1} зачищена. Двери открыты.`);
    return true;
  });
}
function structuredCloneSafe(v){return JSON.parse(JSON.stringify(v));}
/** Foundry v13: spawn world-NPC TokenDocuments only after a player first enters.
 * Store the plan in scene flags; a mutex prevents duplicate first-visit spawns.
 */
export async function activateProceduralRoom(scene,roomIndex,{quiet=false}={}){
  if(!game.user?.isGM)throw Error("Только ведущий может запускать встречи.");
  return withBusy("spawn:"+scene.id+":"+roomIndex,async()=>{
    const state=stateFor(scene);
    if(!state?.spawnOnEntry)return false;
    const room=state.rooms?.find(r=>r.index===roomIndex);
    if(!room||!isCombatRoom(room.type))return false;
    if((state.statuses||{})[String(roomIndex)]!=="ready")return false;
    const pending=state.pendingSpawns?.[String(roomIndex)]||[];
    if(pending.length){
      const created=await scene.createEmbeddedDocuments("Token",pending);
      if(!created||created.length!==pending.length)
        throw Error("Не все NPC созданы. Проверьте сцену и F12, прежде чем повторять.");
    }
    const fresh=structuredCloneSafe(stateFor(scene));
    fresh.statuses??={};
    fresh.statuses[String(roomIndex)]=pending.length?"active":"cleared";
    fresh.pendingSpawns??={};
    delete fresh.pendingSpawns[String(roomIndex)];
    await scene.setFlag(MODULE_ID,"adventure",fresh);
    if(!pending.length)await revealCombatRewards(scene,roomIndex);
    if(!quiet)notify(pending.length
      ?"Комната "+(roomIndex+1)+": появились противники ("+pending.length+"). Выходы заблокированы."
      :"Комната "+(roomIndex+1)+": противников нет, выходы открыты.");
    return true;
  });
}

export async function revealSecret(scene,roomIndex){
  if(!game.user?.isGM)throw Error("Доступно только ведущему.");
  return withBusy(`reveal:${scene.id}:${roomIndex}`,async()=>{
    const state=stateFor(scene);
    if(state?.rooms?.[roomIndex]?.type!=="secret")throw Error("Это не тайная комната.");
    const updates=(scene.walls?.contents||[]).filter(w=>w.door===2 && w.flags?.[MODULE_ID]?.secretGate &&
      w.flags?.[MODULE_ID]?.gateRooms?.includes(roomIndex)).map(w=>({_id:w.id,door:1,ds:1}));
    if(updates.length)await scene.updateEmbeddedDocuments("Wall",updates);
    const fresh=structuredCloneSafe(state);
    fresh.revealed??=[];if(!fresh.revealed.includes(roomIndex))fresh.revealed.push(roomIndex);
    await scene.setFlag(MODULE_ID,"adventure",fresh);
    notify(`Тайный проход к комнате ${roomIndex+1} открыт.`);
    return true;
  });
}
export async function claimChest(scene,chestId,actorId){
  if(!game.user?.isGM)throw Error("Добычу может выдавать только ведущий.");
  const key=`claim:${scene.id}:${chestId}`;
  if(claiming.has(key))throw Error("Этот тайник уже обрабатывается.");
  claiming.add(key);
  try {
    const adventure=stateFor(scene);
    const chest=adventure?.chests?.find(c=>c.id===chestId);
    if(!chest)throw Error("Тайник не найден.");
    if(chest.mode==="item-piles")throw Error("Это сундук Item Piles. Откройте контейнер, чтобы забрать предметы. Прямая выдача отключена во избежание дублирования.");
    if(chest.claimed)throw Error("Этот тайник уже получен.");
    const actor=game.actors.get(actorId);
    if(!actor || actor.type!=="character")throw Error("Выберите персонажа игрока.");
    const itemDatas=chest.items.map(x=>safeItemData(x.data));
    if(!itemDatas.length)throw Error("Тайник пуст.");
    const created=await actor.createEmbeddedDocuments("Item",itemDatas);
    if(created?.length!==itemDatas.length)throw Error("Не все предметы были переданы. Проверьте инвентарь перед повторной попыткой.");
    const updated=structuredCloneSafe(adventure);
    const entry=updated.chests.find(c=>c.id===chestId);
    entry.claimed=true;entry.claimedBy=actor.name;entry.claimedAt=Date.now();
    try{await scene.setFlag(MODULE_ID,"adventure",updated);}
    catch(err){ui.notifications.error("Предметы выданы, но статус тайника не сохранён. НЕ выдавайте повторно до ручной проверки.");throw err;}
    notify(`Тайник ${chest.label}: ${created.length} предмет(ов) передано персонажу ${actor.name}.`);
    return true;
  }finally{claiming.delete(key);}
}

async function checkSceneFights(scene){
  const state=stateFor(scene);
  if(!state?.rooms)return;
  for(const [key,value] of Object.entries(state.statuses||{})) {
    if(value!=="active")continue;
    if(countActiveEnemies(tokensIn(scene),Number(key))===0) await changeEncounter(scene,Number(key),"cleared",{quiet:false});
  }
}
async function onPlayerMoved(token,change){
  if(!isLeader()||!("x" in change || "y" in change))return;
  const scene=token.parent;
  const state=stateFor(scene);
  if(state?.spawnOnEntry && isPlayerCharacter(token) && !token.hidden){
    const index=roomNumber(token,scene,state);
    if(index!==null)await healAtFountain(scene,token,index);
    if(index!==null && isCombatRoom(state.rooms?.find(r=>r.index===index)?.type))
      await activateProceduralRoom(scene,index,{quiet:false});
    return;
  }
  if(!state?.autoLock || !token.actor?.hasPlayerOwner || token.hidden)return;
  const index=roomNumber(token,scene,state);
  if(index===null || !isCombatRoom(state.rooms[index]?.type))return;
  if((state.statuses||{})[String(index)]!=="ready")return;
  if(countActiveEnemies(tokensIn(scene),index)===0)return;
  if(state.lockMode==="party" && !allPartyInside(tokensIn(scene),state.rooms,index,scene.grid?.size||100))return;
  await changeEncounter(scene,index,"active",{quiet:false});
}
/** Single-GM automatic transfer across open, connected room doors on the same scene.
 * Existing generated floors without a portal list are not affected.
 * A per-token hold prevents a bounce back through the same doorway.
 */
async function transferThroughOpenDoor(token,change){
  if(!isLeader()||!("x" in change||"y" in change))return;
  const scene=token.parent,adventure=stateFor(scene);
  if(!adventure?.portalTeleport||!adventure.portals?.length||!token.actor?.hasPlayerOwner||token.hidden)return;
  const key=scene.id+":"+token.id;
  if(portalTransit.has(key))return;
  const grid=Number(scene.grid?.size||100);
  const current={x:Number(token.x)+Number(token.width||1)*grid/2,y:Number(token.y)+Number(token.height||1)*grid/2};
  const hold=portalHold.get(key);
  if(hold){
    const p=adventure.portals.find(x=>x.key===hold);
    if(p&&Math.hypot(current.x-p.x,current.y-p.y)<grid*2.5)return;
    portalHold.delete(key);
  }
  const previous=priorTokenLocation.get(key);
  const roomIndex=previous
    ? roomOfToken(adventure.rooms,{x:previous.x,y:previous.y,width:token.width,height:token.height},grid)
    : roomNumber(token,scene,adventure);
  if(roomIndex===null)return;
  // Do not teleport after the user has already crossed a real open door.
  const nowRoom=roomNumber(token,scene,adventure);
  if(nowRoom!==roomIndex)return;
  for(const portal of adventure.portals){
    if(!portal.rooms.includes(roomIndex)||!isOpenPortal(portal,scene.walls?.contents||[]))continue;
    if(previous){
      const oldCenter={x:previous.x+Number(token.width||1)*grid/2,y:previous.y+Number(token.height||1)*grid/2};
      if(Math.hypot(current.x-portal.x,current.y-portal.y)>Math.hypot(oldCenter.x-portal.x,oldCenter.y-portal.y)+1)continue;
    }
    const land=teleportDestination(portal,roomIndex,adventure.rooms,current,grid,token.width,token.height);
    if(!land)continue;
    const w=Number(token.width||1)*grid,h=Number(token.height||1)*grid;
    if((adventure.hazards||[]).some(q=>land.x<q.x+q.w&&land.x+w>q.x&&land.y<q.y+q.h&&land.y+h>q.y))continue;
    const occupied=tokensIn(scene).some(other=>other.id!==token.id&&
      land.x<Number(other.x)+Number(other.width||1)*grid&&land.x+w>Number(other.x)&&
      land.y<Number(other.y)+Number(other.height||1)*grid&&land.y+h>Number(other.y));
    if(occupied)continue;
    portalTransit.add(key);portalHold.set(key,portal.key);
    try{
      await token.update({x:land.x,y:land.y},{animate:false});
    }catch(error){
      portalHold.delete(key);throw error;
    }finally{portalTransit.delete(key);}
    break;
  }
}
/** GM-only pit alerts. No automatic falling, saves or damage at this stage. */
function reportPitEntry(token,change){
  if(!isLeader()||!("x" in change||"y" in change))return;
  if(!token.actor?.hasPlayerOwner||token.hidden)return;
  const scene=token.parent, adventure=stateFor(scene);
  if(!adventure?.hazards?.length)return;
  const grid=Number(scene.grid?.size||100);
  const x=Number(token.x)+(Number(token.width||1)*grid)/2;
  const y=Number(token.y)+(Number(token.height||1)*grid)/2;
  const current=adventure.hazards.findIndex(h=>x>h.x&&x<h.x+h.w&&y>h.y&&y<h.y+h.h);
  const key=scene.id+":"+token.id;
  const last=pitOccupancy.get(key)??-1;
  if(current>=0&&last!==current)
    ui.notifications.warn("ЯМА: "+token.name+" вошёл в опасную область. Ведущий решает, требуется ли проверка Ловкости и какие последствия применяются.");
  if(current<0)pitOccupancy.delete(key);else pitOccupancy.set(key,current);
}
async function hideLegacyHazardDrawings(){
  if(!isLeader())return;
  const scene=canvas?.scene;
  if(!scene?.getFlag?.(MODULE_ID,"procedural"))return;
  const corrections=(scene.drawings?.contents||[]).filter(d=>
    ["pit","cover"].includes(d.flags?.[MODULE_ID]?.kind) &&
    (d.hidden!==true||Boolean(d.text))
  ).map(d=>({_id:d.id,hidden:true,text:""}));
  if(corrections.length) await scene.updateEmbeddedDocuments("Drawing",corrections);
}
export function registerAdventureHooks(){
  registerGridPortalHooks();
  Hooks.on("preUpdateToken",(token,change)=>{
    if(!isLeader()||!("x" in change||"y" in change))return;
    priorTokenLocation.set(token.parent.id+":"+token.id,{x:Number(token.x),y:Number(token.y)});
  });
  Hooks.on("updateToken",(token,change)=>{
    if(!isLeader())return;
    void transferThroughOpenDoor(token,change).catch(e=>console.error("[moonlighter-floor-forge] portal",e));
    if("x" in change||"y" in change){
      const key=token.parent.id+":"+token.id;
      // A matching pre-update will refresh this key on the next movement.
      priorTokenLocation.delete(key);
    }
  });
  Hooks.on("canvasReady",()=>{void hideLegacyHazardDrawings().catch(e=>console.error("[moonlighter-floor-forge] pit drawing migration",e));});
  Hooks.on("updateToken",(token,change)=>reportPitEntry(token,change));
  Hooks.on("updateToken",(token,change)=>{void onPlayerMoved(token,change).catch(e=>console.error(`[${MODULE_ID}] token movement`,e));
    if(isLeader()&&stateFor(token.parent)&&token.flags?.[MODULE_ID]?.enemy)void checkSceneFights(token.parent).catch(console.error);
  });
  Hooks.on("deleteToken",token=>{if(isLeader()&&stateFor(token.parent))void checkSceneFights(token.parent).catch(console.error);});
  Hooks.on("updateActor",actor=>{
    if(!isLeader())return;
    for(const scene of game.scenes.contents) {
      const data=stateFor(scene);
      if(!data?.rooms || !Object.values(data.statuses||{}).includes("active"))continue;
      if(tokensIn(scene).some(t=>t.actor?.id===actor.id && t.flags?.[MODULE_ID]?.enemy))void checkSceneFights(scene).catch(console.error);
    }
  });
}

function directorHtml(scene,adventure){
  const actorOptions=game.actors.contents.filter(a=>a.type==="character").map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
  const rooms=adventure.rooms.map(room=>{
    const status=adventure.statuses?.[String(room.index)]||"ready";
    const count=countActiveEnemies(tokensIn(scene),room.index);
    const isCombat=isCombatRoom(room.type);
    const isSecret=room.type==="secret";
    return `<div class="mff-director-line"><div><b>${room.index+1}. ${esc(room.name)}</b> <small>${esc(ROOM_TYPES[room.type]||room.type)} · ${esc(status)}${isCombat?` · NPC: ${count}`:""}</small></div><div class="mff-director-buttons">
      ${isCombat&&status==="ready"?`<button type="button" data-mff-start="${room.index}">Начать бой</button>`:""}
      ${isCombat&&status!=="cleared"?`<button type="button" data-mff-clear="${room.index}">Зачистить</button>`:""}
      ${isSecret && !adventure.revealed?.includes(room.index)?`<button type="button" data-mff-reveal="${room.index}">Открыть секрет</button>`:""}
    </div></div>`;
  }).join("");
  const chests=(adventure.chests||[]).map(c=>{
    if (c.mode==="item-piles") {
      const status=chestPileStatus(scene,c);
      const statusText={empty:"Пустой",available:"Игроки могут забрать предметы",missing:"Токен отсутствует",disabled:"Item Piles выключен",unknown:"Статус не определён"}[status]||status;
      const openButton=status==="missing"||status==="disabled"?"":`<button type="button" data-mff-open-pile="${esc(c.id)}">Открыть Item Piles</button>`;
      return `<div class="mff-director-line"><div><b>${esc(c.label)}</b> <small>Item Piles · ${esc(statusText)}</small></div><div class="mff-director-buttons">${openButton}</div></div>`;
    }
    return `<div class="mff-director-line"><div><b>${esc(c.label)}</b><small>${c.claimed?`Выдано: ${esc(c.claimedBy||"")}`:c.items.map(x=>esc(x.name)).join(", ")}</small></div>${c.claimed?"":`<div class="mff-director-buttons"><select data-mff-target="${esc(c.id)}"><option value="">Кому выдать?</option>${actorOptions}</select><button type="button" data-mff-claim="${esc(c.id)}">Выдать</button></div>`}</div>`;
  }).join("");
  const canMigrate=isItemPilesAvailable() && (adventure.chests||[]).some(c=>!c.claimed && c.mode!=="item-piles" && c.items?.length);
  const migrate=canMigrate?`<button type="button" data-mff-migrate>Перевести старые сундуки в Item Piles</button>`:"";
  const prev=adventure.previousSceneId?`<button type="button" data-mff-visit="${esc(adventure.previousSceneId)}">Предыдущий этаж</button>`:"";
  const next=adventure.nextSceneId?`<button type="button" data-mff-visit="${esc(adventure.nextSceneId)}">Следующий этаж</button>`:"";
  return `<div class="mff-director"><p>Экспедиция: ${esc(adventure.expeditionName||scene.name)} · этаж ${adventure.floorIndex||1}/${adventure.floorCount||1}. Управление доступно только ведущему.</p><div class="mff-director-nav">${prev}${next}</div><h3>Комнаты</h3>${rooms}<h3>Сундуки</h3>${migrate}${chests||"<p>Тайников нет.</p>"}<p class="mff-help">Контейнеры Item Piles открываются и забираются самими игроками, без повторной выдачи через модуль. Обычные тайники остаются под управлением ведущего. Бои и секреты управляются здесь или автоматически.</p></div>`;
}
export async function openDirector(scene=canvas?.scene){
  if(!game.user?.isGM)return ui.notifications.warn("Панель доступна только ведущему.");
  const adventure=stateFor(scene);
  if(!adventure?.rooms)return ui.notifications.warn("На открытой сцене нет экспедиции Moonlighter v0.3.");
  const dlg=new foundry.applications.api.DialogV2({window:{title:`Moonlighter — управление этажом ${adventure.floorIndex||1}`,resizable:true},content:directorHtml(scene,adventure),
    buttons:[{action:"close",label:"Закрыть",icon:"fa-solid fa-xmark"}]});
  await dlg.render({force:true});
  const root=dlg.element;
  if(!root)return;
  const act=(selector,fn)=>root.querySelectorAll(selector).forEach(button=>button.addEventListener("click",async()=>{
    button.disabled=true;
    try{await fn(button);await dlg.close();await openDirector(scene);}catch(e){console.error(`[${MODULE_ID}] director`,e);ui.notifications.error(e.message||"Ошибка действия");button.disabled=false;}
  }));
  act("[data-mff-start]",b=>changeEncounter(scene,Number(b.dataset.mffStart),"active"));
  act("[data-mff-clear]",b=>changeEncounter(scene,Number(b.dataset.mffClear),"cleared"));
  act("[data-mff-reveal]",b=>revealSecret(scene,Number(b.dataset.mffReveal)));
  act("[data-mff-open-pile]",async b=>{
    const fresh=stateFor(scene);
    const chest=fresh?.chests?.find(c=>c.id===b.dataset.mffOpenPile);
    if(!chest || chest.mode!=="item-piles")throw Error("Контейнер не найден.");
    return showChestPile(scene,chest);
  });
  act("[data-mff-migrate]",async()=>{
    const result=await migrateLegacyChests(scene);
    ui.notifications.info(`Конвертация: ${result.converted} сундуков, пропущено ${result.skipped}, ошибок: ${result.errors.length}.`);
    if(result.errors.length)ui.notifications.warn(result.errors.join("; "));
  });
  act("[data-mff-claim]",b=>{
    const id=b.dataset.mffClaim;
    const actorId=root.querySelectorAll("[data-mff-target]").length &&
      [...root.querySelectorAll("[data-mff-target]")].find(el=>el.dataset.mffTarget===id)?.value;
    if(!actorId)throw Error("Выберите персонажа для получения предметов.");
    return claimChest(scene,id,actorId);
  });
  act("[data-mff-visit]",async b=>{
    const target=game.scenes.get(b.dataset.mffVisit);
    if(!target)throw Error("Следующий этаж не найден.");
    await target.view();
  });
}
