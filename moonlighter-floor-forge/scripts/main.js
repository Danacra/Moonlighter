import {normalizeRoom, buildLayout, renderLayout} from "./room-core.mjs";
import {openRoomLibrary} from "./room-editor.mjs";
import {assignRoomTypes, safeItemData} from "./adventure-core.mjs";
import {openDirector, registerAdventureHooks} from "./expedition.mjs";
import {resolveLootMode, createChestPile, isItemPilesAvailable} from "./item-piles.mjs";
import {registerMarketSettings, openMarket, currentMarket} from "./market-ui.mjs";
/**
 * Moonlighter Floor Forge — Foundry VTT v13 proof of concept.
 * Creates new scenes from a map image or a template scene, populates them with
 * world Actor tokens, and records loot in Journal pages pinned to map Notes.
 * v0.4: optional Item Piles containers alongside GM-only legacy loot.
 */
const MODULE_ID = "moonlighter-floor-forge";
const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary"];
const RARITY_NAMES = ["Обычная", "Необычная", "Редкая", "Очень редкая", "Легендарная"];
const QUALITY_WEIGHTS = [
  [100, 0, 0, 0, 0],
  [80, 20, 0, 0, 0],
  [55, 30, 15, 0, 0],
  [25, 45, 25, 5, 0],
  [10, 25, 35, 20, 10]
];

const random = () => Math.random();
const choice = list => list[Math.floor(random() * list.length)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[ch]);
const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;

function findZones(scene) {
  if (!scene) return [];
  return scene.drawings.contents.flatMap(drawing => {
    const kind = drawing.text?.trim().toUpperCase();
    if (!["SPAWN", "LOOT", "BOSS"].includes(kind)) return [];
    const width = Math.abs(Number(drawing.shape?.width || 0));
    const height = Math.abs(Number(drawing.shape?.height || 0));
    if (!width || !height) return [];
    // Rectangle drawings are recommended; rotated rectangles are not supported.
    if (Math.abs(Number(drawing.rotation || 0)) > 0.001) return [];
    return [{kind, x: drawing.x, y: drawing.y, width, height}];
  });
}

function getActors(folderId, maxCr) {
  const available = game.actors.contents.filter(a => a.type === "npc" && (!folderId || a.folder?.id === folderId));
  if (!maxCr) return available;
  // Non-D&D 5e NPCs without a defined CR remain eligible.
  return available.filter(a => {
    const raw = a.system?.details?.cr;
    if (raw === undefined || raw === null || raw === "") return true;
    const cr = asCR(raw);
    return cr === null || cr <= maxCr;
  });
}

function asCR(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value ?? "");
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function elitePool(actors) {
  const sorted = actors.slice().sort((a, b) => (asCR(a.system?.details?.cr) || 0) - (asCR(b.system?.details?.cr) || 0));
  return sorted.slice(Math.floor(sorted.length * 0.75));
}

function rarityIndex(item) {
  const raw = String(item.system?.rarity ?? "common").replace(/[\s_-]/g, "").toLowerCase();
  const i = RARITIES.findIndex(r => r.toLowerCase() === raw);
  return i < 0 ? 0 : i;
}

function getItems(folderId) {
  const permittedTypes = new Set(["loot", "equipment", "weapon", "consumable", "tool", "container", "backpack"]);
  return game.items.contents.filter(item =>
    (!folderId || item.folder?.id === folderId) &&
    (game.system.id !== "dnd5e" || permittedTypes.has(item.type))
  );
}

function pickItem(items, quality) {
  const weights = QUALITY_WEIGHTS[quality].slice();
  const byRarity = RARITIES.map((_, index) => items.filter(item => rarityIndex(item) === index));
  for (let i = 0; i < weights.length; i++) if (!byRarity[i].length) weights[i] = 0;
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return choice(items);
  let hit = random() * sum;
  for (let i = 0; i < weights.length; i++) {
    hit -= weights[i];
    if (hit < 0 && byRarity[i].length) return choice(byRarity[i]);
  }
  return choice(items);
}

function segmentsDistance(point, c) {
  const ax = c[0], ay = c[1], bx = c[2], by = c[3];
  const vx = bx - ax, vy = by - ay;
  const length2 = vx * vx + vy * vy;
  if (!length2) return Math.hypot(point.x - ax, point.y - ay);
  const t = clamp(((point.x - ax) * vx + (point.y - ay) * vy) / length2, 0, 1);
  return Math.hypot(point.x - (ax + t * vx), point.y - (ay + t * vy));
}

