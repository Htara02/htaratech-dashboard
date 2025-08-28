// ==== API hacia el servidor ====
const API = {
  getTasks: () => fetch("/tasks").then(r => r.json()),
  saveTasks: (tasks) =>
    fetch("/tasks", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(tasks) }),
  getVapid: () => fetch("/vapidPublicKey").then(r => r.text()),
  subscribe: (sub) =>
    fetch("/subscribe", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(sub) }),
};

// ==== Estado ====
let tasks = [];
const zones = {
  todo: document.getElementById("todo"),
  doing: document.getElementById("doing"),
  done: document.getElementById("done"),
};
const $ = s => document.querySelector(s);
const fmtDate = d => d ? new Date(d).toLocaleString() : "Sin fecha";
const daysUntil = d => { if(!d) return null; const a=new Date();a.setHours(0,0,0,0); const b=new Date(d);b.setHours(0,0,0,0); return Math.round((b-a)/86400000); };
const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const escapeHTML = s => (s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;","&gt;":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

// ==== Utilidades ====
// Convierte lista de archivos a objetos {name,type,data(base64)} (hasta 1MB c/u)
async function filesToObjectList(fileList, limit=8, maxKB=2500){
  const files = Array.from(fileList || []).slice(0, limit);
  const out = [];
  for (const f of files){
    if (f.size > maxKB*2500) {
      alert(`Hey! Tu archivo ${f.name} excede ${maxKB}KB`);
      continue;
    }
    const fr = new FileReader();
    const data = await new Promise((res,rej)=>{
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(f);
    });
    out.push({ name:f.name, type:f.type || "application/octet-stream", data });
  }
  return out;
}

function rebuildCategoryFilter() {
  const sel = $("#filterCategory"); if (!sel) return;
  const current = sel.value;
  const cats = Array.from(new Set(tasks.map(t => (t.category || "General").trim()))).sort((a,b)=>a.localeCompare(b,'es'));
  sel.innerHTML = `<option value="">Categoría: Todas</option>` + cats.map(c => `<option>${escapeHTML(c)}</option>`).join("");
  if (Array.from(sel.options).some(o => o.value === current)) sel.value = current;
}

// 👉 datalist para sugerir categorías
function rebuildCategoryDatalist(){
  const dl = document.getElementById("catOptions");
  if (!dl) return;
  const cats = Array.from(new Set(
    tasks.map(t => (t.category || "General").trim())
  ))
  .filter(Boolean)
  .sort((a,b)=>a.localeCompare(b,'es'));
  dl.innerHTML = cats.map(c => `<option value="${escapeHTML(c)}"></option>`).join("");
}

// 👉 filtro + datalist para COLABORADOR
function rebuildAssigneeFilter(){
  const sel = $("#filterAssignee"); if (!sel) return;
  const current = sel.value;
  const users = Array.from(new Set((tasks.map(t => (t.assignee||"").trim())))).filter(Boolean).sort((a,b)=>a.localeCompare(b,'es'));
  sel.innerHTML = `<option value="">Colaborador: Todos</option>` + users.map(u => `<option>${escapeHTML(u)}</option>`).join("");
  if (Array.from(sel.options).some(o => o.value === current)) sel.value = current;
}
function rebuildAssigneeDatalist(){
  const dl = document.getElementById("assigneeOptions");
  if (!dl) return;
  const users = Array.from(new Set((tasks.map(t => (t.assignee||"").trim())))).filter(Boolean).sort((a,b)=>a.localeCompare(b,'es'));
  dl.innerHTML = users.map(u => `<option value="${escapeHTML(u)}"></option>`).join("");
}

// ==== Render ====
function prioClass(p){ p=(p||"").toLowerCase(); if(p==="alta") return "alta"; if(p==="baja") return "baja"; return "media"; }

function galleryThumbs(files){
  if (!files || !files.length) return "";
  return `
    <div class="gallery">
      ${files.map((f,i)=>{
        const title = escapeHTML(f.name || "archivo");
        const isImg = f.type?.startsWith("image/");
        const hasData = !!f.data;

        if (isImg && hasData) {
          return `<div class="thumb" title="${title}">
                    <a href="${f.data}" download="${title}" target="_blank" rel="noopener">
                      <img src="${f.data}" alt="${title}"/>
                    </a>
                  </div>`;
        } else if (!isImg && hasData) {
          return `<div class="thumb" title="${title}">
                    <a href="${f.data}" download="${title}">
                      <span class="filechip">📎</span>
                      <span class="filename">${title}</span>
                    </a>
                  </div>`;
        } else {
          return `<div class="thumb" title="${title}">
                    <span class="filechip">📎</span>
                    <span class="filename">${title}</span>
                  </div>`;
        }
      }).join("")}
    </div>`;
}

function cardTemplate(t){
  const soon = daysUntil(t.due);
  const overdue = soon!==null && soon<0 && t.status!=="done";
  const soonBadge = soon!==null && soon>=0 && soon<=2 && t.status!=="done";
  const cat = t.category ? escapeHTML(t.category) : "General";
  const prog = Number(t.progress || 0);
  const who = t.assignee ? escapeHTML(t.assignee) : "";

  const el = document.createElement("div");
  el.className="card"; el.draggable=true; el.dataset.id=t.id;
  el.innerHTML = `
    <div class="title">${escapeHTML(t.title)}</div>
    <div class="meta">
      <span class="badge ${prioClass(t.priority)}">${t.priority}</span>
      <span class="badge ${overdue ? "overdue" : (soonBadge ? "soon" : "")}">${fmtDate(t.due)}</span>
      <span class="badge cat">${cat}</span>
      ${who ? `<span class="badge">${who}</span>` : ""}
      <span class="badge">${prog}%</span>
    </div>

    ${galleryThumbs(t.attachments)}

    <div class="progress"><div class="progress-fill" style="width:${prog}%"></div></div>

    ${t.notes ? `<div class="notes"><strong>Notas:</strong> ${escapeHTML(t.notes)}</div>` : ""}
    ${t.extras ? `<div class="notes"><strong>Obs.:</strong> ${escapeHTML(t.extras)}</div>` : ""}

    <div class="actions">
      <button class="edit">Editar</button>
      <button class="move">Mover ➜</button>
    </div>`;

  el.addEventListener("dragstart", e=> e.dataTransfer.setData("text/plain", t.id));
  el.querySelector(".edit").onclick = ()=> openEditor(t.id);
  el.querySelector(".move").onclick = ()=> cycleStatus(t.id);
  return el;
}

function render(){
  const fA = $("#filterAssignee")?.value || "";
  const fC = $("#filterCategory")?.value || "";
  const fP = $("#filterPriority").value;
  const fS = $("#filterStatus").value;

  Object.values(zones).forEach(z=>z.innerHTML="");
  tasks.forEach(t=>{
    if (fA && (t.assignee || "") !== fA) return;
    if (fC && (t.category || "General") !== fC) return;
    if (fP && t.priority !== fP) return;
    if (fS && t.status !== fS) return;
    zones[t.status].appendChild(cardTemplate(t));
  });
}

// ==== CRUD / UI ====
async function syncSave(){
  await API.saveTasks(tasks);
  // rebuildAssigneeFilter();   ❌ ya no hace falta
  // rebuildAssigneeDatalist(); ❌ ya no hace falta
  rebuildCategoryFilter();
  rebuildCategoryDatalist();
}


// añadir
$("#addTask").onclick = async ()=>{
  const title=$("#title").value.trim();
  const due=$("#due").value||null;
  const priority=$("#priority").value;
  const progress=Number($("#progress").value || 0);
  const assignee=$("#assignee").value.trim();   // 👈 nuevo
  const category=$("#category").value.trim() || "General";
  const extras=$("#extras").value.trim();
  const notes=$("#notes").value.trim();
  const attachments = await filesToObjectList($("#attachments").files, 8, 1024);

  if(!title) return alert("Escribe un título.");

  tasks.unshift({
    id:uid(), title, due, priority, progress, assignee, category, extras, notes,
    attachments,
    status: progress===100 ? "done" : (progress>=50 ? "doing" : "todo"),
    notified:{d2:false,d1:false,m5:false}
  });
  await syncSave(); render();
  const links = parseLinks($("#linkUrls").value);
  // ...
  tasks.unshift({
    id:uid(), title, due, priority, progress, assignee, category, extras, notes,
    attachments, links, // 👈 añade aquí
    status: progress===100 ? "done" : (progress>=50 ? "doing" : "todo"),
    notified:{d2:false,d1:false,m5:false}
  });
  // ...
  $("#linkUrls").value = ""; // limpia


  // limpia
  $("#title").value=""; $("#due").value=""; $("#notes").value="";
  $("#category").value=""; $("#assignee").value="";
  $("#extras").value=""; $("#attachments").value="";
  $("#progress").value="0";
};

function cycleStatus(id){
  const t=tasks.find(x=>x.id===id); if(!t) return;
  t.status = t.status==="todo" ? "doing" : (t.status==="doing" ? "done" : "todo");

  // Ajuste de progreso según columna
  if (t.status === "todo")       t.progress = 0;
  else if (t.status === "doing") t.progress = 50;
  else if (t.status === "done")  t.progress = 100;

  syncSave().then(render);
}

// ===== Editor =====
function renderEditGallery(files){
  const cont = $("#e_gallery");
  cont.innerHTML = "";
  (files || []).forEach((f, idx) => {
    const title = escapeHTML(f.name || "archivo");
    const isImg = f.type?.startsWith("image/");
    const hasData = !!f.data;

    const wrap = document.createElement("div");
    wrap.className = "thumb";

    if (isImg && hasData) {
      wrap.innerHTML = `
        <a href="${f.data}" download="${title}" target="_blank" rel="noopener">
          <img src="${f.data}" alt="${title}" />
        </a>
        <button class="remove" title="Eliminar">x</button>`;
    } else if (!isImg && hasData) {
      wrap.innerHTML = `
        <a href="${f.data}" download="${title}">
          <span class="filechip">📎</span>
          <span class="filename">${title}</span>
        </a>
        <button class="remove" title="Eliminar">x</button>`;
    } else {
      wrap.innerHTML = `
        <span class="filechip">📎</span>
        <span class="filename">${title}</span>
        <button class="remove" title="Eliminar">x</button>`;
    }

    wrap.querySelector("button.remove").onclick = ()=>{
      const t=tasks.find(x=>x.id===window.editingId); if(!t) return;
      t.attachments.splice(idx,1);
      renderEditGallery(t.attachments);
    };
    cont.appendChild(wrap);
  });
}

function openEditor(id){
  window.editingId=id;
  const t=tasks.find(x=>x.id===id); if(!t) return;
  $("#e_title").value=t.title;
  $("#e_due").value=t.due ? toLocalInputValue(t.due) : "";
  $("#e_priority").value=t.priority;
  $("#e_progress").value=String(t.progress || 0);
  $("#e_assignee").value=t.assignee || "";           // 👈 nuevo
  $("#e_category").value=t.category || "General";
  $("#e_extras").value=t.extras || "";
  $("#e_notes").value=t.notes||"";
  if (!t.attachments) t.attachments=[];
  renderEditGallery(t.attachments);
  $("#editDialog").showModal();
}

// agregar adjuntos nuevos en el editor
document.getElementById("e_attachments").addEventListener("change", async (e)=>{
  const t=tasks.find(x=>x.id===window.editingId); if(!t) return;
  const add = await filesToObjectList(e.target.files, 8, 1024);
  t.attachments = (t.attachments || []).concat(add).slice(0, 12);
  renderEditGallery(t.attachments);
  e.target.value = "";
});

// GUARDAR (btn con type="button")
document.getElementById("saveBtn").onclick = async () => {
  const t=tasks.find(x=>x.id===window.editingId); if(!t) return;
  const prevDue = t.due;

  t.title=$("#e_title").value.trim()||t.title;
  t.due=$("#e_due").value||null;
  t.priority=$("#e_priority").value;
  t.progress=Number($("#e_progress").value || 0);
  t.assignee=$("#e_assignee").value.trim();          // 👈 nuevo
  t.category=$("#e_category").value.trim() || "General";
  t.extras=$("#e_extras").value.trim();
  t.notes=$("#e_notes").value.trim();

  if (t.progress===100) t.status="done";
  else if (t.progress>=50 && t.status==="todo") t.status="doing";
  else if (t.progress===0 && t.status!=="todo") t.status="todo";

  if (prevDue !== t.due) {
    t.notified = { d2:false, d1:false, m5:false };
  }

  await syncSave(); render();
  document.getElementById("editDialog").close();
};

// CANCELAR
const cancelBtn = document.querySelector('#editDialog button[value="cancel"]');
if (cancelBtn) cancelBtn.onclick = () => document.getElementById("editDialog").close();

// BORRAR
document.getElementById("deleteBtn").onclick = async ()=>{
  if(!confirm("¿Borrar esta tarea?")) return;
  tasks = tasks.filter(x=>x.id!==window.editingId);
  await syncSave(); render();
  document.getElementById("editDialog").close();
};

// Drag & drop
document.querySelectorAll(".dropzone").forEach(zone=>{
  zone.addEventListener("dragover", e=>{ e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", ()=> zone.classList.remove("dragover"));
  zone.addEventListener("drop", e=>{
    e.preventDefault(); zone.classList.remove("dragover");
    const id=e.dataTransfer.getData("text/plain");
    const t=tasks.find(x=>x.id===id); if(!t) return;

    t.status=zone.id;
    if (zone.id === "todo")       t.progress = 0;
    else if (zone.id === "doing") t.progress = 50;
    else if (zone.id === "done")  t.progress = 100;

    syncSave().then(render);
  });
});

// Filtros
$("#filterAssignee")?.addEventListener("change", render);
$("#filterCategory")?.addEventListener("change", render);
$("#filterPriority").onchange=render;
$("#filterStatus").onchange=render;
$("#clearFilters").onclick=()=>{
  $("#filterAssignee") && ($("#filterAssignee").value="");
  $("#filterCategory") && ($("#filterCategory").value="");
  $("#filterPriority").value="";
  $("#filterStatus").value="";
  render();
};

// ---- Push: permiso + suscripción con Service Worker ----
$("#notifyPerms").onclick = async ()=>{
  if(!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Tu navegador no soporta Push."); return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { alert("Permiso de notificaciones denegado."); return; }
  const reg = await navigator.serviceWorker.register("/sw.js");
  const publicKey = await API.getVapid();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
  await API.subscribe(sub);
  alert("¡Notificaciones activadas!");
  document.getElementById("notifyPerms").textContent = "🔔";
  document.getElementById("notifyPerms").title = "Notificaciones activadas";

};

// Helpers
function toLocalInputValue(dateStr){
  const d=new Date(dateStr); const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64); const arr=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
  return arr;
}
// ---- Enlaces ligeros: parser y formateador ----
function isValidUrl(u){
  try { const x = new URL(u); return !!x.protocol && !!x.host; } catch { return false; }
}

function parseLinks(text){
  // Admite líneas con: URL   o   "Nombre | URL"
  const lines = (text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines){
    let name = "", url = line;
    // Permite "Nombre | URL"
    const parts = line.split("|").map(s=>s.trim());
    if (parts.length >= 2){ name = parts[0]; url = parts.slice(1).join("|"); }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url; // autocompleta
    if (isValidUrl(url)){
      if (!name) {
        try { name = new URL(url).hostname; } catch { name = url; }
      }
      out.push({ name, url });
    }
  }
  return out.slice(0, 20); // límite sano de seguridad
}

function formatLinks(links){
  return (links || [])
    .map(l => (l.name ? `${l.name} | ${l.url}` : l.url))
    .join("\n");
}

// Render chips de enlaces
function linksChips(links){
  if (!links || !links.length) return "";
  return `
    <div class="linklist">
      ${links.map(l => `
        <a class="linkchip" href="${escapeHTML(l.url)}" target="_blank" rel="noopener">
          🔗 ${escapeHTML(l.name || l.url)}
        </a>
      `).join("")}
    </div>`;
}


// Inicial
(async ()=>{
  tasks = await API.getTasks();
  // rebuildAssigneeFilter();   ❌ ya no hace falta
  // rebuildAssigneeDatalist(); ❌ ya no hace falta
  rebuildCategoryFilter();
  rebuildCategoryDatalist();
  render();
})();


// ====== Cambiar tema claro/oscuro ======
const themeBtn = document.getElementById("toggleTheme");

function syncThemeIcon(){
  if (!themeBtn) return;
  const light = document.body.classList.contains("light-theme");
  themeBtn.textContent = light ? "🌙" : "☀️";
  themeBtn.setAttribute("aria-label", light ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
}

if (themeBtn) {
  themeBtn.onclick = () => {
    document.body.classList.toggle("light-theme");
    localStorage.setItem("theme", document.body.classList.contains("light-theme") ? "light" : "dark");
    syncThemeIcon();
  };

  window.addEventListener("load", () => {
    if (localStorage.getItem("theme") === "light") {
      document.body.classList.add("light-theme");
    }
    syncThemeIcon();
  });
}


