const KEY = "rocoTrackerV1";
const VERSION = 2;

function uid(prefix="id") { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function now(){ return new Date().toISOString(); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function fmt(d, opts={}){ return new Date(d).toLocaleDateString("es-ES", opts.day ? opts : {day:"2-digit",month:"2-digit",year:"numeric"}); }
function time(d){ return new Date(d).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}); }
function minsBetween(a,b){ return Math.max(0,Math.round((new Date(b)-new Date(a))/60000)); }

function normalizeDb(raw){
  const base = raw && typeof raw === "object" ? raw : {};
  const sessions = Array.isArray(base.sessions) ? base.sessions : [];
  const oldProjects = Array.isArray(base.projects) ? base.projects : [];
  const out = {version:VERSION, sessions:[], projects:[]};
  const projectMap = new Map();

  // Preserve existing V1 sessions and give every block an id/projectId.
  sessions.forEach((s,si)=>{
    const ns = {...s, id:s.id||uid("ses"), blocks:Array.isArray(s.blocks)?s.blocks:[]};
    ns.blocks = ns.blocks.map((b,bi)=>({...b,id:b.id||uid("blk"), projectId:b.projectId||null, attempts:Math.max(1,Number(b.attempts)||1), reason:b.reason||"", note:b.note||"", photo:b.photo||""}));
    out.sessions.push(ns);
  });

  // Migrate V1 projects. Each legacy item becomes its own project to avoid silently merging unrelated blocks.
  oldProjects.forEach(p=>{
    const id=p.id||uid("prj");
    const attempts=Math.max(1,Number(p.attempts)||1);
    const project={id,grade:p.grade||"?",photo:p.photo||"",open:p.open!==false,created:p.created||now(),updated:p.updated||p.created||now(),attemptsTotal:attempts,reason:p.reason||"",note:p.note||"",history:Array.isArray(p.history)?p.history:[]};
    if(!project.history.length) project.history=[{date:project.created,attempts,result:"fail",reason:project.reason,note:project.note,sessionId:null}];
    out.projects.push(project);
  });

  // If an old session block points to nothing, leave it standalone. New V2 logic links explicitly.
  return out;
}

let db;
try { db=normalizeDb(JSON.parse(localStorage.getItem(KEY)||"null")); }
catch(e){ db=normalizeDb(null); }
function save(){
  try{
    localStorage.setItem(KEY,JSON.stringify(db));
    return true;
  }catch(e){
    console.error("RocoTracker: no se pudo guardar",e);
    return false;
  }
}
save();

let state={screen:"home",session:null};
function app(){ document.querySelector("#app").innerHTML=render(); bind(); }
function shell(title,body,showNav=true){
 return `<div class="wrap"><div class="top"><div><div class="title">${title}</div><div class="sub">Boulder logbook personal</div></div>${state.session?`<div class="session-pill">🧗 ${minsBetween(state.session.start,now())} min</div>`:""}</div>${body}${showNav?`<div class="nav"><button data-nav="home">Inicio</button><button data-nav="projects">🔥 Proyectos</button><button data-nav="history">📅 Historial</button><button data-nav="stats">📊 Estadísticas</button></div>`:""}</div>`;
}
function allBlocks(){ return db.sessions.flatMap(s=>s.blocks.map(b=>({...b,session:s}))); }
function completedBlocks(){ return allBlocks().filter(x=>x.result==="done"); }
function openProjects(){ return db.projects.filter(p=>p.open); }
function maxGrade(items,flashOnly=false){ const vals=items.filter(x=>!flashOnly||Number(x.attempts)===1).map(x=>Number(x.grade)).filter(Number.isFinite); return vals.length?Math.max(...vals):"—"; }
function homeView(){
 const blocks=allBlocks(), done=completedBlocks();
 return shell("RocoTracker",`<div class="grid">
 <div class="card"><div class="stat">${db.sessions.length}</div><div class="label">Sesiones</div></div>
 <div class="card"><div class="stat">${blocks.length}</div><div class="label">Registros de bloques</div></div>
 <div class="card"><div class="stat">${done.length}</div><div class="label">Encadenados</div></div>
 <div class="card"><div class="stat">${openProjects().length}</div><div class="label">Proyectos abiertos</div></div></div>
 <div class="actions"><button class="primary big" id="newSession">▶️ Iniciar sesión</button></div>
 <div class="section"><h2>Última sesión</h2>${db.sessions.length?lastSessionCard():`<div class="card muted">Todavía no tienes sesiones.</div>`}</div>`);
}
function lastSessionCard(){ const s=db.sessions[db.sessions.length-1], done=s.blocks.filter(b=>b.result==="done").length; return `<div class="card"><b>${fmt(s.start)} · ${time(s.start)}</b><div class="muted">${s.blocks.length} registros · ${done} encadenados · ${s.end?minsBetween(s.start,s.end):"en curso"} min</div></div>`; }

