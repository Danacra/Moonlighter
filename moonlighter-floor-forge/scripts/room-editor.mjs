/** UI: reusable map-room templates and point-and-click spatial annotation. */
import {normalizeRoom, renderLayout} from "./room-core.mjs";
import {clamp,centerOf,widthOf,placeDoor,overlaps,hitDoor} from "./room-editor-geometry.mjs";
import {ROOM_TYPES} from "./adventure-core.mjs";
const MODULE_ID="moonlighter-floor-forge";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tools=[
  ["door","🚪 Дверь"],["passage","↔️ Проход"],["wall","▰ Стена"],
  ["cover","▤ Укрытие"],["pit","◉ Яма"],["SPAWN","⚔ NPC"],
  ["LOOT","◆ Лут"],["BOSS","★ Босс"]
];
const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(e){console.error(`[${MODULE_ID}]`,e);ui.notifications.error(e.message||"Ошибка редактора комнат");return false;}};
const fileBrowser=(input)=>new foundry.applications.apps.FilePicker({type:"image",current:input.value,
  callback:path=>{input.value=path;}}).render({force:true});

async function imageDimensions(src) {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve({w:img.naturalWidth,h:img.naturalHeight});
    img.onerror=()=>reject(Error("Невозможно открыть изображение. Проверьте путь или загрузите файл через FilePicker."));
    img.src=src;
  });
}

export async function openRoomLibrary() {
  if (!game.user?.isGM) return ui.notifications.warn("Доступно только ведущему");
  const scenes=game.scenes.contents.filter(s=>normalizeRoom(s));
  const content=`<div class="mff-library">
    <p>Сначала создайте шаблоны комнат, затем разметьте края дверями и проходами. Стены, укрытия, ямы и зоны появления добавляются мышью в редакторе. Комнаты сохраняются как сцены-шаблоны в мире.</p>
    <div class="mff-library-list">${scenes.length ? scenes.map(s=>{
      const r=normalizeRoom(s);
      return `<div class="mff-library-item"><span><strong>${esc(s.name)}</strong><small>${r.cols} × ${r.rows} клеток · ${esc(ROOM_TYPES[r.roomType]||"Случайная")} · дверей: ${r.doors?.length||0}</small></span><button type="button" data-mff-edit="${esc(s.id)}"><i class="fa-solid fa-pen"></i> Разметить</button></div>`;
    }).join(""):"<p>Шаблонов ещё нет.</p>"}</div>
    <button type="button" class="mff-primary" data-mff-new><i class="fa-solid fa-plus"></i> Загрузить новую комнату</button>
  </div>`;
  const d=new foundry.applications.api.DialogV2({window:{title:"Moonlighter — библиотека комнат",resizable:true},content,
    buttons:[{action:"close",label:"Закрыть",icon:"fa-solid fa-xmark"}]});
  await d.render({force:true});
  d.element?.querySelector("[data-mff-new]")?.addEventListener("click",safe(async()=>openCreateRoom()));
  for(const button of d.element?.querySelectorAll("[data-mff-edit]")||[])
    button.addEventListener("click",safe(async()=>{
      const scene=game.scenes.get(button.getAttribute("data-mff-edit"));
      if (scene) await openRoomEditor(scene);
    }));
}

