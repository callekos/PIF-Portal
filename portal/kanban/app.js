// ==================== DATASET & LAGRING ====================
const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const SERVER_FN_URL = IS_LOCAL ? "/api/kanban" : "/.netlify/functions/kanban";

// Bas-nyckel; vi gör en per-demo med suffix
const STORAGE_KEY_DEMO_BASE = "kanban_demo_v1";
const demoKey = (id) => `${STORAGE_KEY_DEMO_BASE}:${id}`;

// Tillåt både bindestreck och underscore i values från <select>
const normalizeDatasetId = (id) => id.replace(/-/g, "_");

// DEMO-filer – ABSOLUTA paths. Filnamn måste finnas i portal/data/mock/
const DATASETS = {
  demo_utredare: "/data/mock/utredare.json",
  demo_opk:      "/data/mock/opk.json",
  demo_lpo_chef: "/data/mock/lpo-chef.json", // byt vid behov till rätt filnamn
  demo_annan:    "/data/mock/annan.json"
};

// Mänskliga etiketter för hinten uppe till vänster
const DATASET_LABELS = {
  demo_utredare: "Utredare",
  demo_opk:      "OPK",
  demo_lpo_chef: "LPO-Chef",
  demo_annan:    "Annan"
};

// Valfri bootstrap-fil för Normal
const DEFAULT_NORMAL_BOOTSTRAP = "/data/mock/_normal_bootstrap.json";

// UI – dataset
const datasetSelect   = document.getElementById("datasetSelect");
const applyDatasetBtn = document.getElementById("applyDataset");
const exitDemoBtn     = document.getElementById("exitDemo");
const modeHint        = document.getElementById("modeHint");

// ==================== Standardkolumner ====================
const DEFAULT_COLS = [
  { id: "todo",  name: "Att göra" },
  { id: "doing", name: "Pågår" },
  { id: "done",  name: "Klart" }
];

// ==================== Hjälp & normalisering ====================
const clone = (v) => JSON.parse(JSON.stringify(v));
const uid   = () => Math.random().toString(36).slice(2,10);

function normalizeState(s) {
  const out = s && typeof s === "object" ? clone(s) : {};
  if (!Array.isArray(out.cols) || out.cols.length === 0) out.cols = clone(DEFAULT_COLS);
  if (!Array.isArray(out.tasks)) out.tasks = [];
  const colIds = new Set(out.cols.map(c => c.id));
  out.tasks = out.tasks
    .filter(t => t && typeof t === "object")
    .map(t => ({
      id: t.id || uid(),
      title: t.title || "",
      desc: t.desc || "",
      col: colIds.has(t.col) ? t.col : out.cols[0].id
    }));
  return out;
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} för ${path}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) {
    console.error("JSON-parse-fel för", path, "Innehåll:", text);
    throw new Error(`Ogiltig JSON i ${path}`);
  }
}

// ------ Normal (server) ------
async function serverLoad() {
  try {
    const res = await fetch(SERVER_FN_URL, { method: "GET" });
    if (res.ok) return normalizeState(await res.json());
    if (res.status === 404) {
      try {
        const initial = normalizeState(await fetchJSON(DEFAULT_NORMAL_BOOTSTRAP));
        await serverSave(initial);
        return initial;
      } catch {
        const empty = normalizeState({ cols: clone(DEFAULT_COLS), tasks: [] });
        await serverSave(empty);
        return empty;
      }
    }
    throw new Error(`Server load error: ${res.status}`);
  } catch (e) {
    console.warn("serverLoad fail:", e.message);
    return normalizeState({ cols: clone(DEFAULT_COLS), tasks: [] });
  }
}

async function serverSave(state) {
  const clean = normalizeState(state);
  try {
    await fetch(SERVER_FN_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clean)
    });
  } catch (e) {
    console.warn("serverSave fail:", e.message);
  }
}

// ------ Demo (session) ------
function demoLoad(id)  { const r = sessionStorage.getItem(demoKey(id)); return r ? normalizeState(JSON.parse(r)) : null; }
function demoSave(id,s){ sessionStorage.setItem(demoKey(id), JSON.stringify(normalizeState(s))); }
function demoClearAll(){ Object.keys(sessionStorage).forEach(k => { if (k.startsWith(`${STORAGE_KEY_DEMO_BASE}:`)) sessionStorage.removeItem(k); }); }

