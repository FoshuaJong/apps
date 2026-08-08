// DOM layer: renders the chip UI, syncs button state to the model, and wires
// clicks. All note wording lives in notes.js; all option tables in schema.js.

import { VH_VALUES, CDR_VALUES, CONDITIONS_MAP, POSTERIOR_CONDITIONS_MAP } from "./schema.js";
import { freshEyeState, defaultState, defaultPosteriorState, freshHistoryState } from "./state.js";
import { buildNote, buildPosteriorNote, buildHistoryNote } from "./notes.js";

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

// Covers all five flat posterior booleans: imaging.optos/oct/drs plus the
// top-level arcades/bv flags - each is just a canned-text on/off
// toggle, same mechanism as irisT/ac but keyed by data-field instead of
// data-section since imaging's fields live nested under `imaging`.
function refreshPosteriorToggle(field){
  var btn = document.querySelector('[data-type="posteriorToggle"][data-field="' + field + '"]');
  var value = field === "optos" || field === "oct" || field === "drs" ? posteriorState.imaging[field] : posteriorState[field];
  btn.classList.toggle("is-active", !!value);
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
  ["optos", "oct", "drs", "dimReflex", "arcades", "bv"].forEach(refreshPosteriorToggle);
  refreshPosteriorEyeSection("vit");
  refreshPosteriorEyeSection("macula");
  refreshPosteriorEyeSection("periphery");
  refreshOnh();
  refreshCdr();
}

