// Option tables for all three notes. This is the single source of truth for
// what findings exist and how they are worded - prefer editing this file over
// touching render/refresh/note-building logic.

export const VH_VALUES = ["0.1","0.3","0.5","0.7","1.0"];
export const CDR_VALUES = ["0.1","0.2","0.3","0.4","0.5","0.6","0.7","0.8"];

export const LID_CONDITIONS = [
  { key: "MGD",   label: "MGD",   grades: true },
  { key: "bleph", label: "bleph", grades: true }
];
export const CONJ_CONDITIONS = [
  { key: "hyperaemia",    label: "mild hyperaemia", grades: false },
  { key: "nasalPing",     label: "nasal ping",    grades: false },
  { key: "temporalPing",  label: "temporal ping", grades: false }
];
// Cortical listed before NS to match current clinic note convention.
export const LENS_CONDITIONS = [
  { key: "EpicapsularStars", label: "epicapsular stars", grades: false },
  { key: "Cortical", label: "cortical", grades: true },
  { key: "NS",       label: "NS",       grades: true },
  { key: "PSC",       label: "PSC",     choices: ["on axis", "off axis"] }
];

export const CONDITIONS_MAP = { lids: LID_CONDITIONS, conj: CONJ_CONDITIONS, lens: LENS_CONDITIONS };
// Labels as they appear in the pasted note (distinct from the card headers in the UI).
export const OUTPUT_LABELS = { lids: "lid/lashes", conj: "conj", lens: "lens" };

// Posterior segment is a second, fully independent note builder on the same page
// (own state, own preview, own copy/reset). Vit/macula reuse the same per-eye
// clear+conditions system as conj, but findings on the same eye join with ", "
// here (not a space) and macula's "clear" fallback is a descriptive phrase.
// weissRing's output text ("weiss ring seen") differs from its button label.
export const VIT_CONDITIONS = [
  { key: "floaters",  label: "floaters" },
  { key: "weissRing", label: "weiss ring", text: "weiss ring seen" }
];
// Order matches the one confirmed reference note ("R ERM, dry AMD").
export const MACULA_CONDITIONS = [
  { key: "ERM",          label: "ERM" },
  { key: "dryAMD",       label: "dry AMD" },
  { key: "mildMottling", label: "mild mottling" }
];
// Periphery is per-eye like vit/macula (not a section-wide preset) - each eye
// can independently be clear or have pigment changes.
export const PERIPHERY_CONDITIONS = [
  { key: "pigmentChanges", label: "peripheral age related pigment changes" }
];
export const POSTERIOR_CONDITIONS_MAP = { vit: VIT_CONDITIONS, macula: MACULA_CONDITIONS, periphery: PERIPHERY_CONDITIONS };

