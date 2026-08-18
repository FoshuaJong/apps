/**
 * The match state machine. Contains the rules and nothing else — no DOM, no
 * storage, no rendering. This is what tools/simulate.js drives headlessly.
 *
 * A match moves through three phases:
 *   "commit"  the player is choosing an allocation (match.draft)
 *   "reveal"  both allocations are visible in match.reveal
 *   "over"    someone has reached TARGET
 */

import { LANES, INCOME, BANK_CAP, TARGET, LANE_VALUE_MIN, LANE_VALUE_MAX } from "./config.js";
import { randInt, sum } from "./util.js";
import { affordable } from "./solver.js";
import { ROSTER, chooseMove } from "./opponents.js";

export function rollBoard() {
  return Array.from({ length: LANES }, () =>
    LANE_VALUE_MIN + randInt(LANE_VALUE_MAX - LANE_VALUE_MIN + 1));
}

/**
 * @param {number}  botIndex index into ROSTER
 * @param {boolean} gauntlet whether this match is part of a run
 * @param {object}  carry    { cleared, history } from the previous match in a run.
 *                           Carrying history is what makes the Gauntlet escalate:
 *                           the file on the player never resets mid-run.
 */
export function createMatch(botIndex, { gauntlet = false, carry = null } = {}) {
  return {
    bot: ROSTER[botIndex],
    botIndex,
    gauntlet,
    cleared: gauntlet && carry ? carry.cleared : 0,
    you: { bank: INCOME, score: 0 },
    them: { bank: INCOME, score: 0 },
    values: rollBoard(),
    draft: new Array(LANES).fill(0),
    round: 1,
    phase: "commit",
    reveal: null,
    history: carry && carry.history ? carry.history.slice() : [],
    log: [],
  };
}

/** Resolve the round. Mutates `match` and leaves it in "reveal" or "over". */
export function commitRound(match) {
  if (match.phase !== "commit") return;

  const yours = affordable(match.draft, match.you.bank);
  const theirs = affordable(
    chooseMove(match.bot, {
      values: match.values,
      bank: match.them.bank,
      history: match.history,
    }),
    match.them.bank);

  const winners = [];
  let yourPoints = 0;
  let theirPoints = 0;

  for (let i = 0; i < LANES; i++) {
    if (yours[i] > theirs[i]) { yourPoints += match.values[i]; winners.push("you"); }
    else if (theirs[i] > yours[i]) { theirPoints += match.values[i]; winners.push("them"); }
    else winners.push("void");
  }

  match.you.bank -= sum(yours);
  match.them.bank -= sum(theirs);
  match.you.score += yourPoints;
  match.them.score += theirPoints;

  match.reveal = { you: yours, them: theirs, winners, yourPoints, theirPoints };
  // History is stored from the opponent's point of view: `you` is always the player.
  match.history.push({ values: match.values.slice(), you: yours, them: theirs });
  match.log.unshift(
    `R${match.round} · you ${yours.join("/")} (+${yourPoints}) · them ${theirs.join("/")} (+${theirPoints})`);

  match.phase = isDecided(match) ? "over" : "reveal";
}

export function advanceRound(match) {
  match.round++;
  match.you.bank = Math.min(BANK_CAP, match.you.bank + INCOME);
  match.them.bank = Math.min(BANK_CAP, match.them.bank + INCOME);
  match.values = rollBoard();
  match.draft = new Array(LANES).fill(0);
  match.reveal = null;
  match.phase = "commit";
}

export const isDecided = (match) => match.you.score >= TARGET || match.them.score >= TARGET;

export const playerWon = (match) =>
  match.you.score >= TARGET && match.you.score > match.them.score;

/** Supply left after the current draft allocation. */
export const supplyRemaining = (match) => match.you.bank - sum(match.draft);

/**
 * Set one lane of the draft, clamped so the draft always stays affordable.
 * @returns {number} the value actually applied
 */
export function setDraftLane(match, lane, value) {
  const others = sum(match.draft) - match.draft[lane];
  const applied = Math.max(0, Math.min(value, match.you.bank - others));
  match.draft[lane] = applied;
  return applied;
}

/**
 * Points a side needs to close the match on this board alone, or null if the
 * board cannot get them there. Drives the match-point banner.
 */
export function matchPointNeed(score, values) {
  const need = TARGET - score;
  if (need <= 0) return 0;
  return sum(values) >= need ? need : null;
}