function sessionView(){
 const s=state.session, elapsed=minsBetween(s.start,now()), done=s.blocks.filter(b=>b.result==="done").length;
 return shell("Sesión en curso",`<div class="session-summary"><div><b>${fmt(s.start)}</b><span>${time(s.start)}</span></div><div><b>${elapsed}</b><span>min</span></div><div><b>${s.blocks.length}</b><span>registros</span></div><div><b>${done}</b><span>encadenados</span></div></div>
 <div class="actions"><button class="primary big" id="addBlock">＋ Nuevo bloque</button><button class="big" id="addProject">🔥 Proyectos</button><button id="finish">⏹️ Cerrar sesión</button></div>
 <div class="section"><div class="section-head"><h2>Lo que llevas hoy</h2><span class="muted">${s.blocks.length} registros</span></div>${s.blocks.length?s.blocks.map((b,i)=>sessionBlockHTML(b,i)).join(""):`<div class="card muted">Añade tu primer bloque.</div>`}</div>` ,false);
}
function sessionBlockHTML(b,i){
 const proj=b.projectId?db.projects.find(p=>p.id===b.projectId):null;
 return `<div class="block"><div><div class="grade">Grado ${esc(b.grade)} ${b.photo?"📷":""} ${proj?"🔥":""}</div><div class="${b.result==="done"?"ok":"fail"}">${b.result==="done"?"🟢 Encadenado":"❌ Fallado"} · ${b.attempts} intento${b.attempts==1?"":"s"}</div>${proj?`<div class="muted">Proyecto · ${proj.attemptsTotal} acumulados${!proj.open?" · completado":""}</div>`:""}${b.reason?`<div class="muted">${esc(b.reason)}</div>`:""}${b.note?`<div class="muted">${esc(b.note)}</div>`:""}</div><button data-edit="${i}">Editar</button></div>`;
}

function projectsView(inSession=false){
 const ps=openProjects();
 const body=`<div class="section-head"><h2>🔥 Proyectos abiertos</h2><button id="createProject">＋ Crear</button></div>${ps.length?ps.map(p=>projectHTML(p)).join(""):`<div class="card muted">No tienes proyectos abiertos. Puedes crear uno desde un bloque fallado o con «＋ Crear».</div>`}<div class="section"><h2>Completados recientes</h2>${db.projects.filter(p=>!p.open).slice(-5).reverse().map(p=>projectHTML(p,true)).join("")||'<div class="card muted">Todavía no hay proyectos completados.</div>'}</div>${inSession?`<button class="secondary full" id="backSession">← Volver a la sesión</button>`:""}`;
 return shell(inSession?"Proyectos · sesión en curso":"Proyectos",body,!inSession);
}
function projectHTML(p,done=false){
 return `<div class="project-card"><div class="project-photo">${p.photo?`<img src="${p.photo}" alt="Proyecto grado ${esc(p.grade)}">`:`<div class="photo-placeholder">📷</div>`}</div><div class="project-main"><div class="grade">Grado ${esc(p.grade)} ${done?"✅":"🔥"}</div><div><b>${p.attemptsTotal}</b> intentos acumulados</div><div class="muted">${p.history.length} registro${p.history.length===1?"":"s"} · última vez ${fmt(p.updated)}</div>${p.reason?`<div class="muted">${esc(p.reason)}</div>`:""}</div><div class="project-actions">${!done?`<button data-project="${p.id}" class="primary">Intentar</button>`:""}<button data-project-detail="${p.id}">Ver</button></div></div>`;
}

