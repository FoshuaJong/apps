#!/usr/bin/env node
/**
 * Balance harness. Run with:  node tools/simulate.js
 *
 * Two tables:
 *
 *   1. Scripted policies vs the ladder. These are deliberately dumb reference
 *      players. Their job is to confirm that predictable play is punished —
 *      `fixed` should lose ~100% of matches to everything above Tier 0.
 *
 *   2. A symmetric bot-vs-bot tournament. This is the real fairness test:
 *      the diagonal should sit near 50%, and column averages should decrease
 *      monotonically down the roster (a lower column average means a harder
 *      opponent). If a tier inverts, the ladder ordering is wrong.
 *
 * Nothing here touches the DOM — it drives core/ directly.
 */

import { LANES, INCOME, BANK_CAP, TARGET } from "../src/core/config.js";
import { sum, argmax, randInt, laneOrderByValue } from "../src/core/util.js";
import { proportional, mixedShape, affordable } from "../src/core/solver.js";
import { ROSTER, chooseMove } from "../src/core/opponents.js";
import { rollBoard } from "../src/core/engine.js";
import { readability, leak } from "../src/core/metrics.js";

const MATCHES = Number(process.env.MATCHES || 500);
const MAX_ROUNDS = 60;

/** Scripted reference players: (values, bank, history) => allocation. */
const POLICIES = {
  /** Everything on the most valuable lane. Beats the Mirror, loses to the Bookkeeper. */
  greedy: (values, bank) => {
    const alloc = new Array(LANES).fill(0);
    alloc[argmax(values)] = bank;
    return alloc;
  },
  /** Always Lane 1. The control case: should lose to everything. */
  fixed: (values, bank) => {
    const alloc = new Array(LANES).fill(0);
    alloc[0] = Math.min(bank, 6);
    return alloc;
  },
  /** Value-weighted spread, no variation. Sensible and completely readable. */
  proportional: (values, bank) => proportional(values, bank, 0.8),
  /** Shape-mixing with no attempt to read the opponent back. */
  mixed: (values, bank) => mixedShape(values, bank),

  /**
   * REGRESSION CASE. Found by a playtester, and it beat the whole ladder.
   *
   * Commit exactly 1 supply to every lane regardless of value. Each chip costs 1
   * and forces a p+1 responder to pay 2, so it drains the opponent at 2:1 while
   * banking +2 a round. Once the bank is full, spike the rich lanes with a
   * supply advantage the opponent can no longer match.
   *
   * The strategy never reads the opponent at all, so no amount of modelling
   * defeats it — it beats a *myopic* opponent, one that maximises this round's
   * points with no price on future supply. See CLAUDE.md, "Supply pricing".
   *
   * This policy must not win more than ~50% against Tier 2 and above.
   */
  chipAndSpike: (values, bank) => {
    const alloc = new Array(LANES).fill(0);

    // Accumulation phase: minimum viable contest, maximum banking.
    if (bank < 11) {
      if (bank >= LANES) for (let i = 0; i < LANES; i++) alloc[i] = 1;
      return alloc;
    }

    // Spike phase: buy the two richest lanes outright with the bank advantage.
    const [first, second] = laneOrderByValue(values);
    alloc[first] = Math.ceil(bank * 0.6);
    alloc[second] = bank - alloc[first];
    return alloc;
  },
};

function playMatch(botIndex, policy) {
  const opponent = ROSTER[botIndex];
  const you = { bank: INCOME, score: 0 };
  const them = { bank: INCOME, score: 0 };
  const history = [];

  while (you.score < TARGET && them.score < TARGET && history.length < MAX_ROUNDS) {
    const values = rollBoard();
    const yours = affordable(policy(values, you.bank, history), you.bank);
    const theirs = affordable(chooseMove(opponent, {
      values, bank: them.bank, history,
      scores: { them: them.score, you: you.score }, playerBank: you.bank,
    }), them.bank);

    for (let i = 0; i < LANES; i++) {
      if (yours[i] > theirs[i]) you.score += values[i];
      else if (theirs[i] > yours[i]) them.score += values[i];
    }
    you.bank = Math.min(BANK_CAP, you.bank - sum(yours) + INCOME);
    them.bank = Math.min(BANK_CAP, them.bank - sum(theirs) + INCOME);
    history.push({ values, you: yours, them: theirs });
  }

  return {
    won: you.score >= TARGET && you.score > them.score,
    rounds: history.length,
    readability: readability(history),
    leak: leak(history),
  };
}

