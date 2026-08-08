// Pure state -> note text. No DOM access anywhere in this file, so every
// function here is directly unit-testable (see notes.test.js).

import { CONDITIONS_MAP, OUTPUT_LABELS, VIT_CONDITIONS, MACULA_CONDITIONS, PERIPHERY_CONDITIONS } from "./schema.js";

// ---------- note text ----------

// Builds the ordered list of clause objects ({key, text}) active for one eye.
// "key" identifies the underlying finding so the other eye's matching clause can
// be detected even when the two eyes' clause lists aren't identical overall.
// Conj gets special handling to combine nasal+temporal ping into "N+T".
function buildClauses(eyeState, sectionKey, conditions){
  if (sectionKey === "conj"){
    var clauses = [];
    if (eyeState.hyperaemia) clauses.push({ key: "hyperaemia", text: "mild hyperaemia" });
    var n = eyeState.nasalPing, t = eyeState.temporalPing;
    if (n && t) clauses.push({ key: "ping", text: "ping N+T" });
    else if (n) clauses.push({ key: "ping", text: "nasal ping" });
    else if (t) clauses.push({ key: "ping", text: "temporal ping" });
    return clauses;
  }
  var out = [];
  conditions.forEach(function(c){
    if (c.grades){
      if (eyeState[c.key]) out.push({ key: c.key, text: c.label + " gd" + eyeState[c.key] });
    } else if (c.choices){
      if (eyeState[c.key]) out.push({ key: c.key, text: c.label + " " + eyeState[c.key] });
    } else {
      if (eyeState[c.key]) out.push({ key: c.key, text: c.text || c.label });
    }
  });
  return out;
}

// Match clauses shared by both eyes (same finding, same text) so they can be
// OU-compacted. Whatever's left on either eye - including findings the other eye
// doesn't have - is returned separately so it can stay under that eye's own prefix
// instead of breaking OU-compaction entirely.
function compactEyeClauses(rClauses, lClauses){
  var lUsed = lClauses.map(function(){ return false; });
  var common = [];
  var rLeft = [];
  rClauses.forEach(function(rc){
    var idx = lClauses.findIndex(function(lc, i){ return !lUsed[i] && lc.key === rc.key && lc.text === rc.text; });
    if (idx === -1){
      rLeft.push(rc.text);
    } else {
      common.push(rc.text);
      lUsed[idx] = true;
    }
  });
  var lLeft = lClauses.filter(function(lc, i){ return !lUsed[i]; }).map(function(lc){ return lc.text; });
  return { common: common, rLeft: rLeft, lLeft: lLeft };
}

// joiner/clearLabel let posterior sections (comma-joined multi-condition eyes,
// a descriptive "clear" fallback phrase instead of the literal word) reuse this
// unchanged for anterior, which calls it with neither and gets identical output.
function formatEyeSegments(compacted, rClear, lClear, joiner, clearLabel){
  joiner = joiner || " ";
  clearLabel = clearLabel || "clear";
  var segments = [];
  if (compacted.common.length) segments.push(compacted.common.map(function(c){ return c + " OU"; }).join(", "));
  if (compacted.rLeft.length) segments.push("R " + compacted.rLeft.join(joiner));
  else if (rClear) segments.push("R " + clearLabel);
  if (compacted.lLeft.length) segments.push("L " + compacted.lLeft.join(joiner));
  else if (lClear) segments.push("L " + clearLabel);
  return segments.length ? segments.join(" ") : null;
}

export function sectionText(state, sectionKey){
  var s = state[sectionKey];
  var conditions = CONDITIONS_MAP[sectionKey];

  var rClear = s.R.clear, lClear = s.L.clear;
  if (rClear && lClear) return "clear OU";

  var rClauses = buildClauses(s.R, sectionKey, conditions);
  var lClauses = buildClauses(s.L, sectionKey, conditions);

  return formatEyeSegments(compactEyeClauses(rClauses, lClauses), rClear, lClear);
}

