/** Home screen: opponent roster and career summary. */

import { ROSTER } from "../core/opponents.js";
import { byId } from "./dom.js";

export function renderHome(career) {
  renderRoster(career);
  renderCareer(career);
}

function renderRoster(career) {
  byId("roster").innerHTML = ROSTER.map((opponent, index) => {
    const locked = index >= career.unlocked;
    return `
      <button class="opponent-card" data-index="${index}" ${locked ? "disabled" : ""}>
        ${career.cleared[opponent.id] ? '<span class="opponent-card__cleared">CLEARED</span>' : ""}
        <div class="opponent-card__tier">${opponent.tier}</div>
        <div class="opponent-card__name">${locked ? "Sealed" : opponent.name}</div>
        <p class="opponent-card__desc">${locked
          ? "Beat the opponent above to unseal this file."
          : opponent.description}</p>
      </button>`;
  }).join("");
}

function renderCareer(career) {
  const scored = career.matches.filter((m) => m.readability !== null).slice(-20);
  byId("career").innerHTML = `
    <div>
      <div class="eyebrow">Matches</div>
      <div class="career__value">${career.matches.length}</div>
    </div>
    <div>
      <div class="eyebrow">Best gauntlet</div>
      <div class="career__value">${career.bestGauntlet}</div>
    </div>
    <div>
      <div class="eyebrow">Last 20 · readability</div>
      ${sparkline(scored)}
    </div>`;
}

/** Readability trend. The dashed rule is chance, so the line's position relative
 *  to it is the whole message. */
function sparkline(matches) {
  if (matches.length < 2) {
    return '<span class="muted" style="font-size:13px">Play a few matches to plot your readability.</span>';
  }
  const chanceY = 46 - 0.333 * 44 - 1;
  const points = matches
    .map((m, i) => `${i / (matches.length - 1) * 198 + 1},${46 - m.readability / 100 * 44 - 1}`)
    .join(" ");
  return `
    <svg class="spark" width="200" height="46" viewBox="0 0 200 46" role="img"
         aria-label="Readability across recent matches">
      <line x1="0" y1="${chanceY}" x2="200" y2="${chanceY}" stroke="#2E3A45" stroke-dasharray="3 3"/>
      <polyline fill="none" stroke="#B04A3E" stroke-width="2" points="${points}"/>
    </svg>`;
}
