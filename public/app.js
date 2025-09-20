// ======= Standardkolumner =======
const DEFAULT_COLS = [
  { id: "todo",  name: "Att göra" },
  { id: "doing", name: "Pågår" },
  { id: "done",  name: "Klart" }
];

// ======= Globalt state & historik (Ångra/Gör om) =======
let state = { cols: [...DEFAULT_COLS], tasks: [] };

// Max antal historiksteg (Ångra/Gör om)
const MAX_HISTORY = 10;

// Två stackar: ångra (bakåt) och gör om (framåt)
const UNDO_STACK = [];
const REDO_STACK = [];

function cloneState(s) { return JSON.parse(JSON.stringify(s)); }

// Lägg nuvarande state i UNDO, kapa vid MAX_HISTORY, rensa REDO
function pushHistory() {
  UNDO_STACK.push(cloneState(state));
  if (UNDO_STACK.length > MAX_HISTORY) UNDO_STACK.shift();
  REDO_STACK.length = 0; // ny åtgärd = historiken framåt ogiltig
  updateHistoryButtons();
}

// Ångra: flytta nuvarande state till REDO, poppa från UNDO till state
function undo() {
  if (!UNDO_STACK.length) return;
  const prev = UNDO_STACK.pop();
  REDO_STACK.push(cloneState(state));
  if (REDO_STACK.length > MAX_HISTORY) REDO_STACK.shift();
  state = prev;
  save().then(() => { render(); updateHistoryButtons(); });
}

// Gör om: flytta nuvarande state till UNDO, poppa från REDO till state
function redo() {
  if (!REDO_STACK.length) return;
  const next = REDO_STACK.pop();
  UNDO_STACK.push(cloneState(state));
  if (UNDO_STACK.length > MAX_HISTORY) UNDO_STACK.shift();
  state = next;
  save().then(() => { render(); updateHistoryButtons(); });
}

function updateHistoryButtons() {
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.disabled = UNDO_STACK.length === 0;
  if (redoBtn) redoBtn.disabled = REDO_STACK.length === 0;
}

// ======= DOM =======
const board     = document.getElementById("board");
const colSelect = document.getElementById("col");
const taskForm  = document.getElementById("taskForm");
const colForm   = document.getElementById("colForm");
const undoBtn   = document.getElementById("undoBtn");
const redoBtn   = document.getElementById("redoBtn"); // valfri – finns bara om du lägger till knappen

// toppknappar
const exportBtn = document.getElementById("exportBtn");
const clearBtn  = document.getElementById("clearBtn");

// modaler (uppgift)
const editModal  = document.getElementById("editModal");
const editTitle  = document.getElementById("editTitle");
const editDesc   = document.getElementById("editDesc");
const saveEdit   = document.getElementById("saveEdit");
const cancelEdit = document.getElementById("cancelEdit");

// modaler (kolumn)
const colModal      = document.getElementById("colModal");
const colEditName   = document.getElementById("colEditName");
const colMoveWrap   = document.getElementById("colMoveWrap");
const colMoveSelect = document.getElementById("colMoveSelect");
const colCancel     = document.getElementById("colCancel");
const colDelete     = document.getElementById("colDelete");
const colSave       = document.getElementById("colSave");

// modal (ta bort uppgift)
const deleteModal = document.getElementById("deleteModal");
const delYes = document.getElementById("delYes");
const delNo  = document.getElementById("delNo");

// dölja modaler på start
[editModal, colModal, deleteModal].forEach(el => { if (el) el.hidden = true; });

// ======= Hjälp =======
const uid = () => Math.random().toString(36).slice(2,10);

// ==== Highlight-hjälpare ====
function clearTaskHighlights() {
  document.querySelectorAll(".dropzone.highlight, .dropzone.dragover")
    .forEach(el => el.classList.remove("highlight", "dragover"));
}
function clearColHighlights() {
  document.querySelectorAll(".col.col-highlight")
    .forEach(el => el.classList.remove("col-highlight"));
}