function historyView(){
 const body=`<div class="actions compact"><button id="exportJson">📤 Exportar copia completa</button><button id="exportCsv">📊 Exportar historial CSV</button><button id="shareBackup" class="primary">☁️ Compartir copia → Google Drive</button></div><div class="section"><h2>Sesiones</h2>${db.sessions.slice().reverse().map((s,i)=>sessionCard(s,i)).join("")||'<div class="card muted">Todavía no hay sesiones.</div>'}</div>`;
 return shell("Historial",body);
}
function sessionCard(s){ const done=s.blocks.filter(b=>b.result==="done").length; return `<div class="card history-card"><div class="section-head"><b>${fmt(s.start)}</b><span>${s.end?minsBetween(s.start,s.end):"—"} min</span></div><div class="muted">${s.blocks.length} registros · ${done} encadenados · máx. ${maxGrade(s.blocks)}</div><button data-session-detail="${s.id}">Ver sesión</button></div>`; }

function statsView(){
 const blocks=allBlocks(), done=completedBlocks(), attempts=blocks.reduce((n,b)=>n+Number(b.attempts||1),0);
 const rate=blocks.length?Math.round(done.length/blocks.length*100):0;
 const byGrade=Array.from({length:9},(_,i)=>i+1).map(g=>{const a=blocks.filter(b=>Number(b.grade)===g);return {g,a,d:a.filter(b=>b.result==="done").length,att:a.reduce((n,b)=>n+b.attempts,0)}}).filter(x=>x.a.length);
 const reasons={}; blocks.filter(b=>b.result!=="done"&&b.reason).forEach(b=>reasons[b.reason]=(reasons[b.reason]||0)+1);
 const reasonRows=Object.entries(reasons).sort((a,b)=>b[1]-a[1]);
 return shell("Estadísticas",`<div class="grid"><div class="card"><div class="stat">${db.sessions.length}</div><div class="label">Sesiones</div></div><div class="card"><div class="stat">${rate}%</div><div class="label">Éxito</div></div><div class="card"><div class="stat">${maxGrade(blocks)}</div><div class="label">Máximo encadenado</div></div><div class="card"><div class="stat">${maxGrade(blocks,true)}</div><div class="label">Máximo a flash</div></div></div>
 <div class="section"><h2>Por grado</h2><div class="table">${byGrade.length?`<div class="tr th"><span>Grado</span><span>Registros</span><span>Encadenados</span><span>Éxito</span></div>${byGrade.map(x=>`<div class="tr"><span>${x.g}</span><span>${x.a.length}</span><span>${x.d}</span><span>${Math.round(x.d/x.a.length*100)}%</span></div>`).join("")}`:'<div class="card muted">Registra algunos bloques para ver estadísticas.</div>'}</div></div>
 <div class="section"><h2>Motivos de fallo</h2>${reasonRows.length?reasonRows.map(([r,n])=>`<div class="reason-row"><span>${esc(r)}</span><b>${n}</b></div>`).join(""):`<div class="card muted">Todavía no hay motivos registrados.</div>`}</div>
 <div class="section"><h2>Resumen global</h2><div class="card muted">${blocks.length} registros · ${done.length} encadenados · ${attempts} intentos declarados</div></div>`);
}

function render(){
  if(state.session){
    if(state.screen === "projectsInSession") return projectsView(true);
    return sessionView();
  }
  if(state.screen === "projects") return projectsView(false);
  if(state.screen === "history") return historyView();
  if(state.screen === "stats") return statsView();
  return homeView();
}

