/** Pure helpers for the Moonlighter-style expedition layer. Foundry-free. */
export const ROOM_TYPES = Object.freeze({
  random: "Случайная", entrance: "Вход", combat: "Боевая", treasure: "Сокровища",
  rest: "Отдых", secret: "Тайная", boss: "Босс",
  miniboss:"Мини-босс", sanctuary:"Источник", empty:"Пустая", hazard:"Опасная"
});
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

/** Secrets only appear on leaves so that sealing a secret door never cuts off the critical path. */
export function assignRoomTypes(layout, options = {}, rng = Math.random) {
  const count = layout.placements.length;
  const degree = Array(count).fill(0);
  for (const c of layout.connections) {degree[c.a.room]++; degree[c.b.room]++;}
  const types = Array.from({length:count},(_,i)=>{
    const preset = layout.placements[i].room.roomType || "random";
    return ["combat","treasure","rest","secret"].includes(preset) ? preset : "random";
  });
  if (!count) return types;
  types[0] = "entrance";
  if (count > 1 && options.boss) types[count-1] = "boss";
  for (let i=1;i<count;i++) {
    if (types[i]==="entrance" || types[i]==="boss") continue;
    const secretCandidate = degree[i]===1 && i!==count-1;
    if (types[i]==="secret" && !secretCandidate) types[i]="combat";
    if (types[i]==="random") {
      const roll=rng()*100;
      types[i] = secretCandidate && roll < clamp(Number(options.secretChance)||0,0,100) ? "secret"
        : roll < 20 ? "treasure" : roll < 30 ? "rest" : "combat";
    }
  }
  return types;
}
export function locateRoom(rooms, x, y) {
  const r=rooms.find(q=>x>=q.x && y>=q.y && x<q.x+q.w && y<q.y+q.h);
  return r?.index ?? null;
}
export function roomOfToken(rooms, token, gridSize=100) {
  const cx=(Number(token.x)||0)+(Number(token.width)||1)*gridSize/2;
  const cy=(Number(token.y)||0)+(Number(token.height)||1)*gridSize/2;
  return locateRoom(rooms,cx,cy);
}
export function isDefeated(token) {
  if (!token) return true;
  const actor=token.actor;
  if (!actor) return false; // Unknown actor status is not an automatic victory.
  if (actor.statuses?.has?.("dead")) return true;
  const hp=actor.system?.attributes?.hp;
  return hp && typeof hp.value === "number" && hp.value<=0;
}
export function countActiveEnemies(tokens, roomIndex) {
  return tokens.filter(t=>t.flags?.["moonlighter-floor-forge"]?.roomIndex===roomIndex &&
    t.flags?.["moonlighter-floor-forge"]?.enemy === true && !isDefeated(t)).length;
}
export function allPartyInside(tokens, rooms, roomIndex, gridSize) {
  const party=tokens.filter(t=>t.actor?.hasPlayerOwner && !t.hidden && !isDefeated(t));
  return party.length>0 && party.every(t=>roomOfToken(rooms,t,gridSize)===roomIndex);
}
export function safeItemData(item) {
  const raw=typeof item.toObject==="function" ? item.toObject() : {...item};
  const data=JSON.parse(JSON.stringify(raw));
  for (const key of ["_id","folder","ownership","sort","_stats"]) delete data[key];
  return data;
}
