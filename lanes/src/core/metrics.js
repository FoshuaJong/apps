/**
 * Measurements of the player, surfaced in the dossier and the result screen.
 *
 * All three take the same round-record history described in models.js. All use
 * leave-one-out estimation so that a round is never scored against a model that
 * has already seen it.
 */

import { LANES, LEAK_PROBE_BUDGET } from "./config.js";
import { sum, argmax } from "./util.js";
import { meanAllocation } from "./models.js";
import { bestResponse, proportional, scoreAgainst } from "./solver.js";

/**
 * How often a naive model, fitted without this round, correctly names the lane
 * the player will back. Chance is 1/LANES.
 *
 * Rounds where the player committed nothing are skipped — banking is a decision,
 * but it carries no lane read.
 *
 * @returns {number|null} 0..1, or null below the minimum sample size
 */
export function readability(history) {
  let hits = 0;
  let scored = 0;

  history.forEach((round, index) => {
    if (sum(round.you) === 0) return;

    const context = argmax(round.values);
    let peers = history.filter((r, i) =>
      i !== index && argmax(r.values) === context && sum(r.you) > 0);
    if (peers.length < 2) peers = history.filter((r, i) => i !== index && sum(r.you) > 0);
    if (peers.length < 2) return;

    scored++;
    if (argmax(meanAllocation(peers)) === argmax(round.you)) hits++;
  });

  return scored >= 3 ? hits / scored : null;
}

/**
 * Points per round a perfect reader gains over one playing blind.
 *
 * Interpretation: below +0.4 the player is genuinely hard to model; above +1.2
 * the higher tiers will take them apart.
 *
 * @returns {number|null}
 */
export function leak(history) {
  let readerScore = 0;
  let blindScore = 0;
  let scored = 0;

  history.forEach((round, index) => {
    const peers = history.filter((_, i) => i !== index);
    if (peers.length < 3) return;

    const prediction = meanAllocation(peers);
    readerScore += scoreAgainst(
      bestResponse(prediction, round.values, LEAK_PROBE_BUDGET), round.you, round.values);
    blindScore += scoreAgainst(
      proportional(round.values, LEAK_PROBE_BUDGET, 0.8), round.you, round.values);
    scored++;
  });

  return scored >= 3 ? (readerScore - blindScore) / scored : null;
}

/**
 * Human-readable observations, derived from the same numbers the opponents use.
 * Returns HTML fragments; the emphasised figure is wrapped in a <span>.
 */
export function findings(history) {
  const out = [];
  if (history.length < 3) return out;

  const totalSpend = history.reduce((a, r) => a + sum(r.you), 0) || 1;
  const share = Array.from({ length: LANES }, (_, i) =>
    history.reduce((a, r) => a + r.you[i], 0) / totalSpend);
  const favourite = argmax(share);
  if (share[favourite] > 0.44) {
    out.push(`Lane bias · <span>${Math.round(share[favourite] * 100)}%</span> of your supply goes to Lane ${favourite + 1}`);
  }

  const rich = history.filter((r) => sum(r.values) >= 8);
  const cheap = history.filter((r) => sum(r.values) <= 5);
  if (rich.length >= 2 && cheap.length >= 2) {
    const richSpend = rich.reduce((a, r) => a + sum(r.you), 0) / rich.length;
    const cheapSpend = cheap.reduce((a, r) => a + sum(r.you), 0) / cheap.length;
    if (richSpend - cheapSpend > 3) {
      out.push(`Spike tell · you push <span>${(richSpend - cheapSpend).toFixed(1)}</span> more supply on rich boards`);
    }
    if (cheapSpend < 1.5) out.push("Bank rhythm · you concede cheap boards almost outright");
  }

  const banked = history.filter((r) => sum(r.you) === 0).length;
  if (banked >= 2) out.push(`Withheld · <span>${banked}</span> rounds committed nothing`);

  const opening = history[0];
  if (opening && sum(opening.you) > 0) {
    out.push(`Opening · Lane ${argmax(opening.you) + 1} on the first round`);
  }

  const everSpread = history.some((r) => r.you.filter((x) => x > 0).length === LANES);
  if (history.length >= 4 && !everSpread) out.push("Never spreads across all three lanes");

  return out;
}