/**
 * Returns token upper-left coordinates, and checks basic separation from token
 * centers, other loot markers, and wall segments. This is NOT pathfinding.
 */
function findPosition(scene, kind, zones, used, footprint = 1, blocked = []) {
  const grid = scene.grid?.size || 100;
  const half = grid * footprint / 2;
  const sceneX = Number(scene.dimensions?.sceneX || 0);
  const sceneY = Number(scene.dimensions?.sceneY || 0);
  const mapRect = { x: sceneX, y: sceneY, width: scene.width, height: scene.height };
  const allowed = zones.filter(z => z.kind === kind);
  const rects = allowed.length ? allowed : [mapRect];
  const weighted = rects.filter(r => r.width + 1e-4 >= grid*footprint && r.height + 1e-4 >= grid*footprint);
  if (!weighted.length) return null;
  const walls = scene.walls?.contents ?? [];
  for (let attempt = 0; attempt < 350; attempt++) {
    let selected;
    const total = weighted.reduce((sum, r) => sum + r.width * r.height, 0);
    let lottery = random() * total;
    for (const rect of weighted) {
      lottery -= rect.width * rect.height;
      if (lottery <= 0) { selected = rect; break; }
    }
    selected ??= weighted.at(-1);
    const innerLeft = Math.max(selected.x + half, sceneX + half);
    const innerTop = Math.max(selected.y + half, sceneY + half);
    const innerRight = Math.min(selected.x + selected.width - half, sceneX + scene.width - half);
    const innerBottom = Math.min(selected.y + selected.height - half, sceneY + scene.height - half);
    if (innerRight <= innerLeft || innerBottom <= innerTop) continue;
    let cx = innerLeft + random() * (innerRight - innerLeft);
    let cy = innerTop + random() * (innerBottom - innerTop);
    // Snap to a grid if present. Snap top-left of the token, not its center.
    if (scene.grid?.type && scene.grid.type !== 0) {
      cx = Math.round((cx - half - sceneX) / grid) * grid + sceneX + half;
      cy = Math.round((cy - half - sceneY) / grid) * grid + sceneY + half;
    }
    if (cx < innerLeft || cx > innerRight || cy < innerTop || cy > innerBottom) continue;
    const point = { x: cx, y: cy, radius: half };
    if (used.some(u => Math.hypot(u.x - cx, u.y - cy) < (u.radius + half) * 1.15)) continue;
    // Token footprint may not intersect an annotated pit, cover or doorway.
    if (blocked.some(r => cx+half > r.x && cx-half < r.x+r.w && cy+half > r.y && cy-half < r.y+r.h)) continue;
    if (walls.some(w => Array.isArray(w.c) && segmentsDistance(point, w.c) < half * 0.78)) continue;
    used.push(point);
    return { x: Math.round(cx - half), y: Math.round(cy - half), centerX: Math.round(cx), centerY: Math.round(cy) };
  }
  return null;
}

async function imageDimensions(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({width: img.naturalWidth, height: img.naturalHeight});
    img.onerror = () => reject(new Error("Не удалось загрузить изображение карты. Проверьте путь в файловом менеджере Foundry."));
    img.src = path;
  });
}

async function createFloorScene(config, source) {
  const flags = { [MODULE_ID]: { generated: true, sourceSceneId: source?.id || null, createdAt: Date.now() } };
  if (source) {
    const data = foundry.utils.deepClone(source.toObject());
    delete data._id;
    delete data._stats;
    data.name = config.name;
    data.active = false;
    data.navigation = false;
    data.tokens = [];
    data.notes = [];
    data.drawings = (data.drawings || []).filter(d => !["SPAWN", "LOOT", "BOSS"].includes(String(d.text || "").trim().toUpperCase()));
    data.flags = {...(data.flags || {}), ...flags};
    return await Scene.create(data);
  }
  const dims = await imageDimensions(config.image);
  if (dims.width < 500 || dims.height < 500) throw new Error("Размер карты должен быть не меньше 500 × 500 пикселей.");
  const data = {
    name: config.name,
    active: false,
    navigation: false,
    background: {src: config.image},
    backgroundColor: "#080a0d",
    width: dims.width,
    height: dims.height,
    padding: 0,
    grid: {type: 1, size: config.gridSize, distance: 5, units: "ft"},
    flags
  };
  return await Scene.create(data);
}