function modal(html){ const el=document.createElement("div"); el.className="modal"; el.innerHTML=`<div class="sheet">${html}</div>`; document.body.appendChild(el); return el; }
const REASONS=["Agarre","Fuerza","Técnica","Equilibrio","Potencia","Resistencia","Lectura","Otro"];
function blockForm(existing,onSave,opts={}){
 const b=existing||{grade:"",result:"fail",attempts:1,reason:"",photo:"",note:""}; let result=b.result, photo=b.photo||"";
 const m=modal(`<h2>${opts.title|| (existing?"Editar bloque":"Nuevo bloque")}</h2>
 <div class="field"><label>Grado</label><div class="grade-buttons">${[1,2,3,4,5,6,7,8,9,"?"].map(g=>`<button type="button" class="grade-btn ${String(b.grade)===String(g)?"selected":""}" data-grade="${g}">${g}</button>`).join("")}</div></div>
 <div class="field"><label>Resultado</label><div class="row"><button type="button" id="done" class="result-btn ${result==="done"?"selected-ok":""}">🟢 Encadenado</button><button type="button" id="fail" class="result-btn ${result!=="done"?"selected-fail":""}">❌ Fallado</button></div></div>
 <div class="field"><label>Intentos</label><div class="attempt-control"><button type="button" id="minus">−</button><input id="attempts" type="number" min="1" value="${b.attempts}"><button type="button" id="plus">＋</button></div></div>
 <div class="field"><label>Motivo del fallo (opcional)</label><div class="reason-buttons">${REASONS.map(r=>`<button type="button" class="reason-btn ${b.reason===r?"selected":""}" data-reason="${r}">${r}</button>`).join("")}</div></div>
 <div class="field"><label>Nota (opcional)</label><textarea id="note" rows="2" placeholder="Una frase rápida...">${esc(b.note||"")}</textarea></div>
 <div class="field"><label>Foto opcional</label><input id="photo" type="file" accept="image/*" capture="environment">${photo?`<img class="photo" src="${photo}" alt="Foto del bloque">`:""}</div>
 <div class="row"><button id="cancel">Cancelar</button><button class="primary" id="saveBlock">Guardar</button></div>`);
 m.querySelectorAll("[data-grade]").forEach(x=>x.onclick=()=>{m.querySelectorAll("[data-grade]").forEach(y=>y.classList.remove("selected"));x.classList.add("selected");});
 m.querySelectorAll("[data-reason]").forEach(x=>x.onclick=()=>{m.querySelectorAll("[data-reason]").forEach(y=>y.classList.remove("selected"));x.classList.add("selected");});
 m.querySelector("#done").onclick=()=>{result="done";m.querySelector("#done").classList.add("selected-ok");m.querySelector("#fail").classList.remove("selected-fail");};
 m.querySelector("#fail").onclick=()=>{result="fail";m.querySelector("#fail").classList.add("selected-fail");m.querySelector("#done").classList.remove("selected-ok");};
 m.querySelector("#minus").onclick=()=>{const x=m.querySelector("#attempts");x.value=Math.max(1,(+x.value||1)-1)};
 m.querySelector("#plus").onclick=()=>{const x=m.querySelector("#attempts");x.value=Math.max(1,(+x.value||1)+1)};
 m.querySelector("#cancel").onclick=()=>m.remove();
 m.querySelector("#saveBlock").onclick=()=>{
   const grade=m.querySelector("[data-grade].selected")?.dataset.grade || b.grade || "?";
   const reason=m.querySelector("[data-reason].selected")?.dataset.reason || "";
   const finish=p=>{onSave({id:b.id||uid("blk"),grade,result,attempts:Math.max(1,+m.querySelector("#attempts").value||1),reason,note:m.querySelector("#note").value.trim(),photo:p||photo});m.remove();};
   const f=m.querySelector("#photo").files[0]; if(f){const r=new FileReader();r.onload=()=>finish(r.result);r.readAsDataURL(f);} else finish();
 };
}

