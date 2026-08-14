// Pure state -> note text. No DOM access anywhere in this file, so every
// function here is directly unit-testable (see notes.test.js).
//
// Plain script (see schema.js) - depends on the OptomSchema global, so it must
// load after schema.js.

var OptomNotes = (function(){

const { CONDITIONS_MAP, OUTPUT_LABELS, VIT_CONDITIONS, MACULA_CONDITIONS, PERIPHERY_CONDITIONS, MACULA_REFLEX_OPTIONS, HISTORY_GROUP_BY_KEY: G } = OptomSchema;

// ---------- note text ----------

// A finding that can sit nasally, temporally, or both. Both sides present
// collapse to "<noun> N+T"; one side reads "nasal <noun>" / "temporal <noun>".
// Shared by conj ping and corneal pterygium, which word this identically.
function pairedClause(key, noun, nasal, temporal){
  if (nasal && temporal) return { key: key, text: noun + " N+T" };
  if (nasal) return { key: key, text: "nasal " + noun };
  if (temporal) return { key: key, text: "temporal " + noun };
  return null;
}

// Builds the ordered list of clause objects ({key, text}) active for one eye.
// "key" identifies the underlying finding so the other eye's matching clause can
// be detected even when the two eyes' clause lists aren't identical overall.
// Conj is the one section whose two ping conditions merge into a single clause.
function buildClauses(eyeState, sectionKey, conditions){
  if (sectionKey === "conj"){
    var clauses = [];
    if (eyeState.hyperaemia) clauses.push({ key: "hyperaemia", text: "mild hyperaemia" });
    var ping = pairedClause("ping", "ping", eyeState.nasalPing, eyeState.temporalPing);
    if (ping) clauses.push(ping);
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

function sectionText(state, sectionKey){
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

// Unlike conj, pterygium has no section-level "clear OU" fallback of its own -
// an eye with neither side marked simply contributes nothing, since overall
// cornea clarity is the clear/arcus preset.
function pterygiumClauses(eyeState){
  var clause = pairedClause("pterygium", "pterygium", eyeState.nasal, eyeState.temporal);
  return clause ? [clause] : [];
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
// this joins them with a space if it happens (untested - see README.md
// "Known gaps").
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

function buildNote(state){
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

function buildPosteriorNote(posteriorState){
  var parts = [];
  var img = posteriorState.imaging;

  ["optos", "oct", "drs"].forEach(function(field){
    if (img[field]) parts.push(field.toUpperCase());
  });

  var vitTxt = posteriorEyeSectionText(posteriorState.vit, "vit", VIT_CONDITIONS, "clear", ", ");
  if (vitTxt) parts.push("vit " + vitTxt);
  parts.push("ONH " + onhText(posteriorState));
  parts.push("CDR " + cdrText(posteriorState));
  // No reflex picked reads as a plain "clear"; picking one substitutes that
  // last word for the chosen descriptor rather than appending to it.
  var reflex = MACULA_REFLEX_OPTIONS.find(function(o){ return o.value === posteriorState.maculaReflex; });
  var maculaClearLabel = "flat, even pigmentation, " + (reflex ? reflex.text : "clear");
  var maculaTxt = posteriorEyeSectionText(posteriorState.macula, "macula", MACULA_CONDITIONS, maculaClearLabel, ", ");
  if (maculaTxt) parts.push("macula " + maculaTxt);

  if (posteriorState.arcades) parts.push("arcades clear OU");
  if (posteriorState.bv) parts.push("BV 2:3, non-tort, oblique crossings OU");
  var peripheryTxt = posteriorEyeSectionText(posteriorState.periphery, "periphery", PERIPHERY_CONDITIONS, "mid periphery clear undilated 90D", ", ");
  if (peripheryTxt) parts.push(peripheryTxt);

  return parts.join(" | ");
}

// ---------- history note text ----------

// "a, b and c" - used for the spectacles wearable list, the one clause where
// grammatical "and" reads better than a flat comma list.
function grammarJoinAnd(arr){
  if (arr.length < 2) return arr.join("");
  return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
}

function optionText(group, value){
  var opt = group.options.find(function(o){ return o.value === value; });
  return opt ? (opt.text !== undefined ? opt.text : opt.label) : null;
}

// One group's contribution to the note, or null if it is switched off entirely.
// Everything about the wording - which options exist, how they read, how they
// join - comes from the group's entry in HISTORY_GROUPS.
function groupText(group, historyState){
  var value = historyState[group.key];
  var body;

  if (group.kind === "flag"){
    if (!value) return null;
    body = group.text;
  } else if (group.kind === "multi"){
    var picked = group.options
      .filter(function(o){ return value[o.value]; })
      .map(function(o){ return o.text !== undefined ? o.text : o.label; });
    if (!picked.length) return null;
    body = group.join === "and" ? grammarJoinAnd(picked) : picked.join(", ");
  } else {
    if (!value) return null;
    body = optionText(group, value);
  }

  return (group.prefix || "") + body + (group.suffix || "");
}

// Groups that read better merged than listed separately. Each returns one
// clause; everything else in the note is a plain groupText call.
function specsClause(h){
  var pieces = [groupText(G.wearables, h), groupText(G.cl, h)].filter(Boolean);
  return pieces.length ? pieces.join(", ") : groupText(G.specsNone, h);
}

function visionClause(h){
  if (h.dv === "nochange" && h.nv === "nochange") return "no changes in vision";
  var pieces = [groupText(G.dv, h), groupText(G.nv, h)].filter(Boolean);
  return pieces.length ? pieces.join(", ") : null;
}

function dedClause(h){
  return groupText(G.ded, h) || groupText(G.dedNone, h);
}

// One clause per line, unlike anterior/posterior's " | " runs: history is read
// down the page in the record rather than as a single sentence.
function buildHistoryNote(historyState){
  var h = historyState;
  return [
    groupText(G.reason, h),
    groupText(G.lastEE, h),
    specsClause(h),
    visionClause(h),
    groupText(G.ha, h),
    groupText(G.floaters, h),
    dedClause(h),
    h.notes.trim() || null
  ].filter(Boolean).join("\n");
}

return {
  sectionText: sectionText,
  groupText: groupText,
  buildNote: buildNote,
  buildPosteriorNote: buildPosteriorNote,
  buildHistoryNote: buildHistoryNote
};

})();
