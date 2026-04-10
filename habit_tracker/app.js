'use strict';

// ============================================================
//  HABIT TRACKER — app.js
//  Vanilla JS, no frameworks, no build step.
// ============================================================

// ---- Constants ---------------------------------------------
const STORAGE_KEY = 'habit-tracker-v1';
const MIN_SLEEP   = 4;
const MAX_SLEEP   = 9;
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const DEFAULT_TC = [
  { id: 't1', n: 'Memorable moments' }
];
const DEFAULT_HC = [
  { id: 'h1', n: 'Weight',     t: 'text'  },
  { id: 'h2', n: 'Stretching', t: 'check' },
  { id: 'h3', n: 'Coffee',     t: 'check' },
  { id: 'h4', n: 'Mates',      t: 'check' }
];

// ---- State -------------------------------------------------
let db = null;           // full persisted object
let viewYear  = 0;       // currently displayed year
let viewMonth = 0;       // currently displayed month (1-based)
let modalAction = null;  // 'add-text' | 'add-habit' | 'edit-text' | 'edit-habit'
let modalColId  = null;  // column id being edited

// ---- Utility -----------------------------------------------
function monthKey(y, m) {
  return y + '-' + String(m).padStart(2, '0');
}
function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}
function cloneCols(cols) {
  return JSON.parse(JSON.stringify(cols));
}
function genId(prefix) {
  return prefix + Date.now().toString(36);
}

// ---- Storage -----------------------------------------------
function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeDefaultDb();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.months !== 'object') {
      return makeDefaultDb();
    }
    return parsed;
  } catch (_) {
    return makeDefaultDb();
  }
}

function makeDefaultDb() {
  return { v: 1, theme: 'terminal', months: {} };
}

function saveDb() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (_) { /* storage full — silently ignore */ }
}

// ---- Month data management ---------------------------------
function ensureMonth(y, m) {
  const key = monthKey(y, m);
  if (!db.months[key]) {
    db.months[key] = { tc: [], hc: [], d: {} };
    inheritCols(db.months[key], y, m);
    if (!db.months[key].tc.length) {
      db.months[key].tc = cloneCols(DEFAULT_TC);
    }
    saveDb();
  }
  const md = db.months[key];
  // Ensure sub-objects exist (defensive against corrupt data)
  if (!Array.isArray(md.tc)) md.tc = cloneCols(DEFAULT_TC);
  if (!Array.isArray(md.hc)) md.hc = [];
  if (typeof md.d !== 'object' || md.d === null) md.d = {};
  return md;
}

function inheritCols(target, y, m) {
  // Walk backwards up to 24 months to find prior month data
  for (let i = 1; i <= 24; i++) {
    let pm = m - i;
    let py = y;
    while (pm < 1) { pm += 12; py--; }
    const key = monthKey(py, pm);
    if (db.months[key] && Array.isArray(db.months[key].tc)) {
      target.tc = cloneCols(db.months[key].tc);
      target.hc = cloneCols(db.months[key].hc || []);
      return;
    }
  }
}

function setDayValue(y, m, day, field, value) {
  const key = monthKey(y, m);
  const md = ensureMonth(y, m);
  const dk = String(day);
  if (!md.d[dk]) md.d[dk] = {};
  if (value === '' || value === null || value === undefined) {
    delete md.d[dk][field];
    if (Object.keys(md.d[dk]).length === 0) delete md.d[dk];
  } else {
    md.d[dk][field] = value;
  }
  saveDb();
}

function getDayData(md, day) {
  if (!md || typeof md.d !== 'object') return {};
  return md.d[String(day)] || {};
}

// ---- Theme -------------------------------------------------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  db.theme = theme;
  const metaEl = document.getElementById('meta-theme-color');
  if (metaEl) {
    metaEl.content = theme === 'paper' ? '#F5F0E8' : '#0c0c0e';
  }
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = theme === 'terminal' ? 'Paper' : 'Terminal';
  saveDb();
}

