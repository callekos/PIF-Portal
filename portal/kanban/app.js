// ======= Standardkolumner =======
const DEFAULT_COLS = [
  { id: "todo",  name: "Att göra" },
  { id: "doing", name: "Pågår" },
  { id: "done",  name: "Klart" }
];

// ======= Persistens (localStorage) =======
const STORAGE_KEY = "kanban_state_v1";

function clone(v){ return JSON.parse(JSON.stringify(v)); }

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function savePersisted(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch {}
}

// ======= Globalt state & historik (Ångra/Gör om) =======
let state = loadPersisted() ?? { cols: clone(DEFAULT_COLS), tasks: [] };

const MAX_HISTORY = 10;
const UNDO_STACK = [];
const REDO_STACK = [];

function pushHistory() {
  UNDO_STACK.push(clone(state));
  if (UNDO_STACK.length > MAX_HISTORY) UNDO_STACK.shift();
  REDO_STACK.length = 0;
  updateHistoryButtons();
}
function undo() {
  if (!UNDO_STACK.length) return;
  const prev = UNDO_STACK.pop();
  REDO_STACK.push(clone(state));
  if (REDO_STACK.length > MAX_HISTORY) REDO_STACK.shift();
  state = prev;
  savePersisted(state);
  render(); updateHistoryButtons();
}
function redo() {
  if (!REDO_STACK.length) return;
  const next = REDO_STACK.pop();
  UNDO_STACK.push(clone(state));
  if (UNDO_STACK.length > MAX_HISTORY) UNDO_STACK.shift();
  state = next;
  savePersisted(state);
  render(); updateHistoryButtons();
}

// ======= DOM =======
const board     = document.getElementById("board");
const colSelect = document.getElementById("col");
const taskForm  = document.getElementById("taskForm");
const colForm   = document.getElementById("colForm");
const undoBtn   = document.getElementById("undoBtn");
const redoBtn   = document.getElementById("redoBtn");

const toPortalBtn = document.getElementById("toPortalBtn");
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

// init-modalers synlighet
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

function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = UNDO_STACK.length === 0;
  if (redoBtn) redoBtn.disabled = REDO_STACK.length === 0;
}

// ======= Render =======
function render() {
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
    wrap.draggable = true;

    wrap.addEventListener("dragstart", (e) => {
      if (e.target.closest(".task")) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/col", col.id);
      wrap.classList.add("col-dragging");
      clearTaskHighlights();
    });
    wrap.addEventListener("dragend", () => {
      wrap.classList.remove("col-dragging");
      clearColHighlights();
      const order = Array.from(board.querySelectorAll(".col")).map(el => el.dataset.id);
      if (order.length === state.cols.length && order.some((id, i) => id !== state.cols[i].id)) {
        pushHistory();
        state.cols = order.map(id => state.cols.find(c => c.id === id));
        savePersisted(state);
        render();
      }
    });

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

    const dz = document.createElement("div");
    dz.className = "dropzone";

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
        savePersisted(state);
        render();
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

  // Centralt dragover för highlight
  board.addEventListener("dragover", (e) => {
    const dt = e.dataTransfer; if (!dt) return;
    if (dt.types.includes("text/task")) {
      e.preventDefault();
      clearColHighlights(); clearTaskHighlights();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dz = el && el.closest(".dropzone");
      if (dz) dz.classList.add("highlight","dragover");
      return;
    }
    if (dt.types.includes("text/col")) {
      e.preventDefault();
      clearTaskHighlights(); clearColHighlights();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const colEl = el && el.closest(".col");
      if (colEl && !colEl.classList.contains("col-dragging")) {
        colEl.classList.add("col-highlight");
      }
      const draggingCol = board.querySelector(".col.col-dragging");
      if (draggingCol) {
        const others = Array.from(board.querySelectorAll(".col:not(.col-dragging)"));
        let before = null;
        for (const c of others) {
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
  el.className = "card task";
  el.draggable = true;
  el.ondragstart = e => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.setData("text/task", "1");
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
  savePersisted(state);
  closeTaskModal(); render();
};
cancelEdit.onclick = closeTaskModal;

// ======= Modaler (kolumn) =======
let editingColId = null;
function openColModal(id) {
  const c = state.cols.find(x => x.id === id); if (!c) return;
  editingColId = id;
  colEditName.value = c.name || "";
  colMoveWrap.hidden = true;
  colMoveSelect.innerHTML = "";
  colDelete.textContent = "Ta bort";
  colDelete.dataset.stage = "initial";
  colModal.hidden = false; colEditName.focus();
}
function closeColModal() {
  editingColId = null; colModal.hidden = true;
  colMoveWrap.hidden = true; colDelete.textContent = "Ta bort"; colDelete.dataset.stage = "initial";
}
colSave.onclick = () => {
  const c = state.cols.find(x => x.id === editingColId); if (!c) return;
  const name = (colEditName.value || "").trim(); if (!name) return;
  if (c.name !== name) pushHistory();
  c.name = name;
  savePersisted(state);
  closeColModal(); render();
};
colCancel.onclick = closeColModal;

colDelete.onclick = () => {
  const col = state.cols.find(x => x.id === editingColId); if (!col) return;
  const hasTasks = state.tasks.some(t => t.col === col.id);
  const others   = state.cols.filter(x => x.id !== col.id);

  if (!hasTasks) {
    pushHistory();
    state.cols = state.cols.filter(x => x.id !== col.id);
    if (!state.cols.length) state.cols = clone(DEFAULT_COLS);
    savePersisted(state);
    closeColModal(); render();
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

  const target = colMoveSelect.value; if (!target) return;

  pushHistory();
  state.tasks.forEach(t => { if (t.col === col.id) t.col = target; });
  state.cols = state.cols.filter(x => x.id !== col.id);
  if (!state.cols.length) state.cols = clone(DEFAULT_COLS);
  savePersisted(state);
  closeColModal(); render();
};

// ======= Modal: ta bort uppgift =======
let pendingDeleteTaskId = null;
function openDeleteModal(id){ pendingDeleteTaskId=id; deleteModal.hidden=false; }
function closeDeleteModal(){ pendingDeleteTaskId=null; deleteModal.hidden=true; }
delYes.onclick = () => {
  pushHistory();
  state.tasks = state.tasks.filter(t=>t.id!==pendingDeleteTaskId);
  savePersisted(state);
  closeDeleteModal(); render();
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
  savePersisted(state);
  render(); taskForm.reset();
};

colForm.onsubmit = e => {
  e.preventDefault();
  const name = document.getElementById("colName").value.trim(); if (!name) return;
  pushHistory();
  state.cols.push({ id: uid(), name });
  savePersisted(state);
  render(); colForm.reset();
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
    state = { cols: clone(DEFAULT_COLS), tasks: [] };
    savePersisted(state);
    render();
  }
};

toPortalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  window.location.assign("/");
});

if (undoBtn) undoBtn.onclick = () => undo();
if (redoBtn) redoBtn.onclick = () => redo();

// Tangentbordsgenvägar
window.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((ctrl && e.key.toLowerCase() === "y") || (ctrl && e.shiftKey && e.key.toLowerCase() === "z")) { e.preventDefault(); redo(); }
});

// ======= Start =======
render();
updateHistoryButtons();
