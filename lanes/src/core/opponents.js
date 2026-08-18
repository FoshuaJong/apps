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
 *   hedge  how much insurance to buy above the prediction, as a coefficient on
 *          the player's own variance. NOT a flat bid bonus — see bidMargin().
 *   frugal use economicMix rather than mixedShape when playing without a read
 *   thrift shadow price on supply, in points per supply. 0 is a myopic
 *          maximiser and is exploitable by chip bids — see solver.bestResponse.
 *   dumb   opt out of value-aware fallback play (Sparring Dummy only)
 *   model  (history, values) => number[] | {byRank: number[]} | null
 */

import { LANES, TARGET, BANK_CAP } from "./config.js";
import { sum, randInt, argmax } from "./util.js";
import { mixedShape, economicMix } from "./solver.js";
import { bestResponse } from "./solver.js";
import { meanAllocation, rankModel, rankToLanes, temper, predictionSpread } from "./models.js";
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
    min: 2, eps: 0.38, k: 13, noise: 1.0, thrift: 0.25, hedge: 1.6,
    model: (history) => meanAllocation(history),
  },
  {
    id: "acct",
    name: "The Accountant",
    tier: "Tier 2",
    description: "Watches your bank, not your lanes. Learns how hard you push when the board is rich, and undercuts the spike.",
    min: 2, eps: 0.27, k: 9, noise: 0.85, thrift: 0.60, hedge: 1.2,
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
    min: 2, eps: 0.12, k: 5, noise: 0.6, thrift: 0.40, hedge: 0.9,
    model: (history) => rankModel(history),
  },
  {
    id: "carto",
    name: "The Cartographer",
    tier: "Tier 4",
    description: "Keeps a separate page per board shape. What you do when Lane 1 is hot is filed apart from what you do when Lane 3 is.",
    min: 3, eps: 0.07, k: 4, noise: 0.45, thrift: 0.50, hedge: 0.7,
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
    min: 2, eps: 0.05, k: 3, noise: 0.35, thrift: 0.55, hedge: 0.5, frugal: true,
    model: (history, values) => {
      const read = readability(history);
      // Returning null means "no read available", which sends it to mixed play.
      if (read === null || read < 0.28) return null;
      const context = argmax(values);
      const peers = history.filter((r) => argmax(r.values) === context);
      return peers.length >= 3 ? meanAllocation(peers) : rankModel(history);
    },
  },
];

export const opponentIndexById = (id) => ROSTER.findIndex((o) => o.id === id);

/**
 * Insurance to add on top of a predicted bid, in supply.
 *
 * Scaled by how erratic the player actually is. A flat +1 was the single
 * biggest exploit in the game: against a player who commits 1 to every lane,
 * a flat margin makes the opponent pay 3 for a lane worth taking at 2, every
 * round, forever. Insurance should cost something only when there is risk.
 */
function bidMargin(opponent, history) {
  const hedge = opponent.hedge ?? 0;
  if (!hedge) return 0;
  return Math.round(hedge * Math.min(predictionSpread(history), 3) / 2);
}

/**
 * The shadow price this opponent should put on supply this round, in points
 * per supply.
 *
 * Baseline is the opponent's `thrift`. Two adjustments:
 *
 *   - Urgency. If either side can close the match on this board, future supply
 *     is worthless — points now are the only thing that matters, so the price
 *     drops to zero and the opponent buys whatever it can.
 *   - Bank deficit. If the player is sitting on more supply, the opponent is
 *     losing the economy and needs to stop bleeding, so the price rises.
 */
function supplyPrice(opponent, { values, bank, scores, playerBank }) {
  const thrift = opponent.thrift ?? 0;
  if (!thrift) return 0;

  if (scores) {
    const board = sum(values);
    const urgent = board >= TARGET - scores.them || board >= TARGET - scores.you;
    if (urgent) return 0;
  }

  const deficit = Math.max(0, (playerBank ?? bank) - bank);
  return thrift * (1 + deficit / BANK_CAP * 0.6);
}

/**
 * Choose an opponent's allocation for the round.
 *
 * @param {object} opponent one entry from ROSTER
 * @param {object} ctx      { values, bank, history, scores, playerBank }
 * @returns {number[]} allocation, guaranteed to be within budget
 */
export function chooseMove(opponent, ctx) {
  const { values, bank, history } = ctx;
  if (bank <= 0) return new Array(LANES).fill(0);

  const consultModel = history.length >= opponent.min && Math.random() > opponent.eps;
  if (consultModel) {
    let prediction = opponent.model(history, values);
    if (prediction && prediction.byRank) prediction = rankToLanes(prediction.byRank, values);

    if (prediction) {
      prediction = temper(prediction, history, values, opponent.k, opponent.noise);
      // Returned as-is even when it is all zeroes: with a price on supply,
      // banking is a decision the model made, not a failure to find a move.
      return bestResponse(
        prediction, values, bank,
        bidMargin(opponent, history), supplyPrice(opponent, ctx));
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
  // `frugal` opponents stay solvent while unreadable; the rest just play a shape.
  return opponent.frugal ? economicMix(values, bank) : mixedShape(values, bank);
}
