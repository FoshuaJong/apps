"use strict";
// Shadow Throne Pack Opener — UI. Pack generation lives in gen.js (window.FabGen).
(async function () {
  const G = window.FabGen, S = window.Sfx, X = window.Fx;
  const SET_FILE = "iar.json", CONFIG_FILE = "iar.config.json";
  const REMOTE_IMG = "https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/large/";

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- load data ----------
  let SET, DEFAULT_CONFIG;
  try {
    [SET, DEFAULT_CONFIG] = await Promise.all([SET_FILE, CONFIG_FILE].map(f => fetch(f).then(r => {
      if (!r.ok) throw new Error(`${f} returned HTTP ${r.status}`);
      return r.json();
    })));
  } catch (e) {
    $("loadMsg").textContent = `Couldn't load the card data (${e.message}). Reload the page to try again.`;
    return;
  }
  const CARDS = SET.cards;
  const KEY_INDEX = new Map(CARDS.map((c, i) => [c.k, i]));
  // Printings a booster can actually produce (pools with weight in the default config). Promo-only
  // printings (see config.notInBoosters) are left out of the binder's completion counts.
  const POOLED = new Set([...DEFAULT_CONFIG.slots, ...(DEFAULT_CONFIG.boxGuarantees || [])]
    .flatMap(s => Object.entries(s.pools).filter(([, w]) => w > 0).flatMap(([k]) => SET.pools[k] || [])));

  // ---------- storage (per viewer, best effort) ----------
  const NS = `fabsim:v2:${SET.set}:`;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(NS + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* full or blocked */ } },
    del(k) { try { localStorage.removeItem(NS + k); } catch { /* ignore */ } },
  };
  const DEFAULT_SETTINGS = { speed: "cinematic", style: "stack", autoCommons: true, volume: 0.7, muted: false, tilt: true, particles: true, ambient: true, gyro: false };
  const settings = Object.assign({}, DEFAULT_SETTINGS, store.get("settings", {}));
  let collection = store.get("collection", {});
  let stats = Object.assign(newStats(), store.get("stats", {}));
  let history = store.get("history", []);
  let ach = store.get("ach", {});
  function newStats() { return { packs: 0, boxes: 0, cases: 0, cards: 0, tiers: {}, since: {}, boxScores: [], best: null }; }
  const saveSettings = () => store.set("settings", settings);
  const saveProgress = () => { store.set("collection", collection); store.set("stats", stats); store.set("history", history); store.set("ach", ach); };

  // ---------- config / odds ----------
  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const savedW = store.get("weights", null);
  if (savedW && Array.isArray(savedW.slots) && savedW.slots.length === config.slots.length) {
    savedW.slots.forEach((p, i) => { if (p && typeof p === "object") config.slots[i].pools = p; });
    (savedW.g || []).forEach((p, i) => { if (p && config.boxGuarantees[i]) config.boxGuarantees[i].pools = p; });
  }
  let compiled = null, configError = "", luckCache = null;
  function recompile() {
    try { compiled = G.compile(config, SET.pools); configError = ""; }
    catch (e) { compiled = null; configError = e.message; }
    luckCache = null;
  }
  recompile();
  if (!compiled) { config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); store.del("weights"); recompile(); }
  const REVEAL_ORDER = config.revealOrder || config.slots.map(s => s.name);
  const PACKS_PER_BOX = config.packsPerBox, BOXES_PER_CASE = config.boxesPerCase || 4;

  // ---------- tiers ----------
  const TIERS = {
    common:    { rank: 0, label: "Common",       color: "#a79bb3", sound: "deal" },
    rare:      { rank: 1, label: "Rare",         color: "#6aa0ff", sound: "rare" },
    foil:      { rank: 2, label: "Rainbow foil", color: "#5fe0c5", sound: "foil" },
    majestic:  { rank: 3, label: "Majestic",     color: "#ff5d72", sound: "majestic", spot: true, tell: true },
    cold:      { rank: 4, label: "Cold foil",    color: "#a8e1ff", sound: "cold", spot: true, tell: true },
    marvel:    { rank: 5, label: "Marvel",       color: "#b995ff", sound: "marvel", spot: true, tell: true, charge: 0.7 },
    legendary: { rank: 6, label: "Legendary",    color: "#f0c35a", sound: "legendary", spot: true, tell: true, charge: 1.0 },
    fabled:    { rank: 7, label: "Fabled",       color: "#ff9a5a", sound: "fabled", spot: true, tell: true, charge: 1.6 },
  };
  const TRACKED = ["majestic", "cold", "marvel", "legendary", "fabled"];
  function tierOfCard(c, guarantee) {
    if (c.r === "F") return "fabled";
    if (c.r === "V") return "marvel";
    if (c.r === "L") return "legendary";
    if (guarantee || c.f === "C" || c.f === "G") return "cold";
    if (c.r === "M") return "majestic";
    if (c.f === "R") return "foil";
    if (c.r === "R" || c.r === "S") return "rare";
    return "common";
  }
  const tierOf = e => tierOfCard(CARDS[e.card], e.guarantee);
  function poolTier(pool) {
    if (pool === "F" || pool.endsWith("_F")) return "fabled";
    if (pool === "V") return "marvel";
    if (pool.endsWith("_L")) return "legendary";
    if (pool.startsWith("CF_")) return "cold";
    if (pool === "M" || pool === "X" || pool === "RF_M") return "majestic";
    if (pool.startsWith("RF_")) return "foil";
    if (pool === "R") return "rare";
    return "common";
  }
  const RARITY = { C: "Common", R: "Rare", S: "Super Rare", M: "Majestic", L: "Legendary", F: "Fabled", T: "Token", B: "Basic", V: "Marvel", P: "Promo" };
  const FINISH = { S: "Standard", R: "Rainbow foil", C: "Cold foil", G: "Gold cold foil" };
  const ART = { EA: "Extended art", FA: "Full art", AA: "Alternate art" };
  const PITCH = { "1": "Red", "2": "Yellow", "3": "Blue" };

  // ---------- generated textures ----------
  (function makeTextures() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 160;
    const g = cv.getContext("2d");
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 160, y = Math.random() * 160, r = Math.random() < 0.9 ? 0.6 + Math.random() * 0.8 : 1.6;
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    document.documentElement.style.setProperty("--sparkle-img", `url(${cv.toDataURL()})`);
    const throne = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 80'><path fill-rule='evenodd' d='M18 40V14l4-8 4 8v-4l6-8 6 8v4l4-8 4 8v26z M26 38V23q6-9 12 0v15z M10 31h8v9h-8z M46 31h8v9h-8z M11 40h42v7H11z M14 47h6v29h-6z M44 47h6v29h-6z M20 61h24v4H20z'/></svg>`;
    document.documentElement.style.setProperty("--throne-mask", `url("data:image/svg+xml,${encodeURIComponent(throne)}")`);
  })();

  // ---------- speed ----------
  const SPEED = { cinematic: 1, quick: 0.45, instant: 0 };
  const spd = () => (reducedMotion.matches ? 0.25 : SPEED[settings.speed] ?? 1);
  const wait = ms => sleep(ms * spd());
  function applySpeed() { document.documentElement.style.setProperty("--spd", Math.max(0.05, spd())); }

  // ---------- state ----------
  const state = {
    mode: "pack", view: "loading",
    pack: null,          // { entries, label, seed, box, idx, readOnly }
    revealed: 0, busy: false, spot: null, autoTimer: 0, held: null,
    looseNo: store.get("looseNo", 0),
    box: null, cse: null,
  };

  // ---------- card markup ----------
  function imgTag(path, alt) {
    if (!path) return "";
    const file = path.slice(path.lastIndexOf("/") + 1);
    return `<img src="${esc(path)}" data-remote="${esc(REMOTE_IMG + file)}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false">`;
  }
  function faceHTML(c, back) {
    const f = back ? { ...c, ...back } : c;
    return `<div class="c3-face" data-pitch="${esc(back ? "" : c.p)}">${imgTag(f.img, f.n)}
      <div class="c3-text" aria-hidden="true"><div class="n">${esc(f.n)}</div><div class="id">${esc(c.id)}</div><div class="t">${esc(f.t)}</div></div>
      <div class="c3-shine"></div><div class="c3-glare"></div></div>`;
  }
  // Face-down side: double-faced cards show their own back image (local copy over the LSS copy);
  // everything else shows the Flesh and Blood card back (img/cardback.*) or the built-in fallback design.
  function backHTML(c) {
    if (c.back && c.back.img) {
      const file = c.back.img.slice(c.back.img.lastIndexOf("/") + 1);
      return `<div class="c3-back own-back" style="background-image:url('${esc(c.back.img)}'),url('${esc(REMOTE_IMG + file)}')"></div>`;
    }
    return `<div class="c3-back"><svg aria-hidden="true"><use href="#i-throne"/></svg></div>`;
  }
  function cardHTML(entry, o = {}) {
    const c = CARDS[entry.card], tier = o.tier || tierOf(entry);
    const t = TIERS[tier];
    const tag = o.tag && t.rank >= 1 ? `<span class="tag">${esc(entry.guarantee && tier === "cold" ? "Cold foil" : t.label)}</span>` : "";
    const label = o.up ? `${c.n}, ${t.label}${c.f !== "S" ? ", " + FINISH[c.f] : ""}` : "Face-down card";
    return `<button class="c3 tiltable f-${c.f} r-${c.r}${o.up ? " up" : ""}${o.cls ? " " + o.cls : ""}" data-tier="${tier}" ${o.tell && t.tell ? `data-tell="${tier}"` : ""} data-card="${entry.card}" ${o.attrs || ""} aria-label="${esc(label)}">
      <div class="c3-tilt"><div class="c3-flip">${faceHTML(c, o.back ? c.back : null)}${backHTML(c)}</div></div>${tag}</button>`;
  }
  // Turn a face-down card face-up with the keyframed flip.
  function flipUp(el) {
    if (!el || el.classList.contains("up")) return;
    el.classList.add("flipping", "up");
    const done = () => el.classList.remove("flipping");
    el.querySelector(".c3-flip")?.addEventListener("animationend", done, { once: true });
    setTimeout(done, 700 * Math.max(spd(), 0.05) + 60);
  }
  // image fallback chain: local -> LSS bucket -> text render
  document.addEventListener("error", e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest(".c3-face")) return;
    if (img.dataset.remote && img.src !== img.dataset.remote) { img.src = img.dataset.remote; return; }
    img.closest(".c3-face").classList.add("noimg"); img.remove();
  }, true);
  function preload(entries) {
    return Promise.all(entries.map(e => new Promise(res => {
      const c = CARDS[e.card]; if (!c.img) return res();
      const im = new Image(); im.onload = im.onerror = () => res(); im.src = c.img;
    })));
  }

  // ---------- tilt & holo ----------
  let tiltEl = null, tiltRaf = 0, tiltEv = null;
  function tiltTo(el, px, py, active) {
    const strength = el.closest(".spot, .modal") ? 16 : 11;
    el.style.setProperty("--rx", `${((0.5 - py) * strength).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((px - 0.5) * strength * 1.2).toFixed(2)}deg`);
    el.style.setProperty("--px", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--py", `${(py * 100).toFixed(1)}%`);
    el.style.setProperty("--pa", active ? 1 : 0);
  }
  function tiltReset(el) {
    el.classList.remove("tilting");
    ["--rx", "--ry", "--px", "--py", "--pa"].forEach(p => el.style.removeProperty(p));
  }
  document.addEventListener("pointermove", e => {
    if (!settings.tilt || e.pointerType === "touch" && !e.target.closest(".spot, .modal")) return;
    tiltEv = e;
    if (tiltRaf) return;
    tiltRaf = requestAnimationFrame(() => {
      tiltRaf = 0;
      const ev = tiltEv, el = ev.target.closest?.(".c3.tiltable.up, .pack");
      if (tiltEl && tiltEl !== el) tiltReset(tiltEl);
      tiltEl = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = clamp((ev.clientX - r.left) / r.width, 0, 1), py = clamp((ev.clientY - r.top) / r.height, 0, 1);
      if (el.classList.contains("pack")) {
        el.style.setProperty("--px", (px * 100).toFixed(1));
        el.style.setProperty("--rx", `${((0.5 - py) * 10).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${((px - 0.5) * 14).toFixed(2)}deg`);
        return;
      }
      el.classList.add("tilting");
      tiltTo(el, px, py, true);
    });
  }, { passive: true });
  document.addEventListener("pointerleave", () => { if (tiltEl) { tiltReset(tiltEl); tiltEl = null; } });
  let gyroOn = false;
  function onGyro(e) {
    const el = document.querySelector(".spot .c3.up, .modal .c3.up");
    if (!el || e.beta == null) return;
    tiltTo(el, clamp(0.5 + (e.gamma || 0) / 60, 0, 1), clamp(0.5 + ((e.beta || 0) - 45) / 60, 0, 1), true);
  }
  async function setGyro(on) {
    if (on && !gyroOn) {
      try {
        if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
          const r = await DeviceOrientationEvent.requestPermission(); if (r !== "granted") throw new Error("denied");
        }
        addEventListener("deviceorientation", onGyro); gyroOn = true;
      } catch { settings.gyro = false; saveSettings(); toast("Motion tilt is off", "Your browser didn't allow motion access."); }
    } else if (!on && gyroOn) { removeEventListener("deviceorientation", onGyro); gyroOn = false; }
  }

  // ---------- small UI utilities ----------
  function announce(msg) { const l = $("live"); l.textContent = ""; setTimeout(() => (l.textContent = msg), 30); }
  function toast(title, sub, ico = "★") {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="ico">${esc(ico)}</span><b>${esc(title)}</b><small>${esc(sub || "")}</small>`;
    $("toasts").appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 4200);
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg || "Copied", text.length > 60 ? text.slice(0, 60) + "…" : text, "⧉"); }
    catch { prompt("Copy this:", text); }
  }
  const newSeed = () => G.randomSeed();
  const typedSeed = () => $("seed").value.trim();

  // ---------- pack / box / case construction ----------
  function orderEntries(entries) {
    const rank = new Map(REVEAL_ORDER.map((n, i) => [n, i]));
    return entries.map((e, i) => ({ ...e, _i: i })).sort((a, b) => (rank.get(a.slot) ?? 99) - (rank.get(b.slot) ?? 99) || a._i - b._i);
  }
  function makeBox(seed, label) {
    const packs = G.generateBox(compiled, G.rngFromSeed(label.startsWith("Case") ? seed : "box:" + seed)).map(orderEntries);
    return { seed, label, packs, opened: packs.map(() => false), counted: false };
  }
  function boxFromCase(cseSeed, i) {
    const b = makeBox(`case:${cseSeed}:${i}`, `Case box ${i + 1}`);
    b.seed = cseSeed; b.caseIdx = i; return b;
  }
  function saveResume() {
    if (state.box && state.box.caseIdx == null) store.set("boxResume", { seed: state.box.seed, opened: state.box.opened });
    if (state.cse) store.set("caseResume", { seed: state.cse.seed, opened: state.cse.boxes.map(b => b.opened), active: state.cse.active });
  }
  function restoreOpened(box, opened) { if (Array.isArray(opened)) opened.forEach((v, i) => { if (v && i < box.opened.length) box.opened[i] = true; }); }

  // ---------- commit a pack to collection/stats/history ----------
  function commitPack(pack) {
    const tiersHere = new Set();
    for (const e of pack.entries) {
      const c = CARDS[e.card], t = tierOf(e);
      collection[c.k] = (collection[c.k] || 0) + 1;
      stats.tiers[t] = (stats.tiers[t] || 0) + 1;
      tiersHere.add(t);
    }
    stats.packs++; stats.cards += pack.entries.length;
    for (const t of TRACKED) stats.since[t] = tiersHere.has(t) ? 0 : (stats.since[t] || 0) + 1;
    const best = bestEntry(pack.entries);
    if (best) {
      const bt = tierOf(best);
      if (!stats.best || TIERS[bt].rank > TIERS[stats.best.tier].rank) stats.best = { tier: bt, k: CARDS[best.card].k, when: Date.now() };
    }
    history.unshift({ t: Date.now(), label: pack.label, seed: pack.seed, keys: pack.entries.map(e => CARDS[e.card].k + (e.guarantee ? "*" : "")) });
    if (history.length > 150) history.length = 150;
    if (pack.box) { pack.box.opened[pack.idx] = true; saveResume(); }
    saveProgress();
    $("binderPip").hidden = false;
  }
  function bestEntry(entries) {
    let best = null, br = -1;
    for (const e of entries) { const r = TIERS[tierOf(e)].rank; if (r > br) { br = r; best = e; } }
    return br >= 1 ? best : null;
  }

  // ---------- achievements ----------
  const ACH = [
    ["first_pack", "First rip", "Open your first pack"],
    ["first_majestic", "Crimson crown", "Pull a Majestic"],
    ["first_cold", "Cold open", "Pull a cold foil"],
    ["first_marvel", "Marvellous", "Pull a Marvel"],
    ["first_legendary", "Legend in the making", "Pull a Legendary"],
    ["first_fabled", "The stuff of fable", "Pull a Fabled"],
    ["double", "Double trouble", "Two Majestic-or-better hits in one pack"],
    ["box", "Full display", "Open every pack in a box"],
    ["case", "Case breaker", "Open all four boxes in a case"],
    ["packs100", "Century", "Open 100 packs"],
    ["set50", "Halfway to the throne", "Own half the set's card numbers"],
    ["set100", "Usurper", "Own every card number in the set"],
  ];
  function unlock(id) {
    if (ach[id]) return;
    ach[id] = Date.now(); store.set("ach", ach);
    const a = ACH.find(x => x[0] === id);
    if (a) { toast(a[1], a[2], "✦"); S.play("toast"); }
  }
  function checkPackAchievements(entries) {
    unlock("first_pack");
    if (entries.filter(e => TIERS[tierOf(e)].rank >= 3).length >= 2) unlock("double");
    if (stats.packs >= 100) unlock("packs100");
    const comp = completion();
    if (comp.numbers.have >= comp.numbers.total / 2) unlock("set50");
    if (comp.numbers.have >= comp.numbers.total) unlock("set100");
  }

  // ---------- celebrations ----------
  function celebrate(tier, el) {
    const t = TIERS[tier];
    S.play(t.sound);
    if (!settings.particles || spd() === 0 && tier !== "legendary" && tier !== "fabled") return;
    const [x, y] = el ? X.centerOf(el) : [innerWidth / 2, innerHeight / 2];
    const stage = $("stage");
    switch (tier) {
      case "rare": X.burst(x, y, { colors: ["#6aa0ff", "#cfe0ff"], count: 16, speed: 4, life: 40, size: 2 }); break;
      case "foil": X.burst(x, y, { colors: ["#ff7ab8", "#ffd86b", "#7dffc9", "#6bc3ff", "#b98bff"], count: 28, speed: 5, shape: "star", size: 3, life: 55, gravity: 0.05 }); break;
      case "majestic": X.ring(x, y, "#ff5d72"); X.burst(x, y, { colors: ["#ff5d72", "#ffb0bb", "#fff"], count: 90, speed: 9, size: 2.6, life: 80 }); break;
      case "cold": X.flash("rgba(168,225,255,.35)", 380); X.burst(x, y, { colors: ["#a8e1ff", "#e8f7ff", "#ffffff"], count: 70, speed: 10, shape: "shard", size: 4, life: 70, gravity: 0.08 }); break;
      case "marvel": X.godRays(x, y, "rgba(185,149,255,.9)"); X.confetti(x, y, ["#b995ff", "#ff7ab8", "#6bc3ff", "#ffffff"], 110); break;
      case "legendary":
        X.flash("rgba(240,195,90,.45)", 600); X.godRays(x, y, "rgba(240,195,90,.95)", { dur: 3200, count: 18 });
        X.confetti(x, y, ["#f0c35a", "#ffe29a", "#ffffff", "#c9952f"], 170); X.shake(stage, 1); break;
      case "fabled":
        X.flash("rgba(255,255,255,.8)", 900); X.godRays(x, y, "rgba(255,154,90,.95)", { dur: 4200, count: 20, len: 1.2 });
        setTimeout(() => X.godRays(x, y, "rgba(125,255,201,.7)", { dur: 3600, count: 12, len: 1.1 }), 250);
        X.confetti(x, y, ["#ff8a5a", "#ffd86b", "#7dffc9", "#6bc3ff", "#d38bff", "#fff"], 260); X.shake(stage, 1.7);
        setTimeout(() => X.burst(x, y, { colors: ["#fff", "#ffd86b"], count: 140, speed: 14, shape: "star", size: 4, life: 110, gravity: 0.06 }), 420);
        break;
    }
  }

  // ---------- views ----------
  function setMode(mode, { fresh = false } = {}) {
    state.mode = mode;
    document.querySelectorAll(".modes button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
    clearTimeout(state.autoTimer); closeSpot(true);
    if (mode === "pack") startLoosePack();
    else if (mode === "box") { if (!state.box || state.box.caseIdx != null || fresh) startBox(); else showBox(); }
    else if (mode === "case") { if (!state.cse || fresh) startCase(); else showCase(); }
  }
  function info(html) { $("info").innerHTML = html; }
  function seedChip(seed, kind) {
    return `<span class="chip seedchip">seed <b>${esc(seed)}</b></span>
      <button class="btn small ghost" data-share="${kind}"><svg><use href="#i-share"/></svg>Share</button>`;
  }
  function hint(t) { $("hint").innerHTML = t; }
  function spreadEmpty() {
    $("spread").innerHTML = Array.from({ length: config.packSize }, () => `<div class="slot empty"></div>`).join("");
    $("spread").hidden = false;
  }

  // Loose pack
  function startLoosePack() {
    if (!compiled) { renderConfigError(); return; }
    const seed = typedSeed() || newSeed();
    state.looseNo++; store.set("looseNo", state.looseNo);
    const entries = orderEntries(G.generateLoosePack(compiled, G.rngFromSeed("pack:" + seed)));
    showSealed({ entries, label: `Loose pack #${state.looseNo}`, seed, box: null, idx: -1 });
  }

  // Sealed pack
  function showSealed(pack) {
    state.pack = pack; state.view = "sealed"; state.revealed = 0; state.busy = false;
    const b = pack.box;
    info(b ? `<span class="ctx">${esc(b.label)}</span><span class="chip">pack <b>${pack.idx + 1}</b> of ${b.packs.length}</span><span class="chip"><b>${b.opened.filter(x => !x).length}</b> left in box</span>${seedChip(b.seed, b.caseIdx != null ? "case" : "box")}`
      : `<span class="ctx">${esc(pack.label)}</span>${seedChip(pack.seed, "pack")}${typedSeed() ? `<span class="chip">seed pinned: every loose pack is the same until you clear it</span>` : ""}`);
    $("table").innerHTML = `<div class="pack-wrap">
      <div class="pack" id="pack" role="button" tabindex="0" aria-label="Sealed booster pack. Drag across the top edge, or press Space, to tear it open.">
        <div class="pack-half pack-top"><div class="pack-art">${packArtInner()}</div></div>
        <div class="pack-half pack-body"><div class="pack-art">${packArtInner()}</div></div>
        <div class="pack-tearline"></div><div class="pack-rip"></div><div class="pack-grab" id="packGrab"></div>
      </div>
      <div class="pack-cta"><button class="btn primary" id="tearBtn">Tear open <kbd>Space</kbd></button>
      ${b ? `<button class="btn ghost" id="backToBox">Back to box</button>` : ""}</div></div>`;
    applyPackClips();
    spreadEmpty();
    hint(settings.style === "grid" ? "Drag across the top of the pack to tear it. Cards land face-down; flip them in any order." : "Drag across the top of the pack to tear it. Hits glow on the back before you flip them.");
    $("tearBtn").addEventListener("click", tear);
    $("backToBox")?.addEventListener("click", () => (state.cse && b.caseIdx != null ? showBox() : showBox()));
    wirePackDrag();
    preload(pack.entries);
  }
  function packArtInner() {
    return `<img src="img/pack.webp" alt="" draggable="false">`;
  }
  function crimp(y0, y1, up, n = 12) { // zigzag edge points from left to right between y0 and y1
    const pts = [];
    for (let i = 0; i <= n * 2; i++) pts.push(`${(i / (n * 2) * 100).toFixed(2)}% ${(i % 2 ? (up ? y0 : y1) : (up ? y1 : y0)).toFixed(2)}%`);
    return pts;
  }
  function jag(y, n = 18) { // torn line
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(`${(i / n * 100).toFixed(2)}% ${(y + (i % 2 ? 0.7 : -0.5) + Math.sin(i * 2.3) * 0.3).toFixed(2)}%`);
    return pts;
  }
  function applyPackClips() {
    // The wrapper art has its own crimped edges; we only split it along a torn line under the top crimp.
    const line = jag(6.4, 22);
    const top = ["0% -2%", "100% -2%", ...[...line].reverse()].join(",");
    const body = [...line, "100% 102%", "0% 102%"].join(",");
    document.querySelector(".pack-top").style.clipPath = `polygon(${top})`;
    document.querySelector(".pack-body").style.clipPath = `polygon(${body})`;
  }
  function wirePackDrag() {
    const pack = $("pack"), grab = $("packGrab");
    let startX = 0, dragging = false, lastGrip = 0;
    pack.addEventListener("keydown", e => { if (e.key === "Enter") tear(); });
    pack.addEventListener("click", e => { if (!dragging && !e.target.closest(".pack-grab")) { pack.animate([{ transform: "rotate(0)" }, { transform: "rotate(-2deg)" }, { transform: "rotate(2deg)" }, { transform: "rotate(0)" }], { duration: 300 }); hint("Drag across the glowing top edge to tear it open, or press Space."); } });
    grab.addEventListener("pointerdown", e => {
      S.unlock(); dragging = true; startX = e.clientX; pack.classList.add("dragging"); grab.setPointerCapture(e.pointerId);
    });
    grab.addEventListener("pointermove", e => {
      if (!dragging) return;
      const w = pack.getBoundingClientRect().width;
      const p = clamp((e.clientX - startX) / (w * 0.85), 0, 1);
      pack.style.setProperty("--tear", p.toFixed(3));
      pack.querySelector(".pack-top").style.transform = `rotate(${(p * -5).toFixed(2)}deg) translateY(${(-p * 6).toFixed(1)}px)`;
      if (performance.now() - lastGrip > 55 && p > 0.02) { S.play("grip"); lastGrip = performance.now(); }
      if (p >= 1) { dragging = false; tear(); }
    });
    const end = () => {
      if (!dragging) return; dragging = false; pack.classList.remove("dragging");
      const p = parseFloat(pack.style.getPropertyValue("--tear") || 0);
      if (p > 0.55) tear();
      else { pack.style.setProperty("--tear", 0); pack.querySelector(".pack-top").style.transform = ""; }
    };
    grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
    grab.addEventListener("click", () => { if (!dragging) tear(); });
  }

  async function tear() {
    if (state.view !== "sealed" || state.busy) return;
    S.unlock();
    state.busy = true;
    commitPack(state.pack);
    const pack = $("pack");
    pack.style.setProperty("--tear", 1);
    pack.querySelector(".pack-top").style.transform = "";
    S.play("tear");
    if (settings.particles) {
      const r = pack.getBoundingClientRect();
      X.burst(r.left + r.width * 0.9, r.top + r.height * 0.13, { colors: ["#ffe29a", "#f0c35a", "#fff", "#ff5d72"], count: 40, speed: 7, angle: -Math.PI / 3, spread: 1.6, shape: "shard", size: 3, life: 50 });
    }
    pack.classList.add("torn");
    announce("Pack torn open.");
    await wait(900);
    state.busy = false;
    enterReveal();
  }

  // Reveal
  function enterReveal() {
    const pack = state.pack;
    state.view = "reveal"; state.revealed = 0; state.held = null;
    if (spd() === 0) { revealInstant(); return; }
    if (settings.style === "grid") {
      $("spread").innerHTML = pack.entries.map((e, i) => `<div class="slot">${cardHTML(e, { tell: true, tag: true, cls: "dealt", attrs: `data-slot="${i}" style="--dy:-60px;--dr:${(i % 3 - 1) * 4}deg;animation-delay:${(i * 40 * spd()) | 0}ms"` })}</div>`).join("");
      $("table").innerHTML = `<div class="stack-wrap"><p class="note" style="font-size:1rem">Flip the cards in any order. Glowing backs are hits.</p>
        <div class="stack-actions"><button class="btn primary" id="revealAllBtn">Reveal all <kbd>A</kbd></button></div></div>`;
      $("revealAllBtn").addEventListener("click", revealAll);
      hint("Click a card to flip it. Click a face-up card for details.");
      S.play("slide");
      return;
    }
    renderStack();
    hint(`Click the stack or press <kbd>Space</kbd> to flip the next card · <kbd>A</kbd> reveals the rest`);
    S.play("slide");
    maybeAutoDeal();
  }
  function renderStack() {
    const pack = state.pack, i = state.revealed, left = pack.entries.length - i, held = state.held;
    if (left <= 0 && !held) { $("table").innerHTML = ""; return; }
    // Keep the element of a card that was just flipped, so its flip animation isn't interrupted.
    const keep = held && $("stackTop")?.dataset.held === String(held.i) ? $("stackTop") : null;
    const ghosts = Math.min(4, held ? left : left - 1);
    const nextTier = held && left > 0 ? tierOf(pack.entries[i]) : null;
    const nextTell = nextTier && TIERS[nextTier].tell ? nextTier : null;
    const top = held
      ? (keep ? `<i id="stackTopSlot"></i>` : cardHTML(held.entry, { up: true, cls: "stack-top held", attrs: `id="stackTop" data-held="${held.i}"` }))
      : cardHTML(pack.entries[i], { tell: true, cls: "stack-top", attrs: `id="stackTop"` });
    const nextLabel = held && left === 0 ? "Finish pack" : "Flip next";
    $("table").innerHTML = `<div class="stack-wrap">
      <div class="stack${held ? " has-held" : ""}" id="stack" title="${held ? "Flip the next card" : "Flip this card"}">
        ${Array.from({ length: ghosts }, (_, k) => `<div class="ghost${k === 0 && nextTell ? " tell" : ""}" ${k === 0 && nextTell ? `data-tier="${nextTell}"` : ""} style="transform:translate(${(k + 1) * 3 + (held ? 10 : 0)}px, ${(k + 1) * 3 + (held ? -8 : 0)}px) rotate(${(k % 2 ? 1 : -1) * (k + 1) * 0.8 + (held ? 3 : 0)}deg);z-index:${-k}"></div>`).join("")}
        ${top}
        ${left > 0 ? `<span class="count" aria-label="${left} cards left">${left}</span>` : ""}
      </div>
      <div class="stack-actions"><button class="btn primary" id="nextBtn">${nextLabel} <kbd>Space</kbd></button>${left > 0 ? `<button class="btn ghost" id="revealAllBtn">Reveal the rest <kbd>A</kbd></button>` : ""}</div></div>`;
    if (keep) $("stackTopSlot").replaceWith(keep);
    $("stack").addEventListener("click", () => revealNext());
    $("nextBtn").addEventListener("click", e => { e.stopPropagation(); revealNext(); });
    $("revealAllBtn")?.addEventListener("click", e => { e.stopPropagation(); revealAll(); });
  }
  function maybeAutoDeal() {
    clearTimeout(state.autoTimer);
    if (!settings.autoCommons || state.view !== "reveal" || settings.style === "grid" || state.held) return;
    const next = state.pack.entries[state.revealed];
    if (next && tierOf(next) === "common") state.autoTimer = setTimeout(() => revealNext(true), (state.revealed === 0 ? 450 : 170) * spd());
  }
  // Move the held card from the stack to its slot in the spread.
  function releaseHeld() {
    if (!state.held) return false;
    const h = state.held; state.held = null;
    placeInSlot(h.entry, h.i, $("stackTop"));
    return true;
  }

  async function revealNext(auto = false) {
    if (state.spot) { closeSpot(); return; }
    if (state.view !== "reveal" || state.busy) return;
    if (settings.style === "grid") { const el = document.querySelector(`#spread .c3:not(.up)`); if (el) flipGridCard(el); return; }
    const pack = state.pack;
    clearTimeout(state.autoTimer);
    if (releaseHeld()) {
      S.play("deal");
      if (state.revealed >= pack.entries.length) { renderStack(); await wait(300); toRecap(); return; }
      renderStack();
    }
    const i = state.revealed;
    if (i >= pack.entries.length) return;
    state.busy = true;
    const entry = pack.entries[i], tier = tierOf(entry), t = TIERS[tier];
    const topEl = $("stackTop");
    if (t.charge && topEl) {
      topEl.classList.add("charging");
      S.play("charge", { dur: t.charge * spd() });
      await wait(t.charge * 1000);
    }
    if (topEl) {
      topEl.getBoundingClientRect(); // make sure a freshly rendered card starts face-down so the flip animates
      await new Promise(r => requestAnimationFrame(r));
      topEl.classList.remove("charging"); topEl.removeAttribute("data-tell");
      if (!auto) { topEl.dataset.held = String(i); topEl.classList.add("held"); }
      flipUp(topEl);
      topEl.setAttribute("aria-label", `${CARDS[entry.card].n}, ${t.label}`);
    }
    S.play("flip");
    await wait(t.spot ? 380 : 160);
    state.revealed++;
    firstTimeCheck(entry, tier);
    announce(`${CARDS[entry.card].n}, ${t.label}`);
    if (auto) {
      placeInSlot(entry, i, topEl);
      if (tier !== "common") celebrate(tier, document.querySelector(`#spread [data-slot="${i}"]`)); else S.play("deal");
      renderStack();
    } else {
      // Manual flip: the card stays big on the stack until the next flip.
      state.held = { entry, i };
      renderStack();
      if (t.spot) await openSpot(entry, tier);
      else if (tier !== "common") celebrate(tier, $("stackTop"));
    }
    state.busy = false;
    if (auto && state.revealed >= pack.entries.length && !state.spot) { await wait(350); toRecap(); return; }
    if (!state.spot) maybeAutoDeal();
  }
  function placeInSlot(entry, i, fromEl) {
    const slot = $("spread").children[i];
    if (!slot) return;
    let dx = 0, dy = -120;
    if (fromEl) {
      const a = fromEl.getBoundingClientRect(), b = slot.getBoundingClientRect();
      dx = (a.left + a.width / 2) - (b.left + b.width / 2); dy = (a.top + a.height / 2) - (b.top + b.height / 2);
    }
    slot.classList.remove("empty");
    slot.innerHTML = cardHTML(entry, { up: true, tag: true, cls: "dealt", attrs: `data-slot="${i}" style="--dx:${dx | 0}px;--dy:${dy | 0}px;--dr:${(Math.random() * 10 - 5).toFixed(1)}deg"` });
  }
  async function flipGridCard(el) {
    if (state.busy || el.classList.contains("up")) return;
    const i = +el.dataset.slot, entry = state.pack.entries[i], tier = tierOf(entry), t = TIERS[tier];
    state.busy = true;
    if (t.charge) { el.classList.add("charging"); S.play("charge", { dur: t.charge * spd() }); await wait(t.charge * 900); el.classList.remove("charging"); }
    el.removeAttribute("data-tell"); flipUp(el);
    el.setAttribute("aria-label", `${CARDS[entry.card].n}, ${t.label}`);
    S.play("flip");
    state.revealed++;
    firstTimeCheck(entry, tier);
    await wait(t.spot ? 350 : 120);
    if (t.spot) await openSpot(entry, tier); else if (tier !== "common") celebrate(tier, el);
    state.busy = false;
    if (state.revealed >= state.pack.entries.length && !state.spot) { await wait(400); toRecap(); }
  }
  async function revealAll() {
    if (state.view !== "reveal") return;
    clearTimeout(state.autoTimer);
    if (state.spot) closeSpot(true);
    state.busy = true;
    const pack = state.pack;
    let best = null;
    if (settings.style === "grid") {
      const els = [...document.querySelectorAll("#spread .c3:not(.up)")];
      for (const el of els) {
        const e = pack.entries[+el.dataset.slot];
        el.removeAttribute("data-tell"); flipUp(el); state.revealed++;
        firstTimeCheck(e, tierOf(e), true);
        if (!best || TIERS[tierOf(e)].rank > TIERS[tierOf(best)].rank) best = e;
        S.play("flip"); await wait(80);
      }
    } else {
      releaseHeld();
      while (state.revealed < pack.entries.length) {
        const i = state.revealed, e = pack.entries[i];
        placeInSlot(e, i, $("stackTop")); state.revealed++;
        firstTimeCheck(e, tierOf(e), true);
        if (!best || TIERS[tierOf(e)].rank > TIERS[tierOf(best)].rank) best = e;
        renderStack(); S.play("deal"); await wait(70);
      }
    }
    state.busy = false;
    if (best && TIERS[tierOf(best)].rank >= 1) celebrate(tierOf(best), document.querySelector(`#spread [data-card="${best.card}"]`));
    await wait(500);
    toRecap();
  }
  function revealInstant() {
    const pack = state.pack;
    $("spread").innerHTML = pack.entries.map((e, i) => `<div class="slot">${cardHTML(e, { up: true, tag: true, attrs: `data-slot="${i}"` })}</div>`).join("");
    pack.entries.forEach(e => firstTimeCheck(e, tierOf(e), true));
    state.revealed = pack.entries.length;
    const best = bestEntry(pack.entries);
    if (best) celebrate(tierOf(best), document.querySelector(`#spread [data-card="${best.card}"]`));
    toRecap();
  }
  function firstTimeCheck(entry, tier, quiet) {
    const id = "first_" + tier;
    if (ACH.some(a => a[0] === id) && !ach[id]) {
      ach[id] = Date.now(); store.set("ach", ach);
      const a = ACH.find(x => x[0] === id);
      entry._first = true;
      setTimeout(() => { toast(a[1], a[2], "✦"); if (!quiet) S.play("toast"); }, quiet ? 200 : 1400 * Math.max(spd(), 0.3));
    }
  }

  // Spotlight
  function openSpot(entry, tier) {
    const c = CARDS[entry.card], t = TIERS[tier];
    const spot = $("spot");
    spot.dataset.tier = tier;
    spot.style.setProperty("--tc", t.color);
    const finish = entry.guarantee ? "Cold foil · the box's guaranteed cold" : FINISH[c.f];
    const title = tier === "cold" ? "Cold foil" : (c.f === "C" || c.f === "G") && tier !== "marvel" ? `Cold foil ${t.label}` : (c.f === "R" && tier !== "foil" ? `Rainbow ${t.label}` : t.label);
    spot.innerHTML = `${cardHTML(entry, { up: true, attrs: `id="spotCard"` })}
      <div class="spot-label">${entry._first ? `<span class="first">First ever</span>` : ""}<span class="tier">${esc(title)}</span>
      <span class="name">${esc(c.n)}${c.p ? ` <span style="color:var(--muted)">(${PITCH[c.p]})</span>` : ""}</span>
      <span class="sub">${esc(finish)} · ${esc(c.id)} · click or press Space to continue</span></div>`;
    spot.hidden = false;
    state.spot = { entry, tier };
    requestAnimationFrame(() => celebrate(tier, $("spotCard")));
    return new Promise(res => { state.spot.resolve = res; });
  }
  function closeSpot(silent) {
    if (!state.spot) return;
    const r = state.spot.resolve;
    state.spot = null;
    $("spot").hidden = true; $("spot").innerHTML = "";
    r && r();
    if (silent) return;
    if (state.held) { hint(state.revealed >= state.pack.entries.length ? "Last card. Press <kbd>Space</kbd> or click it to finish the pack." : `Click the stack or press <kbd>Space</kbd> to flip the next card · <kbd>A</kbd> reveals the rest`); return; }
    if (state.view === "reveal" && state.revealed >= state.pack.entries.length) setTimeout(toRecap, 250 * spd());
    else maybeAutoDeal();
  }
  $("spot").addEventListener("click", () => closeSpot());

  // Recap
  function toRecap() {
    if (state.view === "recap") return;
    clearTimeout(state.autoTimer);
    state.held = null;
    state.view = "recap";
    const pack = state.pack;
    // make sure every card is face-up in the spread
    if (!pack.readOnly) pack.entries.forEach((e, i) => {
      const slot = $("spread").children[i];
      if (slot && !slot.querySelector(".c3.up")) { slot.classList.remove("empty"); slot.innerHTML = cardHTML(e, { up: true, tag: true, attrs: `data-slot="${i}"` }); }
    });
    const hits = pack.entries.map((e, i) => ({ e, i, t: tierOf(e) })).filter(h => TIERS[h.t].rank >= 1).sort((a, b) => TIERS[b.t].rank - TIERS[a.t].rank);
    const best = hits[0]?.t;
    const headline = pack.readOnly ? esc(pack.label)
      : !best ? "All commons. It happens."
      : TIERS[best].rank >= 6 ? `${TIERS[best].label} pull!`
      : TIERS[best].rank >= 3 ? `${TIERS[best].label} hit`
      : "Pack opened";
    const b = pack.box;
    const left = b ? b.opened.filter(x => !x).length : 0;
    if (b && !pack.readOnly) info(`<span class="ctx">${esc(b.label)}</span><span class="chip">pack <b>${pack.idx + 1}</b> of ${b.packs.length}</span><span class="chip"><b>${left}</b> left in box</span>${seedChip(b.seed, b.caseIdx != null ? "case" : "box")}`);
    let actions = "";
    if (pack.readOnly) actions = `<button class="btn primary" id="recapBack">Back</button>`;
    else if (b && left > 0) actions = `<button class="btn primary" id="recapNext">Next pack <kbd>Space</kbd></button><button class="btn" id="recapBox">Back to box · ${left} left</button>`;
    else if (b) actions = `<button class="btn gold" id="recapSummary">Box summary <kbd>Space</kbd></button>`;
    else actions = `<button class="btn primary" id="recapNext">Open another <kbd>Space</kbd></button><button class="btn" id="recapToBox">Open a box instead</button>`;
    $("table").innerHTML = `<div class="recap">
      <h2>${headline}</h2>
      <p>${hits.length ? `${hits.length} hit${hits.length === 1 ? "" : "s"} in this pack` : "No rares or foils beyond the guaranteed slots"}${b ? ` · ${b.opened.filter(Boolean).length} of ${b.packs.length} opened` : ""}</p>
      <div class="recap-hits">${hits.map(h => `<button class="hit-chip" data-tier="${h.t}" data-open="${h.i}"><i></i>${esc(CARDS[h.e.card].n)} <small>${esc(h.e.guarantee ? "Cold foil" : TIERS[h.t].label)}</small></button>`).join("")}</div>
      <div class="recap-actions">${actions}${pack.readOnly ? "" : `<button class="btn ghost" data-share="${b ? (b.caseIdx != null ? "case" : "box") : "pack"}"><svg><use href="#i-share"/></svg>Share</button>`}</div></div>`;
    $("table").querySelectorAll("[data-open]").forEach(el => el.addEventListener("click", () => openDetail(pack.entries.map(e => e), +el.dataset.open)));
    $("recapNext")?.addEventListener("click", recapPrimary);
    $("recapSummary")?.addEventListener("click", recapPrimary);
    $("recapBox")?.addEventListener("click", showBox);
    $("recapToBox")?.addEventListener("click", () => setMode("box"));
    $("recapBack")?.addEventListener("click", () => { state.mode === "pack" ? startLoosePack() : state.mode === "box" ? showBox() : showCase(); });
    hint(`Click any card for a closer look. ${b && left ? "<kbd>Space</kbd> opens the next pack." : ""}`);
    if (!pack.readOnly) { checkPackAchievements(pack.entries); if (b && left === 0) finishBox(b); }
  }
  function recapPrimary() {
    const b = state.pack?.box;
    if (state.pack?.readOnly) { $("recapBack")?.click(); return; }
    if (b) { const next = b.opened.indexOf(false); if (next >= 0) { S.play("pick"); showSealed(packFromBox(b, next)); } else showBoxSummary(b); }
    else startLoosePack();
  }
  const packFromBox = (b, i) => ({ entries: b.packs[i], label: `${b.label} · pack ${i + 1}`, seed: b.seed, box: b, idx: i });

  // Box
  function startBox(seed) {
    if (!compiled) { renderConfigError(); return; }
    seed = seed || typedSeed() || newSeed();
    state.box = makeBox(seed, "Booster box");
    saveResume();
    showBox();
  }
  function showBox() {
    const b = state.box;
    if (!b) return startBox();
    state.view = "box"; state.pack = null;
    const left = b.opened.filter(x => !x).length;
    if (left === 0) return showBoxSummary(b);
    info(`<span class="ctx">${esc(b.label)}</span><span class="chip"><b>${left}</b> of ${b.packs.length} packs left</span>${seedChip(b.seed, b.caseIdx != null ? "case" : "box")}`);
    $("table").innerHTML = `<div class="display-wrap">
      <div class="display"><div class="display-inner">
        <div class="display-packs">${b.packs.map((_, i) => `<button class="mini-pack" data-pick="${i}" ${b.opened[i] ? "disabled" : ""} aria-label="Pack ${i + 1}"></button>`).join("")}</div>
        <div class="display-front"><div><div class="ttl">Usurp the Shadow Throne</div><div class="sub">Booster display · ${b.packs.length} packs · 1 cold foil inside</div></div>
        <div class="chip">${b.opened.filter(Boolean).length} opened</div></div>
      </div></div>
      <div class="box-actions">
        <button class="btn primary" id="boxNext">Open the next pack <kbd>Space</kbd></button>
        <button class="btn" id="boxAll">Open the rest instantly</button>
        ${b.caseIdx != null ? `<button class="btn ghost" id="boxCase">Back to case</button>` : `<button class="btn ghost" id="boxNew">New box</button>`}
      </div></div>`;
    $("spread").hidden = true;
    hint("Pick any pack from the display, or take them in order. Every box hides exactly one cold foil.");
    $("table").querySelectorAll("[data-pick]").forEach(el => {
      el.addEventListener("click", () => { S.unlock(); S.play("pick"); showSealed(packFromBox(b, +el.dataset.pick)); });
      el.addEventListener("mouseenter", () => S.play("hover"));
    });
    $("boxNext").addEventListener("click", () => { S.unlock(); S.play("pick"); showSealed(packFromBox(b, b.opened.indexOf(false))); });
    $("boxAll").addEventListener("click", () => openRestOfBox(b));
    $("boxNew")?.addEventListener("click", () => startBox(newSeed()));
    $("boxCase")?.addEventListener("click", showCase);
  }
  function openRestOfBox(b) {
    S.unlock();
    b.opened.forEach((o, i) => { if (!o) { const p = packFromBox(b, i); commitPack(p); p.entries.forEach(e => firstTimeCheck(e, tierOf(e), true)); checkPackAchievements(p.entries); } });
    S.play("slide");
    finishBox(b);
    showBoxSummary(b);
  }
  function finishBox(b) {
    if (b.counted) return;
    b.counted = true;
    stats.boxes++;
    const score = boxScore(b.packs.flat());
    stats.boxScores.push(Math.round(score * 10) / 10);
    if (stats.boxScores.length > 100) stats.boxScores.shift();
    saveProgress();
    unlock("box");
    if (state.cse && b.caseIdx != null && state.cse.boxes.every(x => x.opened.every(Boolean))) {
      if (!state.cse.counted) { state.cse.counted = true; stats.cases++; saveProgress(); unlock("case"); }
    }
  }

  // Box score & luck
  const SCORE = { common: 0, rare: 0.05, foil: 0.15, majestic: 1, cold: 1.5, marvel: 6, legendary: 8, fabled: 60 };
  const boxScore = entries => entries.reduce((s, e) => s + SCORE[tierOf(e)], 0);
  function luckDistribution() {
    if (luckCache) return luckCache;
    luckCache = new Promise(async res => {
      const rng = G.rngFromSeed("luck:" + JSON.stringify(config.slots.map(s => s.pools))), out = [];
      for (let k = 0; k < 20; k++) {
        for (let j = 0; j < 150; j++) out.push(boxScore(G.generateBox(compiled, rng).flat()));
        await sleep(0);
      }
      out.sort((a, b) => a - b); res(out);
    });
    return luckCache;
  }
  function percentile(sorted, v) { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; } return lo / sorted.length; }
  function histogramSVG(sorted, mark) {
    const max = Math.max(sorted[sorted.length - 1], mark) * 1.02, bins = 36, h = new Array(bins).fill(0);
    sorted.forEach(v => h[Math.min(bins - 1, Math.floor(v / max * bins))]++);
    const top = Math.max(...h), W = 360, H = 62;
    const bars = h.map((n, i) => `<rect x="${(i / bins * W).toFixed(1)}" y="${(H - 12 - n / top * (H - 18)).toFixed(1)}" width="${(W / bins - 1.5).toFixed(1)}" height="${(n / top * (H - 18)).toFixed(1)}" rx="1.5" fill="rgba(167,155,179,.35)"/>`).join("");
    const mx = (mark / max * W).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${bars}
      <line x1="${mx}" x2="${mx}" y1="0" y2="${H - 12}" stroke="#f0c35a" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function showBoxSummary(b) {
    state.view = "boxDone"; state.pack = null;
    const all = b.packs.flatMap((p, pi) => p.map(e => ({ ...e, pi })));
    renderSummary({
      title: b.caseIdx != null ? `Box ${b.caseIdx + 1} of the case` : "Box opened",
      sub: `${b.packs.length} packs · ${all.length} cards · seed ${b.seed}`,
      entries: all, boxes: [b],
      actions: b.caseIdx != null
        ? `<button class="btn primary" id="sumNext">Back to case <kbd>Space</kbd></button>`
        : `<button class="btn primary" id="sumNext">Open a new box <kbd>Space</kbd></button>`,
      shareKind: b.caseIdx != null ? "case" : "box", seed: b.seed,
    });
    $("sumNext").addEventListener("click", () => (b.caseIdx != null ? showCase() : startBox(newSeed())));
  }

  function renderSummary({ title, sub, entries, boxes, actions, shareKind, seed }) {
    $("spread").hidden = true;
    info(`<span class="ctx">${esc(title)}</span>${seedChip(seed, shareKind)}`);
    const byTier = {};
    entries.forEach(e => { const t = tierOf(e); byTier[t] = (byTier[t] || 0) + 1; });
    const exp = G.expectedPerBox(compiled), expTier = {};
    Object.entries(exp).forEach(([p, n]) => { const t = poolTier(p); expTier[t] = (expTier[t] || 0) + n * boxes.length; });
    const hits = entries.filter(e => TIERS[tierOf(e)].rank >= 3).sort((a, b) => TIERS[tierOf(b)].rank - TIERS[tierOf(a)].rank || a.card - b.card);
    const score = boxScore(entries) / boxes.length;
    $("table").innerHTML = `<div class="summary">
      <div class="summary-head"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div><div class="summary-actions">${actions}
        <button class="btn" id="sumImg">Save image</button><button class="btn ghost" data-share="${shareKind}"><svg><use href="#i-share"/></svg>Share</button></div></div>
      <div class="luck" id="luck"><div class="big">…</div><div></div><p>Working out how this compares with 3,000 simulated boxes…</p></div>
      <div class="count-row">${Object.keys(TIERS).filter(t => t !== "common").map(t => `<span class="chip" data-tier="${t}" style="border-color:color-mix(in srgb,var(--tc) 45%,transparent)"><b>${byTier[t] || 0}</b> ${TIERS[t].label} <span style="color:var(--dim)">· exp ${fmt(expTier[t] || 0, 1)}</span></span>`).join("")}</div>
      <h3 class="note" style="font-family:var(--f-mono);letter-spacing:.2em;text-transform:uppercase;font-size:.7rem">Majestic or better · ${hits.length}</h3>
      <div class="hits-grid">${hits.length ? hits.map((e, i) => `<div class="cell">${cardHTML(e, { up: true, tag: true, attrs: `data-hit="${i}"` })}<div class="cap">${esc(CARDS[e.card].n)}${e.pi != null ? `<br>pack ${e.pi + 1}` : ""}</div></div>`).join("") : `<p class="note">No Majestic-or-better hits. Brutal.</p>`}</div>
    </div>`;
    $("table").querySelectorAll("[data-hit]").forEach(el => el.addEventListener("click", () => openDetail(hits, +el.dataset.hit)));
    $("sumImg").addEventListener("click", () => saveSummaryImage(title, sub, hits, byTier));
    hint("");
    luckDistribution().then(dist => {
      const el = $("luck"); if (!el) return;
      const p = percentile(dist, score);
      const verdict = p >= 0.95 ? "A box people post about." : p >= 0.75 ? "Well above average." : p >= 0.4 ? "Right around average." : p >= 0.15 ? "A bit light." : "Rough. The next one owes you.";
      el.innerHTML = `<div class="big">${Math.round(p * 100)}<small>th percentile</small></div>${histogramSVG(dist, score)}<div class="axis"><span>weaker boxes</span><span>stronger boxes</span></div>
        <p>${verdict} ${boxes.length > 1 ? "Average box in this case" : "This box"} scored ${fmt(score, 1)} (Majestic 1, cold 1.5, Marvel 6, Legendary 8, Fabled 60), better than ${Math.round(p * 100)}% of simulated boxes.</p>`;
    });
  }

  async function saveSummaryImage(title, sub, hits, byTier) {
    const W = 1200, H = 675, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const bg = g.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.4, W * 0.8);
    bg.addColorStop(0, "#3a1422"); bg.addColorStop(1, "#0b0910"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = "#f0c35a"; g.font = "500 16px 'JetBrains Mono', monospace"; g.fillText("USURP THE SHADOW THRONE · PACK OPENER", 48, 58);
    g.fillStyle = "#f1eaf3"; g.font = "700 52px 'Cormorant Garamond', Georgia, serif"; g.fillText(title, 48, 112);
    g.fillStyle = "#a79bb3"; g.font = "400 18px Outfit, sans-serif"; g.fillText(sub, 48, 142);
    const show = hits.slice(0, 8), cw = 128, ch = cw * 763 / 546, gap = 14;
    const imgs = await Promise.all(show.map(e => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = CARDS[e.card].img; })));
    imgs.forEach((im, i) => {
      const x = 48 + i * (cw + gap), y = 180, col = TIERS[tierOf(show[i])].color;
      g.save(); g.shadowColor = col; g.shadowBlur = 24;
      if (im) g.drawImage(im, x, y, cw, ch); else { g.fillStyle = "#1f1729"; g.fillRect(x, y, cw, ch); }
      g.restore();
      g.fillStyle = col; g.font = "500 12px 'JetBrains Mono', monospace"; g.fillText(TIERS[tierOf(show[i])].label.toUpperCase(), x, y + ch + 22);
    });
    let x = 48; g.font = "500 20px Outfit, sans-serif";
    ["fabled", "legendary", "marvel", "cold", "majestic", "foil", "rare"].forEach(t => {
      const s = `${byTier[t] || 0} ${TIERS[t].label}`;
      g.fillStyle = TIERS[t].color; g.fillText(s, x, H - 56); x += g.measureText(s).width + 28;
    });
    g.fillStyle = "#6f647b"; g.font = "400 13px Outfit, sans-serif"; g.fillText("Fan-made simulator. Card images © Legend Story Studios.", 48, H - 24);
    cv.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `shadow-throne-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  // Case
  function startCase(seed) {
    if (!compiled) { renderConfigError(); return; }
    seed = seed || typedSeed() || newSeed();
    state.cse = { seed, boxes: Array.from({ length: BOXES_PER_CASE }, (_, i) => boxFromCase(seed, i)), active: 0, counted: false };
    saveResume(); showCase();
  }
  function showCase() {
    const cse = state.cse; if (!cse) return startCase();
    state.view = "case"; state.pack = null; $("spread").hidden = true;
    const done = cse.boxes.filter(b => b.opened.every(Boolean)).length;
    info(`<span class="ctx">Case of ${cse.boxes.length} boxes</span><span class="chip"><b>${done}</b> of ${cse.boxes.length} boxes done</span>${seedChip(cse.seed, "case")}`);
    $("table").innerHTML = `<div class="display-wrap"><div class="case-grid">${cse.boxes.map((b, i) => {
      const n = b.opened.filter(Boolean).length;
      return `<button class="case-box${n === b.packs.length ? " done" : ""}" data-box="${i}"><b>Box ${i + 1}</b>
        <div class="mini-row">${b.opened.map(o => `<span class="${o ? "gone" : ""}"></span>`).join("")}</div>
        <div class="progress"><i style="width:${(n / b.packs.length * 100).toFixed(0)}%"></i></div>
        <small>${n === b.packs.length ? "Finished · view summary" : n ? `${b.packs.length - n} packs left` : "Sealed"}</small></button>`;
    }).join("")}</div>
      <div class="box-actions">${done === cse.boxes.length ? `<button class="btn gold" id="caseSum">Case summary <kbd>Space</kbd></button>` : `<button class="btn primary" id="caseNext">Open the next box <kbd>Space</kbd></button>`}
      <button class="btn" id="caseAll">Open the whole case instantly</button><button class="btn ghost" id="caseNew">New case</button></div></div>`;
    hint("A case holds four boxes, each with its own guaranteed cold foil.");
    $("table").querySelectorAll("[data-box]").forEach(el => el.addEventListener("click", () => { S.unlock(); S.play("pick"); openCaseBox(+el.dataset.box); }));
    $("caseNext")?.addEventListener("click", () => openCaseBox(cse.boxes.findIndex(b => !b.opened.every(Boolean))));
    $("caseSum")?.addEventListener("click", showCaseSummary);
    $("caseAll").addEventListener("click", () => { cse.boxes.forEach(b => { if (!b.opened.every(Boolean)) { state.box = b; openRestOfBox(b); } }); showCaseSummary(); });
    $("caseNew").addEventListener("click", () => startCase(newSeed()));
  }
  function openCaseBox(i) {
    const cse = state.cse; cse.active = i; state.box = cse.boxes[i]; saveResume();
    if (state.box.opened.every(Boolean)) showBoxSummary(state.box); else showBox();
  }
  function showCaseSummary() {
    const cse = state.cse;
    state.view = "caseDone";
    const all = cse.boxes.flatMap((b, bi) => b.packs.flatMap((p, pi) => p.map(e => ({ ...e, pi: bi * PACKS_PER_BOX + pi }))));
    renderSummary({ title: "Case opened", sub: `${cse.boxes.length} boxes · ${cse.boxes.length * PACKS_PER_BOX} packs · seed ${cse.seed}`, entries: all, boxes: cse.boxes,
      actions: `<button class="btn primary" id="sumNext">Open a new case <kbd>Space</kbd></button>`, shareKind: "case", seed: cse.seed });
    $("sumNext").addEventListener("click", () => startCase(newSeed()));
  }

  function renderConfigError() {
    info(""); $("spread").hidden = true;
    $("table").innerHTML = `<div class="errors"><b>These odds can't be used yet.</b><ul>${configError.split("\n").map(m => `<li>${esc(m)}</li>`).join("")}</ul>
      <p><button class="btn small" id="fixOdds">Open the odds</button></p></div>`;
    $("fixOdds").addEventListener("click", () => openDrawer("odds"));
  }

  // ---------- detail modal ----------
  let modalCtx = null;
  function openDetail(list, idx, showBack = false) {
    modalCtx = { list, idx, showBack };
    const entry = list[idx], c = CARDS[entry.card], tier = tierOf(entry), t = TIERS[tier];
    const owned = collection[c.k] || 0;
    const f = showBack && c.back ? { ...c, ...c.back } : c;
    const rows = [["Printing", `<span class="mono">${esc(c.id)}</span>`], ["Type", esc(f.t)]];
    if (!showBack) {
      if (c.c !== "") rows.push(["Cost", esc(c.c)]);
      if (c.pw !== "") rows.push(["Power", esc(c.pw)]);
      if (c.d !== "") rows.push(["Defense", esc(c.d)]);
      if (c.hp) rows.push(["Life", esc(c.hp)]);
      rows.push(["Finish", esc(FINISH[c.f] + (c.a ? " · " + c.a.map(a => ART[a] || a).join(", ") : ""))]);
    }
    if (c.ar) rows.push(["Artist", esc(c.ar)]);
    rows.push(["In binder", owned ? `×${owned}` : "Not yet"]);
    $("modal").innerHTML = `
      ${list.length > 1 ? `<button class="modal-nav prev" id="mPrev" aria-label="Previous card"><svg><use href="#i-left"/></svg></button><button class="modal-nav next" id="mNext" aria-label="Next card"><svg><use href="#i-right"/></svg></button>` : ""}
      <div class="modal-card"><button class="icon-btn modal-close" id="mClose" aria-label="Close"><svg><use href="#i-close"/></svg></button>
        <div>${cardHTML(entry, { up: true, back: showBack, attrs: `id="mCard"` })}</div>
        <div><h2 id="mName">${esc(f.n)}</h2>
          <div class="meta"><span class="chip" data-tier="${tier}" style="border-color:var(--tc);color:var(--tc)">${esc(entry.guarantee ? "Cold foil" : t.label)}</span>
            <span class="chip">${esc(RARITY[c.r])}</span>${c.p ? `<span class="chip">${PITCH[c.p]} pitch</span>` : ""}${list.length > 1 ? `<span class="chip">${idx + 1} / ${list.length}</span>` : ""}</div>
          <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
          ${f.ft ? `<p class="rules">${esc(f.ft)}</p>` : ""}
          <div class="modal-actions">${c.back ? `<button class="btn" id="mFlip">Show ${showBack ? "front" : "back"}</button>` : ""}
            ${c.tcg ? `<a class="btn ghost" href="${esc(c.tcg)}" target="_blank" rel="noopener">TCGplayer ↗</a>` : ""}</div>
        </div></div>`;
    $("modal").hidden = false;
    $("mClose").addEventListener("click", closeDetail);
    $("mPrev")?.addEventListener("click", () => navDetail(-1));
    $("mNext")?.addEventListener("click", () => navDetail(1));
    $("mFlip")?.addEventListener("click", () => { S.play("flip"); openDetail(list, idx, !showBack); });
    ($("mFlip") || $("mClose")).focus({ preventScroll: true });
  }
  function navDetail(d) { if (!modalCtx) return; const n = modalCtx.list.length; S.play("click"); openDetail(modalCtx.list, (modalCtx.idx + d + n) % n); }
  function closeDetail() { $("modal").hidden = true; $("modal").innerHTML = ""; modalCtx = null; }
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeDetail(); });
  // Clicking face-up cards anywhere on the stage opens details
  $("spread").addEventListener("click", e => {
    const el = e.target.closest(".c3"); if (!el || !state.pack) return;
    if (!el.classList.contains("up")) { if (state.view === "reveal" && settings.style === "grid") flipGridCard(el); return; }
    const i = +el.dataset.slot;
    const upList = state.pack.entries.map((en, k) => ({ en, k })).filter(x => $("spread").children[x.k]?.querySelector(".c3.up"));
    openDetail(upList.map(x => x.en), Math.max(0, upList.findIndex(x => x.k === i)));
  });

  // ---------- drawers ----------
  let drawerKind = null;
  function openDrawer(kind) {
    drawerKind = kind;
    $("drawer").hidden = false; $("drawerScrim").hidden = false;
    $("drawerTitle").textContent = { binder: "Binder", stats: "Stats", history: "History", odds: "Odds" }[kind];
    if (kind === "binder") { $("binderPip").hidden = true; renderBinder(); }
    if (kind === "stats") renderStats();
    if (kind === "history") renderHistory();
    if (kind === "odds") renderOdds();
    $("drawerClose").focus({ preventScroll: true });
  }
  function closeDrawer() { $("drawer").hidden = true; $("drawerScrim").hidden = true; drawerKind = null; }
  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawerScrim").addEventListener("click", closeDrawer);
  document.querySelectorAll("[data-drawer]").forEach(b => b.addEventListener("click", () => (drawerKind === b.dataset.drawer ? closeDrawer() : openDrawer(b.dataset.drawer))));

  // Binder
  const binderF = { finish: "all", tier: "all", own: "all", q: "" };
  function completion() {
    const nums = new Set(), have = new Set();
    let prints = 0, pHave = 0, hits = 0, hHave = 0;
    for (const i of POOLED) {
      const c = CARDS[i]; nums.add(c.id); prints++;
      const o = (collection[c.k] || 0) > 0;
      if (o) { have.add(c.id); pHave++; }
      if ("MLFV".includes(c.r)) { hits++; if (o) hHave++; }
    }
    return { numbers: { have: have.size, total: nums.size }, printings: { have: pHave, total: prints }, hits: { have: hHave, total: hits } };
  }
  function ringSVG(frac, color) {
    const r = 26, cfr = 2 * Math.PI * r;
    return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(frac * cfr).toFixed(1)} ${cfr.toFixed(1)}" transform="rotate(-90 32 32)"/>
      <text x="32" y="37" text-anchor="middle" font-size="13" fill="#f1eaf3" font-family="Outfit, sans-serif">${Math.round(frac * 100)}%</text></svg>`;
  }
  function renderBinder() {
    const comp = completion();
    const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-f="${key}" data-v="${v}" aria-pressed="${binderF[key] === v}">${l}</button>`).join("")}</div>`;
    $("drawerBody").innerHTML = `
      <div class="completion">
        <div class="ring">${ringSVG(comp.numbers.have / comp.numbers.total, "#d23a4e")}<b>${comp.numbers.have} / ${comp.numbers.total}</b><small>Card numbers</small></div>
        <div class="ring">${ringSVG(comp.printings.have / comp.printings.total, "#5fe0c5")}<b>${comp.printings.have} / ${comp.printings.total}</b><small>Every printing</small></div>
        <div class="ring">${ringSVG(comp.hits.have / comp.hits.total, "#f0c35a")}<b>${comp.hits.have} / ${comp.hits.total}</b><small>Majestic and up</small></div>
      </div>
      <div class="filters">
        <input class="search" id="bq" type="search" placeholder="Search names and rules text" value="${esc(binderF.q)}" aria-label="Search the binder">
        ${seg("own", [["all", "All"], ["owned", "Owned"], ["missing", "Missing"], ["dupes", "Duplicates"]])}
        ${seg("finish", [["all", "Any finish"], ["S", "Standard"], ["R", "Rainbow"], ["C", "Cold"]])}
        ${seg("tier", [["all", "Any rarity"], ["C", "Common"], ["R", "Rare"], ["M", "Majestic"], ["L", "Legendary"], ["V", "Marvel"], ["F", "Fabled"], ["B", "Basic"]])}
      </div>
      <div class="binder-grid" id="bgrid"></div>
      <div><h3>Your data</h3><div class="data-actions">
        <button class="btn small" id="bExport">Export JSON</button>
        <label class="btn small" for="bImport">Import JSON</label><input type="file" id="bImport" accept="application/json" hidden>
        <button class="btn small ghost" id="bReset">Reset everything</button></div>
        <p class="note" style="margin-top:8px">Your binder, stats and history live in this browser only.</p><div id="bConfirm"></div></div>`;
    $("drawerBody").querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { binderF[b.dataset.f] = b.dataset.v; S.play("click"); renderBinder(); }));
    $("bq").addEventListener("input", e => { binderF.q = e.target.value; fillBinder(); });
    $("bExport").addEventListener("click", exportData);
    $("bImport").addEventListener("change", importData);
    $("bReset").addEventListener("click", () => {
      $("bConfirm").innerHTML = `<div class="confirm">Delete your binder, stats, history and achievements? <button class="btn small primary" id="bYes">Delete</button><button class="btn small" id="bNo">Keep</button></div>`;
      $("bYes").addEventListener("click", () => { collection = {}; stats = newStats(); history = []; ach = {}; saveProgress(); toast("Fresh start", "Binder and stats cleared.", "↺"); renderBinder(); });
      $("bNo").addEventListener("click", () => ($("bConfirm").innerHTML = ""));
    });
    fillBinder();
  }
  function binderList() {
    const q = binderF.q.trim().toLowerCase();
    return [...POOLED].sort((a, b) => CARDS[a].id.localeCompare(CARDS[b].id) || CARDS[a].f.localeCompare(CARDS[b].f)).filter(i => {
      const c = CARDS[i], n = collection[c.k] || 0;
      if (binderF.own === "owned" && !n) return false;
      if (binderF.own === "missing" && n) return false;
      if (binderF.own === "dupes" && n < 2) return false;
      if (binderF.finish !== "all" && (binderF.finish === "C" ? !(c.f === "C" || c.f === "G") : c.f !== binderF.finish)) return false;
      if (binderF.tier !== "all" && c.r !== binderF.tier) return false;
      if (q && !(c.n.toLowerCase().includes(q) || (c.ft || "").toLowerCase().includes(q) || c.id.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function fillBinder() {
    const list = binderList();
    $("bgrid").innerHTML = list.length ? list.map((i, k) => {
      const c = CARDS[i], n = collection[c.k] || 0;
      return `<button class="bcell f-${c.f}${n ? "" : " missing"}" data-b="${k}" title="${esc(c.n)} · ${esc(FINISH[c.f])}">${n > 1 ? `<span class="qty">×${n}</span>` : ""}
        <div class="c3-face" data-id="${esc(c.id)}">${n ? imgTag(c.img, c.n) : ""}<div class="c3-text"><div class="n">${esc(c.n)}</div></div></div><small>${esc(c.id)} · ${esc(c.f === "S" ? RARITY[c.r] : FINISH[c.f])}</small></button>`;
    }).join("") : `<p class="note">Nothing matches these filters.</p>`;
    $("bgrid").querySelectorAll("[data-b]").forEach(el => el.addEventListener("click", () => openDetail(list.map(i => ({ card: i })), +el.dataset.b)));
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ app: "shadow-throne-pack-opener", set: SET.set, exported: new Date().toISOString(), collection, stats, history, ach }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `shadow-throne-binder-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importData(e) {
    const f = e.target.files?.[0]; if (!f) return;
    f.text().then(txt => {
      const d = JSON.parse(txt);
      if (d.app !== "shadow-throne-pack-opener" || d.set !== SET.set || typeof d.collection !== "object") throw new Error("That file isn't a binder export for this set.");
      const unknown = Object.keys(d.collection).filter(k => !KEY_INDEX.has(k)).length;
      collection = d.collection; stats = Object.assign(newStats(), d.stats || {}); history = Array.isArray(d.history) ? d.history : []; ach = d.ach || {};
      saveProgress(); renderBinder();
      toast("Binder imported", unknown ? `${unknown} printings weren't recognised and were kept as-is.` : `${Object.keys(collection).length} printings loaded.`, "⇪");
    }).catch(err => toast("Import failed", err.message || "Couldn't read that file.", "!"));
  }

  // Stats
  function renderStats() {
    const exp = G.expectedPerBox(compiled || G.compile(DEFAULT_CONFIG, SET.pools)), perPackTier = {};
    Object.entries(exp).forEach(([p, n]) => { const t = poolTier(p); perPackTier[t] = (perPackTier[t] || 0) + n / PACKS_PER_BOX; });
    const comp = completion();
    const rows = Object.keys(TIERS).filter(t => t !== "common").map(t => {
      const got = stats.tiers[t] || 0, e = (perPackTier[t] || 0) * stats.packs, ratio = e ? got / e : 0;
      const w = Math.min(100, e ? got / (e * 2) * 100 : 0);
      return `<tr data-tier="${t}"><td><span class="dot"></span>${TIERS[t].label}</td><td>${fmt(got)}</td><td>${fmt(e, 1)}</td>
        <td class="${!stats.packs ? "" : ratio >= 1.1 ? "up" : ratio <= 0.9 ? "down" : ""}">${stats.packs && e ? (ratio >= 1 ? "+" : "") + fmt((ratio - 1) * 100) + "%" : "—"}</td>
        <td><div class="bar"><i style="width:${w}%"></i><s style="left:50%"></s></div></td></tr>`;
    }).join("");
    const drought = TRACKED.map(t => {
      const every = perPackTier[t] ? 1 / perPackTier[t] : 0, since = stats.since[t] || 0;
      return `<div data-tier="${t}"><span>${TIERS[t].label}</span><div class="bar"><i style="width:${Math.min(100, every ? since / (every * 2) * 100 : 0)}%"></i><s style="left:50%"></s></div>
        <span class="mono" style="font-size:.78rem">${since} <span style="color:var(--dim)">/ ~${fmt(every)}</span></span></div>`;
    }).join("");
    const bestC = stats.best && KEY_INDEX.has(stats.best.k) ? CARDS[KEY_INDEX.get(stats.best.k)] : null;
    $("drawerBody").innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${fmt(stats.packs)}</b><small>packs opened</small></div>
        <div class="kpi"><b>${fmt(stats.boxes)}</b><small>boxes finished</small></div>
        <div class="kpi"><b>${fmt(stats.cards)}</b><small>cards pulled</small></div>
        <div class="kpi"><b>${comp.numbers.have}</b><small>of ${comp.numbers.total} card numbers</small></div>
      </div>
      ${bestC ? `<p class="note">Best pull so far: <b style="color:${TIERS[stats.best.tier].color}">${esc(bestC.n)}</b> (${TIERS[stats.best.tier].label})</p>` : ""}
      <div><h3>Hits against the odds</h3><table class="data"><thead><tr><th>Tier</th><th>Pulled</th><th>Expected</th><th>Luck</th><th>vs expected</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="note" style="margin-top:6px">Expected counts use the current odds. The tick marks expected; bars past it mean you're running hot.</p></div>
      <div><h3>Packs since your last…</h3><div class="drought">${drought}</div><p class="note" style="margin-top:6px">Second number is the typical gap between pulls.</p></div>
      ${stats.boxScores.length ? `<div><h3>Recent box scores</h3>${sparkSVG(stats.boxScores)}</div>` : ""}
      <div><h3>Achievements · ${ACH.filter(a => ach[a[0]]).length} / ${ACH.length}</h3><div class="ach-grid">${ACH.map(([id, n, d]) => `<div class="ach${ach[id] ? " got" : ""}"><b>${ach[id] ? "✦ " : ""}${esc(n)}</b>${esc(d)}</div>`).join("")}</div></div>
      <div><h3>Check the generator</h3><p class="note">Simulates 10,000 boxes with the current odds and compares every pool with its expected count.</p>
        <p><button class="btn small" id="simBtn">Simulate 10,000 boxes</button></p><div id="simOut"></div></div>`;
    $("simBtn").addEventListener("click", runSim);
  }
  function sparkSVG(v) {
    const W = 520, H = 80, max = Math.max(...v, 1), n = v.length;
    const pts = v.map((y, i) => `${n === 1 ? W / 2 : (i / (n - 1) * (W - 8) + 4).toFixed(1)},${(H - 8 - y / max * (H - 18)).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:80px" aria-label="Box scores, oldest to newest"><polyline points="${pts}" fill="none" stroke="#f0c35a" stroke-width="2" stroke-linejoin="round"/>
      ${v.map((y, i) => `<circle cx="${n === 1 ? W / 2 : (i / (n - 1) * (W - 8) + 4).toFixed(1)}" cy="${(H - 8 - y / max * (H - 18)).toFixed(1)}" r="${i === n - 1 ? 4 : 2}" fill="${i === n - 1 ? "#f0c35a" : "#a79bb3"}"/>`).join("")}</svg>`;
  }
  async function runSim() {
    if (!compiled) return;
    $("simOut").innerHTML = `<p class="note">Simulating…</p>`; await sleep(20);
    const t0 = performance.now(), rng = G.rngFromSeed("sim:" + newSeed()), counts = {}, boxes = 10000;
    for (let b = 0; b < boxes; b++) for (const p of G.generateBox(compiled, rng)) for (const e of p) counts[e.pool] = (counts[e.pool] || 0) + 1;
    const exp = G.expectedPerBox(compiled);
    $("simOut").innerHTML = `<table class="data"><thead><tr><th>Pool</th><th>Per box</th><th>Expected</th></tr></thead><tbody>${Object.keys(exp).sort((a, b) => TIERS[poolTier(a)].rank - TIERS[poolTier(b)].rank).map(p => `<tr data-tier="${poolTier(p)}"><td><span class="dot"></span>${esc(p)}</td><td>${fmt((counts[p] || 0) / boxes, 3)}</td><td>${fmt(exp[p], 3)}</td></tr>`).join("")}</tbody></table>
      <p class="note" style="margin-top:6px">${fmt(boxes)} boxes in ${fmt(performance.now() - t0)} ms.</p>`;
  }

  // History
  function renderHistory() {
    if (!history.length) { $("drawerBody").innerHTML = `<p class="note">Packs you open show up here, newest first.</p>`; return; }
    $("drawerBody").innerHTML = `<div class="hist">${history.map((h, hi) => {
      const entries = histEntries(h);
      const hits = entries.filter(e => TIERS[tierOf(e)].rank >= 1).sort((a, b) => TIERS[tierOf(b)].rank - TIERS[tierOf(a)].rank);
      return `<button class="hrow" data-h="${hi}"><b>${esc(h.label)}</b><span class="when">${new Date(h.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <div class="thumbs">${hits.length ? hits.slice(0, 8).map(e => CARDS[e.card].img ? `<img src="${esc(CARDS[e.card].img)}" alt="${esc(CARDS[e.card].n)}" loading="lazy" style="box-shadow:0 0 0 1.5px ${TIERS[tierOf(e)].color}">` : `<span></span>`).join("") : `<span class="none">No hits</span>`}</div></button>`;
    }).join("")}</div>`;
    $("drawerBody").querySelectorAll("[data-h]").forEach(el => el.addEventListener("click", () => {
      const h = history[+el.dataset.h];
      closeDrawer(); replayHistory(h);
    }));
  }
  function histEntries(h) {
    return h.keys.map(k => { const g = k.endsWith("*"), i = KEY_INDEX.get(g ? k.slice(0, -1) : k); return i == null ? null : { card: i, guarantee: g ? "coldFoil" : undefined, slot: "" }; }).filter(Boolean);
  }
  function replayHistory(h) {
    const entries = histEntries(h);
    state.pack = { entries, label: `${h.label} (from history)`, seed: h.seed, box: null, idx: -1, readOnly: true };
    state.view = "reveal";
    info(`<span class="ctx">${esc(h.label)}</span><span class="chip">from history</span>`);
    $("spread").hidden = false;
    $("spread").innerHTML = entries.map((e, i) => `<div class="slot">${cardHTML(e, { up: true, tag: true, attrs: `data-slot="${i}"` })}</div>`).join("");
    state.view = "reveal"; toRecap();
  }

  // Odds
  const pct = (w, tot) => tot > 0 && w > 0 ? (100 * w / tot).toFixed(w / tot < 0.01 ? 2 : 1) + "%" : "—";
  const POOL_NAME = { B: "Basic", C: "Common", R: "Rare", M: "Majestic", X: "Expansion slot", F: "Fabled", V: "Marvel",
    RF_B: "Rainbow basic", RF_C: "Rainbow common", RF_R: "Rainbow rare", RF_M: "Rainbow majestic", RF_L: "Legendary (rainbow)", RF_F: "Fabled (rainbow)",
    CF_B: "Cold basic", CF_C: "Cold common", CF_R: "Cold rare", CF_M: "Cold majestic", CF_L: "Cold legendary", CF_F: "Cold fabled" };
  function renderOdds() {
    const ph = new Set(config.sourced.placeholders);
    const blocks = [...config.slots.map(o => ({ kind: "slot", o })), ...config.boxGuarantees.map(o => ({ kind: "g", o }))];
    $("drawerBody").innerHTML = `
      ${configError ? `<div class="errors"><b>These odds can't be used yet.</b><ul>${configError.split("\n").map(m => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
      <p class="note">${esc(config.sourced.structure)}</p><p class="note">${esc(config.sourced.rates || "")}</p>
      <p class="note">Changes apply to the next pack, box or case you start. Weights within a slot are relative.</p>
      ${blocks.map(({ kind, o }, bi) => {
        const entries = Object.entries(o.pools), tot = entries.reduce((a, [, w]) => a + (w > 0 ? w : 0), 0);
        const sub = kind === "slot" ? `${o.count} per pack` : `${o.perBox} per box, replaces ${config.slots.find(s => s.name === o.replacesSlot)?.label}`;
        return `<div class="slotcard"><header><h4>${esc(o.label)} <span class="note">· ${esc(sub)}</span></h4><span class="badge ${ph.has(o.name) ? "ph" : "src"}">${ph.has(o.name) ? "Estimate" : "Published"}</span></header>
          ${entries.map(([k, w]) => `<div class="wrow"><label for="w-${bi}-${k}">${esc(POOL_NAME[k] || k)} <span class="mono" style="color:var(--dim)">(${SET.pools[k]?.length ?? 0})</span></label>
          <input type="number" min="0" step="any" id="w-${bi}-${k}" data-b="${bi}" data-k="${k}" value="${w}" ${entries.length === 1 ? "disabled" : ""}><span class="pct">${pct(w, tot)}</span></div>`).join("")}</div>`;
      }).join("")}
      <p><button class="btn small" id="oddsReset">Reset to defaults</button></p>`;
    $("drawerBody").querySelectorAll("input[data-k]").forEach(inp => inp.addEventListener("change", () => {
      const b = blocks[+inp.dataset.b].o;
      b.pools[inp.dataset.k] = inp.value.trim() === "" ? NaN : Number(inp.value);
      recompile();
      store.set("weights", { slots: config.slots.map(s => s.pools), g: config.boxGuarantees.map(g => g.pools) });
      renderOdds();
    }));
    $("oddsReset").addEventListener("click", () => { config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); store.del("weights"); recompile(); renderOdds(); });
  }

  // ---------- settings ----------
  function renderSettings() {
    const opt = (v, cur, l) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`;
    $("settings").innerHTML = `
      <div class="row"><span class="lab">Pace</span><select id="sSpeed" class="search">${opt("cinematic", settings.speed, "Cinematic")}${opt("quick", settings.speed, "Quick")}${opt("instant", settings.speed, "Instant (no reveals)")}</select></div>
      <div class="row"><span class="lab">Reveal style</span><select id="sStyle" class="search">${opt("stack", settings.style, "One by one from the stack")}${opt("grid", settings.style, "Face-down spread, flip any card")}</select></div>
      <label class="tog">Auto-flip commons <input type="checkbox" id="sAuto" ${settings.autoCommons ? "checked" : ""}></label>
      <div class="row"><span class="lab">Volume</span><input type="range" id="sVol" min="0" max="1" step="0.05" value="${settings.volume}"></div>
      <label class="tog">Card tilt and holo glare <input type="checkbox" id="sTilt" ${settings.tilt ? "checked" : ""}></label>
      <label class="tog">Motion tilt on phones <input type="checkbox" id="sGyro" ${settings.gyro ? "checked" : ""}></label>
      <label class="tog">Particles and flashes <input type="checkbox" id="sFx" ${settings.particles ? "checked" : ""}></label>
      <label class="tog">Drifting embers <input type="checkbox" id="sAmb" ${settings.ambient ? "checked" : ""}></label>
      <p class="note">Shortcuts: <kbd>Space</kbd> next · <kbd>A</kbd> reveal all · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pack/box/case · <kbd>C</kbd> binder · <kbd>S</kbd> stats · <kbd>H</kbd> history · <kbd>M</kbd> mute</p>`;
    const bind = (id, fn) => $(id).addEventListener("change", e => { fn(e.target); saveSettings(); });
    bind("sSpeed", t => { settings.speed = t.value; applySpeed(); });
    bind("sStyle", t => { settings.style = t.value; });
    bind("sAuto", t => { settings.autoCommons = t.checked; });
    $("sVol").addEventListener("input", e => { settings.volume = +e.target.value; S.setVolume(settings.volume); saveSettings(); });
    $("sVol").addEventListener("change", () => { S.unlock(); S.play("rare"); });
    bind("sTilt", t => { settings.tilt = t.checked; });
    bind("sGyro", t => { settings.gyro = t.checked; setGyro(t.checked); });
    bind("sFx", t => { settings.particles = t.checked; X.setEnabled(t.checked); });
    bind("sAmb", t => { settings.ambient = t.checked; X.setAmbient(t.checked); });
  }
  $("settingsBtn").addEventListener("click", e => {
    const open = $("settings").hidden;
    $("settings").hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open));
    if (open) renderSettings();
  });
  document.addEventListener("click", e => {
    if (!$("settings").hidden && !e.target.closest("#settings, #settingsBtn")) { $("settings").hidden = true; $("settingsBtn").setAttribute("aria-expanded", "false"); }
  });
  function applyMute() {
    S.setMuted(settings.muted);
    $("muteBtn").innerHTML = `<svg><use href="#i-${settings.muted ? "mute" : "sound"}"/></svg>`;
    $("muteBtn").setAttribute("aria-label", settings.muted ? "Sound off (M)" : "Sound on (M)");
  }
  $("muteBtn").addEventListener("click", () => { settings.muted = !settings.muted; saveSettings(); applyMute(); S.unlock(); if (!settings.muted) S.play("rare"); });

  // ---------- share ----------
  function shareURL(kind) {
    const u = new URL(location.href); u.search = ""; u.hash = "";
    const seed = kind === "pack" ? state.pack?.seed : kind === "box" ? state.box?.seed : state.cse?.seed;
    u.searchParams.set("mode", kind); if (seed) u.searchParams.set("seed", seed);
    return u.toString();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-share]"); if (!b) return;
    copyText(shareURL(b.dataset.share), "Link copied: the same seed opens the same " + b.dataset.share);
  });

  // ---------- mode tabs, seed ----------
  document.querySelectorAll(".modes button").forEach(b => b.addEventListener("click", () => { S.unlock(); S.play("click"); setMode(b.dataset.mode, { fresh: false }); }));
  $("rollSeed").addEventListener("click", () => { $("seed").value = ""; store.set("seed", ""); toast("Seed cleared", "Every pack is random again.", "⚄"); });
  $("seed").addEventListener("change", () => store.set("seed", $("seed").value.trim()));

  // ---------- keyboard ----------
  document.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$("modal").hidden) {
      if (e.key === "Escape") closeDetail();
      else if (e.key === "ArrowLeft") navDetail(-1);
      else if (e.key === "ArrowRight") navDetail(1);
      return;
    }
    if (e.key === "Escape") { if (state.spot) closeSpot(); else if (drawerKind) closeDrawer(); else if (!$("settings").hidden) $("settings").hidden = true; return; }
    if (e.target.closest("input, select, textarea")) return;
    if (drawerKind) return;
    const k = e.key.toLowerCase();
    if (e.code === "Space" || (e.key === "Enter" && !e.target.closest("button, a, [role=button]"))) {
      e.preventDefault(); if (e.repeat) return; S.unlock(); primaryAction(); return;
    }
    if (e.target.closest("button, a")) { /* let buttons keep their own keys */ }
    if (k === "a" && state.view === "reveal") revealAll();
    else if (k === "1") setMode("pack"); else if (k === "2") setMode("box"); else if (k === "3") setMode("case");
    else if (k === "c") openDrawer("binder"); else if (k === "s") openDrawer("stats"); else if (k === "h") openDrawer("history");
    else if (k === "m") $("muteBtn").click();
  });
  function primaryAction() {
    if (state.spot) { closeSpot(); return; }
    switch (state.view) {
      case "sealed": tear(); break;
      case "reveal": revealNext(); break;
      case "recap": recapPrimary(); break;
      case "box": if (state.box) { S.play("pick"); showSealed(packFromBox(state.box, state.box.opened.indexOf(false))); } break;
      case "boxDone": case "caseDone": $("sumNext")?.click(); break;
      case "case": ($("caseNext") || $("caseSum"))?.click(); break;
    }
  }

  // ---------- boot ----------
  X.mount(); X.setEnabled(settings.particles); X.setAmbient(settings.ambient);
  (async function findCardBack() {
    for (const f of ["img/cardback.webp", "img/cardback.png", "img/cardback.jpg"]) {
      const ok = await new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = f; });
      if (ok) { document.documentElement.style.setProperty("--cardback", `url("${f}")`); document.documentElement.classList.add("has-cardback"); return; }
    }
  })();
  applySpeed(); applyMute(); S.setVolume(settings.volume);
  if (settings.gyro) setGyro(true);
  $("commit").textContent = `@ ${SET.sourceCommit.slice(0, 7)}`;
  document.addEventListener("pointerdown", () => S.unlock(), { once: true });
  $("seed").value = store.get("seed", "") || "";

  // restore an unfinished box/case
  const br = store.get("boxResume", null);
  if (br && br.seed && compiled) { state.box = makeBox(br.seed, "Booster box"); restoreOpened(state.box, br.opened); if (state.box.opened.every(Boolean)) state.box.counted = true; }
  const cr = store.get("caseResume", null);
  if (cr && cr.seed && compiled) {
    state.cse = { seed: cr.seed, boxes: Array.from({ length: BOXES_PER_CASE }, (_, i) => boxFromCase(cr.seed, i)), active: cr.active || 0, counted: false };
    (cr.opened || []).forEach((o, i) => { if (state.cse.boxes[i]) { restoreOpened(state.cse.boxes[i], o); if (state.cse.boxes[i].opened.every(Boolean)) state.cse.boxes[i].counted = true; } });
    if (state.cse.boxes.every(b => b.counted)) state.cse.counted = true;
  }

  const qs = new URLSearchParams(location.search);
  const qMode = qs.get("mode"), qSeed = qs.get("seed");
  if (qSeed && ["pack", "box", "case"].includes(qMode)) {
    document.querySelectorAll(".modes button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mode === qMode)));
    state.mode = qMode;
    if (qMode === "pack") { $("seed").value = qSeed; startLoosePack(); }
    else if (qMode === "box") startBox(qSeed);
    else startCase(qSeed);
    toast("Shared " + qMode + " loaded", `Seed ${qSeed}`, "⇲");
  } else if (state.box && state.box.opened.some(Boolean) && !state.box.opened.every(Boolean)) {
    state.mode = "box"; document.querySelectorAll(".modes button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mode === "box")));
    showBox(); toast("Welcome back", "Your box is where you left it.", "↩");
  } else setMode("pack");
})();
