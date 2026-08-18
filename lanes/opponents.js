/**
 * The opponent ladder.
 *
 * Every opponent receives identical history. What differs is the model it
 * builds from it, and each tier adds one conditioning dimension:
 *
 *   Dummy        nothing — ignores lane values entirely
 *   Mirror       your unconditioned average shape
 *   Accountant   your tempo: how hard you push as a function of board value
 *   Bookkeeper   your habits by lane RANK (what you do to the richest lane)
 *   Cartographer your habits by lane IDENTITY, filed per board shape
 *   Equilibrist  unexploitable by default, exploits once you become readable
 *
 * The ladder is not a linear ramp. Each tier is beaten by a different
 * adaptation, and the adaptation that beats one tier can lose to the next —
 * dumping everything on the top lane beats the Mirror and loses 21-0 to the
 * Bookkeeper. Preserve that property when adding tiers.
 *
 * ---- opponent fields ----
 *   min    rounds of history required before the model is consulted at all
 *   eps    probability of ignoring the model and playing mixed instead
 *   k      shrinkage constant passed to temper() — higher is a slower learner
 *   noise  multiplier on prediction noise — higher is a shakier hand
 *   margin extra supply committed above the prediction, as insurance
 *   dumb   opt out of value-aware fallback play (Sparring Dummy only)
 *   model  (history, values) => number[] | {byRank: number[]} | null
 */

import { LANES } from "./config.js";
import { sum, randInt, argmax } from "./util.js";
import { mixedShape } from "./solver.js";
import { bestResponse } from "./solver.js";
import { meanAllocation, rankModel, rankToLanes, temper } from "./models.js";
import { readability } from "./metrics.js";

/** Bucket a board by how much is on offer. Used by the Accountant. */
const valueBand = (total) => (total >= 8 ? "rich" : total <= 5 ? "cheap" : "mid");

export const ROSTER = [
  {
    id: "dummy",
    name: "Sparring Dummy",
    tier: "Tier 0",
    description: "Commits at random and never learns a thing. Beat it once to confirm you have the rules.",
    dumb: true,
    min: Infinity,
    eps: 1,
    model: () => null,
  },
  {
    id: "mirror",
    name: "The Mirror",
    tier: "Tier 1",
    description: "Plays your average shape back at you. Anyone with a favourite lane loses to it.",
    min: 2, eps: 0.38, k: 13, noise: 1.0,
    model: (history) => meanAllocation(history),
  },
  {
    id: "acct",
    name: "The Accountant",
    tier: "Tier 2",
    description: "Watches your bank, not your lanes. Learns how hard you push when the board is rich, and undercuts the spike.",
    min: 2, eps: 0.27, k: 9, noise: 0.85,
    model: (history, values) => {
      const band = valueBand(sum(values));
      const peers = history.filter((r) => valueBand(sum(r.values)) === band);
      return meanAllocation(peers.length >= 2 ? peers : history);
    },
  },
  {
    id: "book",
    name: "The Bookkeeper",
    tier: "Tier 3",
    description: "Files you by lane worth, not lane number. It knows what you do to the richest lane on the board wherever it turns up.",
    min: 2, eps: 0.12, k: 5, noise: 0.6,
    model: (history) => rankModel(history),
  },
  {
    id: "carto",
    name: "The Cartographer",
    tier: "Tier 4",
    description: "Keeps a separate page per board shape. What you do when Lane 1 is hot is filed apart from what you do when Lane 3 is.",
    min: 3, eps: 0.07, k: 4, noise: 0.45, margin: 1,
    model: (history, values) => {
      const context = argmax(values);
      const peers = history.filter((r) => argmax(r.values) === context);
      return meanAllocation(peers.length >= 2 ? peers : history);
    },
  },
  {
    id: "equi",
    name: "The Equilibrist",
    tier: "Tier 5",
    description: "Plays unexploitably by default. It only reaches for the read once your readability climbs — so it is, strictly, your own fault.",
    min: 2, eps: 0.05, k: 3, noise: 0.35, margin: 1,
    model: (history, values) => {
      const read = readability(history);
      // Returning null means "no read available", which sends it to mixed play.
      if (read === null || read < 0.36) return null;
      const context = argmax(values);
      const peers = history.filter((r) => argmax(r.values) === context);
      return peers.length >= 3 ? meanAllocation(peers) : rankModel(history);
    },
  },
];

export const opponentIndexById = (id) => ROSTER.findIndex((o) => o.id === id);

/**
 * Choose an opponent's allocation for the round.
 *
 * @param {object}   opponent one entry from ROSTER
 * @param {object}   ctx      { values, bank, history }
 * @returns {number[]} allocation, guaranteed to be within budget
 */
export function chooseMove(opponent, { values, bank, history }) {
  if (bank <= 0) return new Array(LANES).fill(0);

  const consultModel = history.length >= opponent.min && Math.random() > opponent.eps;
  if (consultModel) {
    let prediction = opponent.model(history, values);
    if (prediction && prediction.byRank) prediction = rankToLanes(prediction.byRank, values);

    if (prediction) {
      prediction = temper(prediction, history, values, opponent.k, opponent.noise);
      const alloc = bestResponse(prediction, values, bank, opponent.margin || 0);
      if (sum(alloc) > 0) return alloc;
    }
  }

  // No usable read, or a deliberate refusal to use one.
  if (opponent.dumb) {
    const spend = randInt(bank + 1);
    const alloc = new Array(LANES).fill(0);
    for (let i = 0; i < spend; i++) alloc[randInt(LANES)]++;
    return alloc;
  }
  if (sum(values) <= 4 && Math.random() < 0.45) return new Array(LANES).fill(0);
  return mixedShape(values, bank);
}
