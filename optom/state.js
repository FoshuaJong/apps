// State factories. `fresh*` = everything off; `default*` = the normal-findings
// baseline the Reset button restores.

import { LID_CONDITIONS, CONJ_CONDITIONS, LENS_CONDITIONS, VIT_CONDITIONS, MACULA_CONDITIONS, PERIPHERY_CONDITIONS } from "./schema.js";

// ---------- state ----------

export function freshEyeState(conditions){
  var o = { clear: false };
  conditions.forEach(function(c){ o[c.key] = (c.grades || c.choices) ? null : false; });
  return o;
}

export function freshSectionState(conditions){
  return { R: freshEyeState(conditions), L: freshEyeState(conditions) };
}

export function freshPterygiumState(){
  return { R: { nasal: false, temporal: false }, L: { nasal: false, temporal: false } };
}

export function freshState(){
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

export function defaultState(){
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

export function freshPosteriorState(){
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

export function defaultPosteriorState(){
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


// ---------- history state (third, fully independent note - fixed option
// sets rather than per-eye grids, so it skips the eye-group render system
// entirely and is built/synced by its own small set of functions below) ----------

export function freshHistoryState(){
  return {
    reason: null,
    lastEE: null,
    specs: { noSpecs: false, progs: false, svd: false, occupational: false, svn: false, cl: null },
    vision: { dv: null, nv: null },
    ha: null,
    floaters: null,
    ded: { noSymptoms: false, dry: false, watery: false, red: false, itchy: false },
    notes: ""
  };
}

