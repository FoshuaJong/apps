/**
 * Entry point. Owns the two pieces of mutable application state (the current
 * match and the career record), wires events, and moves between screens.
 *
 * Rendering lives in ui/, rules live in core/. Nothing in core/ imports from
 * ui/, so the rules stay drivable headlessly by tools/simulate.js.
 */

import { LANES, TARGET } from "./core/config.js";
import { ROSTER } from "./core/opponents.js";
import { readability } from "./core/metrics.js";
import {
  createMatch, commitRound, advanceRound, playerWon, setDraftLane,
} from "./core/engine.js";
import { loadCareer, saveCareer } from "./core/storage.js";
import { byId, showScreen } from "./ui/dom.js";
import { renderHome } from "./ui/home.js";
import { renderMatch, patchDraft } from "./ui/match.js";
import { renderResult, renderGauntletAdvance } from "./ui/result.js";

/** Index of the first opponent in a Gauntlet run — the Dummy is a tutorial, not a rung. */
const GAUNTLET_START = 1;

let career = null;
let match = null;
let selectedLane = 0;

/* ------------------------------------------------------------- flow ------ */

function startMatch(botIndex, options = {}) {
  match = createMatch(botIndex, options);
  selectedLane = 0;
  showScreen("screen-match");
  renderMatch(match, selectedLane);
}

function goHome() {
  match = null;
  showScreen("screen-home");
  renderHome(career);
}

function onPrimary() {
  if (match.phase === "commit") commitRound(match);
  else if (match.phase === "reveal") advanceRound(match);
  else return finishMatch();
  renderMatch(match, selectedLane);
}

async function finishMatch() {
  const won = playerWon(match);
  const read = readability(match.history);

  if (won) {
    career.cleared[match.bot.id] = true;
    career.unlocked = Math.max(career.unlocked, Math.min(ROSTER.length, match.botIndex + 2));
  }
  career.matches.push({
    opponent: match.bot.id,
    won,
    readability: read === null ? null : Math.round(read * 100),
  });

  const runContinues = match.gauntlet && won && match.botIndex + 1 < ROSTER.length;
  if (match.gauntlet && won) {
    career.bestGauntlet = Math.max(career.bestGauntlet, match.cleared + 1);
  }
  await saveCareer(career);

  showScreen("screen-result");
  if (runContinues) {
    const carry = { cleared: match.cleared + 1, history: match.history };
    const from = match;
    renderGauntletAdvance(from, carry.cleared, {
      onContinue: () => startMatch(from.botIndex + 1, { gauntlet: true, carry }),
      onBank: goHome,
    });
    return;
  }

  const finished = match;
  renderResult(finished, won, {
    onAgain: () => (finished.gauntlet
      ? startMatch(GAUNTLET_START, { gauntlet: true })
      : startMatch(finished.botIndex)),
    onHome: goHome,
  });
}

/* ------------------------------------------------------------ input ------ */

function adjustLane(lane, delta) {
  if (match.phase !== "commit") return;
  const applied = setDraftLane(match, lane, match.draft[lane] + delta);
  selectedLane = lane;

  const slider = byId("lanes").querySelector(`input[data-range="${lane}"]`);
  if (slider) slider.value = applied;
  patchDraft(match, selectedLane);
}

function wireEvents() {
  byId("roster").addEventListener("click", (e) => {
    const card = e.target.closest(".opponent-card");
    if (card && !card.disabled) startMatch(Number(card.dataset.index));
  });

  byId("btn-single").onclick = () =>
    byId("roster").scrollIntoView({ behavior: "smooth", block: "start" });
  byId("btn-gauntlet").onclick = () => startMatch(GAUNTLET_START, { gauntlet: true });

  byId("lanes").addEventListener("click", (e) => {
    const stepper = e.target.closest("button[data-delta]");
    if (stepper) return adjustLane(Number(stepper.dataset.lane), Number(stepper.dataset.delta));

    const lane = e.target.closest(".lane");
    if (lane) {
      selectedLane = Number(lane.dataset.lane);
      patchDraft(match, selectedLane);
    }
  });

  // Patch rather than re-render: see patchDraft() for why.
  byId("lanes").addEventListener("input", (e) => {
    const slider = e.target.closest("input[data-range]");
    if (!slider) return;
    const lane = Number(slider.dataset.range);
    const applied = setDraftLane(match, lane, Number(slider.value));
    if (Number(slider.value) !== applied) slider.value = applied;
    selectedLane = lane;
    patchDraft(match, selectedLane);
  });

  byId("btn-primary").onclick = onPrimary;
  byId("btn-clear").onclick = () => {
    match.draft = new Array(LANES).fill(0);
    renderMatch(match, selectedLane);
  };
  byId("btn-quit").onclick = goHome;

  document.addEventListener("keydown", (e) => {
    if (!match || byId("screen-match").classList.contains("hidden")) return;

    if (e.key >= "1" && e.key <= String(LANES)) {
      selectedLane = Number(e.key) - 1;
      patchDraft(match, selectedLane);
    } else if (e.key === "ArrowUp") adjustLane(selectedLane, 1);
    else if (e.key === "ArrowDown") adjustLane(selectedLane, -1);
    else if (e.key === "Enter") onPrimary();
    else return;

    e.preventDefault();
  });
}

/* ------------------------------------------------------------- boot ------ */

(async function boot() {
  byId("target-points").textContent = TARGET;
  career = await loadCareer();
  wireEvents();
  goHome();
})();
