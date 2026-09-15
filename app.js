const KEY="rocoTrackerV1";
let db=JSON.parse(localStorage.getItem(KEY)||'{"sessions":[],"projects":[]}');
let state={screen:"home",session:null};

function save(){localStorage.setItem(KEY,JSON.stringify(db))}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function now(){return new Date().toISOString()}
function fmt(d){return new Date(d).toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"})}
function app(){document.querySelector("#app").innerHTML=render(); bind()}
function render(){
 if(state.screen==="session") return sessionView();
 if(state.screen==="projects") return projectsView();
 if(state.screen==="history") return historyView();
 return homeView();
}
function shell(title,body){
 return `<div class="wrap"><div class="top"><div><div class="title">${title}</div><div class="sub">Boulder logbook personal</div></div></div>${body}<div class="nav"><button data-nav="home">Inicio</button><button data-nav="projects">🔥 Proyectos</button><button data-nav="history">📅 Historial</button></div></div>`;
}
function homeView(){
 let s=db.sessions, blocks=s.flatMap(x=>x.blocks), done=blocks.filter(b=>b.result==="done").length;
 return shell("RocoTracker",`<div class="grid">
 <div class="card"><div class="stat">${s.length}</div><div class="label">Sesiones</div></div>
 <div class="card"><div class="stat">${blocks.length}</div><div class="label">Bloques registrados</div></div>
 <div class="card"><div class="stat">${done}</div><div class="label">Encadenados</div></div>
 <div class="card"><div class="stat">${db.projects.filter(p=>p.open).length}</div><div class="label">Proyectos abiertos</div></div>
 </div>
 <div class="actions"><button class="primary" id="newSession">▶️ Iniciar sesión</button></div>
 <div class="section"><h2>Última sesión</h2>${s.length?`<div class="card">${fmt(s[s.length-1].start)} · ${s[s.length-1].blocks.length} bloques</div>`:`<div class="card muted">Todavía no tienes sesiones.</div>`}</div>`);
}
function sessionView(){
 const s=state.session, elapsed=Math.round((Date.now()-new Date(s.start))/60000);
 return shell("Sesión en curso",`<div class="grid">
 <div class="card"><div class="stat">${elapsed} min</div><div class="label">Tiempo</div></div>
 <div class="card"><div class="stat">${s.blocks.length}</div><div class="label">Bloques</div></div></div>
 <div class="actions"><button class="primary" id="addBlock">＋ Nuevo bloque</button><button id="addProject">🔥 Continuar proyecto</button><button id="finish">⏹️ Cerrar sesión</button></div>
 <div class="section"><h2>Bloques de esta sesión</h2>${s.blocks.length?s.blocks.map(blockHTML).join(""):`<div class="card muted">Añade tu primer bloque.</div>`}</div>`);
}
function blockHTML(b,i){
 return `<div class="block"><div><div class="grade">Grado ${esc(b.grade)} ${b.photo?"📷":""}</div><div class="${b.result==="done"?"ok":"fail"}">${b.result==="done"?"🟢 Encadenado":"❌ Fallado"} · ${b.attempts} intento${b.attempts==1?"":"s"}</div>${b.reason?`<div class="muted">${esc(b.reason)}</div>`:""}</div><button data-edit="${i}">Editar</button></div>`
}
function projectsView(){
 let ps=db.projects.filter(p=>p.open);
 return shell("Proyectos",`${ps.length?ps.map((p,i)=>`<div class="block"><div><div class="grade">Grado ${esc(p.grade)} ${p.photo?"📷":""}</div><div class="muted">${p.attempts} intentos acumulados</div>${p.reason?`<div class="muted">${esc(p.reason)}</div>`:""}</div><button data-project="${i}">Intentar</button></div>`).join(""):`<div class="card muted">No tienes proyectos abiertos.</div>`}`);
}
function historyView(){
 return shell("Historial",`${db.sessions.slice().reverse().map(s=>`<div class="card" style="margin:8px 0"><b>${fmt(s.start)}</b><div class="muted">${s.blocks.length} bloques · ${s.blocks.filter(b=>b.result==="done").length} encadenados · máx. ${Math.max(0,...s.blocks.map(b=>Number(b.grade)||0))}</div></div>`).join("")||'<div class="card muted">Todavía no hay sesiones.</div>'}`);
}
function modal(html){let el=document.createElement("div");el.className="modal";el.innerHTML=`<div class="sheet">${html}</div>`;document.body.appendChild(el);return el}
function blockForm(existing,onSave){
 let b=existing||{grade:"",result:"fail",attempts:1,reason:"",photo:""};
 let m=modal(`<h2>${existing?"Editar bloque":"Nuevo bloque"}</h2>
 <div class="field"><label>Grado (1–9 o ?)</label><input id="grade" inputmode="numeric" value="${esc(b.grade)}" placeholder="6"></div>
 <div class="row"><button id="done">🟢 Encadenado</button><button id="fail">❌ Fallado</button></div>
 <div class="field"><label>Intentos</label><input id="attempts" type="number" min="1" value="${b.attempts}"></div>
 <div class="field"><label>Motivo del fallo (opcional)</label><input id="reason" value="${esc(b.reason)}" placeholder="Fuerza, técnica, agarre..."></div>
 <div class="field"><label>Foto opcional</label><input id="photo" type="file" accept="image/*" capture="environment"></div>
 <div class="row"><button id="cancel">Cancelar</button><button class="primary" id="saveBlock">Guardar</button></div>`);
 let result=b.result, photo=b.photo;
 m.querySelector("#done").onclick=()=>{result="done"};
 m.querySelector("#fail").onclick=()=>{result="fail"};
 m.querySelector("#cancel").onclick=()=>m.remove();
 m.querySelector("#saveBlock").onclick=()=>{
   let f=m.querySelector("#photo").files[0];
   const finish=(p)=>{onSave({grade:m.querySelector("#grade").value||"?",result,attempts:Math.max(1,+m.querySelector("#attempts").value||1),reason:m.querySelector("#reason").value,photo:p||photo});m.remove();app()};
   if(f){let r=new FileReader();r.onload=()=>finish(r.result);r.readAsDataURL(f)}else finish();
 }
}
function bind(){
 document.querySelectorAll("[data-nav]").forEach(x=>x.onclick=()=>{state.screen=x.dataset.nav;app()});
 const n=document.querySelector("#newSession"); if(n)n.onclick=()=>{state.session={start:now(),blocks:[]};state.screen="session";app()};
 const a=document.querySelector("#addBlock");if(a)a.onclick=()=>blockForm(null,b=>state.session.blocks.push(b));
 const f=document.querySelector("#finish");if(f)f.onclick=()=>{db.sessions.push({...state.session,end:now()});state.session.blocks.forEach(b=>{if(b.result==="fail") db.projects.push({...b,open:true,created:now()})});save();state.session=null;state.screen="home";app()};
 document.querySelectorAll("[data-edit]").forEach(x=>x.onclick=()=>blockForm(state.session.blocks[+x.dataset.edit],b=>state.session.blocks[+x.dataset.edit]=b));
 const p=document.querySelector("#addProject");if(p)p.onclick=()=>projectPicker();
 document.querySelectorAll("[data-project]").forEach(x=>x.onclick=()=>projectAttempt(db.projects.filter(p=>p.open)[+x.dataset.project]));
}
function projectPicker(){
 if(!db.projects.some(p=>p.open)){alert("No tienes proyectos abiertos.");return}
 state.screen="projects";app();
}
function projectAttempt(p){
 blockForm({...p,result:"fail",attempts:1},b=>{
   p.attempts+=b.attempts;
   p.reason=b.reason||p.reason;
   if(b.result==="done") p.open=false;
   state.session.blocks.push({...b,project:true});
   save();app();
 });
}
app();