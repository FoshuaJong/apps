// DOM layer: renders the chip UI, syncs button state to the model, and wires
// clicks. All note wording lives in notes.js; all option tables in schema.js.
//
// Plain script (see schema.js) - loads last, after the three globals it reads.

(function(){

const { VH_VALUES, CDR_VALUES, CONDITIONS_MAP, POSTERIOR_CONDITIONS_MAP, POSTERIOR_TOGGLES, HISTORY_GROUPS, HISTORY_GROUP_BY_KEY } = OptomSchema;
const { freshEyeState, defaultState, defaultPosteriorState, freshHistoryState } = OptomState;
const { buildNote, buildPosteriorNote, buildHistoryNote } = OptomNotes;

// The three notes are independent models sharing one preview footer.
var state = defaultState();
var posteriorState = defaultPosteriorState();
var historyState = freshHistoryState();

// ---------- render (build DOM once) ----------

// scope disambiguates posterior's vit/macula (which share this exact per-eye
// clear+conditions markup) from anterior's lids/conj/lens via the data-type
// value, so one delegated click handler can tell which state bag to mutate
// without the two note builders' sections colliding on selector lookups.
function conditionRowHTML(sectionKey, eye, c, scope){
  var boolType = scope ? scope + "Bool" : "bool";
  if (c.grades){
    var chips = [1,2,3,4].map(function(g){
      return '<button type="button" class="chip chip-grade" data-type="grade" data-section="' + sectionKey +
        '" data-eye="' + eye + '" data-cond="' + c.key + '" data-grade="' + g + '">' + g + '</button>';
    }).join("");
    return '<div class="cond-row"><span class="cond-label">' + c.label + '</span><div class="grade-chips">' + chips + '</div></div>';
  }
  if (c.choices){
    var choiceChips = c.choices.map(function(v){
      return '<button type="button" class="chip chip-choice" data-type="choice" data-section="' + sectionKey +
        '" data-eye="' + eye + '" data-cond="' + c.key + '" data-value="' + v + '">' + v + '</button>';
    }).join("");
    return '<div class="cond-row"><span class="cond-label">' + c.label + '</span><div class="grade-chips">' + choiceChips + '</div></div>';
  }
  return '<div class="cond-row cond-row-bool"><button type="button" class="chip chip-bool" data-type="' + boolType + '" data-section="' +
    sectionKey + '" data-eye="' + eye + '" data-cond="' + c.key + '">' + c.label + '</button></div>';
}

function eyeGroupHTML(sectionKey, eye, conditions, scope){
  var clearType = scope ? scope + "EyeClear" : "eyeClear";
  var rows = conditions.map(function(c){ return conditionRowHTML(sectionKey, eye, c, scope); }).join("");
  return '<div class="eye-group">' +
    '<div class="eye-group-head"><span class="eye-label">' + eye + '</span>' +
    '<button type="button" class="chip chip-clear" data-type="' + clearType + '" data-section="' + sectionKey + '" data-eye="' + eye + '">clear</button>' +
    '</div><div class="cond-rows">' + rows + '</div></div>';
}

function renderEyeSections(){
  ["lids", "conj", "lens"].forEach(function(sectionKey){
    var grid = document.querySelector('[data-eyes-grid="' + sectionKey + '"]');
    var conditions = CONDITIONS_MAP[sectionKey];
    grid.innerHTML = eyeGroupHTML(sectionKey, "R", conditions) + eyeGroupHTML(sectionKey, "L", conditions);
  });
}

function renderPosteriorEyeSections(){
  ["vit", "macula", "periphery"].forEach(function(sectionKey){
    var grid = document.querySelector('[data-post-eyes-grid="' + sectionKey + '"]');
    var conditions = POSTERIOR_CONDITIONS_MAP[sectionKey];
    grid.innerHTML = eyeGroupHTML(sectionKey, "R", conditions, "posterior") + eyeGroupHTML(sectionKey, "L", conditions, "posterior");
  });
}

function vhEyeBlockHTML(eye){
  function slotHTML(slotKey){
    return VH_VALUES.map(function(v){
      return '<button type="button" class="chip chip-vh" data-type="vh" data-slot="' + slotKey + '" data-value="' + v + '">' + v + '</button>';
    }).join("");
  }
  return '<div class="vh-eye"><span class="eye-label">' + eye + '</span>' +
    '<div class="vh-slot">' + slotHTML(eye + "top") + '</div>' +
    '<span class="vh-slash">/</span>' +
    '<div class="vh-slot">' + slotHTML(eye + "bottom") + '</div></div>';
}

function renderVH(){
  document.querySelector('[data-vh-grid]').innerHTML = vhEyeBlockHTML("R") + vhEyeBlockHTML("L");
}

// Same shape as vhEyeBlockHTML but one value-slot per eye (no slash/second slot) -
// CDR is a single reading per eye, always shown, never OU-compacted.
function cdrEyeBlockHTML(eye){
  var chips = CDR_VALUES.map(function(v){
    return '<button type="button" class="chip chip-vh" data-type="cdr" data-eye="' + eye + '" data-value="' + v + '">' + v + '</button>';
  }).join("");
  return '<div class="vh-eye"><span class="eye-label">' + eye + '</span><div class="vh-slot">' + chips + '</div></div>';
}

function renderCdr(){
  document.querySelector('[data-cdr-grid]').innerHTML = cdrEyeBlockHTML("R") + cdrEyeBlockHTML("L");
}

// Pterygium is cornea-specific and per-eye, but unlike lids/conj/lens it has no
// eye-level "clear" concept of its own (overall cornea clarity is the clear/arcus
// preset above) - so it gets its own minimal render/state rather than joining
// CONDITIONS_MAP.
function pterygiumEyeHTML(eye){
  return '<div class="eye-group"><div class="eye-group-head"><span class="eye-label">' + eye + '</span></div>' +
    '<div class="cond-rows">' +
    '<div class="cond-row cond-row-bool"><button type="button" class="chip chip-bool" data-type="pterygium" data-eye="' +
      eye + '" data-side="nasal">nasal pterygium</button></div>' +
    '<div class="cond-row cond-row-bool"><button type="button" class="chip chip-bool" data-type="pterygium" data-eye="' +
      eye + '" data-side="temporal">temporal pterygium</button></div>' +
    '</div></div>';
}

function renderPterygium(){
  document.querySelector('[data-pterygium-grid]').innerHTML = pterygiumEyeHTML("R") + pterygiumEyeHTML("L");
}

// ONH's baseline phrase is always present (not a per-eye clear flag) and PPA is
// additive on top of it rather than replacing it - no clear button needed here,
// same reasoning as pterygium.
function onhEyeHTML(eye){
  return '<div class="eye-group"><div class="eye-group-head"><span class="eye-label">' + eye + '</span></div>' +
    '<div class="cond-rows"><div class="cond-row cond-row-bool">' +
    '<button type="button" class="chip chip-bool" data-type="onh" data-eye="' + eye + '">PPA</button>' +
    '</div></div></div>';
}

function renderOnh(){
  document.querySelector('[data-onh-grid]').innerHTML = onhEyeHTML("R") + onhEyeHTML("L");
}

// History cards are generated from HISTORY_GROUPS rather than written out in
// index.html, so a new option needs no markup. Consecutive groups sharing a
// `card` are emitted into the same card, in schema order.
function historyChipHTML(group, option, chipClass){
  return '<button type="button" class="chip ' + chipClass + '" data-type="historyChip" data-group="' +
    group.key + '" data-value="' + option.value + '">' + option.label + '</button>';
}

function historyGroupHTML(group){
  if (group.kind === "flag"){
    return '<div class="preset-row">' +
      historyChipHTML(group, { value: group.key, label: group.label }, "chip-preset") + '</div>';
  }
  // `row` groups (DV/NV) sit on a labelled line together; the rest flow freely.
  if (group.row){
    return '<div class="cond-row"><span class="cond-label">' + group.row + '</span><div class="grade-chips">' +
      group.options.map(function(o){ return historyChipHTML(group, o, "chip-choice"); }).join("") +
      '</div></div>';
  }
  return '<div class="preset-row">' +
    group.options.map(function(o){ return historyChipHTML(group, o, "chip-preset"); }).join("") + '</div>';
}

function renderHistoryGroups(){
  var html = "";
  HISTORY_GROUPS.forEach(function(g, i){
    var prev = HISTORY_GROUPS[i - 1];
    var next = HISTORY_GROUPS[i + 1];
    if (!prev || prev.card !== g.card){
      html += '<section class="card"><div class="card-head"><h2>' + g.card + '</h2></div>';
      if (g.row) html += '<div class="cond-rows">';
    }
    html += historyGroupHTML(g);
    if (!next || next.card !== g.card){
      if (g.row) html += '</div>';
      html += '</section>';
    }
  });
  document.querySelector("[data-history-groups]").innerHTML = html;
}

// ---------- refresh (sync button states to model) ----------

function refreshEyeSection(sectionKey){
  var sectionState = state[sectionKey];
  var conditions = CONDITIONS_MAP[sectionKey];

  ["R", "L"].forEach(function(eye){
    var eyeState = sectionState[eye];
    var clearBtn = document.querySelector('[data-type="eyeClear"][data-section="' + sectionKey + '"][data-eye="' + eye + '"]');
    clearBtn.classList.toggle("is-active", !!eyeState.clear);

    conditions.forEach(function(c){
      if (c.grades){
        [1,2,3,4].forEach(function(g){
          var btn = document.querySelector('[data-type="grade"][data-section="' + sectionKey + '"][data-eye="' + eye +
            '"][data-cond="' + c.key + '"][data-grade="' + g + '"]');
          btn.classList.toggle("is-active", eyeState[c.key] === g);
        });
      } else if (c.choices){
        c.choices.forEach(function(v){
          var choiceBtn = document.querySelector('[data-type="choice"][data-section="' + sectionKey + '"][data-eye="' + eye +
            '"][data-cond="' + c.key + '"][data-value="' + v + '"]');
          choiceBtn.classList.toggle("is-active", eyeState[c.key] === v);
        });
      } else {
        var boolBtn = document.querySelector('[data-type="bool"][data-section="' + sectionKey + '"][data-eye="' + eye +
          '"][data-cond="' + c.key + '"]');
        boolBtn.classList.toggle("is-active", !!eyeState[c.key]);
      }
    });
  });
}

function refreshPosteriorEyeSection(sectionKey){
  var sectionState = posteriorState[sectionKey];
  var conditions = POSTERIOR_CONDITIONS_MAP[sectionKey];

  ["R", "L"].forEach(function(eye){
    var eyeState = sectionState[eye];
    var clearBtn = document.querySelector('[data-type="posteriorEyeClear"][data-section="' + sectionKey + '"][data-eye="' + eye + '"]');
    clearBtn.classList.toggle("is-active", !!eyeState.clear);

    conditions.forEach(function(c){
      var boolBtn = document.querySelector('[data-type="posteriorBool"][data-section="' + sectionKey + '"][data-eye="' + eye +
        '"][data-cond="' + c.key + '"]');
      boolBtn.classList.toggle("is-active", !!eyeState[c.key]);
    });
  });
}

function refreshCornea(){
  document.querySelectorAll('[data-type="cornea"]').forEach(function(btn){
    btn.classList.toggle("is-active", state.cornea === btn.dataset.value);
  });
}

function refreshPterygium(){
  ["R", "L"].forEach(function(eye){
    ["nasal", "temporal"].forEach(function(side){
      var btn = document.querySelector('[data-type="pterygium"][data-eye="' + eye + '"][data-side="' + side + '"]');
      btn.classList.toggle("is-active", !!state.pterygium[eye][side]);
    });
  });
}

function refreshOnh(){
  ["R", "L"].forEach(function(eye){
    var btn = document.querySelector('[data-type="onh"][data-eye="' + eye + '"]');
    btn.classList.toggle("is-active", !!posteriorState.onh[eye].PPA);
  });
}

function refreshVH(){
  ["Rtop", "Rbottom", "Ltop", "Lbottom"].forEach(function(slot){
    document.querySelectorAll('[data-type="vh"][data-slot="' + slot + '"]').forEach(function(btn){
      btn.classList.toggle("is-active", state.vh[slot] === btn.dataset.value);
    });
  });
}

function refreshCdr(){
  ["R", "L"].forEach(function(eye){
    document.querySelectorAll('[data-type="cdr"][data-eye="' + eye + '"]').forEach(function(btn){
      btn.classList.toggle("is-active", posteriorState.cdr[eye] === btn.dataset.value);
    });
  });
}

function refreshSingle(sectionKey){
  var btn = document.querySelector('[data-type="single"][data-section="' + sectionKey + '"]');
  btn.classList.toggle("is-active", !!state[sectionKey]);
}

// Flat posterior booleans (imaging.optos/oct/drs, dimReflex, arcades, bv). The
// state location comes from the toggle's `path` in schema.js, so nested and
// top-level fields read and write the same way.
function toggleTarget(path){
  var obj = posteriorState;
  for (var i = 0; i < path.length - 1; i++) obj = obj[path[i]];
  return { obj: obj, prop: path[path.length - 1] };
}

function refreshPosteriorToggle(toggle){
  var t = toggleTarget(toggle.path);
  document.querySelector('[data-type="posteriorToggle"][data-field="' + toggle.field + '"]')
    .classList.toggle("is-active", !!t.obj[t.prop]);
}

function refreshAll(){
  refreshEyeSection("lids");
  refreshEyeSection("conj");
  refreshEyeSection("lens");
  refreshCornea();
  refreshPterygium();
  refreshVH();
  refreshSingle("irisT");
  refreshSingle("ac");
}

function refreshPosteriorAll(){
  POSTERIOR_TOGGLES.forEach(refreshPosteriorToggle);
  refreshPosteriorEyeSection("vit");
  refreshPosteriorEyeSection("macula");
  refreshPosteriorEyeSection("periphery");
  refreshOnh();
  refreshCdr();
}

// Every history chip carries data-group/data-value, so one pass over
// HISTORY_GROUPS highlights the whole tab regardless of how many options exist.
function refreshHistoryAll(){
  HISTORY_GROUPS.forEach(function(g){
    var value = historyState[g.key];
    document.querySelectorAll('[data-type="historyChip"][data-group="' + g.key + '"]').forEach(function(btn){
      var on = g.kind === "flag" ? !!value
             : g.kind === "multi" ? !!value[btn.dataset.value]
             : value === btn.dataset.value;
      btn.classList.toggle("is-active", on);
    });
  });
}


// ---------- preview / copy ----------

var previewEl = document.getElementById("preview");
var copyBtn = document.getElementById("copyBtn");
var previewEyebrowEl = document.getElementById("previewEyebrow");

// The footer is shared by both notes - it always shows whichever note the
// active tab points to, so switching tabs re-renders it via setActiveTab()
// and every click re-renders it via this same call at the end of handleClick.
function updateActivePreview(){
  previewEl.value = activeTab === "anterior" ? buildNote(state) :
    activeTab === "posterior" ? buildPosteriorNote(posteriorState) : buildHistoryNote(historyState);
  syncCopyState();
}

function syncCopyState(){
  copyBtn.disabled = !previewEl.value.trim();
}

previewEl.addEventListener("input", syncCopyState);

function flashCopied(){
  var original = "Copy note";
  copyBtn.textContent = "Copied!";
  copyBtn.classList.add("is-copied");
  setTimeout(function(){
    copyBtn.textContent = original;
    copyBtn.classList.remove("is-copied");
  }, 1400);
}

// Copies exactly what's in the textarea, respecting any manual tweaks the user made.
function copyNote(){
  var note = previewEl.value;
  if (!note.trim()) return;

  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(note).then(flashCopied).catch(function(){ fallbackCopy(); });
  } else {
    fallbackCopy();
  }
}

function fallbackCopy(){
  previewEl.select();
  try { document.execCommand("copy"); } catch (e) { /* no-op */ }
  flashCopied();
}

// ---------- interaction ----------

function resetEye(sectionKey, eye){
  state[sectionKey][eye] = freshEyeState(CONDITIONS_MAP[sectionKey]);
}

function clearHistoryGroup(group){
  if (group.kind === "multi") Object.keys(historyState[group.key]).forEach(function(v){ historyState[group.key][v] = false; });
  else historyState[group.key] = group.kind === "flag" ? false : null;
}

function historyGroupIsOn(group){
  var value = historyState[group.key];
  return group.kind === "multi" ? Object.keys(value).some(function(v){ return value[v]; }) : !!value;
}

// A "flag" group ("No specs", "No dry eye symptoms") and the groups it `clears`
// are mutually exclusive: switching one on switches the other side off.
function historyChipClicked(group, value){
  if (group.kind === "flag"){
    var turningOn = !historyState[group.key];
    group.clears.forEach(function(key){ clearHistoryGroup(HISTORY_GROUP_BY_KEY[key]); });
    historyState[group.key] = turningOn;
    return;
  }

  if (group.kind === "multi") historyState[group.key][value] = !historyState[group.key][value];
  else historyState[group.key] = historyState[group.key] === value ? null : value;

  if (!historyGroupIsOn(group)) return;
  HISTORY_GROUPS.forEach(function(f){
    if (f.kind === "flag" && f.clears.indexOf(group.key) !== -1) historyState[f.key] = false;
  });
}

var activeTab = "history";

var TAB_LABELS = { history: "History", anterior: "Anterior", posterior: "Posterior" };

// Switching tabs never touches state - it's purely which panel is visible and
// which note the shared footer currently reflects.
function setActiveTab(tab){
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(function(btn){
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach(function(panel){
    panel.hidden = panel.dataset.tabPanel !== tab;
  });
  previewEyebrowEl.textContent = TAB_LABELS[tab] + " note preview";
  updateActivePreview();
}

document.getElementById("app").addEventListener("click", handleClick);
document.querySelector("footer").addEventListener("click", handleClick);
document.querySelector(".tab-switcher").addEventListener("click", handleClick);

// One handler per data-type, each taking the button's dataset. Handlers that
// return true have already dealt with the redraw and skip the refresh below.
var HANDLERS = {
  // ---- anterior ----
  eyeClear: function(d){
    var turningOn = !state[d.section][d.eye].clear;
    resetEye(d.section, d.eye);
    state[d.section][d.eye].clear = turningOn;
  },
  grade: function(d){
    var eye = state[d.section][d.eye], grade = Number(d.grade);
    eye[d.cond] = eye[d.cond] === grade ? null : grade;
    eye.clear = false;
  },
  bool: function(d){
    var eye = state[d.section][d.eye];
    eye[d.cond] = !eye[d.cond];
    if (eye[d.cond]) eye.clear = false;
  },
  choice: function(d){
    var eye = state[d.section][d.eye];
    eye[d.cond] = eye[d.cond] === d.value ? null : d.value;
    eye.clear = false;
  },
  cornea: function(d){
    state.cornea = state.cornea === d.value ? null : d.value;
  },
  pterygium: function(d){
    state.pterygium[d.eye][d.side] = !state.pterygium[d.eye][d.side];
  },
  vh: function(d){
    state.vh[d.slot] = state.vh[d.slot] === d.value ? null : d.value;
  },
  single: function(d){
    state[d.section] = !state[d.section];
  },

  // ---- posterior ----
  posteriorEyeClear: function(d){
    var turningOn = !posteriorState[d.section][d.eye].clear;
    posteriorState[d.section][d.eye] = freshEyeState(POSTERIOR_CONDITIONS_MAP[d.section]);
    posteriorState[d.section][d.eye].clear = turningOn;
  },
  posteriorBool: function(d){
    var eye = posteriorState[d.section][d.eye];
    eye[d.cond] = !eye[d.cond];
    if (eye[d.cond]) eye.clear = false;
  },
  onh: function(d){
    posteriorState.onh[d.eye].PPA = !posteriorState.onh[d.eye].PPA;
  },
  cdr: function(d){
    posteriorState.cdr[d.eye] = d.value;
  },
  posteriorToggle: function(d){
    var toggle = POSTERIOR_TOGGLES.find(function(t){ return t.field === d.field; });
    var target = toggleTarget(toggle.path);
    target.obj[target.prop] = !target.obj[target.prop];
  },

  // ---- history: one handler for every chip on the tab, since which group a
  // chip belongs to and how it behaves both come from schema.js ----
  historyChip: function(d){
    historyChipClicked(HISTORY_GROUP_BY_KEY[d.group], d.value);
  },

  // ---- shared footer / tabs ----
  reset: function(){
    if (activeTab === "anterior") state = defaultState();
    else if (activeTab === "posterior") posteriorState = defaultPosteriorState();
    else {
      historyState = freshHistoryState();
      document.getElementById("historyNotesInput").value = "";
    }
  },
  copy: function(){
    copyNote();
    return true;
  },
  tab: function(d){
    setActiveTab(d.tab);
    return true;
  }
};

function handleClick(e){
  var btn = e.target.closest("button[data-type]");
  if (!btn) return;
  var handler = HANDLERS[btn.dataset.type];
  if (!handler || handler(btn.dataset)) return;

  refreshAll();
  refreshPosteriorAll();
  refreshHistoryAll();
  updateActivePreview();
}

// ---------- theme ----------

var THEME_KEY = "optom-theme";

function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
}

function initTheme(){
  var saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* no-op */ }
  applyTheme(saved === "dark" ? "dark" : "light");
}

document.getElementById("themeToggle").addEventListener("click", function(){
  var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* no-op */ }
});

document.getElementById("historyNotesInput").addEventListener("input", function(e){
  historyState.notes = e.target.value;
  updateActivePreview();
});

// ---------- init ----------

initTheme();
renderEyeSections();
renderPterygium();
renderVH();
refreshAll();
renderPosteriorEyeSections();
renderOnh();
renderCdr();
refreshPosteriorAll();
renderHistoryGroups();
refreshHistoryAll();
setActiveTab("history");

})();

