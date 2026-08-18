/** Match screen: the race to the target, the three lanes, and the supply meter. */

import { LANES, TARGET } from "../core/config.js";
import { sum } from "../core/util.js";
import { matchPointNeed, supplyRemaining } from "../core/engine.js";
import { byId } from "./dom.js";
import { renderDossier } from "./dossier.js";

export function renderMatch(match, selectedLane) {
  renderRace(match);
  renderLanes(match, selectedLane);
  renderSupply(match);

  byId("btn-primary").textContent =
    match.phase === "over" ? "See the file" : match.phase === "reveal" ? "Next round" : "Commit";
  byId("btn-clear").classList.toggle("hidden", match.phase !== "commit");
  byId("log").innerHTML = match.log.map((line) => `<div>${line}</div>`).join("");

  renderDossier(match.history);
}

/* ---------------------------------------------------------------- race ---- */

function renderRace(match) {
  const youNeed = matchPointNeed(match.you.score, match.values);
  const themNeed = matchPointNeed(match.them.score, match.values);

  byId("race").innerHTML = `
    <div class="race__head">
      <span class="race__round">Round ${match.round}</span>
      <span class="race__context">${match.bot.name} · board worth ${sum(match.values)} · first to ${TARGET}</span>
    </div>
    ${raceRow("you", "You", match.you.score)}
    ${raceRow("them", "Them", match.them.score)}
    ${match.phase === "over" ? "" : matchPointBanner(youNeed, themNeed)}
    ${match.gauntlet
      ? `<div class="race__context" style="margin-top:8px">Gauntlet · ${match.cleared} cleared · they carry ${match.history.length} rounds of your file</div>`
      : ""}`;
}

function raceRow(side, label, score) {
  const tint = side === "you" ? "tint-you" : "tint-them";
  return `
    <div class="race__row">
      <span class="race__label ${tint}">${label}</span>
      <div class="race__track">
        <i class="race__fill race__fill--${side}" style="width:${Math.min(100, score / TARGET * 100)}%"></i>
      </div>
      <span class="race__score num ${tint}">${score}</span>
      <span class="race__need num">${score >= TARGET ? "—" : `${TARGET - score} to win`}</span>
    </div>`;
}

function matchPointBanner(youNeed, themNeed) {
  if (youNeed !== null && themNeed !== null) {
    return `<div class="matchpoint matchpoint--both">Match point both ways · you win on ${youNeed}, they win on ${themNeed}</div>`;
  }
  if (youNeed !== null) {
    return `<div class="matchpoint matchpoint--you">Match point · take ${youNeed} points this round and it's over</div>`;
  }
  if (themNeed !== null) {
    return `<div class="matchpoint matchpoint--them">Match point against you · they win on ${themNeed} points this round</div>`;
  }
  return "";
}

/* --------------------------------------------------------------- lanes ---- */

function renderLanes(match, selectedLane) {
  const revealed = match.phase !== "commit";
  const remaining = supplyRemaining(match);

  byId("lanes").innerHTML = Array.from({ length: LANES }, (_, i) => {
    const winner = revealed ? match.reveal.winners[i] : null;
    const classes = [
      "lane",
      revealed ? "lane--revealed" : "",
      selectedLane === i && !revealed ? "lane--selected" : "",
      winner === "you" ? "lane--won-you" : winner === "them" ? "lane--won-them" : "",
    ].filter(Boolean).join(" ");

    return `
      <div class="${classes}" data-lane="${i}">
        <div class="lane__head">
          <span class="lane__label">Lane ${i + 1}</span>
          <span class="lane__value num">${match.values[i]}</span>
        </div>
        <div class="pips">${pips(match.values[i])}</div>
        <div class="lane__commit num">${revealed ? match.reveal.you[i] : match.draft[i]}</div>
        <div class="lane__opponent num">${revealed ? match.reveal.them[i] : ""}</div>
        ${revealed ? "" : laneControls(i, match, remaining)}
      </div>`;
  }).join("");
}

const pips = (value) =>
  [1, 2, 3].map((p) => `<span class="pip ${p <= value ? "pip--on" : ""}"></span>`).join("");

function laneControls(lane, match, remaining) {
  return `
    <input type="range" min="0" max="${match.you.bank}" value="${match.draft[lane]}"
           data-range="${lane}" aria-label="Commit to lane ${lane + 1}">
    <div class="stepper">
      <button data-delta="-1" data-lane="${lane}" ${match.draft[lane] <= 0 ? "disabled" : ""}>−</button>
      <button data-delta="1" data-lane="${lane}" ${remaining <= 0 ? "disabled" : ""}>+</button>
    </div>`;
}

/* -------------------------------------------------------------- supply ---- */

function renderSupply(match) {
  const revealed = match.phase !== "commit";
  const remaining = revealed ? match.you.bank : supplyRemaining(match);
  const total = match.you.bank + (revealed ? sum(match.reveal.you) : 0);

  byId("supply-left").textContent = remaining;
  byId("supply-total").textContent = total;
  byId("supply-bar").style.width = `${match.you.bank ? remaining / match.you.bank * 100 : 0}%`;
  byId("opponent-supply").innerHTML =
    `<span class="tint-them">Their supply <b class="num">${match.them.bank}</b></span>`;
}

/**
 * Update only the numbers that change while the player drags a slider.
 *
 * A full re-render here would tear the range input out of the DOM mid-drag and
 * drop the pointer capture, which silently breaks dragging. Do not replace this
 * with renderMatch().
 */
export function patchDraft(match, selectedLane) {
  const remaining = supplyRemaining(match);

  byId("lanes").querySelectorAll(".lane").forEach((el, i) => {
    el.querySelector(".lane__commit").textContent = match.draft[i];
    el.classList.toggle("lane--selected", selectedLane === i);

    const steppers = el.querySelectorAll(".stepper button");
    if (steppers.length) {
      steppers[0].disabled = match.draft[i] <= 0;
      steppers[1].disabled = remaining <= 0;
    }
  });

  byId("supply-left").textContent = remaining;
  byId("supply-bar").style.width = `${match.you.bank ? remaining / match.you.bank * 100 : 0}%`;
}
