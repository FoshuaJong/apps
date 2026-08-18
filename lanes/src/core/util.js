/** Pure helpers. No imports, no side effects — safe to use from anywhere. */

/** Random integer in [0, n). */
export const randInt = (n) => Math.floor(Math.random() * n);

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Index of the largest element. Ties resolve to the lowest index, which the
 *  models rely on: "the top lane" must be deterministic given a board. */
export const argmax = (xs) => xs.indexOf(Math.max(...xs));

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Standard normal sample (Box–Muller). Used to blur model predictions. */
export function gaussian() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Lane indices ordered by descending value. Ties keep their natural order. */
export const laneOrderByValue = (values) =>
  values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