// ==================== Globalt state & historik ====================
let MODE = "normal";
let CURRENT_DEMO = null; // håller reda på vilket demo som är aktivt (id)
let state = normalizeState({ cols: clone(DEFAULT_COLS), tasks: [] });

const MAX_HISTORY = 10;
const UNDO_STACK = [];
const REDO_STACK = [];

function pushHistory(){ UNDO_STACK.push(clone(state)); if(UNDO_STACK.length>MAX_HISTORY) UNDO_STACK.shift(); REDO_STACK.length=0; updateHistoryButtons(); }
function undo(){ if(!UNDO_STACK.length) return; const prev=UNDO_STACK.pop(); REDO_STACK.push(clone(state)); if(REDO_STACK.length>MAX_HISTORY) REDO_STACK.shift(); state=normalizeState(prev); persist(); render(); updateHistoryButtons(); }
function redo(){ if(!REDO_STACK.length) return; const next=REDO_STACK.pop(); UNDO_STACK.push(clone(state)); if(UNDO_STACK.length>MAX_HISTORY) UNDO_STACK.shift(); state=normalizeState(next); persist(); render(); updateHistoryButtons(); }
function persist(){
  if (MODE === "normal") serverSave(state);
  else if (CURRENT_DEMO) demoSave(CURRENT_DEMO, state);
}

// ==================== DOM ====================
const board     = document.getElementById("board");
const colSelect = document.getElementById("col");
const taskForm  = document.getElementById("taskForm");
const colForm   = document.getElementById("colForm");
const undoBtn   = document.getElementById("undoBtn");
const redoBtn   = document.getElementById("redoBtn");
const toPortalBtn = document.getElementById("toPortalBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn  = document.getElementById("clearBtn");

// modaler
const editModal  = document.getElementById("editModal");
const editTitle  = document.getElementById("editTitle");
const editDesc   = document.getElementById("editDesc");
const saveEdit   = document.getElementById("saveEdit");
const cancelEdit = document.getElementById("cancelEdit");

const colModal      = document.getElementById("colModal");
const colEditName   = document.getElementById("colEditName");
const colMoveWrap   = document.getElementById("colMoveWrap");
const colMoveSelect = document.getElementById("colMoveSelect");
const colCancel     = document.getElementById("colCancel");
const colDelete     = document.getElementById("colDelete");
const colSave       = document.getElementById("colSave");

const deleteModal = document.getElementById("deleteModal");
const delYes = document.getElementById("delYes");
const delNo  = document.getElementById("delNo");

[editModal, colModal, deleteModal].forEach(el => { if (el) el.hidden = true; });

// ==================== Lägesbyte ====================
async function setMode(newMode, datasetId=null){
  MODE = newMode;

  if(MODE==="normal"){
    CURRENT_DEMO = null;
    state = await serverLoad();
    if (modeHint) modeHint.textContent = "Läge: Normal (server)";
  } else {
    const id = normalizeDatasetId(datasetId);
    CURRENT_DEMO = id;
    const label = DATASET_LABELS[id] || id;
    const file  = DATASETS[id];
    if(!file){ alert("Okänt dataset: "+id); return; }

    try{
      // Först: finns demo-buffert för just DETTA dataset?
      state = demoLoad(id) || normalizeState(await fetchJSON(file));
      // Spara bufferten under datasetets egen nyckel
      demoSave(id, state);
      if (modeHint) modeHint.textContent = `Läge: Demo (${label}) – sessionStorage`;
    }catch(e){
      alert("Kunde inte ladda dataset: "+label+"\n\n"+e.message);
      return;
    }
  }

  UNDO_STACK.length=0; REDO_STACK.length=0;
  render(); updateHistoryButtons();
}

// ===== Lägesknappar =====
applyDatasetBtn?.addEventListener("click", async () => {
  const raw = datasetSelect.value;               // "normal" | "demo_*"
  const val = normalizeDatasetId(raw);
  if (val === "normal") await setMode("normal");
  else                  await setMode("demo", val);
});

// "Avsluta demo" = till Normal men sparar alla demo-buffertar för vidare växling
exitDemoBtn?.addEventListener("click", async () => {
  datasetSelect.value = "normal";
  await setMode("normal");
});

// ==================== Render ====================
function updateHistoryButtons(){
  if(undoBtn) undoBtn.disabled=!UNDO_STACK.length;
  if(redoBtn) redoBtn.disabled=!REDO_STACK.length;
}

function render(){
  state = normalizeState(state);
  const cols = state.cols;

  // kolumnselect
  colSelect.innerHTML = "";
  cols.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id; opt.textContent = c.name;
    colSelect.appendChild(opt);
  });

  // kolumner
  board.innerHTML = "";
  cols.forEach(col => {
    const wrap = document.createElement("div");
    wrap.className = "col";
    wrap.dataset.id = col.id;
    wrap.draggable = true;

    wrap.addEventListener("dragstart", (e) => {
      if (e.target.closest(".task")) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/col", col.id);
      wrap.classList.add("col-dragging");
    });
    wrap.addEventListener("dragend", () => {
      wrap.classList.remove("col-dragging");
      const order = Array.from(board.querySelectorAll(".col")).map(el => el.dataset.id);
      if (order.length === cols.length && order.some((id,i)=>id!==cols[i].id)) {
        pushHistory();
        state.cols = order.map(id => cols.find(c => c.id===id));
        persist();
        render();
      }
    });

    const h2 = document.createElement("h2");
    const nameSpan = document.createElement("span"); nameSpan.textContent = col.name;
    const menu = document.createElement("button"); menu.className="drag-handle"; menu.textContent="⋮"; menu.title="Redigera kolumn";
    menu.onclick = (ev)=>{ ev.stopPropagation(); openColModal(col.id); };
    h2.appendChild(nameSpan); h2.appendChild(menu);
    wrap.appendChild(h2);

    const dz = document.createElement("div"); dz.className="dropzone";
    dz.addEventListener("dragover",(e)=>{ if(e.dataTransfer?.types?.includes("text/task")) e.preventDefault(); });
    dz.addEventListener("drop",(e)=>{
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      const t = state.tasks.find(x=>x.id===id);
      if(t && t.col!==col.id){ pushHistory(); t.col=col.id; persist(); render(); }
    });

    const items = state.tasks.filter(t=>t.col===col.id);
    if(!items.length){ const empty=document.createElement("div"); empty.className="empty"; empty.textContent="Inga uppgifter"; dz.appendChild(empty); }
    else items.forEach(t => dz.appendChild(taskCard(t,col)));

    wrap.appendChild(dz);
    board.appendChild(wrap);
  });

  updateHistoryButtons();
}

