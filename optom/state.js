// State factories. `fresh*` = everything off; `default*` = the normal-findings
// baseline the Reset button restores.
//
// Plain script (see schema.js) - depends on the OptomSchema global, so it must
// load after schema.js.

var OptomState = (function(){

const { LID_CONDITIONS, CONJ_CONDITIONS, LENS_CONDITIONS, VIT_CONDITIONS, MACULA_CONDITIONS, PERIPHERY_CONDITIONS, HISTORY_GROUPS } = OptomSchema;

// ---------- state ----------

function freshEyeState(conditions){
  var o = { clear: false };
  conditions.forEach(function(c){ o[c.key] = (c.grades || c.choices) ? null : false; });
  return o;
}

function freshSectionState(conditions){
  return { R: freshEyeState(conditions), L: freshEyeState(conditions) };
}

function freshPterygiumState(){
  return { R: { nasal: false, temporal: false }, L: { nasal: false, temporal: false } };
}

function freshState(){
  return {
    lids: freshSectionState(LID_CONDITIONS),
    conj: freshSectionState(CONJ_CONDITIONS),
    cornea: null,
    pterygium: freshPterygiumState(),
    vh: { Rtop: null, Rbottom: null, Ltop: null, Lbottom: null },
    lens: freshSectionState(LENS_CONDITIONS),
    irisT: false,
    ac: false
  };
}

function defaultState(){
  var s = freshState();
  s.lids.R.clear = true;
  s.lids.L.clear = true;
  s.conj.R.clear = true;
  s.conj.L.clear = true;
  s.cornea = "clear";
  s.vh = { Rtop: "1.0", Rbottom: "1.0", Ltop: "1.0", Lbottom: "1.0" };
  s.lens.R.clear = true;
  s.lens.L.clear = true;
  s.irisT = true;
  s.ac = true;
  return s;
}


// ---------- posterior state (fully independent second note) ----------

function freshPosteriorState(){
  return {
    imaging: { optos: false, oct: false, drs: false },
    vit: freshSectionState(VIT_CONDITIONS),
    onh: { R: { PPA: false }, L: { PPA: false } },
    cdr: { R: "0.3", L: "0.3" },
    macula: freshSectionState(MACULA_CONDITIONS),
    dimReflex: false,
    arcades: false,
    bv: false,
    periphery: freshSectionState(PERIPHERY_CONDITIONS)
  };
}

function defaultPosteriorState(){
  var p = freshPosteriorState();
  p.imaging.optos = true;
  p.vit.R.clear = true;
  p.vit.L.clear = true;
  p.macula.R.clear = true;
  p.macula.L.clear = true;
  p.arcades = true;
  p.bv = true;
  p.periphery.R.clear = true;
  p.periphery.L.clear = true;
  return p;
}


// ---------- history state ----------
//
// Derived entirely from HISTORY_GROUPS, so adding an option to schema.js gives
// it a state slot automatically. `notes` is the one free-text field and is the
// only key here not backed by a group.

function freshHistoryState(){
  var s = { notes: "" };
  HISTORY_GROUPS.forEach(function(g){
    if (g.kind === "multi"){
      s[g.key] = {};
      g.options.forEach(function(o){ s[g.key][o.value] = false; });
    } else {
      s[g.key] = g.kind === "flag" ? false : null;
    }
  });
  return s;
}

return {
  freshEyeState: freshEyeState,
  freshSectionState: freshSectionState,
  freshPterygiumState: freshPterygiumState,
  freshState: freshState,
  defaultState: defaultState,
  freshPosteriorState: freshPosteriorState,
  defaultPosteriorState: defaultPosteriorState,
  freshHistoryState: freshHistoryState
};

})();
