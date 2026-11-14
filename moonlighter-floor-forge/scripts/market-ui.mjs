import {MARKET_GROUPS,createMarket,normalizeMarket,nextMarketDay,appraisal} from './market-core.mjs';
import {isItemPilesAvailable} from './item-piles.mjs';
import {createMarketMerchant} from './market-piles.mjs';
const MOD='moonlighter-floor-forge';
const SETTING='marketState';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opt=(id,label)=>`<option value="${esc(id)}">${esc(label)}</option>`;
export function registerMarketSettings(){
  game.settings.register(MOD,SETTING,{name:'Moonlighter: состояние рынка',hint:'Спрос и день в торговой системе.',
    scope:'world',config:false,type:Object,default:createMarket()});
}
export function currentMarket(){
  try{return normalizeMarket(game.settings.get(MOD,SETTING));}
  catch{return createMarket();}
}
async function updateMarket(value){return game.settings.set(MOD,SETTING,normalizeMarket(value));}
function folderItems(folder){
  return (game.items?.contents||[]).filter(item=>(!folder||item.folder?.id===folder) &&
    (game.system?.id!=='dnd5e'||['loot','equipment','weapon','consumable','tool','container','backpack'].includes(item.type)));
}
function marketTable(market){
  return `<table class="mff-market-table"><thead><tr><th>Категория</th><th>Спрос</th><th>Изменение стоимости</th></tr></thead><tbody>${
    Object.entries(MARKET_GROUPS).map(([key,label])=>{const value=market.demand[key];
      return `<tr><td>${esc(label)}</td><td>${value.toFixed(2)}×</td><td>${Math.round((value-1)*100)}%</td></tr>`;}).join('')
    }</tbody></table>`;
}
function marketHtml(market){
  const folders=(game.folders?.contents||[]).filter(f=>f.type==='Item').sort((a,b)=>a.name.localeCompare(b.name));
  const scene=canvas?.scene;
  const cx=Math.max(0,Math.round((Number(scene?.width)||1000)/2));
  const cy=Math.max(0,Math.round((Number(scene?.height)||1000)/2));
  return `<div class="mff-market">
    <p class="mff-description">Текущая экспедиция приносит артефакты, а их стоимость зависит от спроса. <strong>Рыночный день ${market.day}</strong>. Смена дня не изменяет цены существующих торговцев автоматически.</p>
    ${marketTable(market)}
    <fieldset><legend>Оценщик добычи</legend>
      <p class="mff-help">Выбери персонажа на сцене, затем «Оценить инвентарь». Если токен не выделен, анализируются предметы из выбранной папки мира.</p>
      <div class="mff-field"><label for="mff-shop-folder">Папка предметов</label><select id="mff-shop-folder" name="shopFolder">${opt('','Все предметы мира')}${folders.map(f=>opt(f.id,f.name)).join('')}</select></div>
    </fieldset>
    <fieldset><legend>Торговец Item Piles</legend>
      <div class="mff-field"><label for="mff-shop-name">Название магазина</label><input type="text" name="shopName" id="mff-shop-name" maxlength="80" value="Лавка артефактов" required></div>
      <div class="mff-field"><label for="mff-shop-count">Предметов в ассортименте</label><div class="mff-range"><input id="mff-shop-count" type="range" name="shopCount" min="1" max="30" value="12" data-mff-range><output for="mff-shop-count">12</output></div></div>
      <div class="mff-field"><label for="mff-shop-markup">Наценка</label><div class="mff-range"><input id="mff-shop-markup" type="range" name="shopMarkup" min="50" max="200" step="5" value="100" data-mff-range><output for="mff-shop-markup">100%</output></div></div>
      <div class="mff-field"><label>Позиция торговца на сцене</label><div class="mff-shop-pos"><input name="shopX" type="number" min="0" step="1" value="${cx}" title="X"><input name="shopY" type="number" min="0" step="1" value="${cy}" title="Y"></div></div>
      <p class="mff-help">Продаваемые предметы получают копии рыночных цен в gp. Их оригиналы и найденная игроками добыча не изменяются. Покупка, продажа и расчёты выполняются через Item Piles; его собственные торговые правила и комиссии настраиваются в интерфейсе торговца.</p>
      <p class="mff-market-status">${isItemPilesAvailable()?'Item Piles доступен: можно создать магазин.':'Item Piles недоступен: оценка и смена рыночного дня работают, создание торговца — нет.'}</p>
    </fieldset>
    <p class="mff-help">Важно: новые цены применяются только к ассортименту создаваемого торговца. Переоценка предметов, которые игрок продаёт торговцу, пока не автоматизирована.</p>
  </div>`;
}
function readForm(dialog){
  const form=dialog.element?.querySelector('form');
  if(!form)throw Error('Не удалось прочитать форму рынка.');
  const data=new FormData(form);
  const get=(name)=>String(data.get(name)??'').trim();
  return {folder:get('shopFolder'),name:get('shopName').slice(0,80)||'Лавка артефактов',
    count:Math.max(1,Math.min(30,Math.round(Number(get('shopCount'))||12))),
    markup:Math.max(.5,Math.min(2,Number(get('shopMarkup')||100)/100)),
    position:{x:Number(get('shopX')),y:Number(get('shopY'))}};
}
async function reportAppraisal(dialog){
  const cfg=readForm(dialog);
  const controlled=canvas?.tokens?.controlled?.[0]?.actor;
  const source=controlled?.items?.contents?.length?controlled.items.contents:folderItems(cfg.folder);
  if(!source.length)throw Error('Нет предметов для оценки. Выбери персонажа или папку с предметами.');
  const market=currentMarket();
  const entries=source.slice(0,100).map(i=>appraisal(i,market)).sort((a,b)=>b.suggestedGP-a.suggestedGP);
  const html=`<div class="mff-market-report"><p>День ${market.day}. Источник: ${esc(controlled?.name||'предметы мира')}. Показаны первые ${entries.length} предметов.</p>
    <table class="mff-market-table"><thead><tr><th>Предмет</th><th>Категория</th><th>Оценка</th></tr></thead><tbody>${entries.map(v=>`<tr><td>${esc(v.name)}${v.isEstimate?' <small title="Примерная цена по редкости">*</small>':''}</td><td>${esc(MARKET_GROUPS[v.category])}</td><td>${v.suggestedGP.toFixed(2)} gp</td></tr>`).join('')}</tbody></table><p class="mff-help">* Если цена предмета не задана системой, используется ориентировочная оценка по редкости. Это справочная стоимость, не автоматическое изменение инвентаря.</p></div>`;
  await foundry.applications.api.DialogV2.wait({window:{title:'Moonlighter — оценка добычи',resizable:true},content:html,
    buttons:[{action:'close',label:'Закрыть',default:true}]});
}
async function placeMerchant(dialog){
  const scene=canvas?.scene;
  if(!scene)throw Error('Открой сцену, на которой нужно разместить торговца.');
  const conf=readForm(dialog);
  const pool=folderItems(conf.folder);
  if(!pool.length)throw Error('Папка не содержит подходящих предметов.');
  const id=foundry.utils.randomID();
  const result=await createMarketMerchant(scene,{id,name:conf.name,position:conf.position,
    items:pool,stockCount:conf.count,market:currentMarket(),markup:conf.markup});
  ui.notifications.info(`Создан магазин «${conf.name}»: ${result.count} товаров. Открой токен через Item Piles.`);
  return true;
}
let changing=false;
export async function openMarket(){
  if(!game.user?.isGM)return ui.notifications.warn('Панель рынка доступна ведущему.');
  const dialog=new foundry.applications.api.DialogV2({
    window:{title:'Moonlighter — рынок и торговля',resizable:true},content:marketHtml(currentMarket()),
    buttons:[
      {action:'appraise',icon:'fa-solid fa-magnifying-glass-dollar',label:'Оценить предметы',callback:async (e,b,d)=>{
        try{await reportAppraisal(d);return false;}catch(error){ui.notifications.error(error.message);return false;}}},
      {action:'next',icon:'fa-solid fa-calendar-day',label:'Следующий день',callback:async()=>{
        if(changing)return false;changing=true;
        try{const m=nextMarketDay(currentMarket());await updateMarket(m);
          ui.notifications.info(`Рынок обновлён: день ${m.day}.`);void openMarket();return true;}
        catch(error){ui.notifications.error(error.message);return false;}finally{changing=false;}}},
      {action:'merchant',icon:'fa-solid fa-store',label:'Создать торговца',callback:async(e,b,d)=>{
        try{await placeMerchant(d);return true;}catch(error){console.error(`[${MOD}] merchant creation`,error);ui.notifications.error(error.message);return false;}}},
      {action:'cancel',label:'Закрыть'}
    ]
  });
  await dialog.render({force:true});
  const el=dialog.element;
  el?.querySelectorAll('[data-mff-range]').forEach(input=>{
    const output=el.querySelector(`output[for="${input.id}"]`);
    input.addEventListener('input',()=>{if(output)output.textContent=`${input.value}${input.name==='shopMarkup'?'%':''}`;});
  });
  return dialog;
}
