/**
 * The machinery opponents use to predict the player.
 *
 * A "round record" is the shared unit of history throughout the codebase:
 *   { values: number[], you: number[], them: number[] }
 * where `you` is always the *player's* allocation, from the opponent's point of
 * view. Every model here consumes an array of those.
 */

import { LANES } from "./config.js";
import { sum, gaussian, laneOrderByValue } from "./util.js";

/** Mean player allocation per lane, or null if there is nothing to average. */
export function meanAllocation(rounds) {
  if (!rounds.length) return null;
  return Array.from({ length: LANES }, (_, i) =>
    rounds.reduce((a, r) => a + r.you[i], 0) / rounds.length);
}

/**
 * Mean player allocation indexed by lane *rank* rather than lane identity:
 * slot 0 is whatever lane was worth most that round.
 *
 * This is a strictly different read from meanAllocation. A player who always
 * spikes the richest lane looks uniform to a per-lane model and completely
 * transparent to this one.
 *
 * @returns {{byRank: number[]}|null} tagged so botMove knows to remap it
 */
export function rankModel(rounds) {
  if (!rounds.length) return null;
  const totals = new Array(LANES).fill(0);
  for (const r of rounds) {
    laneOrderByValue(r.values).forEach((lane, rank) => { totals[rank] += r.you[lane]; });
  }
  return { byRank: totals.map((x) => x / rounds.length) };
}

/** Map a rank-indexed prediction back onto this round's actual lanes. */
export function rankToLanes(byRank, values) {
  const prediction = new Array(LANES).fill(0);
  laneOrderByValue(values).forEach((lane, rank) => { prediction[lane] = byRank[rank]; });
  return prediction;
}

/**
 * Temper a raw estimate before acting on it.
 *
 * Two corrections, both of which exist to stop opponents from being uncannily
 * sharp in round two:
 *   1. Shrink toward a value-weighted prior, weighted by sample count. `k` is
 *      the number of observations at which the model half-trusts its own data.
 *   2. Add noise scaled to how much the player actually varies, so a player
 *      with high variance is genuinely harder to pin down.
 *
 * This is also what makes the Gauntlet escalate: history accumulates across
 * matches in a run, so `n` grows and shrinkage weakens.
 *
 * @param {number[]} prediction raw per-lane estimate
 * @param {object[]} history    round records observed so far
 * @param {number[]} values     this round's lane values
 * @param {number}   k          shrinkage constant (higher = slower to trust data)
 * @param {number}   noise      multiplier on the player's own standard deviation
 */
export function temper(prediction, history, values, k, noise) {
  const n = history.length;
  const averageSpend = history.reduce((a, r) => a + sum(r.you), 0) / Math.max(1, n);
  const totalValue = sum(values) || 1;
  const prior = values.map((v) => averageSpend * v / totalValue);
  const weight = n / (n + k);

  const deviation = Array.from({ length: LANES }, (_, i) => {
    if (n < 2) return 3;
    const mean = history.reduce((a, r) => a + r.you[i], 0) / n;
    return Math.sqrt(history.reduce((a, r) => a + (r.you[i] - mean) ** 2, 0) / n);
  });

  return prediction.map((p, i) =>
    Math.max(0, weight * p + (1 - weight) * prior[i] + gaussian() * deviation[i] * noise));
}