/** Assemble a floor from saved image-room templates, matching opposite door slots. */
async function createRoomFloor(config) {
  const rooms = game.scenes.contents.map(normalizeRoom).filter(Boolean);
  if (!rooms.length) throw new Error("Сначала загрузите и разметьте комнаты в библиотеке комнат.");
  const layout = buildLayout(rooms, config.roomCount, Math.random,{boss:Boolean(config.bossId)});
  const roles = assignRoomTypes(layout,{secretChance:config.secretChance,boss:Boolean(config.bossId)});
  const geo = renderLayout(layout, config.gridSize,roles);
  // Never modify the template scenes: each generated floor gets its own scene.
  const scene = await Scene.create({
    name:config.name, active:false, navigation:false,
    width:geo.width, height:geo.height, padding:0,
    backgroundColor:"#090c11", grid:{type:1,size:config.gridSize,distance:5,units:"ft",alpha:0.14},
    flags:{[MODULE_ID]:{generated:true,procedural:true,createdAt:Date.now()}}
  });
  if(!scene) throw new Error("Не удалось создать сцену для процедурного этажа.");
  if(geo.tiles.length) await scene.createEmbeddedDocuments("Tile",geo.tiles);
  if(geo.walls.length) await scene.createEmbeddedDocuments("Wall",geo.walls);
  if(geo.drawings.length) await scene.createEmbeddedDocuments("Drawing",geo.drawings);
  await scene.setFlag(MODULE_ID,"layout",{
    count:layout.placements.length,requested:layout.requested,connectedDoors:layout.connections.length,
    rooms:layout.placements.map((p,i)=>({template:p.room.id,name:p.room.name,x:p.x,y:p.y,rotation:p.rotation,type:roles[i]}))
  });
  return {scene, zones:geo.zones, blocked:geo.blocked, roomRects:geo.roomRects,
    roles, actualRooms:layout.placements.length};
}