// Shared by posterior's vit/macula: same clear+conditions shape as sectionText,
// but with a configurable comma-joiner (posterior joins multi-condition eyes
// with ", " not a space) and a configurable "clear" fallback phrase (macula's
// is a descriptive baseline, not the literal word "clear").
function posteriorEyeSectionText(sectionState, sectionKey, conditions, clearLabel, joiner){
  var rClear = sectionState.R.clear, lClear = sectionState.L.clear;
  if (rClear && lClear) return clearLabel + " OU";

  var rClauses = buildClauses(sectionState.R, sectionKey, conditions);
  var lClauses = buildClauses(sectionState.L, sectionKey, conditions);

  return formatEyeSegments(compactEyeClauses(rClauses, lClauses), rClear, lClear, joiner, clearLabel);
}

// Same nasal/temporal -> N+T combination as conj's ping, but pterygium has no
// section-level "clear OU" fallback of its own - an eye with neither side marked
// simply contributes nothing, since overall cornea clarity is the clear/arcus preset.
function pterygiumClauses(eyeState){
  var clauses = [];
  if (eyeState.nasal && eyeState.temporal) clauses.push({ key: "pterygium", text: "pterygium N+T" });
  else if (eyeState.nasal) clauses.push({ key: "pterygium", text: "nasal pterygium" });
  else if (eyeState.temporal) clauses.push({ key: "pterygium", text: "temporal pterygium" });
  return clauses;
}

function pterygiumText(state){
  var rClauses = pterygiumClauses(state.pterygium.R);
  var lClauses = pterygiumClauses(state.pterygium.L);
  if (!rClauses.length && !lClauses.length) return null;
  return formatEyeSegments(compactEyeClauses(rClauses, lClauses), false, false);
}

function vhText(state){
  var vh = state.vh;
  if (!vh.Rtop && !vh.Rbottom && !vh.Ltop && !vh.Lbottom) return null;
  var f = function(v){ return v || "\u2013"; };
  return "R " + f(vh.Rtop) + "/" + f(vh.Rbottom) + " L " + f(vh.Ltop) + "/" + f(vh.Lbottom);
}

// ONH's baseline is always present for both eyes (so it always OU-compacts on
// its own), with any PPA leftover(s) prefixed before it, comma-joined - the
// reverse order/joiner from formatEyeSegments' common-first/space-join, so this
// doesn't fit that helper. No reference example has PPA on both eyes at once;
// this joins them with a space if it happens (untested - see CLAUDE.md).
function onhText(posteriorState){
  var baseline = "distinct margins, evenly perfused";
  var pieces = [];
  if (posteriorState.onh.R.PPA) pieces.push("R PPA");
  if (posteriorState.onh.L.PPA) pieces.push("L PPA");
  return pieces.length ? pieces.join(" ") + ", " + baseline + " OU" : baseline + " OU";
}

function cdrText(posteriorState){
  return "R" + posteriorState.cdr.R + " L" + posteriorState.cdr.L;
}

export function buildNote(state){
  var parts = [];

  var lidsTxt = sectionText(state, "lids");
  if (lidsTxt) parts.push(OUTPUT_LABELS.lids + " " + lidsTxt);

  var conjTxt = sectionText(state, "conj");
  if (conjTxt) parts.push(OUTPUT_LABELS.conj + " " + conjTxt);

  var pterygiumTxt = pterygiumText(state);
  if (state.cornea || pterygiumTxt){
    var corneaPieces = [];
    if (state.cornea) corneaPieces.push(state.cornea === "clear" ? "clear OU" : "arcus OU otherwise clear OU");
    if (pterygiumTxt) corneaPieces.push(pterygiumTxt);
    parts.push("cornea " + corneaPieces.join(", "));
  }

  var vhTxt = vhText(state);
  if (vhTxt) parts.push("VH " + vhTxt);

  var lensTxt = sectionText(state, "lens");
  if (lensTxt) parts.push(OUTPUT_LABELS.lens + " " + lensTxt);

  if (state.irisT) parts.push("no IrisT OU");
  if (state.ac) parts.push("AC deep and Q OU");

  if (parts.length === 0) return "";
  return parts.join(" | ");
}