function refreshHistoryAll(){
  document.querySelectorAll('[data-type="historyReason"]').forEach(function(b){
    b.classList.toggle("is-active", historyState.reason === b.dataset.value);
  });
  document.querySelectorAll('[data-type="historyLastEE"]').forEach(function(b){
    b.classList.toggle("is-active", historyState.lastEE === b.dataset.value);
  });
  document.querySelector('[data-type="historyNoSpecs"]').classList.toggle("is-active", !!historyState.specs.noSpecs);
  ["progs", "svd", "occupational", "svn"].forEach(function(cond){
    document.querySelector('[data-type="historySpecsToggle"][data-cond="' + cond + '"]')
      .classList.toggle("is-active", !!historyState.specs[cond]);
  });
  document.querySelectorAll('[data-type="historyCL"]').forEach(function(b){
    b.classList.toggle("is-active", historyState.specs.cl === b.dataset.value);
  });
  ["dv", "nv"].forEach(function(sub){
    document.querySelectorAll('[data-type="historyVision"][data-sub="' + sub + '"]').forEach(function(b){
      b.classList.toggle("is-active", historyState.vision[sub] === b.dataset.value);
    });
  });
  document.querySelectorAll('[data-type="historyHA"]').forEach(function(b){
    b.classList.toggle("is-active", historyState.ha === b.dataset.value);
  });
  document.querySelectorAll('[data-type="historyFloaters"]').forEach(function(b){
    b.classList.toggle("is-active", historyState.floaters === b.dataset.value);
  });
  document.querySelector('[data-type="historyNoDed"]').classList.toggle("is-active", !!historyState.ded.noSymptoms);
  ["dry", "watery", "red", "itchy"].forEach(function(cond){
    document.querySelector('[data-type="historyDedToggle"][data-cond="' + cond + '"]')
      .classList.toggle("is-active", !!historyState.ded[cond]);
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

function handleClick(e){
  var btn = e.target.closest("button[data-type]");
  if (!btn) return;
  var type = btn.dataset.type;

  switch (type){
    case "eyeClear": {
      var sec2 = btn.dataset.section, eye2 = btn.dataset.eye;
      var turningOn2 = !state[sec2][eye2].clear;
      resetEye(sec2, eye2);
      state[sec2][eye2].clear = turningOn2;
      break;
    }
    case "grade": {
      var sec3 = btn.dataset.section, eye3 = btn.dataset.eye, cond3 = btn.dataset.cond, grade3 = Number(btn.dataset.grade);
      var eyeState3 = state[sec3][eye3];
      eyeState3[cond3] = (eyeState3[cond3] === grade3) ? null : grade3;
      eyeState3.clear = false;
      break;
    }
    case "bool": {
      var sec4 = btn.dataset.section, eye4 = btn.dataset.eye, cond4 = btn.dataset.cond;
      var eyeState4 = state[sec4][eye4];
      eyeState4[cond4] = !eyeState4[cond4];
      if (eyeState4[cond4]) eyeState4.clear = false;
      break;
    }
    case "choice": {
      var sec6 = btn.dataset.section, eye6 = btn.dataset.eye, cond6 = btn.dataset.cond, value6 = btn.dataset.value;
      var eyeState6 = state[sec6][eye6];
      eyeState6[cond6] = (eyeState6[cond6] === value6) ? null : value6;
      eyeState6.clear = false;
      break;
    }
    case "cornea": {
      var val = btn.dataset.value;
      state.cornea = (state.cornea === val) ? null : val;
      break;
    }
    case "pterygium": {
      var pEye = btn.dataset.eye, pSide = btn.dataset.side;
      state.pterygium[pEye][pSide] = !state.pterygium[pEye][pSide];
      break;
    }
    case "vh": {
      var slot = btn.dataset.slot, val2 = btn.dataset.value;
      state.vh[slot] = (state.vh[slot] === val2) ? null : val2;
      break;
    }
    case "single": {
      var sec5 = btn.dataset.section;
      state[sec5] = !state[sec5];
      break;
    }
    case "reset": {
      if (activeTab === "anterior") state = defaultState();
      else if (activeTab === "posterior") posteriorState = defaultPosteriorState();
      else {
        historyState = freshHistoryState();
        document.getElementById("historyNotesInput").value = "";
      }
      break;
    }
    case "copy": {
      copyNote();
      return;
    }
    case "tab": {
      setActiveTab(btn.dataset.tab);
      return;
    }
    case "posteriorEyeClear": {
      var pcSec = btn.dataset.section, pcEye = btn.dataset.eye;
      var pcTurningOn = !posteriorState[pcSec][pcEye].clear;
      posteriorState[pcSec][pcEye] = freshEyeState(POSTERIOR_CONDITIONS_MAP[pcSec]);
      posteriorState[pcSec][pcEye].clear = pcTurningOn;
      break;
    }
    case "posteriorBool": {
      var pbSec = btn.dataset.section, pbEye = btn.dataset.eye, pbCond = btn.dataset.cond;
      var pbEyeState = posteriorState[pbSec][pbEye];
      pbEyeState[pbCond] = !pbEyeState[pbCond];
      if (pbEyeState[pbCond]) pbEyeState.clear = false;
      break;
    }
    case "onh": {
      var onhEye = btn.dataset.eye;
      posteriorState.onh[onhEye].PPA = !posteriorState.onh[onhEye].PPA;
      break;
    }
    case "cdr": {
      var cdrEye = btn.dataset.eye, cdrVal = btn.dataset.value;
      posteriorState.cdr[cdrEye] = cdrVal;
      break;
    }
    case "posteriorToggle": {
      var ptField = btn.dataset.field;
      if (ptField === "optos" || ptField === "oct" || ptField === "drs"){
        posteriorState.imaging[ptField] = !posteriorState.imaging[ptField];
      } else {
        posteriorState[ptField] = !posteriorState[ptField];
      }
      break;
    }
    case "historyReason": {
      var hrVal = btn.dataset.value;
      historyState.reason = (historyState.reason === hrVal) ? null : hrVal;
      break;
    }
    case "historyLastEE": {
      var hyVal = btn.dataset.value;
      historyState.lastEE = (historyState.lastEE === hyVal) ? null : hyVal;
      break;
    }
    case "historyNoSpecs": {
      var turningOnNoSpecs = !historyState.specs.noSpecs;
      historyState.specs = { noSpecs: turningOnNoSpecs, progs: false, svd: false, occupational: false, svn: false, cl: null };
      break;
    }
    case "historySpecsToggle": {
      var scCond = btn.dataset.cond;
      historyState.specs[scCond] = !historyState.specs[scCond];
      if (historyState.specs[scCond]) historyState.specs.noSpecs = false;
      break;
    }
    case "historyCL": {
      var hclVal = btn.dataset.value;
      historyState.specs.cl = (historyState.specs.cl === hclVal) ? null : hclVal;
      if (historyState.specs.cl) historyState.specs.noSpecs = false;
      break;
    }
    case "historyVision": {
      var hvSub = btn.dataset.sub, hvVal = btn.dataset.value;
      historyState.vision[hvSub] = (historyState.vision[hvSub] === hvVal) ? null : hvVal;
      break;
    }
    case "historyHA": {
      var hhVal = btn.dataset.value;
      historyState.ha = (historyState.ha === hhVal) ? null : hhVal;
      break;
    }
    case "historyFloaters": {
      var hfVal = btn.dataset.value;
      historyState.floaters = (historyState.floaters === hfVal) ? null : hfVal;
      break;
    }
    case "historyNoDed": {
      var turningOnNoDed = !historyState.ded.noSymptoms;
      historyState.ded = { noSymptoms: turningOnNoDed, dry: false, watery: false, red: false, itchy: false };
      break;
    }
    case "historyDedToggle": {
      var hdCond = btn.dataset.cond;
      historyState.ded[hdCond] = !historyState.ded[hdCond];
      if (historyState.ded[hdCond]) historyState.ded.noSymptoms = false;
      break;
    }
  }

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
refreshHistoryAll();
setActiveTab("history");

