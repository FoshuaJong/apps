// Golden-note regression tests. Zero dependencies - run with:
//
//   node optom/notes.test.js
//
// These lock in the exact strings the app pastes into a patient record, so a
// refactor that changes wording fails loudly. To add a case, add an entry to
// TESTS below; `build` receives a fresh state and returns the note.

import { buildNote, buildPosteriorNote, buildHistoryNote } from "./notes.js";
import { defaultState, defaultPosteriorState, freshHistoryState } from "./state.js";

const TESTS = [
  // ---------- anterior ----------
  {
    name: "anterior: defaults",
    run: () => buildNote(defaultState()),
    expect: "lid/lashes clear OU | conj clear OU | cornea clear OU | VH R 1.0/1.0 L 1.0/1.0 | lens clear OU | no IrisT OU | AC deep and Q OU"
  },
  {
    name: "anterior: conj ping combines to N+T on one eye, other eye clear",
    run: () => {
      const s = defaultState();
      s.conj.R.clear = false;
      s.conj.R.nasalPing = true;
      s.conj.R.temporalPing = true;
      return buildNote(s);
    },
    expect: "lid/lashes clear OU | conj R ping N+T L clear | cornea clear OU | VH R 1.0/1.0 L 1.0/1.0 | lens clear OU | no IrisT OU | AC deep and Q OU"
  },
  {
    name: "anterior: pterygium combines to N+T and rides alongside cornea preset",
    run: () => {
      const s = defaultState();
      s.pterygium.R.nasal = true;
      s.pterygium.R.temporal = true;
      return buildNote(s);
    },
    expect: "lid/lashes clear OU | conj clear OU | cornea clear OU, R pterygium N+T | VH R 1.0/1.0 L 1.0/1.0 | lens clear OU | no IrisT OU | AC deep and Q OU"
  },
  {
    name: "anterior: graded finding on one eye compacts against a clear fellow eye",
    run: () => {
      const s = defaultState();
      s.lens.R.clear = false;
      s.lens.R.NS = 2;
      return buildNote(s);
    },
    expect: "lid/lashes clear OU | conj clear OU | cornea clear OU | VH R 1.0/1.0 L 1.0/1.0 | lens R NS gd2 L clear | no IrisT OU | AC deep and Q OU"
  },

  // ---------- posterior ----------
  {
    name: "posterior: defaults",
    run: () => buildPosteriorNote(defaultPosteriorState()),
    expect: "OPTOS | vit clear OU | ONH distinct margins, evenly perfused OU | CDR R0.3 L0.3 | macula flat, even pigmentation, clear reflex OU | arcades clear OU | BV 2:3, non-tort, oblique crossings OU | mid periphery clear undilated 90D OU"
  },
  {
    name: "posterior: dim reflex swaps the macula baseline phrase",
    run: () => {
      const p = defaultPosteriorState();
      p.dimReflex = true;
      return buildPosteriorNote(p);
    },
    expect: "OPTOS | vit clear OU | ONH distinct margins, evenly perfused OU | CDR R0.3 L0.3 | macula flat, even pigmentation, dim reflex OU | arcades clear OU | BV 2:3, non-tort, oblique crossings OU | mid periphery clear undilated 90D OU"
  },
  {
    name: "posterior: dim reflex still applies to the fellow eye when one eye has a finding",
    run: () => {
      const p = defaultPosteriorState();
      p.dimReflex = true;
      p.macula.R.clear = false;
      p.macula.R.ERM = true;
      return buildPosteriorNote(p);
    },
    expect: "OPTOS | vit clear OU | ONH distinct margins, evenly perfused OU | CDR R0.3 L0.3 | macula R ERM L flat, even pigmentation, dim reflex | arcades clear OU | BV 2:3, non-tort, oblique crossings OU | mid periphery clear undilated 90D OU"
  },
  {
    name: "posterior: PPA prefixes the always-present ONH baseline",
    run: () => {
      const p = defaultPosteriorState();
      p.onh.R.PPA = true;
      return buildPosteriorNote(p);
    },
    expect: "OPTOS | vit clear OU | ONH R PPA, distinct margins, evenly perfused OU | CDR R0.3 L0.3 | macula flat, even pigmentation, clear reflex OU | arcades clear OU | BV 2:3, non-tort, oblique crossings OU | mid periphery clear undilated 90D OU"
  },

  // ---------- history ----------
  {
    name: "history: routine exam, nothing abnormal",
    run: () => {
      const h = freshHistoryState();
      h.reason = "REE";
      h.lastEE = "2024";
      h.specsNone = true;
      h.dv = "nochange";
      h.nv = "nochange";
      h.ha = "noHA";
      h.floaters = "noFFs";
      h.dedNone = true;
      return buildHistoryNote(h);
    },
    expect: "REE, last EE 2024, no specs or CLs, no changes in vision, no HA or DIP, no FFs, no dry eye symptoms"
  },
  {
    name: "history: multiple corrections, split DV/NV, multiple DED symptoms, free text",
    run: () => {
      const h = freshHistoryState();
      h.reason = "firstOPSM";
      h.lastEE = "2025";
      h.wearables.progs = true;
      h.wearables.svd = true;
      h.wearables.svn = true;
      h.cl = "daily";
      h.dv = "blurry";
      h.nv = "nochange";
      h.ha = "haNoDIP";
      h.floaters = "longstanding";
      h.ded.dry = true;
      h.ded.watery = true;
      h.notes = "using 3 screens at work";
      return buildHistoryNote(h);
    },
    expect: "First time in OPSM, last EE 2025, using progs, SVD and SVN, Daily CLs, DV blurry, no changes in NV, HA, no DIP, longstanding floaters, no changes, no flashes, dry, watery eyes, using 3 screens at work"
  },
  {
    name: "history: empty state produces an empty note",
    run: () => buildHistoryNote(freshHistoryState()),
    expect: ""
  }
];

let failed = 0;
for (const t of TESTS) {
  let actual;
  try {
    actual = t.run();
  } catch (err) {
    console.error(`✗ ${t.name}\n    threw: ${err.message}`);
    failed++;
    continue;
  }
  if (actual === t.expect) {
    console.log(`✓ ${t.name}`);
  } else {
    console.error(`✗ ${t.name}\n    expected: ${JSON.stringify(t.expect)}\n    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log(`\n${TESTS.length - failed}/${TESTS.length} passed`);
process.exit(failed ? 1 : 0);
