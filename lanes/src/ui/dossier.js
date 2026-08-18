/**
 * The dossier: the opponent's file on the player, rendered live.
 *
 * This is the signature element. It deliberately shows the same model the
 * opponent is acting on — if a finding appears here, an opponent with the
 * matching conditioning dimension is already using it.
 */

import { readability, economy, findings } from "../core/metrics.js";
import { byId } from "./dom.js";

export function renderDossier(history) {
  const read = readability(history);
  const percent = read === null ? null : Math.round(read * 100);
  const observed = findings(history);
  const eco = economy(history);

  byId("dossier").innerHTML = `
    <span class="eyebrow">Their file on you</span>
    <div class="dossier__subject">Subject: you · ${history.length} round${history.length === 1 ? "" : "s"} observed</div>

    <div class="readout">
      <div class="readout__value num">${percent === null ? "—" : `${percent}%`}</div>
      <div class="readout__caption">Readability · how often a naive model names the lane you'll back</div>
      <div class="meter">
        <i class="meter__fill" style="width:${percent ?? 0}%"></i>
        <span class="meter__chance"></span>
      </div>
      <div class="readout__caption num">chance = 33%</div>
    </div>

    <div class="readout readout--secondary">
      <div class="readout__value num">${eco ? `${eco.you.toFixed(2)}` : "—"}</div>
      <div class="readout__caption">Economy · points you take per supply committed${
        eco ? ` · ours is <span class="num">${eco.them.toFixed(2)}</span>` : ""}</div>
    </div>

    <ul class="findings">${renderFindings(observed)}</ul>`;
}

export function renderFindings(observed, emptyMessage = "Nothing conclusive yet. Keep playing and they'll find something.") {
  if (!observed.length) return `<li class="findings__empty">${emptyMessage}</li>`;
  return observed.map((finding) => `<li>${finding}</li>`).join("");
}