function createProjectFromBlock(block){
 const project={id:uid("prj"),grade:block.grade,photo:block.photo||"",open:true,created:now(),updated:now(),attemptsTotal:block.attempts,reason:block.reason||"",note:block.note||"",history:[{date:now(),attempts:block.attempts,result:block.result,reason:block.reason||"",note:block.note||"",sessionId:state.session?.id||null}]};
 db.projects.push(project); block.projectId=project.id; save(); return project;
}
function chooseProjectForFailedBlock(block){
 const candidates=openProjects().filter(p=>String(p.grade)===String(block.grade));
 if(candidates.length){
   const reuse=confirm(`Ya tienes ${candidates.length} proyecto${candidates.length>1?"s":""} abierto${candidates.length>1?"s":""} de grado ${block.grade}.\n\n¿Quieres registrar este intento en el proyecto más reciente?\n\nAceptar = continuar proyecto\nCancelar = crear proyecto nuevo`);
   if(reuse){ const p=candidates.sort((a,b)=>new Date(b.updated)-new Date(a.updated))[0]; addAttemptToProject(p,block); return; }
 }
 if(confirm("¿Quieres guardar este bloque como proyecto para continuarlo otro día?")) createProjectFromBlock(block);
}
function addAttemptToProject(p,block){
 p.attemptsTotal+=block.attempts; p.updated=now(); p.reason=block.reason||p.reason; p.note=block.note||p.note; p.history.push({date:now(),attempts:block.attempts,result:block.result,reason:block.reason||"",note:block.note||"",sessionId:state.session?.id||null});
 block.projectId=p.id;
 if(block.result==="done") p.open=false;
 save();
}

function projectPicker(){ state.screen="projectsInSession"; app(); }
function projectAttempt(p){
 blockForm({grade:p.grade,result:"fail",attempts:1,reason:p.reason||"",photo:p.photo||"",note:""},b=>{b.projectId=p.id;state.session.blocks.push(b);addAttemptToProject(p,b);app();},{title:`Intentar proyecto · grado ${p.grade}`});
}
function projectDetail(p){
 modal(`<h2>Grado ${esc(p.grade)} ${p.open?"🔥":"✅"}</h2>${p.photo?`<img class="photo" src="${p.photo}" alt="Proyecto">`:""}<div class="card"><b>${p.attemptsTotal} intentos acumulados</b><div class="muted">Creado ${fmt(p.created)} · última vez ${fmt(p.updated)}</div></div><div class="section"><h3>Historial del proyecto</h3>${p.history.slice().reverse().map(h=>`<div class="history-line"><b>${fmt(h.date)}</b> · ${h.result==="done"?"🟢 Encadenado":"❌ Fallado"} · ${h.attempts} intento${h.attempts==1?"":"s"}${h.reason?` · ${esc(h.reason)}`:""}${h.note?`<div class="muted">${esc(h.note)}</div>`:""}</div>`).join("")}</div><button id="closeModal" class="full">Cerrar</button>`);
 document.querySelector("#closeModal")?.addEventListener("click",e=>e.closest(".modal").remove());
}
function sessionDetail(id){
 const s=db.sessions.find(x=>x.id===id); if(!s)return;
 modal(`<h2>${fmt(s.start)} · ${time(s.start)}</h2><div class="card"><b>${s.blocks.length} registros</b><div class="muted">${s.end?minsBetween(s.start,s.end):"—"} min · máximo ${maxGrade(s.blocks)}</div></div>${s.blocks.map((b,i)=>`<div class="block"><div><div class="grade">${esc(b.grade)} ${b.projectId?"🔥":""}</div><div class="${b.result==="done"?"ok":"fail"}">${b.result==="done"?"🟢 Encadenado":"❌ Fallado"} · ${b.attempts} intento${b.attempts===1?"":"s"}</div>${b.reason?`<div class="muted">${esc(b.reason)}</div>`:""}${b.note?`<div class="muted">${esc(b.note)}</div>`:""}</div></div>`).join("")}<button id="closeModal" class="full">Cerrar</button>`);
 document.querySelector("#closeModal")?.addEventListener("click",e=>e.closest(".modal").remove());
}

function finishSession(){
 if(!state.session) return;
 if(!state.session.blocks.length){ if(!confirm("La sesión no tiene bloques. ¿Cerrar igualmente?"))return; }
 state.session.end=now();
 const finished=state.session;
 const previous=db.sessions;
 db.sessions.push(finished);
 if(!save()){
   db.sessions=previous;
   state.session=finished;
   state.session.end=null;
   alert("No se ha podido guardar la sesión. Es posible que el almacenamiento esté lleno, normalmente por fotos demasiado grandes. Exporta una copia y vuelve a intentarlo.");
   return;
 }
 state.session=null;
 state.screen="home";
 app();
}