async function generate(config, {view=true}={}) {
  if (!game.user?.isGM) throw new Error("Создание подземелья доступно только ведущему.");
  const usingRooms = config.mode === "rooms";
  const template = !usingRooms && config.mode === "scene" ? game.scenes.get(config.sourceId) : null;
  if (!usingRooms && config.mode === "scene" && !template) throw new Error("Выберите существующую сцену-шаблон.");
  if (!usingRooms && config.mode === "image" && !config.image) throw new Error("Выберите изображение карты.");
  const actorPool = getActors(config.enemyFolder, config.maxCR);
  if (config.enemyCount && !actorPool.length) throw new Error("Нет подходящих NPC в Actors. Импортируйте Moonlighter Bestiary через панель «Токены», выберите папку NPC и проверьте максимальный CR.");
  const lootMode = config.lootCount ? resolveLootMode(config.lootMode || "auto") : "legacy";
  const itemPool = getItems(config.lootFolder);
  if (config.lootCount && !itemPool.length) throw new Error("В Items нет подходящих предметов. Добавьте предметы в мир или отключите тайники (значение 0).");
  const boss = config.bossId ? game.actors.get(config.bossId) : null;
  if (config.bossId && (!boss || boss.type !== "npc")) throw new Error("Босс должен быть NPC из папки Actors.");

  const assembled = usingRooms ? await createRoomFloor(config) : null;
  const zones = assembled ? assembled.zones : findZones(template);
  const blocked = assembled ? assembled.blocked : [];
  const scene = assembled ? assembled.scene : await createFloorScene(config, template);
  if (!scene) throw new Error("Foundry не создал сцену.");
  const occupied = [];
  const summary = {enemies: 0, elites: 0, loot: 0, itemPiles: 0, fallbackStashes: 0, boss: false, skipped: 0};
  const tokenData = [];
  const best = elitePool(actorPool);
  const combatRooms=assembled?.roomRects?.filter(r=>r.type==="combat")||[];
  const lootRooms=(assembled?.roomRects?.filter(r=>!["entrance","boss"].includes(r.type))||[])
    .sort((a,b)=>({treasure:0,secret:1,rest:2,combat:3}[a.type]??4)-({treasure:0,secret:1,rest:2,combat:3}[b.type]??4));
  function positionInRoom(kind, roomIndex, footprint) {
    const roomZones = zones.filter(z=>z.kind===kind && z.roomIndex===roomIndex);
    if (!roomZones.length) return null;
    return findPosition(scene, kind, roomZones, occupied, footprint, blocked);
  }

  for (let i = 0; i < config.enemyCount; i++) {
    const elite = random() * 100 < config.eliteChance;
    const actor = choice((elite ? best : actorPool).length ? (elite ? best : actorPool) : actorPool);
    const size = Math.max(1, Number(actor.prototypeToken?.width || 1), Number(actor.prototypeToken?.height || 1));
    const roomIndex=assembled && combatRooms.length ? combatRooms[i%combatRooms.length].index : null;
    const pos = roomIndex!==null ? positionInRoom("SPAWN",roomIndex,size)
      : !assembled ? findPosition(scene,"SPAWN",zones,occupied,size,blocked) : null;
    if (!pos) { summary.skipped++; continue; }
    const token = await actor.getTokenDocument({x: pos.x, y: pos.y, hidden: false});
    const data = token.toObject();
    delete data._id;
    data.flags = {...(data.flags || {}), [MODULE_ID]: {elite: Boolean(elite), enemy:true, ...(roomIndex!==null?{roomIndex}:{})}};
    // Elite status is a GM label; this prototype does not modify stats.
    if (elite) data.name = `${actor.name} ★`;
    tokenData.push(data);
    summary.enemies++;
    if (elite) summary.elites++;
  }
  if (boss) {
    const bossSize = Math.max(1, Number(boss.prototypeToken?.width || 1), Number(boss.prototypeToken?.height || 1));
    const roomIndex=assembled?.roomRects?.at(-1)?.index ?? null;
    const pos = findPosition(scene, "BOSS", zones, occupied, bossSize, blocked);
    if (pos) {
      const token = await boss.getTokenDocument({x: pos.x, y: pos.y, hidden: false});
      const data = token.toObject();
      delete data._id;
      data.flags = {...(data.flags || {}), [MODULE_ID]: {boss: true,enemy:true, ...(roomIndex!==null?{roomIndex}:{})}};
      tokenData.push(data);
      summary.boss = true;
    } else summary.skipped++;
  }
  if (tokenData.length) await scene.createEmbeddedDocuments("Token", tokenData);

  const stashPositions = [];
  for (let i = 0; i < config.lootCount; i++) {
    const roomIndex=assembled && lootRooms.length ? lootRooms[i%lootRooms.length].index : null;
    const pos = roomIndex!==null ? positionInRoom("LOOT",roomIndex,0.7)
      : !assembled ? findPosition(scene,"LOOT",zones,occupied,0.7,blocked) : null;
    if (!pos) { summary.skipped++; continue; }
    const chosen = Array.from({length: config.itemsPerStash}, () => pickItem(itemPool, config.quality));
    stashPositions.push({pos, items: chosen,roomIndex});
  }
  // Containers are real Item Piles tokens when the optional integration is active.
  // Legacy Notes/Tiles are generated only for the fallback subset; never both.
  const createdStashes = [];
  const fallbackStashes = [];
  for (let i=0; i<stashPositions.length; i++) {
    const stash=stashPositions[i];
    const chestId=`chest-${i+1}`;
    const label=`Тайник ${i+1}`;
    const itemData=stash.items.map(safeItemData);
    let pile=null;
    if (lootMode === "item-piles") {
      try {
        pile=await createChestPile(scene,{chestId,label,roomIndex:stash.roomIndex,pos:stash.pos,items:itemData});
        summary.itemPiles++;
      } catch(error) {
        // A failed API call could have partially created a pile. Do not silently
        // create a second copy of the loot: leave it for a GM to inspect.
        console.error(`[${MODULE_ID}] Item Piles chest ${chestId} failed`,error);
        throw new Error(`Item Piles не смог создать «${label}». Проверьте сцену на частично созданный сундук: ${error.message}`);
      }
    }
    const record={id:chestId,label:`${i+1} (комната ${(stash.roomIndex??0)+1})`,roomIndex:stash.roomIndex,
      mode:pile?"item-piles":"legacy",claimed:false,
      ...(pile?{tokenId:pile.tokenId,tokenUuid:pile.tokenUuid,items:[]} :
        {items:stash.items.map(item=>({name:item.name,rarity:RARITY_NAMES[rarityIndex(item)],data:safeItemData(item)}))})};
    createdStashes.push(record);
    if(!pile)fallbackStashes.push({...stash,index:i});
  }
  if(fallbackStashes.length) {
    const pages=fallbackStashes.map(({items,index})=>({
      name:`Тайник ${index+1}`,type:"text",text:{format:1,
        content:`<h2>Тайник ${index+1}</h2><p>Содержимое:</p><ul>${items.map(item=>`<li>@UUID[${item.uuid}]{${escapeHtml(item.name)}} (${RARITY_NAMES[rarityIndex(item)]})</li>`).join("")}</ul><p>Запись ведущего: выдать через панель этажа.</p>`}
    }));
    const journal=await JournalEntry.create({name:`${config.name} — добыча`,pages,
      ownership:{default:0},flags:{[MODULE_ID]:{sceneId:scene.id}}});
    if(!journal)throw new Error("Не удалось создать журнал добычи.");
    const noteData=fallbackStashes.map(({pos,index},i)=>({
      entryId:journal.id,pageId:journal.pages.contents[i]?.id||null,
      x:pos.centerX,y:pos.centerY,
      texture:{src:"icons/svg/chest.svg"},
      iconSize:Math.max(32,Math.min(64,Number(scene.grid?.size||100)*0.52)),
      text:`Тайник ${index+1}`,global:false,
      flags:{[MODULE_ID]:{stash:true,stashIndex:index,chestId:`chest-${index+1}`}}
    }));
    await scene.createEmbeddedDocuments("Note",noteData);
    if(assembled) {
      const g=config.gridSize;
      await scene.createEmbeddedDocuments("Tile",fallbackStashes.map(({pos,index})=>({
        x:pos.centerX-g*.3,y:pos.centerY-g*.3,width:g*.6,height:g*.6,
        texture:{src:"icons/svg/chest.svg"},locked:true,hidden:false,
        flags:{[MODULE_ID]:{chestId:`chest-${index+1}`}}
      })));
    }
    summary.fallbackStashes=fallbackStashes.length;
  }
  summary.loot=createdStashes.length;
  if(assembled) {
    const chests=createdStashes;
    const statuses=Object.fromEntries(assembled.roomRects.map(r=>[String(r.index),"ready"]));
    await scene.setFlag(MODULE_ID,"adventure",{
      expeditionName:config.expeditionName||config.name,
      floorIndex:config.floorIndex||1,floorCount:config.floorCount||1,
      expeditionId:config.expeditionId||"", previousSceneId:null,nextSceneId:null,
      autoLock:config.autoLock!==false,lockMode:config.lockMode||"party",
      rooms:assembled.roomRects,statuses,revealed:[],chests,lootMode,
      hazards:assembled.blocked.filter(b=>b.kind==="pit")
    });
  }
  await scene.setFlag(MODULE_ID, "generation", {...config, image: config.image ? "[hidden path]" : "", summary});
  if (summary.skipped) ui.notifications.warn(`Размещено ${summary.enemies} NPC, ${summary.loot} сундуков. Не удалось разместить ${summary.skipped} объектов: проверьте зоны SPAWN/LOOT и ямы.`);
  if (view) await scene.view();
  return {scene, summary, zones: zones.length, actualRooms:assembled?.actualRooms ?? null};
}

