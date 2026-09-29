// Particle and screen effects on a full-screen canvas. window.Fx
(function () {
  "use strict";
  const canvas = document.createElement("canvas");
  canvas.className = "fx-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const g = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, running = false, enabled = true, ambientOn = true;
  const parts = [], rays = [], embers = [];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function mount() { document.body.appendChild(canvas); resize(); addEventListener("resize", resize); seedEmbers(); kick(); }

  function seedEmbers() {
    embers.length = 0;
    const n = Math.round(Math.min(46, W * H / 32000));
    for (let i = 0; i < n; i++) embers.push(newEmber(true));
  }
  function newEmber(anyY) {
    return { x: Math.random() * W, y: anyY ? Math.random() * H : H + 10, vy: -(0.12 + Math.random() * 0.35),
      vx: (Math.random() - 0.5) * 0.12, r: 0.6 + Math.random() * 1.8, a: 0.15 + Math.random() * 0.45, ph: Math.random() * 6.28 };
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  function burst(x, y, { colors = ["#fff"], count = 60, speed = 7, gravity = 0.12, life = 90, shape = "spark", size = 3, spread = Math.PI * 2, angle = -Math.PI / 2, drag = 0.985 } = {}) {
    if (!enabled || reduced.matches) return;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.35 + Math.random() * 0.8);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity, life: life * rnd(0.6, 1.2), age: 0,
        c: pick(colors), s: size * rnd(0.6, 1.4), shape, rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3), drag, wob: rnd(0, 6.28) });
    }
    kick();
  }
  function confetti(x, y, colors, count = 120) {
    burst(x, y, { colors, count, speed: 11, gravity: 0.18, life: 170, shape: "confetti", size: 6, spread: Math.PI * 1.1, angle: -Math.PI / 2, drag: 0.975 });
  }
  function ring(x, y, color, count = 36) {
    if (!enabled || reduced.matches) return;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, g: 0, life: 45, age: 0, c: color, s: 2.6, shape: "spark", rot: 0, vr: 0, drag: 0.93, wob: 0 });
    }
    kick();
  }
  function godRays(x, y, color, { dur = 2400, count = 14, len = 0.9 } = {}) {
    if (!enabled || reduced.matches) return;
    rays.push({ x, y, color, t0: performance.now(), dur, count, len: Math.max(W, H) * len, rot: Math.random() * 6 });
    kick();
  }
  function flash(color = "#fff", ms = 500) {
    if (!enabled || reduced.matches) return;
    const el = document.createElement("div");
    el.className = "fx-flash"; el.style.background = color; el.style.animationDuration = ms + "ms";
    document.body.appendChild(el); setTimeout(() => el.remove(), ms + 50);
  }
  function shake(el, strength = 1) {
    if (!enabled || reduced.matches || !el) return;
    el.style.setProperty("--shake", strength);
    el.classList.remove("fx-shake"); void el.offsetWidth; el.classList.add("fx-shake");
    setTimeout(() => el.classList.remove("fx-shake"), 650);
  }

  function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }
  function loop() {
    g.clearRect(0, 0, W, H);
    const t = performance.now();
    // ambient embers
    if (ambientOn && !reduced.matches) {
      for (const e of embers) {
        e.y += e.vy; e.x += e.vx + Math.sin(t / 1400 + e.ph) * 0.15;
        if (e.y < -10) Object.assign(e, newEmber(false));
        const fl = 0.6 + 0.4 * Math.sin(t / 500 + e.ph * 3);
        g.globalAlpha = e.a * fl;
        g.fillStyle = "#ff5a3c";
        g.beginPath(); g.arc(e.x, e.y, e.r, 0, 6.283); g.fill();
      }
    }
    // god rays
    for (let i = rays.length - 1; i >= 0; i--) {
      const r = rays[i], p = (t - r.t0) / r.dur;
      if (p >= 1) { rays.splice(i, 1); continue; }
      const alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      g.save(); g.translate(r.x, r.y); g.rotate(r.rot + p * 0.6); g.globalCompositeOperation = "lighter";
      for (let k = 0; k < r.count; k++) {
        g.rotate((Math.PI * 2) / r.count);
        const grad = g.createLinearGradient(0, 0, r.len, 0);
        grad.addColorStop(0, r.color); grad.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = 0.22 * alpha; g.fillStyle = grad;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(r.len, -r.len * 0.07); g.lineTo(r.len, r.len * 0.07); g.closePath(); g.fill();
      }
      g.restore();
    }
    // particles
    g.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age++; if (p.age > p.life) { parts.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const k = 1 - p.age / p.life;
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = p.c;
      if (p.shape === "confetti") {
        g.globalCompositeOperation = "source-over";
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.scale(1, Math.abs(Math.cos(p.age / 6 + p.wob)));
        g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); g.restore();
        g.globalCompositeOperation = "lighter";
      } else if (p.shape === "star") {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.beginPath();
        for (let j = 0; j < 8; j++) { const rr = j % 2 ? p.s * 0.35 : p.s * 1.4; g.lineTo(Math.cos(j * Math.PI / 4) * rr, Math.sin(j * Math.PI / 4) * rr); }
        g.closePath(); g.fill(); g.restore();
      } else if (p.shape === "shard") {
        g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx));
        g.beginPath(); g.moveTo(p.s * 2.2, 0); g.lineTo(-p.s, p.s * 0.5); g.lineTo(-p.s, -p.s * 0.5); g.closePath(); g.fill(); g.restore();
      } else {
        g.beginPath(); g.arc(p.x, p.y, p.s * (0.5 + k * 0.5), 0, 6.283); g.fill();
      }
    }
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    if (parts.length || rays.length || (ambientOn && !reduced.matches)) requestAnimationFrame(loop);
    else { running = false; g.clearRect(0, 0, W, H); }
  }

  window.Fx = {
    mount, burst, confetti, ring, godRays, flash, shake,
    setEnabled(v) { enabled = v; if (!v) { parts.length = 0; rays.length = 0; } },
    setAmbient(v) { ambientOn = v; kick(); },
    centerOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
  };
})();
