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
 * The best set of lanes to take, assuming the opponent commits `prediction`.
 * With three lanes there are only eight subsets, so this enumerates.
 *
 * `price` is a shadow price on supply, in points per supply. The objective is
 * `gain - price * cost` rather than `gain`, which is what stops an opponent from
 * paying 6 supply for 6 points every round against an opponent who is paying 3.
 *
 * At price 0 this is a myopic maximiser and is exploitable by chip bids — a
 * player who commits 1 to every lane forces a p+1 responder to pay 2 per lane,
 * draining them at 2:1 while banking the difference. See CLAUDE.md.
 *
 * The empty subset is always a candidate, so declining to contest is a real
 * option rather than a fallback.
 *
 * @param {number[]} prediction expected opponent commitment per lane
 * @param {number[]} values     points each lane is worth this round
 * @param {number}   budget     supply available to spend
 * @param {number}   margin     extra supply above the prediction, as insurance
 * @param {number}   price      points per supply; 0 restores myopic behaviour
 * @returns {number[]} allocation, possibly all zeroes if banking scores best
 */
export function bestResponse(prediction, values, budget, margin = 0, price = 0) {
  let best = { net: -Infinity, cost: Infinity, alloc: new Array(LANES).fill(0) };

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
    if (cost > budget) continue;

    const net = gain - price * cost;
    if (net > best.net || (net === best.net && cost < best.cost)) best = { net, cost, alloc };
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
/**
 * Sample which lanes to contest, weighted by their average value and sharpened
 * so rich pairs are preferred without ever being certain. Shared by every mixed
 * strategy so they all vary shape the same way.
 */
export function sampleContestSet(values) {
  const subsets = [];
  for (let mask = 1; mask < (1 << LANES); mask++) {
    const lanes = [];
    for (let i = 0; i < LANES; i++) if (mask & (1 << i)) lanes.push(i);
    const worth = sum(lanes.map((i) => values[i]));
    subsets.push({ lanes, weight: Math.pow(worth / lanes.length, 2.2) });
  }

  const totalWeight = subsets.reduce((a, s) => a + s.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const s of subsets) {
    roll -= s.weight;
    if (roll <= 0) return s.lanes;
  }
  return subsets[0].lanes;
}

export function mixedShape(values, budget) {
  if (budget <= 0) return new Array(LANES).fill(0);

  const chosen = { lanes: sampleContestSet(values) };
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

/**
 * Mixed play that also sizes its bids.
 *
 * mixedShape() picks a good shape but spends a random 45–100% of bank on it,
 * which bleeds supply against anyone who bids economically. This picks the
 * shape the same way, then bids near the level a lane is actually likely to be
 * contested at, and banks the rest.
 *
 * This is what "unexploitable by default" should mean: unreadable *and* solvent.
 */
export function economicMix(values, budget) {
  if (budget <= 0) return new Array(LANES).fill(0);

  const lanes = sampleContestSet(values);
  const meanValue = sum(values) / LANES || 1;
  const base = 1.5 + Math.random() * 2.5;
  const alloc = new Array(LANES).fill(0);

  let left = budget;
  for (const i of lanes) {
    const bid = Math.min(left, Math.max(1, Math.round(base * values[i] / meanValue)));
    alloc[i] = bid;
    left -= bid;
    if (left <= 0) break;
  }
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