async function openCreateRoom() {
  const options=game.scenes.contents.filter(s=>!normalizeRoom(s)).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  const content=`<div class="mff-form mff-newroom">
    <p>Загрузите изображение отдельной комнаты (PNG/WebP/JPG). Вместо него можно выбрать существующую сцену с фоновым изображением.</p>
    <div class="mff-field"><label>Название шаблона</label><input id="mff-room-name" type="text" value="Новая комната" maxlength="100"></div>
    <div class="mff-field"><label>Взять фон сцены</label><select id="mff-room-source"><option value="">— Изображение ниже —</option>${options}</select></div>
    <div class="mff-field"><label>Файл изображения</label><div class="mff-file"><input type="text" id="mff-room-image" placeholder="maps/room01.webp"><button type="button" data-pick-room><i class="fa-solid fa-folder-open"></i></button></div></div>
    <div class="mff-field"><label>Пикселей на клетку</label><input id="mff-room-grid" type="number" min="40" max="300" value="100"></div>
    <div class="mff-field"><label>Клеток по горизонтали (необязательно)</label><input id="mff-room-cols" type="number" min="2" max="100" placeholder="Автоматически"></div>
    <div class="mff-field"><label>Клеток по вертикали (необязательно)</label><input id="mff-room-rows" type="number" min="2" max="100" placeholder="Автоматически"></div>
    <p class="mff-help">Если изображение не кратно размеру клетки, укажите точные размеры, например 22 × 13. Пропорции изображения должны соответствовать количеству клеток.</p>
    <p class="mff-help">Изображение автоматически подстраивается под целое число клеток. Все шаблоны совместимы в итоговой карте даже при разном исходном разрешении.</p></div>`;
  const d=new foundry.applications.api.DialogV2({window:{title:"Добавить шаблон комнаты",resizable:true},content,buttons:[
    {action:"create",label:"Создать и разметить",icon:"fa-solid fa-plus",default:true,
      callback:safe(async(_evt,_button,dialog)=>{
        const root=dialog.element;
        const name=root.querySelector("#mff-room-name").value.trim()||"Новая комната";
        const from=game.scenes.get(root.querySelector("#mff-room-source").value);
        const image=from?.background?.src||root.querySelector("#mff-room-image").value.trim();
        if(!image) throw Error("Сначала выберите изображение комнаты или сцену с фоном.");
        const grid=Math.max(40,Math.min(300,Number(from?.grid?.size || root.querySelector("#mff-room-grid").value||100)));
        const imageSize=await imageDimensions(image);
        const overrideCols=Number(root.querySelector("#mff-room-cols").value)||0;
        const overrideRows=Number(root.querySelector("#mff-room-rows").value)||0;
        const cols=Math.max(2,Math.round(overrideCols||(overrideRows?overrideRows*imageSize.w/imageSize.h:imageSize.w/grid)));
        const rows=Math.max(2,Math.round(overrideRows||(overrideCols?overrideCols*imageSize.h/imageSize.w:imageSize.h/grid)));
        if(Math.abs(cols/rows-imageSize.w/imageSize.h)/(imageSize.w/imageSize.h)>0.04)
          throw Error("Число клеток и пропорции изображения не совпадают. Исправьте размеры, чтобы избежать растяжения и кривой сетки.");
        if(cols>100 || rows>100) throw Error("Комната слишком большая (максимум 100 × 100 клеток). Увеличьте значение пикселей на клетку.");
        const room={image,cols,rows,roomType:"random",doors:[],walls:[],covers:[],pits:[],zones:[]};
        const scene=await Scene.create({name,active:false,navigation:false,
          background:{src:image},width:cols*grid,height:rows*grid,padding:0,
          grid:{type:1,size:grid,distance:5,units:"ft"},
          flags:{[MODULE_ID]:{room}}});
        if (!scene) throw Error("Не удалось создать сцену-шаблон.");
        ui.notifications.info(`Шаблон «${name}» создан. Теперь обозначьте двери и препятствия.`);
        await openRoomEditor(scene);
        return true;
      })},
    {action:"cancel",label:"Отмена"}]});
  await d.render({force:true});
  d.element?.querySelector("[data-pick-room]")?.addEventListener("click",()=>fileBrowser(d.element.querySelector("#mff-room-image")));
  d.element?.querySelector("#mff-room-source")?.addEventListener("change",e=>{
    const s=game.scenes.get(e.target.value);
    if(s?.background?.src) d.element.querySelector("#mff-room-image").value=s.background.src;
  });
}

