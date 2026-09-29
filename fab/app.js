"use strict";
// FaB pack opener UI. Generation lives in gen.js (window.FabGen), shared with tools/test.js.
(async function () {
  const G = window.FabGen;
  const SET_FILE = "iar.json", CONFIG_FILE = "iar.config.json";
  // Card images: local copy first, LSS's public bucket second, text render last.
  const REMOTE_IMG = "https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/large/";

  const POOL_INFO = {
    B: ["Basic", "B"], C: ["Common", "C"], R: ["Rare", "R"], M: ["Majestic", "M"], X: ["Expansion slot", "M"],
    L: ["Legendary", "L"], F: ["Fabled", "F"], V: ["Marvel", "V"],
    RF_B: ["Rainbow foil basic", "B"], RF_C: ["Rainbow foil common", "C"], RF_R: ["Rainbow foil rare", "R"],
    RF_M: ["Rainbow foil majestic", "M"], RF_L: ["Legendary (rainbow)", "L"], RF_F: ["Fabled (rainbow)", "F"],
    CF_B: ["Cold foil basic", "B"], CF_C: ["Cold foil common", "C"], CF_R: ["Cold foil rare", "R"],
    CF_M: ["Cold foil majestic", "M"], CF_L: ["Cold foil legendary", "L"], CF_F: ["Cold foil fabled", "F"],
  };
  const POOL_ORDER = ["C", "B", "R", "M", "X", "F", "RF_B", "RF_C", "RF_R", "RF_M", "RF_L", "RF_F", "V",
    "CF_B", "CF_C", "CF_R", "CF_M", "CF_L", "CF_F"];
  const RARITY = { C: "Common", R: "Rare", S: "Super Rare", M: "Majestic", L: "Legendary", F: "Fabled", T: "Token", B: "Basic", V: "Marvel", P: "Promo" };
  const RAR_SHORT = { C: "COM", R: "RARE", S: "SR", M: "MAJ", L: "LEG", F: "FAB", T: "TOK", B: "BAS", V: "MRV", P: "PRO" };
  const FINISH = { S: "Standard", R: "Rainbow foil", C: "Cold foil", G: "Gold cold foil" };
  const ART = { EA: "Extended art", FA: "Full art", AA: "Alternate art" };
  const PITCH = { "1": "Red (1)", "2": "Yellow (2)", "3": "Blue (3)" };
  const HIT_RARITY = new Set(["R", "S", "M", "L", "F", "V"]);
  const BIG_RARITY = new Set(["M", "L", "F", "V"]);

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fab:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fab:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  let SET, DEFAULT_CONFIG;
  try {
    const [s, c] = await Promise.all([SET_FILE, CONFIG_FILE].map(f => fetch(f).then(r => {
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
      return r.json();
    })));
    SET = s; DEFAULT_CONFIG = c;
  } catch (e) {
    $("status").textContent = `Couldn't load the card data (${e.message}). Reload the page to try again.`;
    return;
  }

  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  let compiled = null;
  const state = { pack: [], packLabel: "", box: null, boxIdx: 0, boxNo: 0, looseNo: 0, seedUsed: "",
    session: {}, sessionPacks: 0, lastBox: null, sim: null, log: [], tab: "box", timers: [] };

  // ---------- Images ----------
  function imgTag(path) {
    if (!path) return "";
    const file = path.slice(path.lastIndexOf("/") + 1);
    return `<img src="${esc(path)}" data-remote="${esc(REMOTE_IMG + file)}" alt="" loading="lazy" decoding="async">`;
  }
  // Delegated error handler: step down the fallback chain.
  document.addEventListener("error", e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest(".face")) return;
    if (img.dataset.remote && img.src !== img.dataset.remote) { img.src = img.dataset.remote; return; }
    img.closest(".face").classList.remove("has-img");
    img.remove();
  }, true);

  // ---------- Config ----------
  function recompile() {
    try { compiled = G.compile(config, SET.pools); $("errors").hidden = true; }
    catch (e) {
      compiled = null;
      $("errorList").innerHTML = String(e.message).split("\n").map(m => `<li>${esc(m)}</li>`).join("");
      $("errors").hidden = false;
    }
    $("openPack").disabled = $("openBox").disabled = !compiled;
    state.sim = null;
    renderTally();
  }
  const pct = (w, tot) => tot > 0 && w > 0 ? (100 * w / tot).toFixed(w / tot < .01 ? 2 : 1) + "%" : "—";
  function renderOdds() {
    const ph = new Set(config.sourced.placeholders);
    const blocks = [...config.slots.map(o => ({ kind: "slot", o })), ...config.boxGuarantees.map(o => ({ kind: "g", o }))];
    $("slotgrid").innerHTML = blocks.map(({ kind, o }, bi) => {
      const entries = Object.entries(o.pools);
      const tot = entries.reduce((a, [, w]) => a + (w > 0 ? w : 0), 0);
      const fixed = entries.length === 1;
      const sub = kind === "slot" ? `${o.count} per pack` : `${o.perBox} per box, replaces ${config.slots.find(s => s.name === o.replacesSlot)?.label || o.replacesSlot}`;
      return `<div class="slotcard"><header><h3>${esc(o.label)} <span class="note">· ${esc(sub)}</span></h3>
        <span class="badge ${ph.has(o.name) ? "ph" : "src"}">${ph.has(o.name) ? "Placeholder" : "Published"}</span></header>
        ${entries.map(([k, w]) => `<div class="wrow"><label for="w-${bi}-${k}">${esc(POOL_INFO[k]?.[0] || k)} <span class="mono note">(${SET.pools[k]?.length ?? 0})</span></label>
          <input type="number" min="0" step="0.001" id="w-${bi}-${k}" data-b="${bi}" data-k="${k}" value="${w}" ${fixed ? "disabled" : ""}>
          <span class="pct">${pct(w, tot)}</span></div>`).join("")}</div>`;
    }).join("");
    $("slotgrid").querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => {
      const b = blocks[+inp.dataset.b].o;
      b.pools[inp.dataset.k] = inp.value.trim() === "" ? NaN : Number(inp.value);
      recompile();
      const tot = Object.values(b.pools).reduce((a, w) => a + (w > 0 ? w : 0), 0);
      inp.closest(".slotcard").querySelectorAll("input").forEach(i2 =>
        i2.parentElement.querySelector(".pct").textContent = pct(b.pools[i2.dataset.k], tot));
      store.set("weights:" + config.set, { slots: config.slots.map(s => s.pools), g: config.boxGuarantees.map(g => g.pools) });
    }));
    $("srcnote").textContent = "Published: " + config.sourced.structure +
      " Placeholder weights are not from Legend Story Studios, so treat any rate they produce as illustrative.";
  }

  // ---------- Cards ----------
  const slotLabel = name => config.slots.find(s => s.name === name)?.label || name;
  function faceHTML(c, back) {
    const f = back ? { ...c, ...back, pw: "", d: "", c: "", hp: "" } : c;
    const tag = c.f === "R" ? "Rainbow" : (c.f === "C" || c.f === "G") ? "Cold" : "";
    return `<div class="face f-${c.f}${f.img ? " has-img" : ""}" data-pitch="${esc(f.p || "")}">
      ${imgTag(f.img)}
      <div class="text-render" aria-hidden="true">
        <div class="pitchbar"></div><div class="fname">${esc(f.n)}</div><div class="art">${esc(c.id)}</div>
        <div class="ftype">${esc(f.t)}</div>
        <div class="fstats"><span>${f.pw !== "" ? "P " + esc(f.pw) : (f.hp ? "Life " + esc(f.hp) : "")}</span><span>${RAR_SHORT[c.r]}</span><span>${f.d !== "" ? "D " + esc(f.d) : ""}</span></div>
        ${f.c !== "" ? `<span class="cost">${esc(f.c)}</span>` : ""}
      </div>
      ${tag ? `<span class="ftag">${tag}</span>` : ""}
    </div>`;
  }
  function cardHTML(entry, i, opts = {}) {
    const c = SET.cards[entry.card];
    const hit = BIG_RARITY.has(c.r) || entry.guarantee ? " hit" : "";
    return `<button class="card${hit}${opts.up ? " up" : ""}" data-i="${i}" ${opts.up ? 'tabindex="-1"' : ""} aria-label="${opts.up ? esc(c.n) : `Face-down card ${i + 1}, ${esc(slotLabel(entry.slot))} slot`}">
      <div class="inner">${faceHTML(c, opts.back ? c.back : null)}<div class="back"><span>FAB</span></div></div></button>`;
  }
  function renderPack() {
    state.timers.forEach(clearTimeout); state.timers = [];
    $("spread").innerHTML = state.pack.map((e, i) => {
      const c = SET.cards[e.card];
      return `<div class="slot${BIG_RARITY.has(c.r) || e.guarantee ? " is-hit" : ""}">${cardHTML(e, i)}<span class="slotlabel">${esc(e.guarantee ? "Cold foil" : slotLabel(e.slot))}</span></div>`;
    }).join("");
    $("spread").querySelectorAll(".card").forEach(el => el.addEventListener("click", () => {
      const i = +el.dataset.i;
      el.classList.contains("up") ? showDetail(state.pack[i]) : flip(el, i);
    }));
  }
  function flip(el, i) {
    if (el.classList.contains("up")) return;
    el.classList.add("up");
    const c = SET.cards[state.pack[i].card];
    el.setAttribute("aria-label", `${c.n}, ${RARITY[c.r]}, ${FINISH[c.f]}. Open details`);
  }
  function revealAll() {
    let t = 0;
    [...$("spread").querySelectorAll(".card:not(.up)")].forEach(el => {
      t += el.classList.contains("hit") ? 450 : 70;
      state.timers.push(setTimeout(() => flip(el, +el.dataset.i), t));
    });
  }

  // ---------- Opening ----------
  const seedFor = () => $("seed").value.trim() || G.randomSeed();
  function record(pack, where) {
    state.sessionPacks++;
    for (const e of pack) {
      state.session[e.pool] = (state.session[e.pool] || 0) + 1;
      const c = SET.cards[e.card];
      if (HIT_RARITY.has(c.r) || c.f !== "S") state.log.unshift({ ...e, where });
    }
    if (state.log.length > 300) state.log.length = 300;
    renderLog();
  }
  function openPack() {
    if (!compiled) return;
    if (state.box && state.boxIdx < state.box.length - 1) { nextBoxPack(); return; }
    state.box = null;
    state.seedUsed = seedFor();
    state.looseNo++;
    state.pack = G.generateLoosePack(compiled, G.rngFromSeed("pack:" + state.seedUsed));
    state.packLabel = `Loose pack ${state.looseNo}`;
    record(state.pack, state.packLabel);
    renderPack(); renderStatus(); renderTally();
  }
  function openBox() {
    if (!compiled) return;
    state.seedUsed = seedFor();
    state.boxNo++;
    state.box = G.generateBox(compiled, G.rngFromSeed("box:" + state.seedUsed));
    const counts = {};
    state.box.forEach(p => p.forEach(e => counts[e.pool] = (counts[e.pool] || 0) + 1));
    state.lastBox = { counts, no: state.boxNo, seed: state.seedUsed };
    if ($("stepBox").checked) {
      state.boxIdx = 0; state.pack = state.box[0];
      record(state.pack, `Box ${state.boxNo} · pack 1`);
      renderPack();
    } else {
      state.box.forEach((p, i) => record(p, `Box ${state.boxNo} · pack ${i + 1}`));
      state.boxIdx = state.box.length - 1; state.pack = state.box[state.boxIdx];
      renderPack(); revealAll();
    }
    state.tab = "box"; renderStatus(); renderTally();
  }
  function nextBoxPack() {
    if (!state.box || state.boxIdx >= state.box.length - 1) return;
    state.boxIdx++; state.pack = state.box[state.boxIdx];
    record(state.pack, `Box ${state.boxNo} · pack ${state.boxIdx + 1}`);
    renderPack(); renderStatus();
  }
  function skipBox() {
    if (!state.box) return;
    while (state.boxIdx < state.box.length - 1) {
      state.boxIdx++;
      record(state.box[state.boxIdx], `Box ${state.boxNo} · pack ${state.boxIdx + 1}`);
    }
    state.pack = state.box[state.boxIdx];
    renderPack(); revealAll(); renderStatus();
  }
  function renderStatus() {
    const s = $("status");
    if (!state.pack.length) { s.innerHTML = `<span>Press <strong>Open pack</strong> or <strong>Space</strong> to start. Click a card to flip it, then click again for details.</span>`; return; }
    let html = state.box ? `<strong>Box ${state.boxNo} · pack ${state.boxIdx + 1} of ${state.box.length}</strong>` : `<strong>${esc(state.packLabel)}</strong>`;
    html += `<span class="seedchip">seed <b>${esc(state.seedUsed)}</b><button id="copySeed" type="button">Copy</button></span>`;
    if (state.box && state.boxIdx < state.box.length - 1)
      html += `<button class="btn-secondary" id="nextPack">Next pack</button><button class="btn-secondary" id="skipBox">Skip to summary</button>`;
    else if (state.box) html += `<span>Box finished. The tally compares it with the configured odds.</span>`;
    s.innerHTML = html;
    $("copySeed").addEventListener("click", async e => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(state.seedUsed); b.textContent = "Copied"; }
      catch { $("seed").value = state.seedUsed; $("seed").select(); b.textContent = "In seed field"; }
    });
    $("nextPack")?.addEventListener("click", nextBoxPack);
    $("skipBox")?.addEventListener("click", skipBox);
  }

  // ---------- Tally ----------
  function renderTally() {
    for (const t of ["box", "session", "sim"]) $("tab" + t[0].toUpperCase() + t.slice(1)).setAttribute("aria-selected", String(state.tab === t));
    const tbl = $("tally"), note = $("tallyNote");
    if (!compiled) { tbl.innerHTML = ""; note.textContent = "Fix the odds below to see expected counts."; return; }
    const perBox = G.expectedPerBox(compiled);
    let obs, scale, label;
    if (state.tab === "box") {
      if (!state.lastBox) { tbl.innerHTML = ""; note.textContent = "Open a box to compare its pulls with one box's expected counts."; return; }
      obs = state.lastBox.counts; scale = 1; label = `Box ${state.lastBox.no} (seed ${state.lastBox.seed}) against one box's expected counts.`;
    } else if (state.tab === "session") {
      if (!state.sessionPacks) { tbl.innerHTML = ""; note.textContent = "Nothing opened yet this session."; return; }
      obs = state.session; scale = state.sessionPacks / config.packsPerBox;
      label = `${state.sessionPacks} pack${state.sessionPacks === 1 ? "" : "s"} opened this session, against the expected count for that many packs.`;
    } else {
      if (!state.sim) {
        tbl.innerHTML = "";
        note.innerHTML = `<button class="btn-secondary" id="runSim">Simulate 10,000 boxes</button> Checks the generator against the odds. Takes about a second.`;
        $("runSim").addEventListener("click", runSim); return;
      }
      obs = state.sim.counts; scale = state.sim.boxes;
      label = `Average per box over ${state.sim.boxes.toLocaleString()} simulated boxes (${state.sim.ms} ms).`;
    }
    const perBoxMode = state.tab === "sim";
    const fmt = v => perBoxMode ? v.toFixed(3) : (Number.isInteger(v) ? v : v.toFixed(2));
    const rows = POOL_ORDER.filter(k => (perBox[k] || 0) > 0 || (obs[k] || 0) > 0).map(k => {
      const o = perBoxMode ? (obs[k] || 0) / scale : (obs[k] || 0);
      const e = (perBox[k] || 0) * (perBoxMode ? 1 : scale);
      const r = POOL_INFO[k]?.[1] || "C";
      return `<tr><td><span class="rar${BIG_RARITY.has(r) ? " big" : ""}">${RAR_SHORT[r]}</span>${esc(POOL_INFO[k]?.[0] || k)}</td>
        <td class="${!perBoxMode && o > e + 1e-9 ? "up" : ""}">${fmt(o)}</td><td>${fmt(e)}</td></tr>`;
    });
    tbl.innerHTML = `<thead><tr><th>Pull</th><th>${perBoxMode ? "Observed / box" : "Pulled"}</th><th>Expected</th></tr></thead><tbody>${rows.join("")}</tbody>`;
    note.textContent = label;
  }
  function runSim() {
    if (!compiled) return;
    const t0 = performance.now(), rng = G.rngFromSeed("sim:" + G.randomSeed()), counts = {}, boxes = 10000;
    for (let b = 0; b < boxes; b++) for (const p of G.generateBox(compiled, rng)) for (const e of p) counts[e.pool] = (counts[e.pool] || 0) + 1;
    state.sim = { counts, boxes, ms: Math.round(performance.now() - t0) };
    renderTally();
  }

  // ---------- Log & detail ----------
  function renderLog() {
    $("logCount").textContent = state.log.length ? `${state.log.length} hit${state.log.length === 1 ? "" : "s"}, newest first` : "";
    if (!state.log.length) { $("log").innerHTML = `<li class="empty">Rares, Majestics, Legendaries, Marvels and every foil land here.</li>`; return; }
    $("log").innerHTML = state.log.slice(0, 150).map((e, i) => {
      const c = SET.cards[e.card];
      return `<li><span class="rar${BIG_RARITY.has(c.r) ? " big" : ""}">${RAR_SHORT[c.r]}</span><button data-li="${i}"><span class="pdot" data-p="${esc(c.p)}"></span>${esc(c.n)}</button>
        <span class="meta">${esc(e.guarantee ? "Cold foil" : FINISH[c.f])}<br>${esc(e.where)}</span></li>`;
    }).join("");
    $("log").querySelectorAll("button[data-li]").forEach(b => b.addEventListener("click", () => showDetail(state.log[+b.dataset.li])));
  }
  let lastFocus = null;
  function showDetail(entry, showBack = false) {
    const c = SET.cards[entry.card];
    if (!showBack) lastFocus = document.activeElement;
    const f = showBack ? c.back : c;
    const rows = [["Printing", `<span class="mono">${esc(c.id)}</span>`]];
    if (!showBack) {
      rows.push(["Pitch", c.p ? PITCH[c.p] : "None"], ["Type", esc(c.t)], ["Rarity", RARITY[c.r]],
        ["Finish", FINISH[c.f] + (c.a ? " · " + c.a.map(a => ART[a] || a).join(", ") : "")],
        ["Slot", esc(entry.guarantee ? `Cold foil (in place of ${slotLabel(entry.slot)})` : slotLabel(entry.slot))]);
      if (c.c !== "") rows.push(["Cost", esc(c.c)]);
      if (c.pw !== "") rows.push(["Power", esc(c.pw)]);
      if (c.d !== "") rows.push(["Defense", esc(c.d)]);
      if (c.hp) rows.push(["Life", esc(c.hp)]);
    } else rows.push(["Type", esc(f.t)], ["Side", "Back face"]);
    $("dialog").innerHTML = `<div class="dcard">${cardHTML(entry, 0, { up: true, back: showBack })}</div>
      <div><h2 id="dName">${esc(f.n)}</h2><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>
      <div class="actions">${c.back ? `<button class="btn-secondary" id="flipDlg">Show ${showBack ? "front" : "back"}</button>` : ""}<button class="btn-primary" id="closeDlg">Close</button></div>`;
    $("scrim").hidden = false;
    $("closeDlg").addEventListener("click", closeDetail);
    $("flipDlg")?.addEventListener("click", () => showDetail(entry, !showBack));
    ($("flipDlg") || $("closeDlg")).focus();
  }
  function closeDetail() { $("scrim").hidden = true; lastFocus?.focus?.(); }
  $("scrim").addEventListener("click", e => { if (e.target === $("scrim")) closeDetail(); });

  // ---------- Wiring ----------
  $("openPack").addEventListener("click", openPack);
  $("openBox").addEventListener("click", openBox);
  $("revealAll").addEventListener("click", revealAll);
  $("tabBox").addEventListener("click", () => { state.tab = "box"; renderTally(); });
  $("tabSession").addEventListener("click", () => { state.tab = "session"; renderTally(); });
  $("tabSim").addEventListener("click", () => { state.tab = "sim"; renderTally(); });
  $("resetOdds").addEventListener("click", () => { config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); store.set("weights:" + config.set, null); renderOdds(); recompile(); });
  $("seed").addEventListener("change", () => store.set("seed", $("seed").value.trim()));
  $("stepBox").addEventListener("change", () => store.set("stepBox", $("stepBox").checked));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("scrim").hidden) { closeDetail(); return; }
    if (!$("scrim").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, summary")) return;
    // Space is the next-pack shortcut even when a toolbar button has focus; Enter still presses buttons.
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) openPack(); return; }
    if (e.target.closest("button")) return;
    if (e.key === "r" || e.key === "R") { e.preventDefault(); revealAll(); }
  });

  $("seed").value = store.get("seed", "") || "";
  $("stepBox").checked = store.get("stepBox", true);
  const saved = store.get("weights:" + config.set, null);
  if (saved && Array.isArray(saved.slots) && saved.slots.length === config.slots.length) {
    saved.slots.forEach((p, i) => { if (p && typeof p === "object") config.slots[i].pools = p; });
    (saved.g || []).forEach((p, i) => { if (p && config.boxGuarantees[i]) config.boxGuarantees[i].pools = p; });
  }
  $("commit").textContent = "commit " + SET.sourceCommit.slice(0, 10);
  $("setName").textContent = config.setName;
  $("setLabel").textContent = `Flesh and Blood · ${config.set} · ${config.packSize} cards, ${config.packsPerBox} packs`;
  renderOdds(); recompile(); renderLog();
  // Open with a sample pack, face up, so the first view shows what the tool does.
  if (compiled) { openPack(); $("spread").querySelectorAll(".card").forEach((el, i) => flip(el, i)); }
  renderStatus();
})();