// ---- Mobile column width enforcement -----------------------
// CSS width on <col> is unreliable in table-layout:fixed — browsers
// compute fixed widths at first render and don't always re-evaluate
// when CSS changes via attribute selectors.  Set inline styles directly.
function applyMobileColWidths() {
  if (window.innerWidth > 640) return;
  const wrapper = document.querySelector('.table-wrapper');
  const tab = (wrapper && wrapper.dataset.mobileTab) || 'notes';
  const SHOW = {
    notes:  ['g-day', 'g-notes'],
    habits: ['g-day', 'g-habit'],
    sleep:  ['g-day', 'g-sleep'],
  };
  // Content columns that should flex to fill remaining width
  const FLEX = { notes: 'col-text', habits: 'col-habit', sleep: 'col-sleep' };
  const show = SHOW[tab] || SHOW.notes;
  const flex = FLEX[tab] || 'col-text';
  document.querySelectorAll('#table-colgroup col').forEach(col => {
    if (!show.some(g => col.classList.contains(g))) {
      col.style.width = '0';
    } else if (col.classList.contains(flex)) {
      col.style.width = 'auto';
    } else {
      col.style.width = '';
    }
  });
}

// ---- Render ------------------------------------------------
function render() {
  const md = ensureMonth(viewYear, viewMonth);
  renderHeading();
  buildColgroup(md);
  applyMobileColWidths();
  buildThead(md);
  buildTbody(md);
  requestAnimationFrame(() => drawSleepGraph(md));
}

function renderHeading() {
  document.getElementById('month-heading').textContent =
    MONTH_NAMES[viewMonth - 1] + ' ' + viewYear;
}

// Build <colgroup> with correct proportional widths
function buildColgroup(md) {
  const cg = document.getElementById('table-colgroup');
  cg.innerHTML = '';

  function addCol(cls) {
    const col = document.createElement('col');
    col.className = cls;
    cg.appendChild(col);
    return col;
  }

  // Day column (fixed)
  addCol('col-day g-day');

  // Text columns (flexible — browser distributes remaining after fixed cols)
  md.tc.forEach(() => addCol('col-text g-notes'));
  addCol('col-add g-notes');   // "+ add text col" button

  // Habit columns (compact fixed)
  md.hc.forEach(() => addCol('col-habit g-habit'));
  addCol('col-add g-habit');   // "+ add habit col" button

  // Sleep column (fixed)
  addCol('col-sleep g-sleep');
}

// Build header row
function buildThead(md) {
  const thead = document.getElementById('table-head');
  thead.innerHTML = '';
  const tr = document.createElement('tr');

  // --- Day header ---
  const thDay = document.createElement('th');
  thDay.className = 'th-day g-day';
  thDay.textContent = 'Day';
  tr.appendChild(thDay);

  // --- Text column headers ---
  md.tc.forEach(col => {
    const th = document.createElement('th');
    th.className = 'th-text g-notes';
    th.dataset.colType = 'text';
    th.dataset.colId = col.id;

    const label = document.createElement('span');
    label.className = 'header-label';
    label.textContent = col.n;
    th.appendChild(label);

    const delBtn = document.createElement('button');
    delBtn.className = 'header-delete';
    delBtn.title = 'Remove column';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteColumn('text', col.id);
    });
    th.appendChild(delBtn);

    th.addEventListener('click', () => activateHeaderRename(th, 'text', col.id));
    tr.appendChild(th);
  });

  // "+ Add notes column" button
  const thAddText = document.createElement('th');
  thAddText.className = 'th-add g-notes';
  const btnAddText = document.createElement('button');
  btnAddText.className = 'btn-add-col';
  btnAddText.title = 'Add notes column';
  btnAddText.textContent = '+';
  btnAddText.addEventListener('click', () => openAddColModal('text'));
  thAddText.appendChild(btnAddText);
  tr.appendChild(thAddText);

  // --- Habit column headers (vertical) ---
  md.hc.forEach(col => {
    const th = document.createElement('th');
    th.className = 'th-habit g-habit';
    th.dataset.colType = 'habit';
    th.dataset.colId = col.id;

    const inner = document.createElement('span');
    inner.className = 'header-inner';
    inner.textContent = col.n;
    th.appendChild(inner);

    const delBtn = document.createElement('button');
    delBtn.className = 'header-delete';
    delBtn.title = 'Remove column';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteColumn('habit', col.id);
    });
    th.appendChild(delBtn);

    th.addEventListener('click', () => activateHeaderRename(th, 'habit', col.id));
    tr.appendChild(th);
  });

  // "+ Add habit column" button
  const thAddHabit = document.createElement('th');
  thAddHabit.className = 'th-add g-habit';
  const btnAddHabit = document.createElement('button');
  btnAddHabit.className = 'btn-add-col';
  btnAddHabit.title = 'Add habit column';
  btnAddHabit.textContent = '+';
  btnAddHabit.addEventListener('click', () => openAddColModal('habit'));
  thAddHabit.appendChild(btnAddHabit);
  tr.appendChild(thAddHabit);

  // --- Sleep header ---
  const thSleep = document.createElement('th');
  thSleep.className = 'th-sleep g-sleep';
  thSleep.innerHTML = 'Sleep<span class="sleep-axis-label">4h – 9h</span>';
  tr.appendChild(thSleep);

  thead.appendChild(tr);
}

