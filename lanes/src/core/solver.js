/**
 * Allocation strategies. Everything here is a pure function from
 * (board, budget) to an allocation array of length LANES.
 *
 * An "allocation" is always a plain array like [4, 0, 7] — one entry per lane,
 * non-negative integers, summing to at most the budget.
 */

import { LANES } from "./config.js";
import { randInt, sum, clamp } from "./util.js";

/**
 * The cheapest way to take the most valuable set of lanes, assuming the
 * opponent commits `prediction`. With three lanes there are only eight subsets,
 * so this enumerates rather than doing anything clever.
 *
 * @param {number[]} prediction  expected opponent commitment per lane
 * @param {number[]} values      points each lane is worth this round
 * @param {number}   budget      supply available to spend
 * @param {number}   margin      extra supply committed above the prediction, as
 *                               insurance against the prediction being low
 * @returns {number[]} allocation, or all zeroes if nothing is affordable
 */
export function bestResponse(prediction, values, budget, margin = 0) {
  let best = { gain: -1, cost: Infinity, alloc: new Array(LANES).fill(0) };

  for (let mask = 0; mask < (1 << LANES); mask++) {
    const alloc = new Array(LANES).fill(0);
    let cost = 0;
    let gain = 0;

    for (let i = 0; i < LANES; i++) {
      if (!(mask & (1 << i))) continue;
      const bid = Math.max(0, Math.round(prediction[i])) + 1 + margin;
      alloc[i] = bid;
      cost += bid;
      gain += values[i];
    }

    const better = gain > best.gain || (gain === best.gain && cost < best.cost);
    if (cost <= budget && better) best = { gain, cost, alloc };
  }

  return best.alloc.slice();
}

/**
 * Spread `fraction` of the budget across all lanes in proportion to their value.
 * This is the "no information" baseline: sensible, and completely predictable.
 */
export function proportional(values, budget, fraction, jitter = false) {
  const spend = clamp(Math.round(budget * fraction), 0, budget);
  const total = sum(values) || 1;
  const alloc = values.map((v) => Math.floor(spend * v / total));

  let remainder = spend - sum(alloc);
  while (remainder-- > 0) alloc[randInt(LANES)]++;

  if (jitter) {
    for (let k = 0; k < 2; k++) {
      const from = randInt(LANES);
      const to = randInt(LANES);
      if (from !== to && alloc[from] > 0) { alloc[from]--; alloc[to]++; }
    }
  }
  return alloc;
}

/**
 * Genuinely mixed play: sample *which* lanes to contest, not just how much.
 *
 * This matters more than it looks. Jittering around a value-weighted mean is
 * still centred on a single shape, so any mean-based model reads it. Varying the
 * shape itself is what defeats the read — which is exactly why a player who
 * always dumps everything on the top lane beats the Mirror.
 */
export function mixedShape(values, budget) {
  if (budget <= 0) return new Array(LANES).fill(0);

  // Weight each candidate subset by its average lane value, sharpened so that
  // rich pairs are preferred without ever being certain.
  const subsets = [];
  for (let mask = 1; mask < (1 << LANES); mask++) {
    const lanes = [];
    for (let i = 0; i < LANES; i++) if (mask & (1 << i)) lanes.push(i);
    const worth = sum(lanes.map((i) => values[i]));
    subsets.push({ lanes, weight: Math.pow(worth / lanes.length, 2.2) });
  }

  const totalWeight = subsets.reduce((a, s) => a + s.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = subsets[0];
  for (const s of subsets) {
    roll -= s.weight;
    if (roll <= 0) { chosen = s; break; }
  }

  const spend = clamp(Math.round(budget * (0.45 + Math.random() * 0.55)), 1, budget);
  const worth = sum(chosen.lanes.map((i) => values[i])) || 1;
  const alloc = new Array(LANES).fill(0);

  let remainder = spend;
  for (const i of chosen.lanes) {
    const share = Math.floor(spend * values[i] / worth);
    alloc[i] = share;
    remainder -= share;
  }
  while (remainder-- > 0) alloc[chosen.lanes[randInt(chosen.lanes.length)]]++;

  return alloc;
}

/** Points `mine` would score against `theirs` on this board. Ties score nothing. */
export function scoreAgainst(mine, theirs, values) {
  let points = 0;
  for (let i = 0; i < LANES; i++) if (mine[i] > theirs[i]) points += values[i];
  return points;
}

/** Trim an allocation down until it is affordable, shaving the largest lane first. */
export function affordable(alloc, budget) {
  const out = alloc.map((x) => Math.max(0, Math.round(x)));
  while (sum(out) > budget) {
    const biggest = out.indexOf(Math.max(...out));
    out[biggest]--;
  }
  return out;
}