/** Both sides driven by roster opponents, each keeping its own view of history. */
function duel(aIndex, bIndex) {
  const a = ROSTER[aIndex];
  const b = ROSTER[bIndex];
  const you = { bank: INCOME, score: 0 };
  const them = { bank: INCOME, score: 0 };
  const historyA = [];  // what A has seen of B
  const historyB = [];  // what B has seen of A
  let rounds = 0;

  while (you.score < TARGET && them.score < TARGET && rounds < MAX_ROUNDS) {
    const values = rollBoard();
    const yours = affordable(chooseMove(a, {
      values, bank: you.bank, history: historyA,
      scores: { them: you.score, you: them.score }, playerBank: them.bank,
    }), you.bank);
    const theirs = affordable(chooseMove(b, {
      values, bank: them.bank, history: historyB,
      scores: { them: them.score, you: you.score }, playerBank: you.bank,
    }), them.bank);

    for (let i = 0; i < LANES; i++) {
      if (yours[i] > theirs[i]) you.score += values[i];
      else if (theirs[i] > yours[i]) them.score += values[i];
    }
    you.bank = Math.min(BANK_CAP, you.bank - sum(yours) + INCOME);
    them.bank = Math.min(BANK_CAP, them.bank - sum(theirs) + INCOME);

    // Each side records its opponent under the `you` key.
    historyA.push({ values, you: theirs, them: yours });
    historyB.push({ values, you: yours, them: theirs });
    rounds++;
  }

  return you.score >= TARGET && you.score > them.score;
}

const pct = (n, d) => `${(n / d * 100).toFixed(0)}%`.padStart(6);

console.log(`\nPolicy vs ladder  (${MATCHES} matches per cell, win % as the player)\n`);
console.log("".padEnd(14) + ROSTER.map((o) => o.id.padStart(6)).join(" "));
for (const [name, policy] of Object.entries(POLICIES)) {
  const cells = [];
  let readSum = 0, leakSum = 0, samples = 0, roundSum = 0;

  for (let i = 0; i < ROSTER.length; i++) {
    let wins = 0;
    for (let m = 0; m < MATCHES; m++) {
      const r = playMatch(i, policy);
      if (r.won) wins++;
      roundSum += r.rounds;
      if (r.readability !== null) { readSum += r.readability; leakSum += r.leak; samples++; }
    }
    cells.push(pct(wins, MATCHES));
  }
  const rounds = (roundSum / (MATCHES * ROSTER.length)).toFixed(1);
  console.log(
    name.padEnd(14) + cells.join(" ") +
    `   read ${(readSum / samples * 100).toFixed(0)}%  leak ${(leakSum / samples).toFixed(2)}  ${rounds} rds`);
}

console.log(`\nSymmetric duels  (row plays as the player; low column average = hard opponent)\n`);
console.log("".padEnd(14) + ROSTER.map((o) => o.id.padStart(6)).join(" "));
const columnTotals = new Array(ROSTER.length).fill(0);
for (let a = 0; a < ROSTER.length; a++) {
  const cells = [];
  for (let b = 0; b < ROSTER.length; b++) {
    let wins = 0;
    for (let m = 0; m < MATCHES; m++) if (duel(a, b)) wins++;
    columnTotals[b] += wins / MATCHES;
    cells.push(pct(wins, MATCHES));
  }
  console.log(ROSTER[a].id.padEnd(14) + cells.join(" "));
}
console.log("".padEnd(14) + columnTotals.map((t) => pct(t, ROSTER.length)).join(" ") + "   column avg\n");