// ======= IO =======
async function save() {
  try {
    await fetch("/save", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(state)
    });
  } catch {}
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") {
    return { cols: [...DEFAULT_COLS], tasks: [] };
  }
  let cols = [];
  if (Array.isArray(raw.cols)) {
    cols = raw.cols.map(c => ({ id: c.id || uid(), name: c.name || c.title || "Kolumn" }));
  } else if (Array.isArray(raw.columns)) {
    cols = raw.columns.map(c => ({ id: c.id || uid(), name: c.name || c.title || "Kolumn" }));
  }
  if (!cols.length) cols = [...DEFAULT_COLS];
  const colIds = new Set(cols.map(c => c.id));
  let tasks = Array.isArray(raw.tasks) ? raw.tasks.slice() : [];
  tasks = tasks.map(t => {
    const col = t.col || t.column || t.colId;
    const safeCol = colIds.has(col) ? col : cols[0].id;
    return {
      id: t.id || uid(),
      title: (t.title || "").trim() || "Utan titel",
      desc:  (t.desc  || t.description || "").trim(),
      col:   safeCol
    };
  });
  return { cols, tasks };
}

async function load() {
  try {
    const res = await fetch("/load", { cache:"no-store" });
    if (res.ok) {
      const data = await res.json();
      state = normalizeState(data);
    } else {
      state = { cols:[...DEFAULT_COLS], tasks:[] };
    }
  } catch {
    state = { cols:[...DEFAULT_COLS], tasks:[] };
  }
  render();
  updateHistoryButtons();
}

// ======= Render =======
function render() {
  // 1..5 kolumner per rad
  board.style.setProperty("--cols", Math.min(5, state.cols.length || 3));

  // fyll kolumnval i formuläret
  colSelect.innerHTML = "";
  state.cols.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id; opt.textContent = c.name;
    colSelect.appendChild(opt);
  });

  // bygg kolumner
  board.innerHTML = "";
  state.cols.forEach(col => {
    const wrap = document.createElement("div");
    wrap.className = "col";
    wrap.dataset.id = col.id;
    wrap.draggable = true; // kolumn kan dras

    // kolumn-drag start/slut (flytta DOM + spara ordning på dragend)
    wrap.addEventListener("dragstart", (e) => {
      if (e.target.closest(".card")) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/col", col.id);
      wrap.classList.add("col-dragging");
      clearTaskHighlights();
    });
    wrap.addEventListener("dragend", () => {
      wrap.classList.remove("col-dragging");
      clearColHighlights();
      // uppdatera ordning efter DOM
      const order = Array.from(board.querySelectorAll(".col")).map(el => el.dataset.id);
      if (order.length === state.cols.length && order.some((id, i) => id !== state.cols[i].id)) {
        pushHistory();
        state.cols = order.map(id => state.cols.find(c => c.id === id));
        save().then(render);
      }
    });

    // kolumn-header
    const h2 = document.createElement("h2");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = col.name;
    const menu = document.createElement("button");
    menu.className = "drag-handle";
    menu.textContent = "⋮";
    menu.title = "Redigera kolumn";
    menu.onclick = (ev) => { ev.stopPropagation(); openColModal(col.id); };
    h2.appendChild(nameSpan); h2.appendChild(menu);
    wrap.appendChild(h2);

    // dropzon för kort
    const dz = document.createElement("div");
    dz.className = "dropzone";

    // Minimal per-zone logik: bara tillåt drop
    dz.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types?.includes("text/task")) e.preventDefault();
    });
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      clearTaskHighlights();
      const id = e.dataTransfer.getData("text/plain");
      const t = state.tasks.find(x=>x.id===id);
      if (t && t.col !== col.id) {
        pushHistory();
        t.col = col.id;
        save().then(render);
      }
    });

    const items = state.tasks.filter(t=>t.col===col.id);
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty"; empty.textContent = "Inga uppgifter";
      dz.appendChild(empty);
    } else {
      items.forEach(t => dz.appendChild(taskCard(t, col)));
    }

    wrap.appendChild(dz);
    board.appendChild(wrap);
  });

  // === Centraliserad dragover styr highlight för både uppgift och kolumn ===
  board.addEventListener("dragover", (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;

    // Flyttar UPPGIFT: highlight exakt EN dropzone under pekaren
    if (dt.types.includes("text/task")) {
      e.preventDefault();
      clearColHighlights();
      clearTaskHighlights();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dz = el && el.closest(".dropzone");
      if (dz) dz.classList.add("highlight","dragover");
      return;
    }

    // Flyttar KOLUMN: highlight exakt EN hel kolumn under pekaren
    if (dt.types.includes("text/col")) {
      e.preventDefault();
      clearTaskHighlights();
      clearColHighlights();

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const colEl = el && el.closest(".col");
      if (colEl && !colEl.classList.contains("col-dragging")) {
        colEl.classList.add("col-highlight");
      }

      // uppdatera live-position i DOM
      const draggingCol = board.querySelector(".col.col-dragging");
      if (draggingCol) {
        const cols = Array.from(board.querySelectorAll(".col:not(.col-dragging)"));
        let before = null;
        for (const c of cols) {
          const r = c.getBoundingClientRect();
          if (e.clientX < r.left + r.width / 2) { before = c; break; }
        }
        if (before) board.insertBefore(draggingCol, before);
        else board.appendChild(draggingCol);
      }
    }
  }, { passive:false });

  updateHistoryButtons();
}

