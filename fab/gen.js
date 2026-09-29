// Pack generator: pure functions, no DOM. Shared by the page and the Node test harness.
(function (root) {
  "use strict";

  // ---- Seedable RNG: xmur3 string hash -> sfc32 ----
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function rngFromSeed(seed) {
    const h = xmur3(String(seed));
    const r = sfc32(h(), h(), h(), h());
    for (let i = 0; i < 15; i++) r(); // warm up
    return r;
  }
  function randomSeed() {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    const buf = new Uint32Array(8);
    (root.crypto || require("crypto").webcrypto).getRandomValues(buf);
    let s = "";
    for (const n of buf) s += alphabet[n % alphabet.length];
    return s;
  }

  // ---- Config validation ----
  class ConfigError extends Error {}

  function validateWeights(where, pools, poolIndex, problems) {
    if (!pools || typeof pools !== "object" || !Object.keys(pools).length) {
      problems.push(`${where}: no pools listed.`);
      return;
    }
    let total = 0;
    for (const [k, w] of Object.entries(pools)) {
      if (typeof w !== "number" || !isFinite(w) || w < 0) {
        problems.push(`${where}: weight for pool "${k}" must be a number ≥ 0 (got ${JSON.stringify(w)}).`);
        continue;
      }
      if (!(k in poolIndex)) { problems.push(`${where}: pool "${k}" does not exist in the set data.`); continue; }
      if (w > 0 && poolIndex[k].length === 0) problems.push(`${where}: pool "${k}" has weight ${w} but no cards.`);
      total += w;
    }
    if (!(total > 0)) problems.push(`${where}: weights sum to 0, so nothing can be drawn.`);
  }

  function validateConfig(config, poolIndex) {
    const problems = [];
    if (!Number.isInteger(config.packSize) || config.packSize < 1) problems.push("packSize must be a positive integer.");
    if (!Number.isInteger(config.packsPerBox) || config.packsPerBox < 1) problems.push("packsPerBox must be a positive integer.");
    const slots = Array.isArray(config.slots) ? config.slots : [];
    if (!slots.length) problems.push("Config has no slots.");
    const names = new Set();
    let total = 0;
    for (const s of slots) {
      const where = `Slot "${s.name}"`;
      if (!s.name) problems.push("Every slot needs a name.");
      if (names.has(s.name)) problems.push(`${where} is defined twice.`);
      names.add(s.name);
      if (!Number.isInteger(s.count) || s.count < 1) problems.push(`${where}: count must be a positive integer.`);
      else total += s.count;
      validateWeights(where, s.pools, poolIndex, problems);
      if (s.noDuplicates && s.count > 1) {
        const avail = Object.entries(s.pools || {}).filter(([k, w]) => w > 0 && poolIndex[k])
          .reduce((n, [k]) => n + poolIndex[k].length, 0);
        if (avail < s.count) problems.push(`${where}: noDuplicates needs at least ${s.count} cards but its pools hold ${avail}.`);
      }
    }
    if (slots.length && total !== config.packSize)
      problems.push(`Slot counts add up to ${total}, but packSize is ${config.packSize}.`);
    for (const g of config.boxGuarantees || []) {
      const where = `Box guarantee "${g.name}"`;
      if (!names.has(g.replacesSlot)) problems.push(`${where}: replacesSlot "${g.replacesSlot}" is not a slot.`);
      if (!Number.isInteger(g.perBox) || g.perBox < 1 || g.perBox > config.packsPerBox)
        problems.push(`${where}: perBox must be an integer from 1 to packsPerBox.`);
      validateWeights(where, g.pools, poolIndex, problems);
    }
    const replaced = (config.boxGuarantees || []).map(g => g.replacesSlot);
    if (new Set(replaced).size !== replaced.length) problems.push("Two box guarantees replace the same slot; give each its own slot.");
    if (problems.length) throw new ConfigError(problems.join("\n"));
  }

  // ---- Weighted pick with precomputed cumulative weights ----
  function compileWeights(pools) {
    const keys = [], cum = [];
    let t = 0;
    for (const [k, w] of Object.entries(pools)) {
      if (w > 0) { t += w; keys.push(k); cum.push(t); }
    }
    return { keys, cum, total: t };
  }
  function pickWeighted(cw, rng) {
    const x = rng() * cw.total;
    let lo = 0, hi = cw.cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cw.cum[mid]) hi = mid; else lo = mid + 1; }
    return cw.keys[lo];
  }

  function compile(config, poolIndex) {
    validateConfig(config, poolIndex);
    const slots = config.slots.map(s => ({ ...s, cw: compileWeights(s.pools) }));
    const guarantees = (config.boxGuarantees || []).map(g => ({ ...g, cw: compileWeights(g.pools) }));
    return { config, poolIndex, slots, guarantees };
  }

  // ---- Generation: returns plain data ({slot, pool, card} with card = index into set cards) ----
  function drawSlot(slotName, count, cw, noDup, poolIndex, rng) {
    const out = [], used = new Set();
    for (let i = 0; i < count; i++) {
      let pool, card, tries = 0;
      do {
        pool = pickWeighted(cw, rng);
        const arr = poolIndex[pool];
        card = arr[Math.floor(rng() * arr.length)];
        tries++;
      } while (noDup && used.has(card) && tries < 1000);
      used.add(card);
      out.push({ slot: slotName, pool, card });
    }
    return out;
  }

  function generatePack(compiled, rng, replacements) {
    const cards = [];
    for (const s of compiled.slots) {
      const g = replacements && replacements[s.name];
      if (g) cards.push(...drawSlot(s.name, s.count, g.cw, s.noDuplicates, compiled.poolIndex, rng).map(c => ({ ...c, guarantee: g.name })));
      else cards.push(...drawSlot(s.name, s.count, s.cw, s.noDuplicates, compiled.poolIndex, rng));
    }
    return cards;
  }

  function generateBox(compiled, rng) {
    const n = compiled.config.packsPerBox;
    const perPack = Array.from({ length: n }, () => ({}));
    for (const g of compiled.guarantees) {
      // choose g.perBox distinct packs (partial Fisher-Yates)
      const idx = Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i < g.perBox; i++) {
        const j = i + Math.floor(rng() * (n - i));
        [idx[i], idx[j]] = [idx[j], idx[i]];
        perPack[idx[i]][g.replacesSlot] = g;
      }
    }
    return perPack.map(rep => generatePack(compiled, rng, rep));
  }

  // A lone pack bought off the shelf: a guarantee lands in it with probability perBox / packsPerBox.
  function generateLoosePack(compiled, rng) {
    const rep = {};
    for (const g of compiled.guarantees)
      if (rng() < g.perBox / compiled.config.packsPerBox) rep[g.replacesSlot] = g;
    return generatePack(compiled, rng, rep);
  }

  // Expected cards per box, keyed by pool.
  function expectedPerBox(compiled) {
    const n = compiled.config.packsPerBox, exp = {};
    const add = (cw, times) => {
      for (let i = 0; i < cw.keys.length; i++) {
        const w = cw.cum[i] - (i ? cw.cum[i - 1] : 0);
        exp[cw.keys[i]] = (exp[cw.keys[i]] || 0) + times * w / cw.total;
      }
    };
    for (const s of compiled.slots) {
      const g = compiled.guarantees.find(x => x.replacesSlot === s.name);
      const replacedPacks = g ? g.perBox : 0;
      add(s.cw, (n - replacedPacks) * s.count);
      if (g) add(g.cw, g.perBox * s.count);
    }
    return exp;
  }

  const api = { rngFromSeed, randomSeed, validateConfig, compile, generatePack, generateBox,
    generateLoosePack, expectedPerBox, ConfigError, pickWeighted, compileWeights };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FabGen = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