/** A single expedition is an ordered set of separately generated and linked scenes. */
async function generateExpedition(config){
  if(config.mode!=="rooms" || config.floorCount<=1)return generate(config);
  const count=clamp(config.floorCount,1,4);
  const expeditionId=foundry.utils?.randomID?.()||`expedition-${Date.now()}`;
  const created=[];
  for(let i=1;i<=count;i++){
    const floorConfig={...config,
      name:`${config.name} — этаж ${i}`,expeditionName:config.name,
      expeditionId,floorIndex:i,floorCount:count,
      bossId:i===count?config.bossId:"",
      enemyCount:Math.min(50,config.enemyCount+Math.floor((i-1)*config.enemyCount*.2)),
      maxCR:config.maxCR?Math.min(30,config.maxCR+i-1):0
    };
    try{created.push(await generate(floorConfig,{view:false}));}
    catch(e){throw Error(`Ошибка при создании этажа ${i}; созданные сцены (${created.length}) сохранены. ${e.message}`);}
  }
  for(let i=0;i<created.length;i++){
    const scene=created[i].scene;
    const state=scene.getFlag(MODULE_ID,"adventure");
    await scene.setFlag(MODULE_ID,"adventure",{...state,
      previousSceneId:created[i-1]?.scene.id||null,
      nextSceneId:created[i+1]?.scene.id||null});
  }
  await created[0].scene.view();
  return {...created[0],floors:created.length,created};
}