function taskCard(task, col) {
  const el = document.createElement("div");
  el.className = "card";
  el.draggable = true;
  el.ondragstart = e => {
    e.dataTransfer.setData("text/plain", task.id); // id
    e.dataTransfer.setData("text/task", "1");      // typmarkör
  };

  const title = document.createElement("div");
  title.className = "title"; title.textContent = task.title;

  const desc = document.createElement("div");
  desc.className = "desc"; desc.textContent = task.desc || "";

  const meta = document.createElement("div");
  meta.className = "meta";

  const tag = document.createElement("span");
  tag.className = "tag"; tag.textContent = col.name;

  const acts = document.createElement("div");
  acts.className  = "actions";

  const edit = document.createElement("button");
  edit.className = "btn secondary"; edit.textContent = "Redigera";
  edit.onclick = () => openTaskModal(task.id);

  const del = document.createElement("button");
  del.className = "btn danger"; del.textContent = "Ta bort";
  del.onclick = () => openDeleteModal(task.id);

  acts.appendChild(edit); acts.appendChild(del);
  meta.appendChild(tag); meta.appendChild(acts);

  el.appendChild(title); el.appendChild(desc); el.appendChild(meta);
  return el;
}

// ======= Modaler (uppgift) =======
let editingTaskId = null;
function openTaskModal(id) {
  const t = state.tasks.find(x=>x.id===id); if (!t) return;
  editingTaskId = id;
  editTitle.value = t.title || ""; editDesc.value = t.desc || "";
  editModal.hidden = false; editTitle.focus();
}
function closeTaskModal(){ editingTaskId=null; editModal.hidden=true; }
saveEdit.onclick = () => {
  const t = state.tasks.find(x=>x.id===editingTaskId); if (!t) return;
  const newTitle = (editTitle.value||"").trim();
  const newDesc  = (editDesc.value||"").trim();
  if (t.title !== newTitle || t.desc !== newDesc) pushHistory();
  t.title = newTitle; t.desc = newDesc;
  save().then(()=>{ closeTaskModal(); render(); });
};
cancelEdit.onclick = closeTaskModal;

// ======= Modaler (kolumn) =======
let editingColId = null;
function openColModal(id) {
  const c = state.cols.find(x => x.id === id);
  if (!c) return;
  editingColId = id;
  colEditName.value = c.name || "";
  colMoveWrap.hidden = true;
  colMoveSelect.innerHTML = "";
  colDelete.textContent = "Ta bort";
  colDelete.dataset.stage = "initial";
  colModal.hidden = false; colEditName.focus();
}
function closeColModal() {
  editingColId = null;
  colModal.hidden = true;
  colMoveWrap.hidden = true;
  colDelete.textContent = "Ta bort";
  colDelete.dataset.stage = "initial";
}
colSave.onclick = () => {
  const c = state.cols.find(x => x.id === editingColId);
  if (!c) return;
  const name = (colEditName.value || "").trim();
  if (!name) return;
  if (c.name !== name) pushHistory();
  c.name = name;
  save().then(()=>{ closeColModal(); render(); });
};
colCancel.onclick = closeColModal;