function bind(){
 document.querySelectorAll("[data-nav]").forEach(x=>x.onclick=()=>{if(state.session)return;state.screen=x.dataset.nav;app()});
 const n=document.querySelector("#newSession"); if(n)n.onclick=()=>{state.session={id:uid("ses"),start:now(),blocks:[]};state.screen="session";app()};
 const a=document.querySelector("#addBlock");if(a)a.onclick=()=>blockForm(null,b=>{state.session.blocks.push(b);if(b.result==="fail")chooseProjectForFailedBlock(b);app();});
 const p=document.querySelector("#addProject");if(p)p.onclick=projectPicker;
 const f=document.querySelector("#finish");
 if(f){
   let closing=false;
   const close=()=>{ if(closing)return; closing=true; finishSession(); setTimeout(()=>{closing=false},300); };
   f.onclick=close;
   f.ontouchend=close;
 }
 document.querySelectorAll("[data-edit]").forEach(x=>x.onclick=()=>blockForm(state.session.blocks[+x.dataset.edit],b=>{const idx=+x.dataset.edit;const old=state.session.blocks[idx];b.projectId=old.projectId||null;state.session.blocks[idx]=b;app();}));
 document.querySelectorAll("[data-project]").forEach(x=>x.onclick=()=>projectAttempt(db.projects.find(p=>p.id===x.dataset.project)));
 document.querySelectorAll("[data-project-detail]").forEach(x=>x.onclick=()=>projectDetail(db.projects.find(p=>p.id===x.dataset.projectDetail)));
 const back=document.querySelector("#backSession");if(back)back.onclick=()=>{state.screen="session";app()};
 const cp=document.querySelector("#createProject");if(cp)cp.onclick=()=>blockForm(null,b=>{const p=createProjectFromBlock(b);if(state.session)state.session.blocks.push({...b,projectId:p.id});app();},{title:"Crear proyecto"});
 document.querySelectorAll("[data-session-detail]").forEach(x=>x.onclick=()=>sessionDetail(x.dataset.sessionDetail));
 const ej=document.querySelector("#exportJson");if(ej)ej.onclick=()=>downloadText(`RocoTracker_backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(db,null,2),"application/json");
 const ec=document.querySelector("#exportCsv");if(ec)ec.onclick=()=>downloadText(`RocoTracker_historial_${new Date().toISOString().slice(0,10)}.csv`,toCsv(),"text/csv;charset=utf-8");
 const sh=document.querySelector("#shareBackup");if(sh)sh.onclick=shareBackup;
}

function downloadText(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(v){return `"${String(v??"").replace(/"/g,'""')}"`;}
function toCsv(){const rows=[["Fecha","Hora","Sesión","Grado","Resultado","Intentos","Proyecto","Motivo","Nota"]];db.sessions.forEach(s=>s.blocks.forEach(b=>rows.push([fmt(s.start),time(s.start),s.id,b.grade,b.result==="done"?"Encadenado":"Fallado",b.attempts,b.projectId?"Sí":"No",b.reason,b.note])));return "\uFEFF"+rows.map(r=>r.map(csvCell).join(";")).join("\n");}
async function shareBackup(){
 const name=`RocoTracker_backup_${new Date().toISOString().slice(0,10)}.json`;
 const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
 const file=new File([blob],name,{type:"application/json"});
 if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
   try{await navigator.share({title:"Copia de seguridad RocoTracker",text:"Copia completa de RocoTracker",files:[file]});return;}catch(e){if(e.name==="AbortError")return;}
 }
 downloadText(name,JSON.stringify(db,null,2),"application/json");
 alert("Tu iPhone ha descargado la copia. Desde el menú de compartir/archivos puedes guardarla en Google Drive. Si tienes Google Drive instalado, selecciónalo en la hoja de compartir.");
}

app();