function svgShape(state,tool,shape) {
  const lineStyle=({wall:"#ffde7b"})[tool];
  if (tool==="door"||tool==="passage"){
    const position=centerOf(shape), w=widthOf(shape);
    const horizontal=shape.side==="N"||shape.side==="S";
    const bx=horizontal?position:shape.side==="W"?0:state.cols;
    const by=horizontal?shape.side==="N"?0:state.rows:position;
    const hx=horizontal?bx:shape.side==="W"?.35:state.cols-.35;
    const hy=horizontal?shape.side==="N"?.35:state.rows-.35:by;
    const line=horizontal
      ? '<line x1="'+(bx-w/2)+'" y1="'+by+'" x2="'+(bx+w/2)+'" y2="'+by+'"'
      : '<line x1="'+bx+'" y1="'+(by-w/2)+'" x2="'+bx+'" y2="'+(by+w/2)+'"';
    const color=tool==="door"?"#69d8ff":"#65ef8a";
    return line+' stroke="'+color+'" stroke-width=".16" stroke-linecap="round"/>'
      +'<circle cx="'+hx+'" cy="'+hy+'" r=".30" fill="'+color+'" stroke="#171717" stroke-width=".075"/>'
      +'<text x="'+hx+'" y="'+(hy+.115)+'" text-anchor="middle" font-size=".34" fill="#15212b">'+(tool==="door"?"D":"P")+'</text>';
  }
  if(tool==="wall") return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${lineStyle}" stroke-width=".16" stroke-linecap="round"/>`;
  const col={cover:["#d69f57","#ffd08b"],pit:["#210f15","#ff566c"],SPAWN:["#39d577","#55ff99"],LOOT:["#e5d34e","#ffea7a"],BOSS:["#cf80ff","#e2aeff"]}[tool];
  return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="${col[0]}" fill-opacity=".25" stroke="${col[1]}" stroke-width=".13" stroke-dasharray=".2 .1"/>`;
}
const snap=v=>Math.round(v*2)/2;
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));

export async function openRoomEditor(scene) {
  if(!game.user?.isGM) return;
  const orig=normalizeRoom(scene);
  if(!orig) throw Error("Эта сцена не является комнатой Moonlighter.");
  const state=foundry.utils.deepClone(orig);
  state.roomType??="random";
  state.autoPerimeterWalls??=!(state.walls?.length);
  const history=[];
  const toolButtons=tools.map(([id,label])=>`<button type="button" data-room-tool="${id}" class="${id==="door"?"selected":""}">${label}</button>`).join("");
  const content=`<div class="mff-room-editor">
    <p><strong>${esc(scene.name)}</strong> · ${state.cols}×${state.rows} клеток. Обозначай двери на границе карты. Стены ставь двумя кликами, укрытия/ямы/зоны — перетягиванием мыши.</p>

    <section class="mff-editor-toolbar" aria-label="Настройки редактора">
      <div class="mff-editor-section">
        <div class="mff-editor-section-title">Комната и назначение</div>
        <div class="mff-editor-settings">
          <label for="mff-room-kind">Тип комнаты</label>
          <select id="mff-room-kind">${Object.entries(ROOM_TYPES).map(([id,label])=>`<option value="${id}" ${state.roomType===id?"selected":""}>${esc(label)}</option>`).join("")}</select>
        </div>
        <p class="mff-editor-tip">«Вход» — первая комната; «Тайная» — необязательный тупик; «Босс» — финальная арена.</p>
      </div>
      <div class="mff-editor-section">
        <div class="mff-editor-section-title">Инструмент разметки</div>
        <div class="mff-editor-tools">${toolButtons}</div>
      </div>
      <div class="mff-editor-section">
        <div class="mff-editor-section-title">Двери и стены</div>
        <div class="mff-door-range-row">
          <label for="mff-door-width">Ширина новой двери</label>
          <input id="mff-door-width" type="range" value="1" min=".25" max="2" step=".25">
          <output id="mff-door-width-out" for="mff-door-width">1.00 клетки</output>
        </div>
        <div class="mff-wall-options">
          <label class="mff-check-line"><input id="mff-snap-walls" type="checkbox" checked><span>Привязка стен к половине клетки</span></label>
          <label class="mff-check-line"><input id="mff-auto-perimeter" type="checkbox" ${state.autoPerimeterWalls?"checked":""}><span>Автоматический внешний контур комнаты</span></label>
        </div>
        <p class="mff-editor-tip">Если обводишь стены вручную, выключи автоматический внешний контур — иначе стены могут дублироваться.</p>
      </div>
      <p class="mff-editor-shorthelp">Щёлкни возле края комнаты, чтобы поставить дверь. Перетащи бирюзовый маркер для перемещения. Выбери маркер, чтобы настроить координаты.</p>
    </section>
    <div class="mff-editor-canvas" style="aspect-ratio:${state.cols}/${state.rows};max-width:min(100%,${Math.round(60*state.cols/state.rows)}vh)">
      <img src="${esc(state.image)}" draggable="false" alt="Карта комнаты">
      <svg xmlns="http://www.w3.org/2000/svg" id="mff-annotation-svg" viewBox="0 0 ${state.cols} ${state.rows}" preserveAspectRatio="none">
        <defs><pattern id="mff-grid-pattern" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".025"/></pattern></defs>
        <rect width="${state.cols}" height="${state.rows}" fill="transparent" pointer-events="all"/>
        <rect width="${state.cols}" height="${state.rows}" fill="url(#mff-grid-pattern)" pointer-events="none"/>
        <g id="mff-annotations" pointer-events="none"></g><g id="mff-draft" pointer-events="none"></g>
      </svg>
    </div>
      <div class="mff-door-inspector" id="mff-door-inspector" hidden>
        <div class="mff-editor-section-title">Выбранный проём — точная настройка</div>
        <div class="mff-inspector-grid">
          <label for="mff-selected-side">Сторона
            <select id="mff-selected-side"><option value="N">Север</option><option value="E">Восток</option><option value="S">Юг</option><option value="W">Запад</option></select>
          </label>
          <label for="mff-selected-offset">Положение (клетки)
            <input id="mff-selected-offset" type="number" min="0" step=".01">
          </label>
          <label for="mff-selected-width">Ширина (клетки)
            <input id="mff-selected-width" type="number" min=".25" max="2" step=".25">
          </label>
          <button type="button" data-mff-door-remove>Удалить дверь</button>
        </div>
      </div>
    <div class="mff-editor-footer"><span id="mff-editor-status">Дверей: 0 · Стен: 0</span>
      <button type="button" data-room-undo>↩ Отменить</button><button type="button" data-room-clear>Очистить</button></div>
    <p class="mff-help">Рисованные двери на PNG не перемещаются — редактор управляет только проходом и стеной Foundry. Дверь теперь можно поставить в любом месте на границе комнаты. Для соединения у обоих проёмов должна совпадать ширина. Двери автоматически стыкуются с дверями других комнат; непарные проёмы закрываются стеной. <strong>Обычная дверь</strong> станет интерактивной дверью Foundry, <strong>проход</strong> будет оставлен открытым. Ямы не наносят урон автоматически.</p>
  </div>`;
  // Foundry v13 sanitizes dialog HTML strings and can strip embedded SVG.
  // Pass a trusted DOM element so the drawing layer and tool bindings survive.
  const trustedContent = document.createElement("div");
  trustedContent.innerHTML = content;
  const d=new foundry.applications.api.DialogV2({window:{title:`Разметка комнаты: ${scene.name}`,resizable:true},content:trustedContent,
    buttons:[{action:"save",label:"Сохранить разметку",default:true,icon:"fa-solid fa-floppy-disk",
      callback:safe(async()=>{
        if(!state.doors.length) {ui.notifications.warn("Для соединения комнат отметьте хотя бы одну дверь или проход.");return false;}
        const data={image:state.image,cols:state.cols,rows:state.rows,roomType:state.roomType,autoPerimeterWalls:state.autoPerimeterWalls,doors:state.doors,
          walls:state.walls,covers:state.covers,pits:state.pits,zones:state.zones};
        await scene.setFlag(MODULE_ID,"room",data);
        // Create actual Foundry WallDocuments on the source template as well.
        // Only delete our own previously generated preview walls, never GM-authored walls.
        const preview=renderLayout({
          placements:[{room:{...data,id:scene.id,name:scene.name},rotation:0,x:0,y:0,
            cols:state.cols,rows:state.rows,
            doors:state.doors.map((d,originalIndex)=>({...d,originalIndex}))}],
          connections:[],cols:state.cols,rows:state.rows
        },Number(scene.grid?.size||100),["combat"]);
        const stale=scene.walls.contents.filter(w=>w.flags?.[MODULE_ID]?.templatePreview===true);
        if(stale.length)await scene.deleteEmbeddedDocuments("Wall",stale.map(w=>w.id));
        if(preview.walls.length) await scene.createEmbeddedDocuments("Wall",
          preview.walls.map(w=>({...w,flags:{...(w.flags||{}),[MODULE_ID]:{templatePreview:true}}})));
        ui.notifications.info(`Разметка «${scene.name}» сохранена: дверей ${state.doors.length}, стен в шаблоне ${preview.walls.length}.`);
        return true;
      })}, {action:"cancel",label:"Отмена"}]});
  await d.render({force:true});
  const root=d.element, svg=root?.querySelector("#mff-annotation-svg");
  if (!svg) {
    const message="Не удалось создать SVG для разметки. Откройте консоль (F12) и сообщите ошибку разработчику.";
    console.error(`[${MODULE_ID}] ${message}`,{dialog:d,root});
    ui.notifications.error(message);
    return;
  }

  const perimeterCheckbox=root.querySelector("#mff-auto-perimeter");
  perimeterCheckbox?.addEventListener("change",e=>{state.autoPerimeterWalls=e.target.checked;});
  const typeSelector=root.querySelector("#mff-room-kind");
  if(!typeSelector) {
    ui.notifications.error("Не найден выбор типа комнаты. Проверьте модуль и обновите страницу Foundry.");
    return;
  }
  typeSelector.value=state.roomType;
  typeSelector.addEventListener("change",event=>{state.roomType=event.target.value;});
  let tool="door",pendingWall=null,dragStart=null,selected=-1,dragDoor=null;
  const inspector=root.querySelector("#mff-door-inspector");
  const status=root.querySelector("#mff-editor-status");
  const shapes=root.querySelector("#mff-annotations");
  const draft=root.querySelector("#mff-draft");
  const widthSlider=root.querySelector("#mff-door-width");
  const widthOut=root.querySelector("#mff-door-width-out");
  const selectedSide=root.querySelector("#mff-selected-side");
  const selectedOffset=root.querySelector("#mff-selected-offset");
  const selectedWidth=root.querySelector("#mff-selected-width");
  widthSlider?.addEventListener("input",()=>{widthOut.textContent=Number(widthSlider.value).toFixed(2)+" клетки";});
  const snapshot=()=>history.push(JSON.stringify({doors:state.doors,walls:state.walls,covers:state.covers,pits:state.pits,zones:state.zones}));
  const locate=event=>{
    const r=svg.getBoundingClientRect();
    return {x:clamp((event.clientX-r.left)/r.width*state.cols,0,state.cols),
      y:clamp((event.clientY-r.top)/r.height*state.rows,0,state.rows)};
  };
  const pointForWall=p=>root.querySelector("#mff-snap-walls")?.checked
    ? {x:clamp(snap(p.x),0,state.cols),y:clamp(snap(p.y),0,state.rows)}
    : {x:clamp(Math.round(p.x*100)/100,0,state.cols),y:clamp(Math.round(p.y*100)/100,0,state.rows)};
  const areaShape=(a,b)=>{
    const x=clamp(snap(Math.min(a.x,b.x)),0,state.cols),y=clamp(snap(Math.min(a.y,b.y)),0,state.rows);
    const x2=clamp(snap(Math.max(a.x,b.x)),0,state.cols),y2=clamp(snap(Math.max(a.y,b.y)),0,state.rows);
    return {x,y,w:x2-x,h:y2-y};
  };
  const selectDoor=i=>{
    selected=i>=0&&i<state.doors.length?i:-1;
    inspector.hidden=selected<0;
    if(selected<0)return;
    const d=state.doors[selected];
    selectedSide.value=d.side;
    selectedOffset.max=String((d.side==="N"||d.side==="S"?state.cols:state.rows)-widthOf(d)/2);
    selectedOffset.min=String(widthOf(d)/2);
    selectedOffset.value=String(Number(centerOf(d).toFixed(2)));
    selectedWidth.value=String(widthOf(d));
  };
  function redraw(){
    shapes.innerHTML=[
      ...state.doors.map((x,i)=>svgShape(state,x.kind,x).replace('stroke="#171717"', 'stroke="'+(i===selected?"#fff6a7":"#171717")+'"')),
      ...state.walls.map(x=>svgShape(state,"wall",x)),
      ...state.covers.map(x=>svgShape(state,"cover",x)),
      ...state.pits.map(x=>svgShape(state,"pit",x)),
      ...state.zones.map(x=>svgShape(state,x.kind,x))
    ].join("");
    status.textContent="Дверей/проходов: "+state.doors.length+" · Стен: "+state.walls.length
      +" · Укрытий: "+state.covers.length+" · Ям: "+state.pits.length+" · Зон: "+state.zones.length
      +" · Тип: "+(typeSelector.selectedOptions[0]?.textContent||state.roomType);
  }
  function clearPending(){pendingWall=null;dragStart=null;dragDoor=null;draft.innerHTML="";}
  function applySelectedChange(){
    if(selected<0)return;
    const old=state.doors[selected];
    const side=selectedSide.value;
    const max=side==="N"||side==="S"?state.cols:state.rows;
    const width=clamp(Number(selectedWidth.value)||1,.25,Math.min(2,max));
    const offset=clamp(Math.round((Number(selectedOffset.value)||.5)*100)/100,width/2,max-width/2);
    const candidate={...old,side,index:Math.floor(offset),offset,width};
    if(overlaps(state.doors,candidate,selected)){
      ui.notifications.warn("Дверные проёмы пересекаются");
      selectDoor(selected);return;
    }
    snapshot();state.doors[selected]=candidate;
    selectDoor(selected);redraw();
  }
  for(const input of [selectedSide,selectedOffset,selectedWidth])
    input.addEventListener("change",applySelectedChange);
  root.querySelector("[data-mff-door-remove]")?.addEventListener("click",()=>{
    if(selected<0)return;
    snapshot();state.doors.splice(selected,1);selectDoor(-1);redraw();
  });
  for(const button of root.querySelectorAll("[data-room-tool]"))button.addEventListener("click",()=>{
    tool=button.getAttribute("data-room-tool");
    root.querySelectorAll("[data-room-tool]").forEach(el=>el.classList.toggle("selected",el===button));
    clearPending();if(!["door","passage"].includes(tool))selectDoor(-1);
  });
  root.querySelector("[data-room-undo]")?.addEventListener("click",()=>{
    if(!history.length)return;
    Object.assign(state,JSON.parse(history.pop()));clearPending();selectDoor(-1);redraw();
  });
  root.querySelector("[data-room-clear]")?.addEventListener("click",()=>{
    if(!window.confirm("Удалить всю разметку этой комнаты? Сохранение — только по кнопке «Сохранить».") )return;
    snapshot();state.doors=[];state.walls=[];state.covers=[];state.pits=[];state.zones=[];
    clearPending();selectDoor(-1);redraw();
  });
  svg.addEventListener("pointerdown",event=>{
    if(event.button!==0)return;
    event.preventDefault();
    const p=locate(event);
    if(tool==="door"||tool==="passage"){
      const i=hitDoor(state.doors,p,state.cols,state.rows);
      if(i>=0){
        selectDoor(i);dragDoor={i,start:p,original:{...state.doors[i]},moved:false};
        try{svg.setPointerCapture(event.pointerId);}catch{}
      }else{
        const d=placeDoor(p,state.cols,state.rows,tool,Number(widthSlider.value),true);
        if(overlaps(state.doors,d)) {
          ui.notifications.warn("Проём пересекает существующую дверь. Перетащите её за бирюзовый кружок.");return;
        }
        snapshot();state.doors.push(d);selectDoor(state.doors.length-1);redraw();
      }
      return;
    }
    if(tool==="wall"){
      const point=pointForWall(p);
      if(!pendingWall){pendingWall=point;return;}
      if(point.x!==pendingWall.x||point.y!==pendingWall.y){
        snapshot();state.walls.push({x1:pendingWall.x,y1:pendingWall.y,x2:point.x,y2:point.y});
        redraw();
      }
      clearPending();return;
    }
    dragStart=p;try{svg.setPointerCapture(event.pointerId);}catch{}
  });
  svg.addEventListener("pointermove",event=>{
    const p=locate(event);
    if(dragDoor){
      if(Math.hypot(p.x-dragDoor.start.x,p.y-dragDoor.start.y)>.12)dragDoor.moved=true;
      if(dragDoor.moved) {
        const old=dragDoor.original;
        const candidate=placeDoor(p,state.cols,state.rows,old.kind,widthOf(old),true);
        if(!overlaps(state.doors,candidate,dragDoor.i)){
          draft.innerHTML=svgShape(state,candidate.kind,candidate);
          dragDoor.candidate=candidate;
        }else{
          draft.innerHTML="";dragDoor.candidate=null;
        }
      }
    }else if(tool==="wall"&&pendingWall){
      const p2=pointForWall(p);
      draft.innerHTML=svgShape(state,"wall",{x1:pendingWall.x,y1:pendingWall.y,x2:p2.x,y2:p2.y});
    }else if(dragStart){
      const rect=areaShape(dragStart,p);
      draft.innerHTML=rect.w>0&&rect.h>0?svgShape(state,tool,rect):"";
    }
  });
  svg.addEventListener("pointerup",event=>{
    if(dragDoor){
      if(dragDoor.moved&&dragDoor.candidate){
        snapshot();state.doors[dragDoor.i]=dragDoor.candidate;
      }
      const i=dragDoor.i;
      clearPending();selectDoor(i);redraw();
      try{if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);}catch{}
      return;
    }
    if(!dragStart)return;
    const rect=areaShape(dragStart,locate(event));
    if(rect.w>=.5&&rect.h>=.5){
      snapshot();
      if(tool==="cover")state.covers.push(rect);
      else if(tool==="pit")state.pits.push(rect);
      else if(["SPAWN","LOOT","BOSS"].includes(tool))state.zones.push({...rect,kind:tool});
      redraw();
    }
    clearPending();
  });
  svg.addEventListener("pointercancel",()=>{clearPending();redraw();});
  redraw();
}