// Build all day rows
function buildTbody(md) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  const today = new Date();
  const totalDays = daysInMonth(viewYear, viewMonth);

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(viewYear, viewMonth - 1, d);
    const dow = date.getDay(); // 0=Sun
    const isToday = (
      today.getFullYear() === viewYear &&
      today.getMonth() + 1 === viewMonth &&
      today.getDate() === d
    );
    const isWeekend = (dow === 0 || dow === 6);
    const dayData = getDayData(md, d);
    tbody.appendChild(buildDayRow(d, dow, dayData, md, isToday, isWeekend));
  }
}

function buildDayRow(d, dow, dayData, md, isToday, isWeekend) {
  const tr = document.createElement('tr');
  if (isToday)   tr.classList.add('today');
  if (isWeekend) tr.classList.add('weekend');

  // --- Day cell ---
  const tdDay = document.createElement('td');
  tdDay.className = 'td-day g-day';
  const numSpan  = document.createElement('span');
  numSpan.className = 'cell-day-num';
  numSpan.textContent = d;
  const nameSpan = document.createElement('span');
  nameSpan.className = 'cell-day-name';
  nameSpan.textContent = DAY_NAMES[dow];
  tdDay.appendChild(numSpan);
  tdDay.appendChild(nameSpan);
  tr.appendChild(tdDay);

  // --- Text column cells ---
  md.tc.forEach(col => {
    const td = document.createElement('td');
    td.className = 'td-text g-notes';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'text-cell-input';
    inp.maxLength = 500;
    inp.value = (typeof dayData[col.id] === 'string') ? dayData[col.id] : '';
    inp.addEventListener('change', () => {
      setDayValue(viewYear, viewMonth, d, col.id, inp.value.trim());
    });
    td.appendChild(inp);
    tr.appendChild(td);
  });

  // Add-text phantom spacer
  const tdAddText = document.createElement('td');
  tdAddText.className = 'td-add g-notes';
  tr.appendChild(tdAddText);

  // --- Habit column cells ---
  md.hc.forEach(col => {
    const td = document.createElement('td');
    td.className = 'td-habit g-habit';

    if (col.t === 'check') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'habit-check';
      cb.checked = dayData[col.id] === true;
      cb.addEventListener('change', () => {
        setDayValue(viewYear, viewMonth, d, col.id, cb.checked);
      });
      td.appendChild(cb);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'habit-text-input';
      inp.maxLength = 20;
      inp.value = (typeof dayData[col.id] === 'string') ? dayData[col.id] : '';
      inp.addEventListener('change', () => {
        setDayValue(viewYear, viewMonth, d, col.id, inp.value.trim());
      });
      td.appendChild(inp);
    }
    tr.appendChild(td);
  });

  // Add-habit phantom spacer
  const tdAddHabit = document.createElement('td');
  tdAddHabit.className = 'td-add g-habit';
  tr.appendChild(tdAddHabit);

  // --- Sleep cell ---
  const tdSleep = document.createElement('td');
  tdSleep.className = 'td-sleep g-sleep';
  tdSleep.dataset.day = d;

  const hasSleep = (typeof dayData.s === 'number' && isFinite(dayData.s));

  if (hasSleep) {
    // Show a faint placeholder to hold space; SVG graph renders on top
    const hint = document.createElement('span');
    hint.className = 'sleep-value-hint';
    hint.textContent = dayData.s;
    tdSleep.appendChild(hint);
  } else {
    // Show input for first entry
    tdSleep.appendChild(createSleepInput(d));
  }

  // Clicking a filled sleep cell opens the edit input
  tdSleep.addEventListener('click', () => {
    if (!tdSleep.querySelector('.sleep-input')) {
      openSleepEdit(tdSleep, d, dayData.s);
    }
  });

  tr.appendChild(tdSleep);
  return tr;
}

