/** Optional integration with Item Piles (public API). No imports from Item Piles internals. */
const MODULE_ID = 'moonlighter-floor-forge';
const ITEM_PILES_ID = 'item-piles';
const DND5E_SUPPORT_ID = 'itempilesdnd5e';
export const CHEST_IMAGE = 'modules/moonlighter-floor-forge/assets/chest-closed.svg';
export const OPEN_CHEST_IMAGE = 'modules/moonlighter-floor-forge/assets/chest-open.svg';

export function isItemPilesAvailable() {
  return Boolean(game?.modules?.get?.(ITEM_PILES_ID)?.active &&
    game?.itempiles?.API && typeof game.itempiles.API.createItemPile === 'function' &&
    (game?.system?.id !== 'dnd5e' || game?.modules?.get?.(DND5E_SUPPORT_ID)?.active));
}

/** `auto` leaves legacy loot intact if the optional modules are not installed. */
export function resolveLootMode(preference = 'auto') {
  if (preference === 'legacy') return 'legacy';
  if (isItemPilesAvailable()) return 'item-piles';
  if (preference === 'item-piles') {
    throw new Error('Для контейнеров установите и включите Item Piles и Item Piles: D&D 5e (для системы D&D 5e).');
  }
  return 'legacy';
}

function chestToken(scene, chestId) {
  return scene?.tokens?.contents?.find(token => token.flags?.[MODULE_ID]?.chestId === chestId) || null;
}

/**
 * Create a separate unlinked container token with its own inventory.
 * Item Piles handles player interaction, inventory transfers and empty state.
 * Never copy these items to adventure flags: that would create a second source of truth.
 */
export async function createChestPile(scene, {chestId, label, roomIndex, pos, items}) {
  if (!isItemPilesAvailable()) throw new Error('Item Piles не активен или нет системной интеграции.');
  const existing = chestToken(scene, chestId);
  if (existing) return {tokenId: existing.id, tokenUuid: existing.uuid || null, alreadyPresent:true};
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) throw new Error('Неверные координаты сундука.');
  const api = game.itempiles.API;
  const flags = {[MODULE_ID]: {chestId, roomIndex: roomIndex ?? null, sceneId: scene.id}};
  const tokenData = {
    name: label, width: 0.7, height: 0.7,
    texture: {src: CHEST_IMAGE},
    flags,
    displayName: 20,
    // Each new token has an unlinked actor delta, not a shared chest inventory.
    actorLink: false
  };
  const pileSettings = {
    enabled: true,
    type: game.itempiles.pile_types?.CONTAINER || 'container',
    closed: true, locked: false,
    deleteWhenEmpty: false,
    closedImage: CHEST_IMAGE,
    openedImage: CHEST_IMAGE,
    emptyImage: CHEST_IMAGE
  };
  const itemData = items.map(item => {
    const data = structuredCloneSafe(item);
    delete data._id; delete data._stats; delete data.folder; delete data.ownership;
    return data;
  });
  const result = await api.createItemPile({
    sceneId: scene.id,
    position: {x: pos.x, y: pos.y},
    tokenOverrides: tokenData,
    itemPileFlags: pileSettings,
    items: itemData
  });
  // API return shape varies across versions (UUID string, or tokenUuid object).
  const token = chestToken(scene, chestId);
  const tokenUuid = typeof result === 'string' ? result : result?.tokenUuid || token?.uuid || null;
  if (!tokenUuid && !token) throw new Error(`Item Piles не подтвердил создание токена сундука «${label}».`);
  return {tokenId: token?.id || extractTokenId(scene, tokenUuid), tokenUuid};
}
function structuredCloneSafe(value) { return JSON.parse(JSON.stringify(value)); }
function extractTokenId(scene, uuid) {
  const m = typeof uuid === 'string' && uuid.match(/Scene\.([^\.]+)\.Token\.([^\.]+)/);
  return m?.[1] === scene.id ? m[2] : null;
}
export function findChestPile(scene, chest) {
  if (!scene || !chest) return null;
  return scene.tokens?.get?.(chest.tokenId) || chestToken(scene, chest.id);
}
export function chestPileStatus(scene, chest) {
  if (chest.mode !== 'item-piles') return 'legacy';
  const token = findChestPile(scene, chest);
  if (!token) return 'missing';
  if (!isItemPilesAvailable()) return 'disabled';
  try { return game.itempiles.API.isItemPileEmpty(token) ? 'empty' : 'available'; }
  catch { return 'unknown'; }
}
export async function showChestPile(scene, chest) {
  if (!isItemPilesAvailable()) throw new Error('Включите Item Piles и его поддержку D&D 5e.');
  const token = findChestPile(scene, chest);
  if (!token) throw new Error('Токен сундука не найден. Возможно, он был удалён.');
  return game.itempiles.API.renderItemPileInterface(token);
}

/** Convert previously generated v0.3 GM loot. Never convert claimed chests. */
export async function migrateLegacyChests(scene) {
  if (!game.user?.isGM) throw new Error('Только ведущий может конвертировать сундуки.');
  if (!isItemPilesAvailable()) throw new Error('Требуется активный Item Piles и поддержка D&D 5e.');
  const state = scene?.getFlag?.(MODULE_ID, 'adventure');
  if (!state?.chests) throw new Error('На сцене нет сундуков предыдущей версии.');
  const outcomes = {converted:0, skipped:0, errors:[]};
  for (let i=0; i<state.chests.length; i++) {
    // Read fresh flags after each write to reduce risk of overwriting other state.
    const current = scene.getFlag(MODULE_ID,'adventure');
    const chest = current?.chests?.[i];
    if (!chest || chest.mode === 'item-piles' || chest.claimed || !chest.items?.length) {
      outcomes.skipped++; continue;
    }
    const note = scene.notes?.contents?.find(n =>
      n.flags?.[MODULE_ID]?.stashIndex === i || n.flags?.[MODULE_ID]?.chestId === chest.id);
    if (!note) {outcomes.errors.push(`${chest.label}: не найдена старая отметка на карте`);continue;}
    const grid = Number(scene.grid?.size || 100);
    const pos = {x: Math.round(note.x-grid*0.35), y: Math.round(note.y-grid*0.35)};
    try {
      const data = await createChestPile(scene, {
        chestId: chest.id, label:`Тайник ${chest.label}`, roomIndex:chest.roomIndex,
        pos, items:chest.items.map(row=>row.data)
      });
      // Persist the mode switch BEFORE removing original GM markers.
      const fresh = structuredCloneSafe(scene.getFlag(MODULE_ID,'adventure'));
      fresh.chests[i] = {...fresh.chests[i], mode:'item-piles', tokenId:data.tokenId,
        tokenUuid:data.tokenUuid, items:[]};
      await scene.setFlag(MODULE_ID,'adventure',fresh);
      await scene.deleteEmbeddedDocuments('Note',[note.id]);
      const tiles = scene.tiles?.contents?.filter(t => t.flags?.[MODULE_ID]?.chestId === chest.id) || [];
      if (tiles.length) await scene.deleteEmbeddedDocuments('Tile',tiles.map(t=>t.id));
      outcomes.converted++;
    } catch(error) {
      outcomes.errors.push(`${chest.label}: ${error.message}`);
      console.error(`[${MODULE_ID}] Unable to migrate chest`,chest.id,error);
    }
  }
  return outcomes;
}
