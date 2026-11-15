/** UI: reusable map-room templates and point-and-click spatial annotation. */
import {normalizeRoom, renderLayout} from "./room-core.mjs";
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
    const position=Number(shape.offset??(shape.index+.5));
    const x=shape.side==="W"?0:shape.side==="E"?state.cols:position;
    const y=shape.side==="N"?0:shape.side==="S"?state.rows:position;
    return `<circle cx="${x}" cy="${y}" r=".28" fill="${tool==="door"?"#69d8ff":"#65ef8a"}" stroke="#171717" stroke-width=".07"/><text x="${x}" y="${y+.12}" text-anchor="middle" font-size=".36" fill="#15212b">${tool==="door"?"D":"P"}</text>`;
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
  const history=[];
  const toolButtons=tools.map(([id,label])=>`<button type="button" data-room-tool="${id}" class="${id==="door"?"selected":""}">${label}</button>`).join("");
  const content=`<div class="mff-room-editor">
    <p><strong>${esc(scene.name)}</strong> · ${state.cols}×${state.rows} клеток. Обозначай двери на границе карты. Стены ставь двумя кликами, укрытия/ямы/зоны — перетягиванием мыши.</p>
    <div class="mff-editor-settings"><label for="mff-room-kind">Тип комнаты</label><select id="mff-room-kind">${Object.entries(ROOM_TYPES).map(([id,label])=>`<option value="${id}" ${state.roomType===id?"selected":""}>${esc(label)}</option>`).join("")}</select><small>«Вход» предпочтительно выбирается первым. «Тайная» создаётся только в тупике; «Босс» — роль финального этажа.</small></div>
    <div class="mff-editor-tools">${toolButtons}</div>
    <div class="mff-editor-door-settings">
      <label><input id="mff-free-doors" type="checkbox" checked> Двери без привязки к сетке</label>
      <label>Ширина двери (клеток) <input id="mff-door-width" type="number" value="1" min=".25" max="2" step=".25"></label>
      <label><input id="mff-snap-walls" type="checkbox" checked> Привязка стен к половине клетки</label>
    </div>
    <div class="mff-editor-canvas" style="aspect-ratio:${state.cols}/${state.rows}">
      <img src="${esc(state.image)}" draggable="false" alt="Карта комнаты">
      <svg xmlns="http://www.w3.org/2000/svg" id="mff-annotation-svg" viewBox="0 0 ${state.cols} ${state.rows}" preserveAspectRatio="none">
        <defs><pattern id="mff-grid-pattern" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".025"/></pattern></defs>
        <rect width="${state.cols}" height="${state.rows}" fill="transparent" pointer-events="all"/>
        <rect width="${state.cols}" height="${state.rows}" fill="url(#mff-grid-pattern)" pointer-events="none"/>
        <g id="mff-annotations" pointer-events="none"></g><g id="mff-draft" pointer-events="none"></g>
      </svg>
    </div>
    <div class="mff-editor-footer"><span id="mff-editor-status">Дверей: 0 · Стен: 0</span>
      <button type="button" data-room-undo>↩ Отменить</button><button type="button" data-room-clear>Очистить</button></div>
    <p class="mff-help">Дверь теперь можно поставить в любом месте на границе комнаты. Для соединения у обоих проёмов должна совпадать ширина. Двери автоматически стыкуются с дверями других комнат; непарные проёмы закрываются стеной. <strong>Обычная дверь</strong> станет интерактивной дверью Foundry, <strong>проход</strong> будет оставлен открытым. Ямы не наносят урон автоматически.</p>
  </div>`;
  // Foundry v13 sanitizes dialog HTML strings and can strip embedded SVG.
  // Pass a trusted DOM element so the drawing layer and tool bindings survive.
  const trustedContent = document.createElement("div");
  trustedContent.innerHTML = content;
  const d=new foundry.applications.api.DialogV2({window:{title:`Разметка комнаты: ${scene.name}`,resizable:true},content:trustedContent,
    buttons:[{action:"save",label:"Сохранить разметку",default:true,icon:"fa-solid fa-floppy-disk",
      callback:safe(async()=>{
        if(!state.doors.length) {ui.notifications.warn("Для соединения комнат отметьте хотя бы одну дверь или проход.");return false;}
        const data={image:state.image,cols:state.cols,rows:state.rows,roomType:state.roomType,doors:state.doors,
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
  const shapes=root.querySelector("#mff-annotations"), draft=root.querySelector("#mff-draft"), status=root.querySelector("#mff-editor-status");
  root.querySelector("#mff-room-kind")?.addEventListener("change",e=>{state.roomType=e.target.value;});
  let tool="door", pendingWall=null, dragStart=null;
  const snapshot=()=>history.push(JSON.stringify({doors:state.doors,walls:state.walls,covers:state.covers,pits:state.pits,zones:state.zones}));
  const locate=event=>{
    const r=svg.getBoundingClientRect();
    return {x:limit((event.clientX-r.left)/r.width*state.cols,0,state.cols),
      y:limit((event.clientY-r.top)/r.height*state.rows,0,state.rows)};
  };
  const pointForWall=(p)=>root.querySelector("#mff-snap-walls")?.checked
    ? {x:limit(snap(p.x),0,state.cols),y:limit(snap(p.y),0,state.rows)}
    : {x:limit(Math.round(p.x*100)/100,0,state.cols),y:limit(Math.round(p.y*100)/100,0,state.rows)};
  const areaShape=(a,b)=>{
    const x=limit(snap(Math.min(a.x,b.x)),0,state.cols), y=limit(snap(Math.min(a.y,b.y)),0,state.rows);
    const x2=limit(snap(Math.max(a.x,b.x)),0,state.cols),y2=limit(snap(Math.max(a.y,b.y)),0,state.rows);
    return {x,y,w:x2-x,h:y2-y};
  };
  const redraw=()=>{
    shapes.innerHTML=[
      ...state.doors.map(x=>svgShape(state,x.kind,x)),
      ...state.walls.map(x=>svgShape(state,"wall",x)),
      ...state.covers.map(x=>svgShape(state,"cover",x)),
      ...state.pits.map(x=>svgShape(state,"pit",x)),
      ...state.zones.map(x=>svgShape(state,x.kind,x))
    ].join("");
    status.textContent=`Дверей/проходов: ${state.doors.length} · Стен: ${state.walls.length} · Укрытий: ${state.covers.length} · Ям: ${state.pits.length} · Зон: ${state.zones.length}`;
  };
  const clearPending=()=>{pendingWall=null;dragStart=null;draft.innerHTML="";};
  for(const b of root.querySelectorAll("[data-room-tool]")) b.addEventListener("click",()=>{
    tool=b.getAttribute("data-room-tool");
    root.querySelectorAll("[data-room-tool]").forEach(el=>el.classList.toggle("selected",el===b));
    clearPending();
  });
  root.querySelector("[data-room-undo]")?.addEventListener("click",()=>{
    if(!history.length)return;
    Object.assign(state,JSON.parse(history.pop()));clearPending();redraw();
  });
  root.querySelector("[data-room-clear]")?.addEventListener("click",()=>{
    if(!window.confirm("Удалить всю разметку этой комнаты? Сохранение произойдёт только по кнопке «Сохранить».") ) return;
    snapshot();state.doors=[];state.walls=[];state.covers=[];state.pits=[];state.zones=[];
    clearPending();redraw();
  });
  svg.addEventListener("pointerdown",e=>{
    if(e.button!==0)return;
    e.preventDefault();const p=locate(e);
    if(tool==="door"||tool==="passage"){
      // The nearest room boundary determines the door side. Its center can be placed freely.
      const distances=[["N",p.y],["E",state.cols-p.x],["S",state.rows-p.y],["W",p.x]].sort((a,b)=>a[1]-b[1]);
      const side=distances[0][0];
      const max=(side==="N"||side==="S")?state.cols:state.rows;
      const width=limit(Number(root.querySelector("#mff-door-width")?.value||1),.25,2);
      const raw=side==="N"||side==="S"?p.x:p.y;
      const free=root.querySelector("#mff-free-doors")?.checked!==false;
      const offset=limit(free?Math.round(raw*100)/100:Math.floor(raw)+.5,width/2,max-width/2);
      const center=d=>Number(d.offset??(d.index+.5));
      const i=state.doors.findIndex(d=>d.side===side&&Math.abs(center(d)-offset)<Math.min(.3,width*.3));
      if(i<0 && state.doors.some(d=>d.side===side &&
        Math.abs(center(d)-offset)<(Number(d.width||1)+width)/2-.001)) {
        ui.notifications.warn("Дверные проёмы пересекаются. Выберите другое место.");
        return;
      }
      snapshot();
      if(i>=0){
        if(state.doors[i].kind===tool)state.doors.splice(i,1);
        else state.doors[i]={...state.doors[i],kind:tool};
      } else state.doors.push({side,index:Math.floor(offset),offset,width,kind:tool});
      redraw();return;
    }
    if(tool==="wall"){
      const point=pointForWall(p);
      if(!pendingWall){pendingWall=point;return;}
      if(point.x!==pendingWall.x||point.y!==pendingWall.y){
        snapshot();state.walls.push({x1:pendingWall.x,y1:pendingWall.y,x2:point.x,y2:point.y});redraw();
      }
      clearPending();return;
    }
    dragStart=p;
    try{svg.setPointerCapture(e.pointerId);}catch{}
  });
  svg.addEventListener("pointermove",e=>{
    const p=locate(e);
    if(tool==="wall"&&pendingWall){
      const point=pointForWall(p);
      draft.innerHTML=svgShape(state,"wall",{x1:pendingWall.x,y1:pendingWall.y,x2:point.x,y2:point.y});
    } else if(dragStart){
      const rect=areaShape(dragStart,p);
      if(rect.w>0&&rect.h>0) draft.innerHTML=svgShape(state,tool,rect);
    }
  });
  svg.addEventListener("pointerup",e=>{
    if(!dragStart)return;
    const box=areaShape(dragStart,locate(e));
    if(box.w>=.5&&box.h>=.5){
      snapshot();
      if(tool==="cover")state.covers.push(box);
      else if(tool==="pit")state.pits.push(box);
      else if(["SPAWN","LOOT","BOSS"].includes(tool)) state.zones.push({...box,kind:tool});
      redraw();
    }
    clearPending();
  });
  svg.addEventListener("pointercancel",clearPending);
  redraw();
}