function createSleepInput(day) {
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'sleep-input';
  inp.min = MIN_SLEEP;
  inp.max = MAX_SLEEP;
  inp.step = 0.5;
  inp.placeholder = 'h';

  const commitSleep = () => {
    const raw = parseFloat(inp.value);
    if (isNaN(raw)) {
      // Nothing entered — if there was a prior value, preserve it
      render();
      return;
    }
    const clamped = Math.min(MAX_SLEEP, Math.max(MIN_SLEEP, raw));
    setDayValue(viewYear, viewMonth, day, 's', clamped);
    render();
  };

  inp.addEventListener('change', commitSleep);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { inp.blur(); }
    if (e.key === 'Escape') {
      inp.value = '';
      render();
    }
  });
  return inp;
}

function openSleepEdit(td, day, currentVal) {
  // Replace any existing content
  td.innerHTML = '';
  const inp = createSleepInput(day);
  if (typeof currentVal === 'number') inp.value = currentVal;
  td.appendChild(inp);
  inp.focus();
  inp.select();
}

// ---- Sleep SVG graph ---------------------------------------
function drawSleepGraph(md) {
  const svg = document.getElementById('sleep-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const wrapper = document.querySelector('.table-wrapper');
  if (!wrapper) return;

  const cells = document.querySelectorAll('td.td-sleep');
  if (!cells.length) return;

  const wrapRect = wrapper.getBoundingClientRect();
  const tableEl  = document.getElementById('tracker-table');
  if (!tableEl) return;
  const tableRect = tableEl.getBoundingClientRect();

  // Get sleep column position from the first sleep cell
  const firstCell = cells[0];
  const cellRect  = firstCell.getBoundingClientRect();
  const colLeft   = cellRect.left - wrapRect.left;
  const colWidth  = cellRect.width;

  // Position SVG to cover the full table
  const svgTop  = tableRect.top - wrapRect.top;
  svg.style.left   = '0';
  svg.style.top    = svgTop + 'px';
  svg.style.width  = (wrapRect.width) + 'px';
  svg.style.height = tableRect.height + 'px';

  const NS = 'http://www.w3.org/2000/svg';

  // Draw vertical axis guide lines (at 4h, ~6.5h, 9h)
  const axisVals = [MIN_SLEEP, (MIN_SLEEP + MAX_SLEEP) / 2, MAX_SLEEP];
  axisVals.forEach(v => {
    const x = colLeft + ((v - MIN_SLEEP) / (MAX_SLEEP - MIN_SLEEP)) * colWidth;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x.toFixed(1));
    line.setAttribute('y1', '0');
    line.setAttribute('x2', x.toFixed(1));
    line.setAttribute('y2', tableRect.height.toFixed(1));
    line.setAttribute('stroke', 'var(--graph-axis)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  });

  // Collect data points
  const points = [];
  cells.forEach(cell => {
    const day = parseInt(cell.dataset.day, 10);
    const dayData = getDayData(md, day);
    const s = dayData.s;
    if (typeof s !== 'number' || !isFinite(s) || s < MIN_SLEEP || s > MAX_SLEEP) return;

    const cr   = cell.getBoundingClientRect();
    const y    = (cr.top - wrapRect.top) - svgTop + cr.height / 2;
    const x    = colLeft + ((s - MIN_SLEEP) / (MAX_SLEEP - MIN_SLEEP)) * colWidth;
    points.push({ x, y });
  });

  if (!points.length) return;

  // Draw connecting polyline
  if (points.length >= 2) {
    const polyline = document.createElementNS(NS, 'polyline');
    polyline.setAttribute('points', points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'var(--graph-line)');
    polyline.setAttribute('stroke-width', '1.5');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('opacity', '0.65');
    svg.appendChild(polyline);
  }

  // Draw dots at each data point
  points.forEach(p => {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', p.x.toFixed(1));
    circle.setAttribute('cy', p.y.toFixed(1));
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', 'var(--graph-dot)');
    svg.appendChild(circle);
  });
}

// ---- Column management -------------------------------------
function openAddColModal(type) {
  modalAction = 'add-' + type;
  modalColId  = null;
  document.getElementById('modal-title').textContent =
    type === 'text' ? 'Add notes column' : 'Add habit column';
  document.getElementById('modal-type-row').style.display =
    type === 'habit' ? 'block' : 'none';
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-type').value = 'check';
  document.getElementById('col-modal').showModal();
  document.getElementById('modal-name').focus();
}

function saveModal() {
  const name = document.getElementById('modal-name').value.trim().slice(0, 40);
  if (!name) {
    document.getElementById('modal-name').focus();
    return;
  }
  const type = document.getElementById('modal-type').value;
  const md   = ensureMonth(viewYear, viewMonth);

  if (modalAction === 'add-text') {
    md.tc.push({ id: genId('t'), n: name });
  } else if (modalAction === 'add-habit') {
    md.hc.push({ id: genId('h'), n: name, t: type });
  } else if (modalAction === 'edit-text') {
    const col = md.tc.find(c => c.id === modalColId);
    if (col) col.n = name;
  } else if (modalAction === 'edit-habit') {
    const col = md.hc.find(c => c.id === modalColId);
    if (col) { col.n = name; col.t = type; }
  }

  saveDb();
  document.getElementById('col-modal').close();
  render();
}

function deleteColumn(type, colId) {
  if (!confirm('Remove this column? Its data will be lost for this month.')) return;
  const md = ensureMonth(viewYear, viewMonth);
  if (type === 'text') {
    md.tc = md.tc.filter(c => c.id !== colId);
  } else {
    md.hc = md.hc.filter(c => c.id !== colId);
  }
  // Remove data for this column from all days in this month
  Object.values(md.d).forEach(dayData => { delete dayData[colId]; });
  saveDb();
  render();
}

function activateHeaderRename(th, type, colId) {
  // Don't activate if a delete button was clicked
  if (th.querySelector('.header-rename-input')) return;

  const labelEl = th.querySelector('.header-label, .header-inner');
  if (!labelEl) return;
  const currentName = labelEl.textContent.trim();

  const inp = document.createElement('input');
  inp.className = 'header-rename-input';
  inp.maxLength = 40;
  inp.value = currentName;
  labelEl.replaceWith(inp);
  inp.focus();
  inp.select();

  const commit = () => {
    const newName = inp.value.trim().slice(0, 40) || currentName;
    const md = ensureMonth(viewYear, viewMonth);
    const cols = type === 'text' ? md.tc : md.hc;
    const col = cols.find(c => c.id === colId);
    if (col) col.n = newName;
    saveDb();
    render();
  };

  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  inp.blur();
    if (e.key === 'Escape') { inp.value = currentName; inp.blur(); }
  });
}

// ---- Month navigation --------------------------------------
function navigateMonth(delta) {
  viewMonth += delta;
  if (viewMonth > 12) { viewMonth = 1;  viewYear++;  }
  if (viewMonth < 1)  { viewMonth = 12; viewYear--;  }
  render();
}

// ---- Mobile tabs -------------------------------------------
function setMobileTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const wrapper = document.querySelector('.table-wrapper');
  if (wrapper) wrapper.dataset.mobileTab = tab;
  applyMobileColWidths();
  if (tab === 'sleep') {
    requestAnimationFrame(() => drawSleepGraph(ensureMonth(viewYear, viewMonth)));
  }
}