function renderForm() {
  const sceneOptions = game.scenes.contents.filter(s=>!normalizeRoom(s)).map(scene => option(scene.id, scene.name)).join("");
  const savedRooms = game.scenes.contents.map(normalizeRoom).filter(Boolean).length;
  const actorFolders = game.folders.contents.filter(f => f.type === "Actor").sort((a,b) => a.name.localeCompare(b.name));
  const itemFolders = game.folders.contents.filter(f => f.type === "Item").sort((a,b) => a.name.localeCompare(b.name));
  const npcOptions = game.actors.contents.filter(a => a.type === "npc").sort((a,b) => a.name.localeCompare(b.name));
  const rangeField = (name, label, min, max, value, suffix = "", step = 1) => `
    <div class="mff-field"><label for="mff-${name}">${label}</label><div class="mff-range">
    <input type="range" id="mff-${name}" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" data-mff-range="${suffix}">
    <output for="mff-${name}">${value}${suffix}</output></div></div>`;
  return `<div class="mff-form">
    <p class="mff-description">Генерирует этаж из размеченных комнат либо населяет готовую карту врагами и лутом. Оригинальные шаблоны не изменяются.</p>
    <fieldset><legend>1. Карта и способ генерации</legend>
      <div class="mff-field"><label for="mff-mode">Режим</label><select id="mff-mode" name="mode">
        ${option("rooms",`Собрать из комнат (${savedRooms} шабл.)`)}
        ${option("scene","Копия существующей сцены")}
        ${option("image","Одна карта PNG / WebP / JPG")}</select></div>
      ${rangeField("roomCount", "Количество комнат", 2, 35, 8)}
      ${rangeField("floorCount", "Этажей в экспедиции", 1, 4, 2)}
      ${rangeField("secretChance", "Шанс тайной комнаты в тупике", 0, 100, 20, "%", 5)}
      <p class="mff-help">Для сборки нужны сохранённые комнаты с размеченными дверями. Используются повороты 0°/90°/180°/270°; двери стыкуются по клеткам.</p>
      <div class="mff-field"><label for="mff-name">Название этажа</label><input id="mff-name" type="text" name="name" value="Экспедиция Moonlighter" maxlength="120" required></div>
      <div class="mff-field"><label for="mff-scene">Сцена-шаблон</label><select id="mff-scene" name="sourceId">${option("", "Нет — использовать изображение")}${sceneOptions}</select></div>
      <div class="mff-field"><label for="mff-image">Изображение карты</label><div class="mff-file"><input id="mff-image" type="text" name="image" placeholder="data/maps/dungeon.webp"><button type="button" data-mff-pick title="Загрузить/выбрать файл"><i class="fa-solid fa-folder-open"></i></button></div></div>
      <div class="mff-field"><label for="mff-gridSize">Сетка, пикселей</label><select id="mff-gridSize" name="gridSize">${[50,70,100,140,200].map(v => option(v, String(v))).join("")}</select></div>
      <p class="mff-help">Для режима «Собрать из комнат» изображения и стены берутся из библиотеки комнат, а размер сетки задаётся выше. Для копии существующей сцены сохраняется её исходная геометрия.</p>
    </fieldset>
    <fieldset><legend>2. Боевые комнаты</legend>
      <div class="mff-field"><label for="mff-autoLock">Блокировка дверей</label>
        <select id="mff-autoLock" name="lockMode">${option("party","Когда вся группа в комнате")}${option("first","При входе первого героя")}${option("off","Отключена (ручной запуск)")}</select></div>
      <p class="mff-help">Боевые двери закрываются на замок, после победы открываются. В режиме «группа» учитываются персонажи игроков на текущей сцене. Обычные проходы без дверей не блокируются.</p>
    </fieldset>
    <fieldset><legend>3. Враги</legend>
      <div class="mff-field"><label for="mff-enemyFolder">Папка NPC</label><select id="mff-enemyFolder" name="enemyFolder">${option("", "Все NPC мира")}${actorFolders.map(f => option(f.id, f.name)).join("")}</select></div>
      ${rangeField("enemyCount", "Количество врагов", 0, 50, 10)}
      ${rangeField("eliteChance", "Шанс элиты", 0, 100, 20, "%", 5)}
      ${rangeField("maxCR", "Максимальный CR", 0, 30, 3)}
      <div class="mff-field"><label for="mff-bossId">Босс</label><select id="mff-bossId" name="bossId">${option("", "Без босса")}${npcOptions.map(a => option(a.id, a.name)).join("")}</select></div>
      <p class="mff-help">CR 0 — без ограничения. Элитные NPC выбираются из верхней четверти по CR и отмечаются ★; характеристики не изменяются.</p>
    </fieldset>
    <fieldset><legend>4. Добыча</legend>
      <div class="mff-field"><label for="mff-lootMode">Режим контейнеров</label><select id="mff-lootMode" name="lootMode">
        ${option("auto",`Автоматически (${isItemPilesAvailable()?"Item Piles доступен":"обычные тайники"})`)}
        ${option("item-piles","Только Item Piles (ошибка, если выключен)")}
        ${option("legacy","Старые тайники (выдача ведущим)")}</select></div>
      <div class="mff-field"><label for="mff-lootFolder">Папка предметов</label><select id="mff-lootFolder" name="lootFolder">${option("", "Все предметы мира")}${itemFolders.map(f => option(f.id, f.name)).join("")}</select></div>
      ${rangeField("lootCount", "Количество тайников", 0, 20, 5)}
      ${rangeField("itemsPerStash", "Вещей в тайнике", 1, 6, 2)}
      ${rangeField("quality", "Качество добычи", 0, 4, 2)}
      <p class="mff-help">С Item Piles сундуки появляются как интерактивные токены: игроки открывают их и забирают добычу самостоятельно. Установите также Item Piles: D&D 5e. Без него останется прежняя выдача ведущим.</p>
    </fieldset>
    <p class="mff-hint"><strong>Редактор комнат:</strong> на панели токенов есть отдельная кнопка «Библиотека комнат», где можно загрузить PNG/WebP и вручную нанести двери, стены, укрытия, ямы и зоны NPC/LOOT/BOSS. Для режима одной сцены по-прежнему поддерживаются Drawing-зоны <code>SPAWN</code>, <code>LOOT</code> и <code>BOSS</code>.</p>
  </div>`;
}