function taskCard(task,col){
  const el=document.createElement("div"); el.className="card task"; el.draggable=true;
  el.ondragstart=e=>{ e.dataTransfer.setData("text/plain",task.id); e.dataTransfer.setData("text/task","1"); };

  const title=document.createElement("div"); title.className="title"; title.textContent=task.title;
  const desc=document.createElement("div"); desc.className="desc"; desc.textContent=task.desc||"";
  const meta=document.createElement("div"); meta.className="meta";
  const tag=document.createElement("span"); tag.className="tag"; tag.textContent=col.name;

  const acts=document.createElement("div"); acts.className="actions";
  const edit=document.createElement("button"); edit.className="btn secondary"; edit.textContent="Redigera"; edit.onclick=()=>openTaskModal(task.id);
  const del=document.createElement("button"); del.className="btn danger"; del.textContent="Ta bort"; del.onclick=()=>openDeleteModal(task.id);
  acts.appendChild(edit); acts.appendChild(del);

  meta.appendChild(tag); meta.appendChild(acts);
  el.appendChild(title); el.appendChild(desc); el.appendChild(meta);
  return el;
}

// ==================== Modaler & events ====================
let editingTaskId=null;
function openTaskModal(id){ const t=state.tasks.find(x=>x.id===id); if(!t) return; editingTaskId=id; editTitle.value=t.title||""; editDesc.value=t.desc||""; editModal.hidden=false; editTitle.focus(); }
function closeTaskModal(){ editingTaskId=null; editModal.hidden=true; }
saveEdit.onclick=()=>{ const t=state.tasks.find(x=>x.id===editingTaskId); if(!t) return; const nt=(editTitle.value||"").trim(); const nd=(editDesc.value||"").trim(); if(t.title!==nt||t.desc!==nd) pushHistory(); t.title=nt; t.desc=nd; persist(); closeTaskModal(); render(); };
cancelEdit.onclick=closeTaskModal;

