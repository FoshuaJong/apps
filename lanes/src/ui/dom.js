/** Minimal DOM helpers. The UI is string-templated and re-rendered; there is no
 *  virtual DOM and no framework. */

export const byId = (id) => document.getElementById(id);

const SCREENS = ["screen-home", "screen-match", "screen-result"];

/** Show exactly one top-level screen. */
export function showScreen(id) {
  for (const screen of SCREENS) byId(screen).classList.toggle("hidden", screen !== id);
}

/** Escape text destined for innerHTML. Used for anything not authored here. */
export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
