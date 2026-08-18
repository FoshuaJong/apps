/** Post-match report, and the between-opponents screen during a Gauntlet run. */

import { ROSTER } from "../core/opponents.js";
import { readability, leak, economy, findings } from "../core/metrics.js";
import { byId } from "./dom.js";
import { renderFindings } from "./dossier.js";

const stat = (key, value) =>
  `<div class="stat"><div class="stat__key">${key}</div><div class="stat__value num">${value}</div></div>`;

const formatRead = (r) => (r === null ? "—" : `${Math.round(r * 100)}%`);
const formatLeak = (l) => (l === null ? "—" : `${l >= 0 ? "+" : ""}${l.toFixed(2)} pts/rd`);

/**
 * Shown between opponents in a Gauntlet run.
 * @param {function} onContinue
 * @param {function} onBank stop the run and keep the result
 */
export function renderGauntletAdvance(match, cleared, { onContinue, onBank }) {
  const next = ROSTER[match.botIndex + 1];

  byId("screen-result").innerHTML = `
    <div class="eyebrow">Gauntlet · ${cleared} cleared</div>
    <h2 class="verdict verdict--won">Advanced</h2>
    <p class="prose">Next opponent inherits the file. Every round you've played so far is already in it — <span class="num">${match.history.length}</span> and counting.</p>
    <div class="grid stats">
      ${stat("Readability", formatRead(readability(match.history)))}
      ${stat("Leak", formatLeak(leak(match.history)))}
      ${stat("Next", next.name)}
    </div>
    <div class="actions">
      <button class="btn" id="btn-continue">Face ${next.name}</button>
      <button class="btn btn--ghost" id="btn-bank">Bank the run</button>
    </div>`;

  byId("btn-continue").onclick = onContinue;
  byId("btn-bank").onclick = onBank;
}

/**
 * Final report for a completed match.
 * @param {function} onAgain
 * @param {function} onHome
 */
export function renderResult(match, won, { onAgain, onHome }) {
  const read = readability(match.history);
  const lk = leak(match.history);
  const eco = economy(match.history);

  const heading = won ? (match.gauntlet ? "Roster cleared" : "Match won") : "Match lost";
  const blurb = won
    ? "You stayed ahead of the model. The question is whether you stayed ahead of it, or just got a friendly board."
    : "They found the pattern before you did. The numbers below are the pattern.";

  byId("screen-result").innerHTML = `
    <div class="eyebrow">${match.gauntlet ? `Gauntlet · ${match.cleared} cleared` : match.bot.name}</div>
    <h2 class="verdict ${won ? "verdict--won" : "verdict--lost"}">${heading}</h2>
    <p class="prose">${blurb}</p>

    <div class="grid stats">
      ${stat("Final", `${match.you.score} – ${match.them.score}`)}
      ${stat("Rounds", match.history.length)}
      ${stat("Readability", formatRead(read))}
      ${stat("Leak", formatLeak(lk))}
      ${stat("Economy", eco ? `${eco.you.toFixed(2)} / ${eco.them.toFixed(2)}` : "—")}
    </div>

    <div class="panel">
      <div class="eyebrow" style="margin-bottom:10px">What the file says</div>
      <ul class="findings">
        ${renderFindings(findings(match.history), "Too few rounds to conclude anything. That's its own kind of win.")}
      </ul>
      <p class="muted" style="font-size:12.5px;margin:14px 0 0">
        Leak is how many points per round a perfect reader would gain over one playing blind.
        Under +0.4 you are genuinely hard to model. Above +1.2 the higher tiers will eat you.
        Economy is points taken per supply committed, yours against theirs — you can be
        completely readable and still win if being read costs them more than it earns them.
      </p>
    </div>

    <div class="actions">
      <button class="btn" id="btn-again">${match.gauntlet ? "New run" : "Rematch"}</button>
      <button class="btn btn--ghost" id="btn-home">Roster</button>
    </div>`;

  byId("btn-again").onclick = onAgain;
  byId("btn-home").onclick = onHome;
}