let editingColId=null;
function openColModal(id){ const c=state.cols.find(x=>x.id===id); if(!c) return; editingColId=id; colEditName.value=c.name||""; colMoveWrap.hidden=true; colMoveSelect.innerHTML=""; colDelete.textContent="Ta bort"; colDelete.dataset.stage="initial"; colModal.hidden=false; colEditName.focus(); }
function closeColModal(){ editingColId=null; colModal.hidden=true; colMoveWrap.hidden=true; colDelete.textContent="Ta bort"; colDelete.dataset.stage="initial"; }
colSave.onclick=()=>{ const c=state.cols.find(x=>x.id===editingColId); if(!c) return; const name=(colEditName.value||"").trim(); if(!name) return; if(c.name!==name) pushHistory(); c.name=name; persist(); closeColModal(); render(); };
colCancel.onclick=closeColModal;
colDelete.onclick=()=>{ const col=state.cols.find(x=>x.id===editingColId); if(!col) return;
  const hasTasks=state.tasks.some(t=>t.col===col.id);
  const others=state.cols.filter(x=>x.id!==col.id);
  if(!hasTasks){
    pushHistory();
    state.cols=state.cols.filter(x=>x.id!==col.id);
    if(!state.cols.length) state.cols=clone(DEFAULT_COLS);
    persist(); closeColModal(); render(); return;
  }
  if(!others.length){ alert("Det finns uppgifter i kolumnen men ingen annan kolumn att flytta till. Skapa en ny kolumn först."); return; }
  if(colDelete.dataset.stage!=="confirm"){
    colMoveSelect.innerHTML="";
    others.forEach(o=>{ const opt=document.createElement("option"); opt.value=o.id; opt.textContent=o.name; colMoveSelect.appendChild(opt); });
    colMoveWrap.hidden=false; colDelete.textContent="Bekräfta radering"; colDelete.dataset.stage="confirm"; return;
  }
  const target=colMoveSelect.value; if(!target) return;
  pushHistory();
  state.tasks.forEach(t=>{ if(t.col===col.id) t.col=target; });
  state.cols=state.cols.filter(x=>x.id!==col.id);
  if(!state.cols.length) state.cols=clone(DEFAULT_COLS);
  persist(); closeColModal(); render();
};

let pendingDeleteTaskId=null;
function openDeleteModal(id){ pendingDeleteTaskId=id; deleteModal.hidden=false; }
function closeDeleteModal(){ pendingDeleteTaskId=null; deleteModal.hidden=true; }
delYes.onclick=()=>{ pushHistory(); state.tasks=state.tasks.filter(t=>t.id!==pendingDeleteTaskId); persist(); closeDeleteModal(); render(); };
delNo.onclick=closeDeleteModal;

// Form handlers
taskForm.onsubmit=e=>{
  e.preventDefault();
  state = normalizeState(state);
  const title=document.getElementById("title").value.trim();
  const desc=document.getElementById("desc").value.trim();
  const col=document.getElementById("col").value || state.cols[0].id;
  if(!title) return;
  pushHistory();
  state.tasks.push({ id: uid(), title, desc, col });
  persist();
  render();
  taskForm.reset();
};

colForm.onsubmit=e=>{
  e.preventDefault();
  const name=document.getElementById("colName").value.trim();
  if(!name) return;
  pushHistory();
  state.cols.push({ id: uid(), name });
  persist();
  render();
  colForm.reset();
};

exportBtn.onclick=()=>{ const blob=new Blob([JSON.stringify(normalizeState(state),null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="kanban-export.json"; a.click(); URL.revokeObjectURL(url); };
clearBtn.onclick=()=>{ if(confirm("Rensa allt?")){ pushHistory(); state=normalizeState({ cols: clone(DEFAULT_COLS), tasks: [] }); persist(); render(); } };
toPortalBtn?.addEventListener("click",(e)=>{ e.preventDefault(); location.assign("/"); });

if(undoBtn) undoBtn.onclick=()=>undo();
if(redoBtn) redoBtn.onclick=()=>redo();

window.addEventListener("keydown",(e)=>{ const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl && e.key.toLowerCase()==="z" && !e.shiftKey){ e.preventDefault(); undo(); }
  else if((ctrl && e.key.toLowerCase()==="y") || (ctrl && e.shiftKey && e.key.toLowerCase()==="z")){ e.preventDefault(); redo(); }
});

// ==================== Init ====================
(async function init(){
  const initial = datasetSelect?.value || "normal";
  if(initial==="normal") await setMode("normal"); else await setMode("demo", normalizeDatasetId(initial));
})();