// ---- Export / Import ---------------------------------------
function exportData() {
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'habit-tracker-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(file) {
  const errEl = document.getElementById('import-error');
  errEl.classList.remove('visible');

  if (file.size > 1_000_000) {
    errEl.textContent = 'File too large (max 1 MB)';
    errEl.classList.add('visible');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported || imported.v !== 1 || typeof imported.months !== 'object') {
        throw new Error('Invalid format');
      }
      db = imported;
      // Ensure required fields
      if (!db.months)       db.months = {};
      if (!db.theme)        db.theme  = 'terminal';
      saveDb();
      applyTheme(db.theme);
      render();
    } catch (_) {
      errEl.textContent = 'Import failed — invalid file';
      errEl.classList.add('visible');
      setTimeout(() => errEl.classList.remove('visible'), 4000);
    }
  };
  reader.readAsText(file);
}

// ---- Event wiring ------------------------------------------
function setupEvents() {
  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');
  if (navToggle) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => navLinks.classList.remove('open'))
    );
  }

  // Month navigation
  document.getElementById('btn-prev-month').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => navigateMonth(+1));

  // Theme toggle
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    applyTheme(db.theme === 'terminal' ? 'paper' : 'terminal');
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', exportData);

  // Import
  const importInput = document.getElementById('input-import');
  importInput.addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) {
      importData(e.target.files[0]);
    }
    e.target.value = ''; // allow re-importing same file
  });

  // Modal
  document.getElementById('modal-save').addEventListener('click', saveModal);
  document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('col-modal').close();
  });
  // Close on backdrop click
  document.getElementById('col-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('col-modal')) {
      document.getElementById('col-modal').close();
    }
  });
  // Enter to submit modal
  document.getElementById('modal-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveModal();
  });

  // Mobile tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setMobileTab(btn.dataset.tab));
  });

  // Swipe left/right on the tracker to navigate tabs
  const SWIPE_TABS = ['notes', 'habits', 'sleep'];
  let swipeTouchStartX = 0;
  let swipeTouchStartY = 0;
  const swipeEl = document.getElementById('tracker-main');
  swipeEl.addEventListener('touchstart', e => {
    swipeTouchStartX = e.touches[0].clientX;
    swipeTouchStartY = e.touches[0].clientY;
  }, { passive: true });
  swipeEl.addEventListener('touchend', e => {
    // Don't hijack interaction with inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const dx = e.changedTouches[0].clientX - swipeTouchStartX;
    const dy = e.changedTouches[0].clientY - swipeTouchStartY;
    // Require a clear horizontal gesture (60px min, 1.5x more horizontal than vertical)
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const activeBtn = document.querySelector('.tab-btn.active');
    if (!activeBtn) return;
    const idx = SWIPE_TABS.indexOf(activeBtn.dataset.tab);
    if (dx < 0 && idx < SWIPE_TABS.length - 1) setMobileTab(SWIPE_TABS[idx + 1]);
    else if (dx > 0 && idx > 0) setMobileTab(SWIPE_TABS[idx - 1]);
  }, { passive: true });

  // Resize: redraw sleep graph
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawSleepGraph(ensureMonth(viewYear, viewMonth));
    }, 150);
  });
}

