/** Deterministic, system-independent market math. No Foundry globals or side effects. */
export const MARKET_GROUPS = Object.freeze({
  artifacts: 'Артефакты', gear: 'Снаряжение', potions: 'Расходники', materials: 'Материалы', other: 'Прочее'
});
export const MARKET_GROUP_KEYS = Object.freeze(Object.keys(MARKET_GROUPS));
const RARITY_BASE = {common:2, uncommon:25, rare:150, veryrare:750, legendary:3000, artifact:7500};
export function bound(number,min,max){return Math.min(max,Math.max(min,Number(number)||0));}
const round2 = n=>Math.round((n+Number.EPSILON)*100)/100;
export function marketCategory(item){
  const type=String(item?.type||'').toLowerCase();
  if(['weapon','equipment','armor','tool','backpack','container'].includes(type))return 'gear';
  if(['consumable','spell','scroll'].includes(type))return 'potions';
  if(['loot','treasure'].includes(type))return 'artifacts';
  if(['material','ingredient'].includes(type))return 'materials';
  return 'other';
}
export function rarityKey(item){return String(item?.system?.rarity||'common').replace(/[\s_-]/g,'').toLowerCase();}
/** D&D 5e item price; converting only numeric currency values. */
export function basePriceGP(item){
  const price=item?.system?.price;
  let raw;
  let denomination='gp';
  if(typeof price==='number')raw=price;
  else if(price && typeof price==='object'){
    raw=price.value;
    denomination=String(price.denomination||price.currency||'gp').toLowerCase();
  }
  else if(typeof price==='string' && price.trim()!=='')raw=price;
  const amount=Number(raw);
  if(!Number.isFinite(amount)||amount<=0)return null;
  const ratios={cp:.01,sp:.1,ep:.5,gp:1,pp:10};
  return round2(amount*(ratios[denomination]??1));
}
export function createMarket(){return {version:1,day:1,demand:Object.fromEntries(MARKET_GROUP_KEYS.map(k=>[k,1]))};}
export function normalizeMarket(value){
  const baseline=createMarket();
  return {version:1,day:Math.max(1,Math.floor(Number(value?.day)||1)),demand:Object.fromEntries(MARKET_GROUP_KEYS.map(key=>
    [key,round2(bound(value?.demand?.[key]??1,.6,1.5))]))};
}
export function nextMarketDay(market,rng=Math.random){
  const current=normalizeMarket(market);
  return {version:1,day:current.day+1,demand:Object.fromEntries(MARKET_GROUP_KEYS.map(key=>{
    const factor=.9+bound(rng(),0,1)*.2; // 0.90 — 1.10, per day
    return [key,round2(bound(current.demand[key]*factor,.6,1.5))];
  }))};
}
/** Advisory value. Non-priced artifacts use rarity estimates, not canon D&D prices. */
export function appraisal(item,market,{markup=1}={}){
  const current=normalizeMarket(market);
  const category=marketCategory(item);
  const explicit=basePriceGP(item);
  const base=explicit??(RARITY_BASE[rarityKey(item)]??RARITY_BASE.common);
  const demand=current.demand[category];
  const value=round2(Math.max(.01,base*demand*bound(markup,.5,2.5)));
  return {name:String(item?.name||'Предмет'),category,rarity:rarityKey(item),baseGP:base,
    suggestedGP:value,lowGP:round2(value*.8),highGP:round2(value*1.2),demand,
    isEstimate:explicit===null};
}
/** Copy only. Applying prices to merchant stocks never edits World Items or PC loot. */
export function priceItemForStock(item,market,markup=1){
  const raw=typeof item?.toObject==='function'?item.toObject():item;
  const data=JSON.parse(JSON.stringify(raw));
  for(const key of ['_id','_stats','folder','ownership','sort'])delete data[key];
  data.system??={};
  data.system.price={value:appraisal(item,market,{markup}).suggestedGP,denomination:'gp'};
  return data;
}
/** Sampling without replacement; GM determines available stock, not the floor RNG. */
export function pickMerchantStock(items,count,rng=Math.random){
  const pool=items.slice();
  const out=[];
  const n=Math.min(Math.max(0,Math.floor(Number(count)||0)),pool.length);
  for(let i=0;i<n;i++){
    const idx=Math.min(pool.length-1,Math.floor(bound(rng(),0,.999999)*pool.length));
    out.push(pool.splice(idx,1)[0]);
  }
  return out;
}