function readConfig(dialog) {
  const form = dialog.element?.querySelector("form");
  if (!form) throw new Error("Не удалось прочитать настройки формы.");
  const fd = new FormData(form);
  const get = name => String(fd.get(name) ?? "").trim();
  return {
    name: get("name").slice(0,120) || "Случайное подземелье",
    mode: get("mode") || "rooms",
    roomCount: clamp(Number(get("roomCount")),2,35),
    floorCount:clamp(Number(get("floorCount"))||1,1,4),
    secretChance:clamp(Number(get("secretChance")),0,100),
    lockMode:get("lockMode")||"party",autoLock:get("lockMode")!=="off",
    sourceId: get("sourceId"), image: get("image"),
    gridSize: clamp(Number(get("gridSize")), 50, 200),
    enemyFolder: get("enemyFolder"), enemyCount: clamp(Number(get("enemyCount")), 0, 50),
    eliteChance: clamp(Number(get("eliteChance")), 0, 100),
    maxCR: clamp(Number(get("maxCR")), 0, 30), bossId: get("bossId"),
    lootFolder: get("lootFolder"), lootMode: get("lootMode") || "auto", lootCount: clamp(Number(get("lootCount")), 0, 20),
    itemsPerStash: clamp(Number(get("itemsPerStash")), 1, 6),
    quality: clamp(Number(get("quality")), 0, 4)
  };
}

