// Option tables for all three notes. This is the single source of truth for
// what findings exist and how they are worded - prefer editing this file over
// touching render/refresh/note-building logic.
//
// Plain script, not an ES module: browsers refuse to load module scripts over
// file://, and this page is opened straight off disk as often as it is served.
// A top-level `var` is a global in the browser and under node's
// vm.runInThisContext (how notes.test.js loads this file), so `OptomSchema` is
// the seam the other files import through.

var OptomSchema = (function(){

const VH_VALUES = ["0.1","0.3","0.5","0.7","1.0"];
const CDR_VALUES = ["0.1","0.2","0.3","0.4","0.5","0.6","0.7","0.8"];

const LID_CONDITIONS = [
  { key: "MGD",   label: "MGD",   grades: true },
  { key: "bleph", label: "bleph", grades: true }
];
const CONJ_CONDITIONS = [
  { key: "hyperaemia",    label: "mild hyperaemia", grades: false },
  { key: "nasalPing",     label: "nasal ping",    grades: false },
  { key: "temporalPing",  label: "temporal ping", grades: false }
];
// Cortical listed before NS to match current clinic note convention.
const LENS_CONDITIONS = [
  { key: "EpicapsularStars", label: "epicapsular stars", grades: false },
  { key: "Cortical", label: "cortical", grades: true },
  { key: "NS",       label: "NS",       grades: true },
  { key: "PSC",       label: "PSC",     choices: ["on axis", "off axis"] }
];

const CONDITIONS_MAP = { lids: LID_CONDITIONS, conj: CONJ_CONDITIONS, lens: LENS_CONDITIONS };
// Labels as they appear in the pasted note (distinct from the card headers in the UI).
const OUTPUT_LABELS = { lids: "lid/lashes", conj: "conj", lens: "lens" };

// Posterior segment is a second, fully independent note builder on the same page
// (own state, own preview, own copy/reset). Vit/macula reuse the same per-eye
// clear+conditions system as conj, but findings on the same eye join with ", "
// here (not a space) and macula's "clear" fallback is a descriptive phrase.
// weissRing's output text ("weiss ring seen") differs from its button label.
const VIT_CONDITIONS = [
  { key: "floaters",  label: "floaters" },
  { key: "weissRing", label: "weiss ring", text: "weiss ring seen" }
];
// Order matches the one confirmed reference note ("R ERM, dry AMD").
const MACULA_CONDITIONS = [
  { key: "ERM",          label: "ERM" },
  { key: "dryAMD",       label: "dry AMD" },
  { key: "mildMottling", label: "mild mottling" }
];
// Periphery is per-eye like vit/macula (not a section-wide preset) - each eye
// can independently be clear or have pigment changes.
const PERIPHERY_CONDITIONS = [
  { key: "pigmentChanges", label: "peripheral age related pigment changes" }
];
const POSTERIOR_CONDITIONS_MAP = { vit: VIT_CONDITIONS, macula: MACULA_CONDITIONS, periphery: PERIPHERY_CONDITIONS };

// Flat on/off toggles on the posterior tab. `path` is where the boolean lives in
// posteriorState; spelling it out here is what keeps the nested imaging.* fields
// from needing a special case in both the click and the refresh paths.
const POSTERIOR_TOGGLES = [
  { field: "optos",     path: ["imaging", "optos"] },
  { field: "oct",       path: ["imaging", "oct"] },
  { field: "drs",       path: ["imaging", "drs"] },
  { field: "dimReflex", path: ["dimReflex"] },
  { field: "arcades",   path: ["arcades"] },
  { field: "bv",        path: ["bv"] }
];

// ---------- History tab ----------
//
// Each entry is one row of chips. Consecutive entries sharing a `card` render
// into the same card. State, markup, button highlighting and note text are ALL
// derived from this table, so adding an option is a one-line edit here.
//
//   kind "single" - pick one; clicking the active chip clears it.  state[key] = value | null
//   kind "multi"  - independent on/off options.                    state[key] = { [value]: bool }
//   kind "flag"   - a lone "nothing abnormal" chip.                state[key] = bool
//                   `clears` names the groups it switches off, and which switch it back off.
//
// Per option, `text` defaults to `label`. Per group, `prefix`/`suffix` wrap the
// joined result, and `join: "and"` uses "a, b and c" instead of a plain comma list.
// `row` renders the group as a labelled row instead of a free-flowing chip row.
const HISTORY_GROUPS = [
  { key: "reason", card: "Reason for visit", kind: "single", options: [
    { value: "REE",       label: "REE (routine eye examination)", text: "REE" },
    { value: "firstExam", label: "First eye exam" },
    { value: "firstOPSM", label: "First time in OPSM" }
  ]},

  { key: "lastEE", card: "Last EE", kind: "single", prefix: "last EE ", options: [
    { value: "2025", label: "2025" },
    { value: "2024", label: "2024" },
    { value: "2023", label: "2023" },
    { value: "2022", label: "2022" },
    { value: "2021", label: "2021" },
    { value: "2020", label: "2020" }
  ]},

  { key: "specsNone", card: "Spectacles / CLs", kind: "flag",
    label: "No specs", text: "no specs or CLs", clears: ["wearables", "cl"] },
  { key: "wearables", card: "Spectacles / CLs", kind: "multi", prefix: "using ", join: "and", options: [
    { value: "progs",        label: "Progs",         text: "progs" },
    { value: "svd",          label: "SVD" },
    { value: "occupational", label: "Occupationals", text: "occupationals" },
    { value: "svn",          label: "SVN" }
  ]},
  { key: "cl", card: "Spectacles / CLs", kind: "single", options: [
    { value: "daily",       label: "Daily CLs" },
    { value: "monthly",     label: "Monthly CLs" },
    { value: "fortnightly", label: "Fortnightly CLs" }
  ]},

  { key: "dv", card: "Vision", row: "DV", kind: "single", options: [
    { value: "nochange", label: "no change", text: "no changes in DV" },
    { value: "blurry",   label: "blurry",    text: "DV blurry" }
  ]},
  { key: "nv", card: "Vision", row: "NV", kind: "single", options: [
    { value: "nochange", label: "no change", text: "no changes in NV" },
    { value: "blurry",   label: "blurry",    text: "NV blurry" }
  ]},

  { key: "ha", card: "HA", kind: "single", options: [
    { value: "noHA",    label: "no HA or DIP" },
    { value: "haNoDIP", label: "HA, no DIP" },
    { value: "haDIP",   label: "HA, DIP" }
  ]},

  { key: "floaters", card: "Floaters", kind: "single", options: [
    { value: "noFFs",        label: "no FFs" },
    { value: "longstanding", label: "longstanding floaters, no changes, no flashes" },
    { value: "new",          label: "new floaters, flashes" }
  ]},

  { key: "dedNone", card: "DED", kind: "flag",
    label: "No dry eye symptoms", text: "no dry eye symptoms", clears: ["ded"] },
  { key: "ded", card: "DED", kind: "multi", suffix: " eyes", options: [
    { value: "dry",    label: "Dry eyes",    text: "dry" },
    { value: "watery", label: "Watery eyes", text: "watery" },
    { value: "red",    label: "Red eyes",    text: "red" },
    { value: "itchy",  label: "Itchy eyes",  text: "itchy" }
  ]}
];

// Lookup by group key, for the click handler and the clause builders that need
// to reach a specific group (e.g. specsClause combining wearables with cl).
const HISTORY_GROUP_BY_KEY = Object.fromEntries(HISTORY_GROUPS.map(g => [g.key, g]));

return {
  VH_VALUES: VH_VALUES,
  CDR_VALUES: CDR_VALUES,
  LID_CONDITIONS: LID_CONDITIONS,
  CONJ_CONDITIONS: CONJ_CONDITIONS,
  LENS_CONDITIONS: LENS_CONDITIONS,
  CONDITIONS_MAP: CONDITIONS_MAP,
  OUTPUT_LABELS: OUTPUT_LABELS,
  VIT_CONDITIONS: VIT_CONDITIONS,
  MACULA_CONDITIONS: MACULA_CONDITIONS,
  PERIPHERY_CONDITIONS: PERIPHERY_CONDITIONS,
  POSTERIOR_CONDITIONS_MAP: POSTERIOR_CONDITIONS_MAP,
  POSTERIOR_TOGGLES: POSTERIOR_TOGGLES,
  HISTORY_GROUPS: HISTORY_GROUPS,
  HISTORY_GROUP_BY_KEY: HISTORY_GROUP_BY_KEY
};

})();
