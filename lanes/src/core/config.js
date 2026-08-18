/**
 * Game constants. Every balance knob that is not opponent-specific lives here.
 * Opponent-specific knobs (k, noise, eps, min) live in core/opponents.js.
 */

/** Number of contested lanes per round. Changing this requires touching solver.js
 *  (the subset enumeration is written for 3) and match.css (grid columns). */
export const LANES = 3;

/** Supply granted to both sides at the start of each round. */
export const INCOME = 5;

/** Maximum supply either side may hold. Caps how far ahead you can save for a spike. */
export const BANK_CAP = 15;

/** Points needed to win a match. Also hard-coded as the tick count in match.css. */
export const TARGET = 21;

/** Minimum and maximum points a single lane can be worth in a round. */
export const LANE_VALUE_MIN = 1;
export const LANE_VALUE_MAX = 3;

/** Notional budget used when measuring how much a perfect reader would gain. */
export const LEAK_PROBE_BUDGET = 10;

export const STORAGE_KEY = "signalnoise:career:v1";