let generatorIsRunning = false;
async function openGenerator() {
  if (!game.user?.isGM) return ui.notifications.warn("Только ведущий может создавать подземелья.");
  const dlg = new foundry.applications.api.DialogV2({
    window: {title: "Moonlighter Floor Forge — генератор этажа", resizable: true},
    content: renderForm(),
    buttons: [{
      action: "generate", label: "Создать этаж", icon: "fa-solid fa-dungeon", default: true,
      callback: async (event, button, dialog) => {
        if (generatorIsRunning) return false;
        generatorIsRunning = true;
        try {
          const config = readConfig(dialog);
          ui.notifications.info("Создаётся новый этаж...");
          const result = await generateExpedition(config);
          const s = result.summary;
          ui.notifications.info(`${result.floors||1} этаж(ей) создано. Первый этаж: ${s.enemies} NPC, ${s.loot} сундуков (${s.itemPiles} Item Piles)${s.boss ? ", босс" : ""}.${s.skipped ? ` Не удалось разместить: ${s.skipped}.` : ""}`);
          if (result.actualRooms !== null && result.actualRooms < config.roomCount)
            ui.notifications.warn(`Из ${config.roomCount} комнат получилось соединить ${result.actualRooms}. Добавьте комнаты с большим количеством дверей.`);
          if (!result.zones && config.mode === "scene") ui.notifications.warn("В сцене-шаблоне нет зон SPAWN / LOOT / BOSS: проверьте расположение токенов и тайников.");
          return true;
        } catch(error) {
          console.error(`[${MODULE_ID}] Generation failed`, error);
          ui.notifications.error(error.message || "Ошибка генерации. Подробности в консоли F12.");
          return false;
        } finally { generatorIsRunning = false; }
      }
    }, {action: "cancel", label: "Отмена", icon: "fa-solid fa-xmark"}]
  });
  await dlg.render({force: true});
  const root = dlg.element;
  if (!root) return;
  for (const el of root.querySelectorAll("[data-mff-range]")) {
    const out = root.querySelector(`output[for="${el.id}"]`);
    const suffix = el.getAttribute("data-mff-range") || "";
    el.addEventListener("input", () => { if (out) out.value = `${el.value}${suffix}`; });
  }
  const pathInput = root.querySelector("#mff-image");
  const pickButton = root.querySelector("[data-mff-pick]");
  pickButton?.addEventListener("click", () => {
    new foundry.applications.apps.FilePicker({
      type: "image", current: pathInput.value,
      callback: path => { pathInput.value = path; }
    }).render({force: true});
  });
}

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const control = controls.tokens;
  if (!control?.tools) return;
  control.tools[`${MODULE_ID}-rooms`] = {
    name: `${MODULE_ID}-rooms`,
    title: "Moonlighter — библиотека и разметка комнат",
    icon: "fa-solid fa-draw-polygon",
    order: Object.keys(control.tools).length,
    button: true, visible:true,
    onChange: () => openRoomLibrary()
  };
  control.tools[`${MODULE_ID}-director`] = {
    name:`${MODULE_ID}-director`,title:"Moonlighter — управление этажом и выдача добычи",
    icon:"fa-solid fa-chess-rook",order:Object.keys(control.tools).length,
    button:true,visible:true,onChange:()=>openDirector()
  };
  control.tools[`${MODULE_ID}-market`] = {
    name: `${MODULE_ID}-market`, title:"Moonlighter — рынок, оценка добычи и торговцы",
    icon:"fa-solid fa-store",order:Object.keys(control.tools).length,
    button:true,visible:true,onChange:()=>openMarket()
  };
  control.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: "Moonlighter Floor Forge — создать подземелье",
    icon: "fa-solid fa-dungeon",
    order: Object.keys(control.tools).length,
    button: true,
    visible: true,
    onChange: () => openGenerator()
  };
});

Hooks.once("init", () => { registerMarketSettings(); });

Hooks.once("ready", () => {
  registerAdventureHooks();
  game.moonlighterFloorForge = {open: openGenerator, rooms: openRoomLibrary, director:openDirector,market:openMarket,marketState:currentMarket};
  if (game.user?.isGM) console.info(`[${MODULE_ID}] Ready. Use Tokens toolbar > Dungeon icon or game.moonlighterFloorForge.open().`);
});