colDelete.onclick = () => {
  const col = state.cols.find(x => x.id === editingColId);
  if (!col) return;

  const hasTasks = state.tasks.some(t => t.col === col.id);
  const others   = state.cols.filter(x => x.id !== col.id);

  if (!hasTasks) {
    pushHistory();
    state.cols = state.cols.filter(x => x.id !== col.id);
    if (!state.cols.length) state.cols = [...DEFAULT_COLS];
    save().then(() => { closeColModal(); render(); });
    return;
  }

  if (others.length === 0) {
    alert("Det finns uppgifter i kolumnen men ingen annan kolumn att flytta till. Skapa en ny kolumn först.");
    return;
  }

  if (colDelete.dataset.stage !== "confirm") {
    colMoveSelect.innerHTML = "";
    others.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.id; opt.textContent = o.name;
      colMoveSelect.appendChild(opt);
    });
    colMoveWrap.hidden = false;
    colDelete.textContent = "Bekräfta radering";
    colDelete.dataset.stage = "confirm";
    return;
  }

  const target = colMoveSelect.value;
  if (!target) return;

  pushHistory();
  state.tasks.forEach(t => { if (t.col === col.id) t.col = target; });
  state.cols = state.cols.filter(x => x.id !== col.id);
  if (!state.cols.length) state.cols = [...DEFAULT_COLS];
  save().then(() => { closeColModal(); render(); });
};

// ======= Modal: ta bort uppgift =======
let pendingDeleteTaskId = null;
function openDeleteModal(id){ pendingDeleteTaskId=id; deleteModal.hidden=false; }
function closeDeleteModal(){ pendingDeleteTaskId=null; deleteModal.hidden=true; }
delYes.onclick = () => {
  pushHistory();
  state.tasks = state.tasks.filter(t=>t.id!==pendingDeleteTaskId);
  save().then(()=>{ closeDeleteModal(); render(); });
};
delNo.onclick = closeDeleteModal;

// ======= Form-events & toppknappar =======
taskForm.onsubmit = e => {
  e.preventDefault();
  const title = document.getElementById("title").value.trim();
  const desc  = document.getElementById("desc").value.trim();
  const col   = document.getElementById("col").value || state.cols[0].id;
  if (!title) return;
  pushHistory();
  state.tasks.push({ id: uid(), title, desc, col });
  save().then(()=>{ render(); taskForm.reset(); });
};

colForm.onsubmit = e => {
  e.preventDefault();
  const name = document.getElementById("colName").value.trim(); if (!name) return;
  pushHistory();
  state.cols.push({ id: uid(), name });
  save().then(()=>{ render(); colForm.reset(); });
};

exportBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "kanban-export.json"; a.click();
  URL.revokeObjectURL(url);
};

clearBtn.onclick = () => {
  if (confirm("Rensa allt?")) {
    pushHistory();
    state = { cols:[...DEFAULT_COLS], tasks:[] };
    save().then(render);
  }
};

if (undoBtn) undoBtn.onclick = () => undo();
if (redoBtn) redoBtn.onclick = () => redo();

// Tangentbordsgenvägar: Ctrl+Z (Ångra), Ctrl+Y eller Ctrl+Shift+Z (Gör om)
window.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey; // mac = cmd
  if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault(); undo();
  } else if ((ctrl && e.key.toLowerCase() === "y") || (ctrl && e.shiftKey && e.key.toLowerCase() === "z")) {
    e.preventDefault(); redo();
  }
});

// ======= Start =======
render(); // visa 3 standardkolumner direkt
load();   // hämta ev. sparad data och rendera om
updateHistoryButtons();