// ---- Quick-log (homescreen widget) -------------------------
// Handles ?log=<colId> — ticks the habit for today and shows a toast.
function checkQuickLog() {
  const colId = new URLSearchParams(window.location.search).get('log');
  if (!colId) return;

  // Clean the URL immediately so a hard-refresh won't re-log
  const cleanUrl = window.location.pathname;
  history.replaceState(null, '', cleanUrl);

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const md = ensureMonth(y, m);

  const col = md.hc.find(c => c.id === colId);
  if (!col) {
    showQuickLogToast(null, false);
    return;
  }

  if (col.t !== 'check') {
    showQuickLogToast(col.n, null);
    return;
  }

  const wasChecked = getDayData(md, d)[colId] === true;
  const newVal = !wasChecked;
  setDayValue(y, m, d, colId, newVal || null);
  render();
  showQuickLogToast(col.n, newVal);
}

function showQuickLogToast(habitName, logged) {
  const toast = document.createElement('div');
  toast.className = 'quick-log-toast';

  const icon = document.createElement('span');
  icon.className = 'qlt-icon';

  const name = document.createElement('span');
  name.className = 'qlt-name';

  const sub = document.createElement('span');
  sub.className = 'qlt-sub';

  if (habitName === null) {
    // Habit ID not found
    toast.classList.add('qlt-error');
    icon.textContent = '?';
    name.textContent = 'Habit not found';
    sub.textContent = 'Check your shortcut URL';
  } else if (logged === null) {
    // Text habit — can't quick-log
    toast.classList.add('qlt-error');
    icon.textContent = 'i';
    name.textContent = habitName;
    sub.textContent = 'Open the app to enter a value';
  } else if (logged) {
    toast.classList.add('qlt-checked');
    icon.textContent = '✓';
    name.textContent = habitName;
    sub.textContent = 'Logged for today';
  } else {
    toast.classList.add('qlt-unchecked');
    icon.textContent = '○';
    name.textContent = habitName;
    sub.textContent = 'Removed for today';
  }

  toast.appendChild(icon);
  toast.appendChild(name);
  if (sub.textContent) toast.appendChild(sub);
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));

  const dismiss = () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  };
  setTimeout(dismiss, 2600);
  toast.addEventListener('click', dismiss);
}

// ---- Init --------------------------------------------------
function init() {
  db = loadDb();

  const now  = new Date();
  viewYear   = now.getFullYear();
  viewMonth  = now.getMonth() + 1;

  applyTheme(db.theme || 'terminal');

  // Set default mobile tab BEFORE render so applyMobileColWidths reads it correctly
  const wrapper = document.querySelector('.table-wrapper');
  if (wrapper) wrapper.dataset.mobileTab = 'notes';

  render();
  setupEvents();
  checkQuickLog();
}

document.addEventListener('DOMContentLoaded', init);