export function buildPosteriorNote(posteriorState){
  var parts = [];
  var img = posteriorState.imaging;

  ["optos", "oct", "drs"].forEach(function(field){
    if (img[field]) parts.push(field.toUpperCase());
  });

  var vitTxt = posteriorEyeSectionText(posteriorState.vit, "vit", VIT_CONDITIONS, "clear", ", ");
  if (vitTxt) parts.push("vit " + vitTxt);
  parts.push("ONH " + onhText(posteriorState));
  parts.push("CDR " + cdrText(posteriorState));
  var maculaClearLabel = "flat, even pigmentation, " + (posteriorState.dimReflex ? "dim reflex" : "clear reflex");
  var maculaTxt = posteriorEyeSectionText(posteriorState.macula, "macula", MACULA_CONDITIONS, maculaClearLabel, ", ");
  if (maculaTxt) parts.push("macula " + maculaTxt);

  if (posteriorState.arcades) parts.push("arcades clear OU");
  if (posteriorState.bv) parts.push("BV 2:3, non-tort, oblique crossings OU");
  var peripheryTxt = posteriorEyeSectionText(posteriorState.periphery, "periphery", PERIPHERY_CONDITIONS, "mid periphery clear undilated 90D", ", ");
  if (peripheryTxt) parts.push(peripheryTxt);

  return parts.join(" | ");
}

// ---------- history note text ----------

var HISTORY_REASON_TEXT = { REE: "REE", firstExam: "First eye exam", firstOPSM: "First time in OPSM" };
var HISTORY_HA_TEXT = { noHA: "no HA or DIP", haNoDIP: "HA, no DIP", haDIP: "HA, DIP" };
var HISTORY_FLOATERS_TEXT = {
  noFFs: "no FFs",
  longstanding: "longstanding floaters, no changes, no flashes",
  new: "new floaters, flashes"
};
var HISTORY_CL_TEXT = { daily: "Daily CLs", monthly: "Monthly CLs", fortnightly: "Fortnightly CLs" };

// "a, b and c" - used for the spectacles wearable list, the one clause where
// grammatical "and" reads better than a flat comma list.
function grammarJoinAnd(arr){
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
}

function historySpecsText(historyState){
  var s = historyState.specs;
  var wearables = [];
  if (s.progs) wearables.push("progs");
  if (s.svd) wearables.push("SVD");
  if (s.occupational) wearables.push("occupationals");
  if (s.svn) wearables.push("SVN");
  var clText = s.cl ? HISTORY_CL_TEXT[s.cl] : null;

  if (!wearables.length && !clText) return s.noSpecs ? "no specs or CLs" : null;

  var pieces = [];
  if (wearables.length) pieces.push("using " + grammarJoinAnd(wearables));
  if (clText) pieces.push(clText);
  return pieces.join(", ");
}

function historyVisionText(historyState){
  var v = historyState.vision;
  if (!v.dv && !v.nv) return null;
  if (v.dv === "nochange" && v.nv === "nochange") return "no changes in vision";

  var parts = [];
  if (v.dv) parts.push(v.dv === "blurry" ? "DV blurry" : "no changes in DV");
  if (v.nv) parts.push(v.nv === "blurry" ? "NV blurry" : "no changes in NV");
  return parts.join(", ");
}

function historyDedText(historyState){
  var d = historyState.ded;
  var labels = [];
  if (d.dry) labels.push("dry");
  if (d.watery) labels.push("watery");
  if (d.red) labels.push("red");
  if (d.itchy) labels.push("itchy");
  if (!labels.length) return d.noSymptoms ? "no dry eye symptoms" : null;
  return labels.join(", ") + " eyes";
}

export function buildHistoryNote(historyState){
  var parts = [];

  if (historyState.reason) parts.push(HISTORY_REASON_TEXT[historyState.reason]);
  if (historyState.lastEE) parts.push("last EE " + historyState.lastEE);

  var specsTxt = historySpecsText(historyState);
  if (specsTxt) parts.push(specsTxt);

  var visionTxt = historyVisionText(historyState);
  if (visionTxt) parts.push(visionTxt);

  if (historyState.ha) parts.push(HISTORY_HA_TEXT[historyState.ha]);
  if (historyState.floaters) parts.push(HISTORY_FLOATERS_TEXT[historyState.floaters]);

  var dedTxt = historyDedText(historyState);
  if (dedTxt) parts.push(dedTxt);

  if (historyState.notes.trim()) parts.push(historyState.notes.trim());

  return parts.join(", ");
}

