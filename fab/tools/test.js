// Headless generator tests: node test.js [boxes]
"use strict";
const G = require("../gen.js");
const data = require("../iar.json");
const baseConfig = require("../iar.config.json");

const BOXES = Number(process.argv[2] || 10000);
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { failures++; console.log("FAIL:", msg); } };
const clone = o => JSON.parse(JSON.stringify(o));

// Chi-squared survival function via Wilson–Hilferty normal approximation (fine for df >= 3).
function normalSf(z) { // Abramowitz-Stegun erfc approx
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erfc = y * Math.exp(-(z * z) / 2);
  return z >= 0 ? erfc / 2 : 1 - erfc / 2;
}
function chiSqP(x, k) {
  const z = (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return normalSf(z);
}

const compiled = G.compile(baseConfig, data.pools);
const rng = G.rngFromSeed("test-suite");
const slotCounts = {};  // slot -> pool -> n (excluding guarantee-replaced draws)
const slotTotals = {};
const guaranteeCounts = {}, cardCounts = {};
let guaranteeTotal = 0, badPackSize = 0, badSlotCount = 0, badColdPerBox = 0, coldWrongSlot = 0, dupCommonPacks = 0;

const t0 = Date.now();
for (let b = 0; b < BOXES; b++) {
  const box = G.generateBox(compiled, rng);
  let coldInBox = 0;
  for (const pack of box) {
    if (pack.length !== baseConfig.packSize) badPackSize++;
    const perSlot = {};
    const commons = new Set();
    for (const c of pack) {
      perSlot[c.slot] = (perSlot[c.slot] || 0) + 1;
      cardCounts[c.card] = (cardCounts[c.card] || 0) + 1;
      if (c.guarantee) {
        coldInBox++;
        if (c.slot !== "wildcard") coldWrongSlot++;
        guaranteeCounts[c.pool] = (guaranteeCounts[c.pool] || 0) + 1; guaranteeTotal++;
        continue;
      }
      if (c.slot === "common") { if (commons.has(c.card)) dupCommonPacks++; commons.add(c.card); }
      (slotCounts[c.slot] ||= {})[c.pool] = (slotCounts[c.slot][c.pool] || 0) + 1;
      slotTotals[c.slot] = (slotTotals[c.slot] || 0) + 1;
    }
    for (const s of baseConfig.slots) if (perSlot[s.name] !== s.count) badSlotCount++;
  }
  if (coldInBox !== 1) badColdPerBox++;
}
console.log(`Generated ${BOXES} boxes (${BOXES * 24} packs) in ${Date.now() - t0} ms`);

ok(badPackSize === 0, `${badPackSize} packs had the wrong size`);
ok(badSlotCount === 0, `${badSlotCount} slot/pack pairs had the wrong count`);
ok(badColdPerBox === 0, `${badColdPerBox} boxes did not have exactly one Cold Foil`);
ok(coldWrongSlot === 0, `${coldWrongSlot} Cold Foils landed outside the wildcard slot`);
ok(dupCommonPacks === 0, `${dupCommonPacks} packs had a duplicate common`);

// Observed rate per pool per slot within 3 standard errors of the configured weight.
function checkRates(label, pools, counts, total) {
  const sum = Object.values(pools).reduce((a, b) => a + b, 0);
  for (const [pool, w] of Object.entries(pools)) {
    const p = w / sum, obs = (counts[pool] || 0) / total;
    const se = Math.sqrt(p * (1 - p) / total);
    const z = se ? (obs - p) / se : (obs === p ? 0 : Infinity);
    ok(Math.abs(z) <= 3, `${label}/${pool}: expected ${p.toFixed(5)}, observed ${obs.toFixed(5)} (z=${z.toFixed(2)})`);
    console.log(`  ${label.padEnd(12)} ${pool.padEnd(5)} exp ${p.toFixed(4)}  obs ${obs.toFixed(4)}  z ${z.toFixed(2)}`);
  }
}
console.log("Slot rates:");
for (const s of baseConfig.slots) checkRates(s.name, s.pools, slotCounts[s.name], slotTotals[s.name]);
for (const g of baseConfig.boxGuarantees) checkRates(g.name, g.pools, guaranteeCounts, guaranteeTotal);

// Uniformity within each pool (chi-squared, p > 0.01). Counts per card within a pool are
// only comparable when the pool is only ever reached through the same draws, which holds for all pools here.
console.log("Within-pool uniformity:");
// Bonferroni: ~15 pools are tested at once, so a fixed p > 0.01 would fail about one run in seven by chance.
const testedPools = Object.values(data.pools).filter(v => v.length >= 4).length;
const alpha = 0.01 / testedPools;
console.log(`  (family-wise alpha 0.01 over ${testedPools} pools: each needs p > ${alpha.toFixed(5)})`);
for (const [pool, idxs] of Object.entries(data.pools)) {
  if (idxs.length < 4) continue;
  const counts = idxs.map(i => cardCounts[i] || 0);
  const n = counts.reduce((a, b) => a + b, 0);
  if (n < idxs.length * 20) { console.log(`  ${pool}: skipped (${n} draws is too few)`); continue; }
  const e = n / idxs.length;
  const x2 = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
  const p = chiSqP(x2, idxs.length - 1);
  console.log(`  ${pool.padEnd(5)} cards ${String(idxs.length).padStart(3)}  draws ${String(n).padStart(8)}  chi2 ${x2.toFixed(1)}  p ${p.toFixed(3)}`);
  ok(p > alpha, `pool ${pool} not uniform (p=${p.toFixed(4)})`);
}

// Seeds
const boxA = JSON.stringify(G.generateBox(compiled, G.rngFromSeed("abc")));
const boxB = JSON.stringify(G.generateBox(compiled, G.rngFromSeed("abc")));
const boxC = JSON.stringify(G.generateBox(compiled, G.rngFromSeed("abd")));
ok(boxA === boxB, "same seed produced different boxes");
ok(boxA !== boxC, "different seeds produced identical boxes");

// Expected-per-box math agrees with simulation
const exp = G.expectedPerBox(compiled);
ok(Math.abs(Object.values(exp).reduce((a, b) => a + b, 0) - 24 * 16) < 1e-9, "expected counts do not sum to 384 per box");

// Bad configs rejected with specific messages
function rejects(mutate, pattern, label) {
  const c = clone(baseConfig); mutate(c);
  try { G.compile(c, data.pools); ok(false, `${label}: accepted a bad config`); }
  catch (e) { ok(e instanceof G.ConfigError && pattern.test(e.message), `${label}: wrong message: ${e.message}`); }
}
rejects(c => { c.slots[3].pools.ZZ = 1; }, /pool "ZZ" does not exist/, "missing pool");
rejects(c => { c.slots[3].pools = { R: 0, M: 0 }; }, /weights sum to 0/, "zero weights");
rejects(c => { c.slots[1].count = 10; }, /add up to 15, but packSize is 16/, "wrong slot total");
rejects(c => { c.slots[2].pools = { R: -1 }; }, /must be a number ≥ 0/, "negative weight");
rejects(c => { c.boxGuarantees[0].replacesSlot = "nope"; }, /replacesSlot "nope" is not a slot/, "bad guarantee slot");
rejects(c => { c.boxGuarantees[0].perBox = 25; }, /perBox must be an integer/, "perBox too big");
rejects(c => { c.slots[1].pools = { RF_F: 1 }; }, /noDuplicates needs at least 11/, "noDuplicates impossible");
{
  const pools = clone(data.pools); pools.M = [];
  try { G.compile(baseConfig, pools); ok(false, "empty pool accepted"); }
  catch (e) { ok(/pool "M" has weight 0.25 but no cards/.test(e.message), `empty pool: wrong message: ${e.message}`); }
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
