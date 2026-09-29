// Synthesised sound effects (Web Audio, no audio files). window.Sfx
(function () {
  "use strict";
  let ctx = null, master = null, verb = null, noiseBuf = null;
  let volume = 0.7, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    // Cheap reverb: decaying stereo noise impulse
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    verb.connect(wet).connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const now = () => ctx.currentTime;

  function out(node, sendVerb = 0) {
    node.connect(master);
    if (sendVerb) { const g = ctx.createGain(); g.gain.value = sendVerb; node.connect(g).connect(verb); }
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function noise(t, dur, { type = "bandpass", f0 = 1000, f1 = 1000, q = 1, peak = 0.4, a = 0.005, verbAmt = 0 } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    src.connect(flt).connect(g); out(g, verbAmt);
    src.start(t, Math.random()); src.stop(t + dur + a + 0.05);
  }
  function tone(t, freq, dur, { type = "sine", peak = 0.2, a = 0.004, verbAmt = 0.3, detune = 0, glide = 0 } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    o.connect(g); out(g, verbAmt); o.start(t); o.stop(t + a + dur + 0.05);
  }
  // Bell: fundamental plus inharmonic partials
  function bell(t, f, dur = 1.6, peak = 0.12, verbAmt = 0.5) {
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([m, a]) =>
      tone(t, f * m, dur / (m * 0.6 + 0.4), { peak: peak * a, verbAmt }));
  }
  function boom(t, peak = 0.5) {
    tone(t, 90, 0.9, { peak, glide: 0.4, verbAmt: 0.2 });
    noise(t, 0.5, { type: "lowpass", f0: 400, f1: 60, peak: peak * 0.6 });
  }
  function shimmer(t, dur, base = 2000, n = 14, peak = 0.05) {
    for (let i = 0; i < n; i++) tone(t + Math.random() * dur, base * (1 + Math.random() * 1.5), 0.25, { peak, verbAmt: 0.7 });
  }

  const S = {
    unlock() { ensure(); },
    setVolume(v) { volume = v; if (master) master.gain.value = muted ? 0 : v; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : volume; },
    get muted() { return muted; },
    play(name, opt) { if (muted || !ensure()) return; try { (FX[name] || (() => {}))(now() + 0.01, opt || {}); } catch { /* audio is best-effort */ } },
  };

  const FX = {
    hover(t) { tone(t, 1800, 0.04, { peak: 0.02, verbAmt: 0 }); },
    pick(t) { noise(t, 0.12, { f0: 600, f1: 1400, q: 2, peak: 0.25 }); tone(t, 220, 0.12, { peak: 0.08, verbAmt: 0 }); },
    grip(t) { noise(t, 0.06, { type: "highpass", f0: 3000, f1: 3000, peak: 0.08 }); },
    tear(t) {
      // crinkly foil rip: many short high-passed bursts over a rising band sweep
      for (let i = 0; i < 22; i++) noise(t + i * 0.018 + Math.random() * 0.01, 0.03, { type: "highpass", f0: 2500 + Math.random() * 3000, f1: 4000, peak: 0.18 + Math.random() * 0.15 });
      noise(t, 0.45, { f0: 700, f1: 4200, q: 0.8, peak: 0.35 });
    },
    slide(t) { noise(t, 0.35, { type: "lowpass", f0: 2400, f1: 500, peak: 0.25 }); },
    flip(t) { noise(t, 0.09, { f0: 1800, f1: 5000, q: 1.5, peak: 0.22 }); tone(t + 0.05, 320, 0.05, { peak: 0.05, verbAmt: 0 }); },
    deal(t) { noise(t, 0.06, { type: "lowpass", f0: 1600, f1: 400, peak: 0.2 }); },
    rare(t) { bell(t, 1046, 0.9, 0.07, 0.4); },
    foil(t) { shimmer(t, 0.4, 2400, 10, 0.035); tone(t, 1318, 0.5, { peak: 0.05 }); },
    majestic(t) { bell(t, 659, 1.6, 0.14); bell(t + 0.12, 988, 1.8, 0.12); shimmer(t + 0.1, 0.6, 2200, 10, 0.03); },
    cold(t) { [1568, 2093, 2637, 3136].forEach((f, i) => bell(t + i * 0.07, f, 1.4, 0.05, 0.7)); noise(t, 0.8, { type: "highpass", f0: 6000, f1: 9000, peak: 0.05, verbAmt: 0.5 }); },
    marvel(t) { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => bell(t + i * 0.06, f, 1.5, 0.07)); shimmer(t + 0.3, 1, 2600, 18, 0.03); },
    legendary(t) {
      boom(t, 0.45);
      [392, 494, 587, 784].forEach((f, i) => bell(t + 0.05 + i * 0.09, f, 2.2, 0.12));
      [196, 294, 392].forEach(f => tone(t + 0.35, f, 2.4, { type: "sawtooth", peak: 0.018, a: 0.3, verbAmt: 0.8, detune: (Math.random() - 0.5) * 12 }));
      shimmer(t + 0.4, 1.4, 2400, 24, 0.03);
    },
    fabled(t) {
      boom(t, 0.6); boom(t + 0.5, 0.4);
      [261, 329, 392, 523, 659, 784].forEach((f, i) => { bell(t + 0.1 + i * 0.1, f, 2.8, 0.1);
        tone(t + 0.6, f / 2, 3.2, { type: "sawtooth", peak: 0.012, a: 0.6, verbAmt: 0.9, detune: (i % 2 ? 7 : -7) }); });
      shimmer(t + 0.6, 2.4, 2000, 40, 0.03);
    },
    charge(t, { dur = 1 }) {
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(440, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      o.connect(g); out(g, 0.4); o.start(t); o.stop(t + dur + 0.1);
      noise(t, dur, { f0: 300, f1: 3000, q: 3, peak: 0.08, a: dur * 0.8 });
    },
    click(t) { tone(t, 900, 0.03, { peak: 0.04, verbAmt: 0 }); },
    toast(t) { bell(t, 1318, 0.7, 0.05, 0.3); bell(t + 0.08, 1760, 0.7, 0.04, 0.3); },
  };
  window.Sfx = S;
})();
