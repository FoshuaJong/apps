  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/edh_clock/sw.js').catch(() => {});
  }

  (() => {
    // ── Config ────────────────────────────────────────────────────────────────
    const WORKER_HOST = 'apps.fong.nz'; // same origin — worker is colocated
    const WS_PROTO    = location.protocol === 'https:' ? 'wss' : 'ws';

    // ── Identity ──────────────────────────────────────────────────────────────
    let playerId = localStorage.getItem('edhPlayerId');
    if (!playerId) {
      playerId = crypto.randomUUID();
      localStorage.setItem('edhPlayerId', playerId);
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let ws          = null;
    let gameState   = {};
    let prevPhase   = null;
    let clockOffset = 0;   // Date.now() - serverNow at last message receipt
    let currentCode = null;
    let playerName  = localStorage.getItem('edhPlayerName') || '';

    // ── Colour themes ─────────────────────────────────────────────────────────
    const THEMES = {
      colorless: {
        '--bg': '#000000', '--bg-elevated': '#0a0a0a', '--bg-card': '#111111',
        '--text-primary': '#E8E6E3', '--text-secondary': '#9B9A97', '--text-muted': '#5C5B59',
        '--accent': '#3DA899', '--accent-glow': 'rgba(61,168,153,0.15)',
        '--accent-border-hover': 'rgba(61,168,153,0.25)', '--accent-surface': 'rgba(61,168,153,0.08)',
        '--border': 'rgba(255,255,255,0.06)', '--color-error': '#E87A5D',
      },
      white: {
        '--bg': '#060604', '--bg-elevated': '#0E0E0A', '--bg-card': '#161610',
        '--text-primary': '#F0EDDC', '--text-secondary': '#B0AD9A', '--text-muted': '#6A6858',
        '--accent': '#C8A850', '--accent-glow': 'rgba(200,168,80,0.15)',
        '--accent-border-hover': 'rgba(200,168,80,0.25)', '--accent-surface': 'rgba(200,168,80,0.08)',
        '--border': 'rgba(255,248,200,0.07)', '--color-error': '#E87A5D',
      },
      blue: {
        '--bg': '#00010A', '--bg-elevated': '#02040E', '--bg-card': '#050818',
        '--text-primary': '#D8E8F8', '--text-secondary': '#7898B8', '--text-muted': '#3A5878',
        '--accent': '#3A9AE0', '--accent-glow': 'rgba(58,154,224,0.15)',
        '--accent-border-hover': 'rgba(58,154,224,0.25)', '--accent-surface': 'rgba(58,154,224,0.08)',
        '--border': 'rgba(58,154,224,0.08)', '--color-error': '#E87A5D',
      },
      black: {
        '--bg': '#000000', '--bg-elevated': '#080608', '--bg-card': '#100E10',
        '--text-primary': '#E0D0F0', '--text-secondary': '#9080A8', '--text-muted': '#504860',
        '--accent': '#9855D4', '--accent-glow': 'rgba(152,85,212,0.15)',
        '--accent-border-hover': 'rgba(152,85,212,0.25)', '--accent-surface': 'rgba(152,85,212,0.08)',
        '--border': 'rgba(152,85,212,0.08)', '--color-error': '#E87A5D',
      },
      red: {
        '--bg': '#080000', '--bg-elevated': '#100202', '--bg-card': '#180404',
        '--text-primary': '#F5E0D5', '--text-secondary': '#B07060', '--text-muted': '#684040',
        '--accent': '#E04020', '--accent-glow': 'rgba(224,64,32,0.15)',
        '--accent-border-hover': 'rgba(224,64,32,0.25)', '--accent-surface': 'rgba(224,64,32,0.08)',
        '--border': 'rgba(224,64,32,0.08)', '--color-error': '#E87A5D',
      },
      green: {
        '--bg': '#000800', '--bg-elevated': '#020E02', '--bg-card': '#041604',
        '--text-primary': '#D8F0DC', '--text-secondary': '#70B078', '--text-muted': '#3A6840',
        '--accent': '#40A850', '--accent-glow': 'rgba(64,168,80,0.15)',
        '--accent-border-hover': 'rgba(64,168,80,0.25)', '--accent-surface': 'rgba(64,168,80,0.08)',
        '--border': 'rgba(64,168,80,0.08)', '--color-error': '#E87A5D',
      },
      // Guilds (colour pairs)
      azorius: {
        '--bg': '#01020A', '--bg-elevated': '#04060E', '--bg-card': '#080B18',
        '--text-primary': '#DDE8F5', '--text-secondary': '#809AB8', '--text-muted': '#3E6080',
        '--accent': '#78B0E8', '--accent-glow': 'rgba(120,176,232,0.15)',
        '--accent-border-hover': 'rgba(120,176,232,0.25)', '--accent-surface': 'rgba(120,176,232,0.08)',
        '--border': 'rgba(120,176,232,0.08)', '--color-error': '#E87A5D',
      },
      dimir: {
        '--bg': '#000008', '--bg-elevated': '#030312', '--bg-card': '#06061E',
        '--text-primary': '#C0CEEE', '--text-secondary': '#5870A8', '--text-muted': '#2A3A68',
        '--accent': '#4868E0', '--accent-glow': 'rgba(72,104,224,0.2)',
        '--accent-border-hover': 'rgba(72,104,224,0.30)', '--accent-surface': 'rgba(72,104,224,0.10)',
        '--border': 'rgba(72,104,224,0.09)', '--color-error': '#E87A5D',
      },
      rakdos: {
        '--bg': '#060000', '--bg-elevated': '#0E0204', '--bg-card': '#140408',
        '--text-primary': '#F0C8C0', '--text-secondary': '#A05858', '--text-muted': '#603030',
        '--accent': '#C81828', '--accent-glow': 'rgba(200,24,40,0.15)',
        '--accent-border-hover': 'rgba(200,24,40,0.25)', '--accent-surface': 'rgba(200,24,40,0.08)',
        '--border': 'rgba(200,24,40,0.08)', '--color-error': '#E87A5D',
      },
      gruul: {
        '--bg': '#060200', '--bg-elevated': '#0C0600', '--bg-card': '#140800',
        '--text-primary': '#F0E0C0', '--text-secondary': '#B09060', '--text-muted': '#705830',
        '--accent': '#D06020', '--accent-glow': 'rgba(208,96,32,0.15)',
        '--accent-border-hover': 'rgba(208,96,32,0.25)', '--accent-surface': 'rgba(208,96,32,0.08)',
        '--border': 'rgba(208,96,32,0.08)', '--color-error': '#E87A5D',
      },
      selesnya: {
        '--bg': '#010604', '--bg-elevated': '#050E08', '--bg-card': '#091408',
        '--text-primary': '#E0EEDD', '--text-secondary': '#88B880', '--text-muted': '#486848',
        '--accent': '#70BC58', '--accent-glow': 'rgba(112,188,88,0.15)',
        '--accent-border-hover': 'rgba(112,188,88,0.25)', '--accent-surface': 'rgba(112,188,88,0.08)',
        '--border': 'rgba(112,188,88,0.08)', '--color-error': '#E87A5D',
      },
      orzhov: {
        '--bg': '#050402', '--bg-elevated': '#0C0A06', '--bg-card': '#14100A',
        '--text-primary': '#EEE4D0', '--text-secondary': '#A09070', '--text-muted': '#605848',
        '--accent': '#C8A050', '--accent-glow': 'rgba(200,160,80,0.15)',
        '--accent-border-hover': 'rgba(200,160,80,0.25)', '--accent-surface': 'rgba(200,160,80,0.08)',
        '--border': 'rgba(200,160,80,0.07)', '--color-error': '#E87A5D',
      },
      izzet: {
        '--bg': '#040008', '--bg-elevated': '#08000E', '--bg-card': '#10001E',
        '--text-primary': '#D5C8F8', '--text-secondary': '#8068C0', '--text-muted': '#483080',
        '--accent': '#7038E0', '--accent-glow': 'rgba(112,56,224,0.15)',
        '--accent-border-hover': 'rgba(112,56,224,0.25)', '--accent-surface': 'rgba(112,56,224,0.08)',
        '--border': 'rgba(112,56,224,0.08)', '--color-error': '#E87A5D',
      },
      golgari: {
        '--bg': '#010402', '--bg-elevated': '#050A04', '--bg-card': '#0A1008',
        '--text-primary': '#C8E0C0', '--text-secondary': '#6A9060', '--text-muted': '#3A5830',
        '--accent': '#508840', '--accent-glow': 'rgba(80,136,64,0.15)',
        '--accent-border-hover': 'rgba(80,136,64,0.25)', '--accent-surface': 'rgba(80,136,64,0.08)',
        '--border': 'rgba(80,136,64,0.08)', '--color-error': '#E87A5D',
      },
      boros: {
        '--bg': '#060300', '--bg-elevated': '#0E0800', '--bg-card': '#160C00',
        '--text-primary': '#F8E8D0', '--text-secondary': '#C09860', '--text-muted': '#7A5E30',
        '--accent': '#E87820', '--accent-glow': 'rgba(232,120,32,0.15)',
        '--accent-border-hover': 'rgba(232,120,32,0.25)', '--accent-surface': 'rgba(232,120,32,0.08)',
        '--border': 'rgba(232,120,32,0.08)', '--color-error': '#E87A5D',
      },
      simic: {
        '--bg': '#000806', '--bg-elevated': '#001208', '--bg-card': '#001C10',
        '--text-primary': '#C8F0E5', '--text-secondary': '#58B898', '--text-muted': '#2A7860',
        '--accent': '#28C890', '--accent-glow': 'rgba(40,200,144,0.15)',
        '--accent-border-hover': 'rgba(40,200,144,0.25)', '--accent-surface': 'rgba(40,200,144,0.08)',
        '--border': 'rgba(40,200,144,0.08)', '--color-error': '#E87A5D',
      },
      // Shards (three adjacent colours)
      bant: {
        '--bg': '#000804', '--bg-elevated': '#030E08', '--bg-card': '#061508',
        '--text-primary': '#D8EEE0', '--text-secondary': '#70A888', '--text-muted': '#3A6858',
        '--accent': '#50A8C0', '--accent-glow': 'rgba(80,168,192,0.15)',
        '--accent-border-hover': 'rgba(80,168,192,0.25)', '--accent-surface': 'rgba(80,168,192,0.08)',
        '--border': 'rgba(80,168,192,0.08)', '--color-error': '#E87A5D',
      },
      esper: {
        '--bg': '#020308', '--bg-elevated': '#05060E', '--bg-card': '#090B18',
        '--text-primary': '#D8DCF0', '--text-secondary': '#7880A8', '--text-muted': '#3A4068',
        '--accent': '#8890C8', '--accent-glow': 'rgba(136,144,200,0.15)',
        '--accent-border-hover': 'rgba(136,144,200,0.25)', '--accent-surface': 'rgba(136,144,200,0.08)',
        '--border': 'rgba(136,144,200,0.08)', '--color-error': '#E87A5D',
      },
      grixis: {
        '--bg': '#050008', '--bg-elevated': '#0A0010', '--bg-card': '#10001A',
        '--text-primary': '#E8C0D0', '--text-secondary': '#905088', '--text-muted': '#503048',
        '--accent': '#C02888', '--accent-glow': 'rgba(192,40,136,0.15)',
        '--accent-border-hover': 'rgba(192,40,136,0.25)', '--accent-surface': 'rgba(192,40,136,0.08)',
        '--border': 'rgba(192,40,136,0.08)', '--color-error': '#E87A5D',
      },
      jund: {
        '--bg': '#060200', '--bg-elevated': '#0C0600', '--bg-card': '#140A00',
        '--text-primary': '#EEE0C0', '--text-secondary': '#B08860', '--text-muted': '#6A4830',
        '--accent': '#B85020', '--accent-glow': 'rgba(184,80,32,0.15)',
        '--accent-border-hover': 'rgba(184,80,32,0.25)', '--accent-surface': 'rgba(184,80,32,0.08)',
        '--border': 'rgba(184,80,32,0.08)', '--color-error': '#E87A5D',
      },
      naya: {
        '--bg': '#050400', '--bg-elevated': '#0C0900', '--bg-card': '#141200',
        '--text-primary': '#F0EACC', '--text-secondary': '#C0A860', '--text-muted': '#806830',
        '--accent': '#D4A020', '--accent-glow': 'rgba(212,160,32,0.15)',
        '--accent-border-hover': 'rgba(212,160,32,0.25)', '--accent-surface': 'rgba(212,160,32,0.08)',
        '--border': 'rgba(212,160,32,0.08)', '--color-error': '#E87A5D',
      },
      // Wedges (three non-adjacent colours)
      abzan: {
        '--bg': '#040402', '--bg-elevated': '#0A0A06', '--bg-card': '#121008',
        '--text-primary': '#E4DCC8', '--text-secondary': '#988868', '--text-muted': '#585840',
        '--accent': '#908858', '--accent-glow': 'rgba(144,136,88,0.15)',
        '--accent-border-hover': 'rgba(144,136,88,0.25)', '--accent-surface': 'rgba(144,136,88,0.08)',
        '--border': 'rgba(144,136,88,0.08)', '--color-error': '#E87A5D',
      },
      jeskai: {
        '--bg': '#020308', '--bg-elevated': '#05070E', '--bg-card': '#08091A',
        '--text-primary': '#D8E0F8', '--text-secondary': '#8090C8', '--text-muted': '#404880',
        '--accent': '#5878F0', '--accent-glow': 'rgba(88,120,240,0.15)',
        '--accent-border-hover': 'rgba(88,120,240,0.25)', '--accent-surface': 'rgba(88,120,240,0.08)',
        '--border': 'rgba(88,120,240,0.08)', '--color-error': '#E87A5D',
      },
      sultai: {
        '--bg': '#000806', '--bg-elevated': '#020E0A', '--bg-card': '#041610',
        '--text-primary': '#C0D8CC', '--text-secondary': '#508878', '--text-muted': '#285848',
        '--accent': '#389880', '--accent-glow': 'rgba(56,152,128,0.15)',
        '--accent-border-hover': 'rgba(56,152,128,0.25)', '--accent-surface': 'rgba(56,152,128,0.08)',
        '--border': 'rgba(56,152,128,0.08)', '--color-error': '#E87A5D',
      },
      mardu: {
        '--bg': '#070200', '--bg-elevated': '#0E0500', '--bg-card': '#160800',
        '--text-primary': '#F0D8C8', '--text-secondary': '#B87858', '--text-muted': '#704838',
        '--accent': '#D03020', '--accent-glow': 'rgba(208,48,32,0.15)',
        '--accent-border-hover': 'rgba(208,48,32,0.25)', '--accent-surface': 'rgba(208,48,32,0.08)',
        '--border': 'rgba(208,48,32,0.08)', '--color-error': '#E87A5D',
      },
      temur: {
        '--bg': '#000804', '--bg-elevated': '#020E08', '--bg-card': '#041808',
        '--text-primary': '#D0ECD8', '--text-secondary': '#68A880', '--text-muted': '#2A6840',
        '--accent': '#38B868', '--accent-glow': 'rgba(56,184,104,0.15)',
        '--accent-border-hover': 'rgba(56,184,104,0.25)', '--accent-surface': 'rgba(56,184,104,0.08)',
        '--border': 'rgba(56,184,104,0.08)', '--color-error': '#E87A5D',
      },
    };

    function applyTheme(id) {
      const t = THEMES[id] || THEMES.colorless;
      const root = document.documentElement;
      Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v));
      document.querySelectorAll('.theme-select').forEach(s => { s.value = id; });
      if (currentCode) renderCode(currentCode);
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = t['--bg'] || '#000000'; });
      localStorage.setItem('edhTheme', id);
    }

    applyTheme(localStorage.getItem('edhTheme') || 'colorless');

    document.addEventListener('change', e => {
      if (e.target.classList.contains('theme-select')) applyTheme(e.target.value);
    });

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const viewConnect  = document.getElementById('view-connect');
    const viewLobby    = document.getElementById('view-lobby');
    const viewGame     = document.getElementById('view-game');
    const elCode       = document.getElementById('game-code');
    const elQr         = document.getElementById('qr-container');
    const elPlayerList = document.getElementById('player-list');
    const elTimers     = document.getElementById('timers');
    const elCodeRow          = document.getElementById('code-row');
    const elBtnNewGame       = document.getElementById('btn-new-game');
    const elBtnJoin          = document.getElementById('btn-join-code');
    const elBtnStart         = document.getElementById('btn-start');
    const elBtnPass          = document.getElementById('btn-pass');
    const elBtnPause         = document.getElementById('btn-pause');
    const elInputName        = document.getElementById('input-name');
    const elInputCode        = document.getElementById('input-code');
    const elInputTime        = document.getElementById('input-time');
    const elInputDelay       = document.getElementById('input-delay');
    const elWsIndicator      = document.getElementById('ws-indicator');
    const elPassName         = document.getElementById('pass-name');
    const elError            = document.getElementById('connect-error');
    const elHostWaiting      = document.getElementById('host-waiting');
    const elModalReady       = document.getElementById('modal-ready');
    const elBtnConfirmStart  = document.getElementById('btn-confirm-start');
    const elBtnCancelStart   = document.getElementById('btn-cancel-start');
    const elModalBackdrop    = document.getElementById('modal-backdrop');
    const elGameRoomCode     = document.getElementById('game-room-code');
    const elToastContainer   = document.getElementById('toast-container');
    const elA2hsBanner       = document.getElementById('a2hs-banner');
    const elVictoryOverlay   = document.getElementById('victory-overlay');
    const elVictoryName      = document.getElementById('victory-name');
    const elBtnReturnLobby   = document.getElementById('btn-return-lobby');
    const elHistoryLog       = document.getElementById('history-log');
    const elModalHpElim      = document.getElementById('modal-hp-elim');
    const elHpElimTitle      = document.getElementById('hp-elim-title');
    const elModalTimeElim    = document.getElementById('modal-time-elim');
    const elHpArea           = document.getElementById('hp-area');

    // One-time event delegation for fixed HP area buttons
    elHpArea.addEventListener('click', e => {
      const btn = e.target.closest('.hp-btn');
      if (!btn || !playerId) return;
      send({ type: 'HP_CHANGE', playerId, delta: parseInt(btn.dataset.delta, 10) });
    });

    // ── HP history state ──────────────────────────────────────────────────────
    const hpHistory = [];              // committed log entries [{text, delta}]
    const hpPending = {};              // playerId → {delta, resultHp, name, wallTime, timer}
    let   hpElimPending   = false;     // hp-elimination modal open
    let   timeElimPending = false;     // time-out elimination modal open
    let   prevPlayers   = [];          // for HP change detection

    // ── HP history helpers ────────────────────────────────────────────────────
    function detectHpChanges(gs) {
      for (const p of gs.players) {
        const prev = prevPlayers.find(x => x.id === p.id);
        if (prev && p.hp !== undefined && prev.hp !== undefined && p.hp !== prev.hp) {
          onHpChange(p, gs.players.indexOf(p), prev.hp, p.hp);
        }
      }
      prevPlayers = gs.players.map(p => ({ ...p }));
    }

    function onHpChange(player, idx, oldHp, newHp) {
      const delta = newHp - oldHp;
      spawnHpFloat(idx, delta);
      recordHpChange(player, oldHp, newHp, delta);
      if (player.id === playerId && newHp <= 0 && !player.eliminated && !hpElimPending) {
        hpElimPending = true;
        elHpElimTitle.textContent = `You're at ${newHp} HP`;
        elModalHpElim.hidden = false;
      }
    }

    function spawnHpFloat(idx, delta) {
      const hpEl = document.getElementById(`hp-${idx}`);
      if (!hpEl) return;
      const block = hpEl.parentElement;
      const float = document.createElement('span');
      float.className = 'hp-float ' + (delta > 0 ? 'hp-gain' : 'hp-loss');
      float.textContent = (delta > 0 ? '+' : '') + delta;
      block.appendChild(float);
      float.addEventListener('animationend', () => float.remove(), { once: true });
    }

    function recordHpChange(player, oldHp, newHp, delta) {
      if (hpPending[player.id]) {
        clearTimeout(hpPending[player.id].timer);
        hpPending[player.id].delta += delta;
        hpPending[player.id].resultHp = newHp;
      } else {
        hpPending[player.id] = { delta, resultHp: newHp, name: player.name, wallTime: Date.now() };
      }
      hpPending[player.id].timer = setTimeout(() => commitHpLog(player.id), 10000);
      renderHistory();
    }

    function commitHpLog(pid) {
      const entry = hpPending[pid];
      if (!entry) return;
      delete hpPending[pid];
      const sign = entry.delta > 0 ? '+' : '';
      hpHistory.push({ text: `[${fmtWallTime(entry.wallTime)}] ${entry.name}: ${sign}${entry.delta} HP (Result: ${entry.resultHp})`, delta: entry.delta });
      renderHistory();
    }

    function fmtWallTime(ts) {
      const d = new Date(ts);
      const h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }

    function renderHistory() {
      elHistoryLog.innerHTML = '';
      const pendingEntries = Object.values(hpPending);
      if (pendingEntries.length === 0 && hpHistory.length === 0) {
        elHistoryLog.innerHTML = '<div class="history-empty">No HP changes yet.</div>';
        return;
      }
      for (const entry of hpHistory) {
        const cls = entry.delta > 0 ? 'history-delta-pos' : 'history-delta-neg';
        const el  = document.createElement('div');
        el.className = 'history-entry';
        el.innerHTML = `<span class="${cls}">${escHtml(entry.text)}</span>`;
        elHistoryLog.appendChild(el);
      }
      for (const entry of pendingEntries) {
        const sign = entry.delta > 0 ? '+' : '';
        const cls  = entry.delta > 0 ? 'history-delta-pos' : 'history-delta-neg';
        const el = document.createElement('div');
        el.className = 'history-entry pending';
        el.innerHTML = `<span class="${cls}">[${fmtWallTime(entry.wallTime)}] ${escHtml(entry.name)}: ${sign}${entry.delta} HP (Result: ${entry.resultHp})</span>`;
        elHistoryLog.appendChild(el);
      }
      elHistoryLog.scrollTop = elHistoryLog.scrollHeight;
    }

    // ── Tab switching ─────────────────────────────────────────────────────────
    let activeTab = 'clock';

    function setTab(tab) {
      activeTab = tab;
      document.getElementById('tab-clock').classList.toggle('active',   tab === 'clock');
      document.getElementById('tab-history').classList.toggle('active', tab === 'history');
      document.getElementById('timers').classList.toggle('tab-hidden',  tab !== 'clock');
      elHistoryLog.classList.toggle('visible', tab === 'history');
      if (tab === 'history') renderHistory();
    }

    document.getElementById('tab-clock').addEventListener('click',   () => setTab('clock'));
    document.getElementById('tab-history').addEventListener('click', () => setTab('history'));

    // ── Toast ─────────────────────────────────────────────────────────────────
    function showToast(message, isError = true, duration = 3500) {
      const toast = document.createElement('div');
      toast.className = 'toast' + (isError ? ' toast-error' : '');
      toast.textContent = message;
      elToastContainer.appendChild(toast);
      requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
      setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      }, duration);
    }

    // ── Reconnect overlay ─────────────────────────────────────────────────────
    function setReconnecting(on) {
      document.body.classList.toggle('reconnecting', on);
    }

    // ── WS status indicator ───────────────────────────────────────────────────
    function setWsStatus(state) {
      elWsIndicator.className = 'ws-' + state;
    }

    // ── Add to Home Screen ────────────────────────────────────────────────────
    let a2hsPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      a2hsPrompt = e;
      elA2hsBanner.classList.add('visible');
    });

    document.getElementById('a2hs-install').addEventListener('click', async () => {
      if (!a2hsPrompt) return;
      a2hsPrompt.prompt();
      await a2hsPrompt.userChoice;
      a2hsPrompt = null;
      elA2hsBanner.classList.remove('visible');
    });

    document.getElementById('a2hs-dismiss').addEventListener('click', () => {
      elA2hsBanner.classList.remove('visible');
    });

    // iOS: no beforeinstallprompt — show manual hint if in Safari (not standalone)
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && navigator.standalone);
    if (isIos && !isStandalone) {
      elA2hsBanner.querySelector('.a2hs-text').textContent =
        'Install: tap the Share icon then "Add to Home Screen".';
      document.getElementById('a2hs-install').hidden = true;
      elA2hsBanner.classList.add('visible');
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    if (playerName) elInputName.value = playerName;

    // Pre-fill code if arriving via QR / shared link
    const params   = new URLSearchParams(location.search);
    const joinCode = params.get('join') || params.get('code');
    if (joinCode) {
      elInputCode.value = joinCode.toUpperCase();
      // Arriving via invite — hide new-game path, promote join to primary
      document.getElementById('new-game-actions').hidden = true;
      document.getElementById('connect-divider').hidden  = true;
      elBtnJoin.className = 'btn-primary';
    }

    showConnect();

    // ── Connect-screen actions ────────────────────────────────────────────────
    elBtnNewGame.addEventListener('click', async () => {
      const name = elInputName.value.trim();
      if (!name) { elInputName.focus(); return; }

      setConnectBusy(true);
      try {
        const res = await fetch('/edh/new');
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const { code } = await res.json();
        startSession(code, name);
      } catch (err) {
        setConnectBusy(false);
        elError.textContent = 'Could not reach server — are you online?';
      }
    });

    elBtnJoin.addEventListener('click', () => {
      const name = elInputName.value.trim();
      const code = elInputCode.value.trim().toUpperCase();
      if (!name) { elInputName.focus(); return; }
      if (code.length !== 5) { elInputCode.focus(); return; }
      startSession(code, name);
    });

    // Enter key on code input triggers join
    elInputCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') elBtnJoin.click();
    });

    // ── Session start (WS connect + JOIN) ─────────────────────────────────────
    function startSession(code, name) {
      playerName = name;
      localStorage.setItem('edhPlayerName', name);
      currentCode = code;
      connectWs(code, name);
      showLobby();
      renderCode(code);
    }

    // ── WebSocket ─────────────────────────────────────────────────────────────
    // nameOverride: sent in onopen for the initial JOIN; on auto-reconnect
    // we reuse the module-level playerName (already set by startSession).
    function connectWs(code, nameOverride) {
      if (ws) { ws.onclose = null; ws.close(); }
      setWsStatus('offline');
      ws = new WebSocket(`${WS_PROTO}://${WORKER_HOST}/edh/game/${code}`);

      ws.onopen = () => {
        setWsStatus('connected');
        setReconnecting(false);
        const name = nameOverride || playerName;
        if (name) send({ type: 'JOIN', playerId, name });
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ERROR') { handleServerError(msg); return; }
        if (msg.serverNow) clockOffset = Date.now() - msg.serverNow;
        gameState = msg;
        render();
      };

      ws.onerror = () => { setWsStatus('offline'); };

      ws.onclose = () => {
        setWsStatus('reconnecting');
        // Only show overlay if we're mid-session (have received at least one state)
        if (currentCode && gameState.phase) setReconnecting(true);
        setTimeout(() => connectWs(code), 2000);
      };
    }

    function send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    }

    // ── Server error handling ─────────────────────────────────────────────────
    function handleServerError(msg) {
      const reason = msg.reason || '';
      if (reason === 'INVALID_CODE') {
        showToast('Invalid room code.');
      } else if (reason === 'LOBBY_FULL') {
        showToast('Lobby full — 16 players maximum.');
      } else {
        showToast(msg.message || 'Connection error.');
      }
      // Disconnect cleanly and return to connect screen
      if (ws) { ws.onclose = null; ws.close(); }
      setReconnecting(false);
      currentCode = null;
      showConnect();
    }

    // ── Long-press utility ────────────────────────────────────────────────────

    // ── Touch-to-wake (inactive players) ─────────────────────────────────────
    let wakeTimer = null;
    document.addEventListener('pointerdown', () => {
      if (!document.body.classList.contains('inactive')) return;
      document.body.classList.add('wake');
      clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => document.body.classList.remove('wake'), 5000);
    }, { passive: true });

    // ── Visibility / reconnect ────────────────────────────────────────────────
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !currentCode) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWs(currentCode);
      } else {
        send({ type: 'GET_STATE' });
      }
      requestWakeLock();
    });

    // ── Wake Lock ─────────────────────────────────────────────────────────────
    let wakeLock = null;
    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) return;
      try {
        if (wakeLock) wakeLock.release();
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (_) {}
    }
    requestWakeLock();

    // ── Render ────────────────────────────────────────────────────────────────
    function render() {
      const gs = gameState;
      if (!gs.phase) return;

      // Reset HP history when a new game starts
      if (prevPhase === 'lobby' && gs.phase === 'game') {
        Object.values(hpPending).forEach(e => clearTimeout(e.timer));
        hpHistory.length = 0;
        Object.keys(hpPending).forEach(k => delete hpPending[k]);
        prevPlayers = [];
        renderHistory();
      }
      prevPhase = gs.phase;

      const myIndex          = (gs.players || []).findIndex(p => p.id === playerId);
      const isSelfEliminated = myIndex !== -1 && !!gs.players[myIndex]?.eliminated;
      const isMyTurn         = gs.phase === 'game' && gs.currentTurn === myIndex && !isSelfEliminated;

      elVictoryOverlay.hidden = gs.phase !== 'victory';

      if (gs.phase === 'lobby') {
        showLobby();
        renderLobby(gs);
      } else if (gs.phase === 'victory') {
        showGame();
        renderVictory(gs);
      } else {
        showGame();
        renderGame(gs, isMyTurn, isSelfEliminated, myIndex);
        detectHpChanges(gs);
      }

      document.body.classList.toggle('inactive',        gs.phase === 'game' && !isMyTurn && !isSelfEliminated);
      document.body.classList.toggle('self-eliminated',  gs.phase === 'game' && isSelfEliminated);
    }

    function renderVictory(gs) {
      const winner = gs.players.find(p => p.id === gs.winnerId);
      elVictoryName.textContent = winner ? winner.name : '???';
      elBtnReturnLobby.hidden = gs.hostId !== playerId;
    }

    function renderLobby(gs) {
      const isHost        = gs.hostId === playerId;           // can reorder
      const isFirstInOrder = gs.players[0]?.id === playerId;  // can start

      // First-in-turn-order sees Start button; others see "waiting" text
      elBtnStart.style.display    = isFirstInOrder ? '' : 'none';
      elHostWaiting.style.display = isFirstInOrder ? 'none' : 'block';
      elBtnStart.disabled = gs.players.length < 2;

      // Sync time input with server (unless the user is actively editing it)
      if (document.activeElement !== elInputTime) {
        elInputTime.value = Math.round(gs.defaultMs / 60000);
      }
      if (document.activeElement !== elInputDelay) {
        elInputDelay.value = Math.round(gs.delayMs / 1000);
      }

      // Player roster with reorder controls (↑/↓, host-only)
      elPlayerList.innerHTML = '';
      gs.players.forEach((p, i) => {
        const li = document.createElement('li');

        const pip  = `<span class="pip"></span>`;
        const name = `<span class="player-name-text">${escHtml(p.name)}</span>`;
        const you  = p.id === playerId ? ' <span style="color:var(--accent);font-size:0.65rem">(you)</span>' : '';

        let reorderHtml = '';
        if (isHost) {
          reorderHtml = `
            <span class="reorder-btns">
              <button class="reorder-btn" data-dir="up" data-idx="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="reorder-btn" data-dir="down" data-idx="${i}" ${i === gs.players.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            </span>`;
        }

        li.innerHTML = pip + name + you + reorderHtml;
        elPlayerList.appendChild(li);
      });

      // Reorder button handlers (delegated — rebuilt each render)
      elPlayerList.querySelectorAll('.reorder-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const dir = btn.dataset.dir;
          const order = gs.players.map(p => p.id);
          const swap  = dir === 'up' ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= order.length) return;
          [order[idx], order[swap]] = [order[swap], order[idx]];
          send({ type: 'REORDER', order });
        });
      });
    }

    function renderGame(gs, isMyTurn, isSelfEliminated, myIndex) {
      const cp = gs.players[gs.currentTurn];
      viewGame.classList.toggle('paused', gs.paused);

      elBtnPause.textContent = gs.paused ? 'Resume' : 'Pause';
      elBtnPass.disabled = gs.paused || !isMyTurn || isSelfEliminated;
      elPassName.textContent = isMyTurn ? 'Pass turn' : (cp ? cp.name : '');

      // You-died final time display
      if (isSelfEliminated && myIndex !== -1) {
        document.getElementById('you-died-time').textContent = fmtMs(gs.players[myIndex].bankedMs);
      }


      elTimers.innerHTML = '';
      for (let i = 0; i < gs.players.length; i++) {
        const p      = gs.players[i];
        const isSelf = p.id === playerId;
        const li     = document.createElement('li');
        li.dataset.idx = i;
        li.classList.toggle('active-turn', i === gs.currentTurn && !p.eliminated);
        li.classList.toggle('eliminated',  p.eliminated);

        const displayMs = i === gs.currentTurn && !gs.paused && !p.eliminated
          ? liveMs(gs)
          : p.bankedMs;
        li.classList.toggle('low-time', displayMs < 5 * 60 * 1000 && displayMs > 0 && !p.eliminated);

        // Delay badge on active-turn row — tick() drives content/visibility
        const isActive   = i === gs.currentTurn && !p.eliminated;
        const delayBadge = isActive
          ? `<span class="delay-badge" id="delay-badge" hidden></span>`
          : '';


        const hpVal  = p.hp ?? gs.defaultHp ?? 40;
        const hpHtml = `<span class="hp-block"><span class="player-hp" id="hp-${i}">${hpVal}hp</span></span>`;

        li.classList.toggle('low-hp', hpVal <= 5 && !p.eliminated);

        li.innerHTML = `
          <span class="player-meta">
            <span class="player-name">${escHtml(p.name)}</span>
          </span>
          ${hpHtml}
          ${delayBadge}
          <span class="player-time" id="timer-${i}">${fmtMs(displayMs)}</span>
        `;
        elTimers.appendChild(li);


      }

      // Show HP area for self player only when not eliminated
      const selfP = gs.players.find(p => p.id === playerId);
      elHpArea.hidden = !selfP || selfP.eliminated;
      if (selfP) {
        document.getElementById('hp-area-value').textContent = selfP.hp ?? gs.defaultHp ?? 40;
      }
    }

    // ── rAF tick ──────────────────────────────────────────────────────────────
    function tick() {
      const gs = gameState;
      if (gs.phase === 'game' && !gs.paused && gs.turnStartTime) {
        const el = document.getElementById(`timer-${gs.currentTurn}`);
        if (el) {
          const ms = liveMs(gs);
          el.textContent = fmtMs(ms);
          const li = el.closest('li');
          if (li) li.classList.toggle('low-time', ms < 5 * 60 * 1000 && ms > 0);
          const currentPlayer = gs.players[gs.currentTurn];
          if (ms <= 0 && currentPlayer && currentPlayer.id === playerId && !currentPlayer.eliminated && !timeElimPending) {
            timeElimPending = true;
            elModalTimeElim.hidden = false;
          }
        }
        const badge = document.getElementById('delay-badge');
        if (badge) {
          const dr = delayRemainingMs(gs);
          badge.hidden = dr === 0;
          if (dr > 0) badge.textContent = `+${Math.ceil(dr / 1000)}s`;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // Display Time = Banked - max(0, elapsed - delayMs)
    function liveMs(gs) {
      const elapsed = Date.now() - gs.turnStartTime - clockOffset;
      const mainElapsed = Math.max(0, elapsed - (gs.delayMs || 0));
      return Math.max(0, gs.players[gs.currentTurn].bankedMs - mainElapsed);
    }

    // Milliseconds remaining in the current turn's delay buffer
    function delayRemainingMs(gs) {
      if (!gs.turnStartTime || gs.paused || !gs.delayMs) return 0;
      const elapsed = Date.now() - gs.turnStartTime - clockOffset;
      return Math.max(0, gs.delayMs - elapsed);
    }

    // ── Lobby actions ─────────────────────────────────────────────────────────
    elInputTime.addEventListener('change', () => {
      const mins = parseInt(elInputTime.value, 10);
      if (mins >= 1 && mins <= 999) send({ type: 'SET_TIME', minutes: mins });
    });

    elInputDelay.addEventListener('change', () => {
      const secs = parseInt(elInputDelay.value, 10);
      if (secs >= 0 && secs <= 30) send({ type: 'SET_DELAY', seconds: secs });
    });

    // Start button → open confirmation modal
    elBtnStart.addEventListener('click', () => {
      elModalReady.hidden = false;
    });

    // Modal: confirm → actually start
    elBtnConfirmStart.addEventListener('click', () => {
      elModalReady.hidden = true;
      send({ type: 'START_GAME' });
      requestWakeLock();
    });

    // Modal: cancel / backdrop click → dismiss
    function closeModal() { elModalReady.hidden = true; }
    elBtnCancelStart.addEventListener('click', closeModal);
    elModalBackdrop.addEventListener('click', closeModal);

    elBtnPass.addEventListener('click', () => {
      send({ type: 'PASS_TURN', playerId });
    });

    elBtnPause.addEventListener('click', () => {
      send({ type: gameState.paused ? 'RESUME' : 'PAUSE', playerId });
    });

    elBtnReturnLobby.addEventListener('click', () => {
      send({ type: 'RETURN_TO_LOBBY', playerId });
    });

    // Time elimination modal
    document.getElementById('btn-time-elim-confirm').addEventListener('click', () => {
      elModalTimeElim.hidden = true;
      send({ type: 'ELIMINATE', playerId });
    });

    // HP elimination modal
    document.getElementById('btn-hp-elim-confirm').addEventListener('click', () => {
      elModalHpElim.hidden = true;
      hpElimPending = false;
      send({ type: 'ELIMINATE', playerId });
    });

    function dismissHpModal() {
      elModalHpElim.hidden = true;
      hpElimPending = false;
    }
    document.getElementById('btn-hp-elim-cancel').addEventListener('click', dismissHpModal);
    document.getElementById('modal-hp-backdrop').addEventListener('click', dismissHpModal);

    elCodeRow.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(buildJoinUrl(currentCode));
        showToast('Link copied', false, 2000);
      } catch {
        showToast('Copy failed');
      }
    });
    elCodeRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elCodeRow.click(); }
    });

    // ── Nav toggle ────────────────────────────────────────────────────────────
    document.getElementById('nav-toggle').addEventListener('click', () => {
      document.getElementById('nav-links').classList.toggle('open');
    });

    // ── View helpers ──────────────────────────────────────────────────────────
    function showConnect() {
      viewConnect.classList.add('active');
      viewLobby.classList.remove('active');
      viewGame.classList.remove('active');
      document.body.classList.remove('in-game');
      setConnectBusy(false);
    }

    function showLobby() {
      viewLobby.classList.add('active');
      viewConnect.classList.remove('active');
      viewGame.classList.remove('active');
      document.body.classList.remove('in-game');
      // Reset HP modal and tab if returning from game
      elModalHpElim.hidden = true;
      hpElimPending = false;
      elModalTimeElim.hidden = true;
      timeElimPending = false;
      setTab('clock');
    }

    function showGame() {
      viewGame.classList.add('active');
      viewConnect.classList.remove('active');
      viewLobby.classList.remove('active');
      document.body.classList.add('in-game');
      elGameRoomCode.textContent = currentCode;
    }

    function setConnectBusy(busy) {
      elBtnNewGame.disabled = busy;
      elBtnJoin.disabled    = busy;
      elBtnNewGame.textContent = busy ? 'Creating…' : 'New game';
      elError.textContent = '';
    }

    // ── Misc helpers ──────────────────────────────────────────────────────────
    function renderCode(code) {
      elCode.textContent = code;
      const url = buildJoinUrl(code);
      elQr.innerHTML = '';
      const canvas = document.createElement('canvas');
      elQr.appendChild(canvas);
      const style = getComputedStyle(document.documentElement);
      const qrBg = style.getPropertyValue('--bg').trim() || '#000000';
      const qrFg = style.getPropertyValue('--text-primary').trim() || '#E8E6E3';
      new QRious({
        element:    canvas,
        value:      url,
        size:       128,
        background: qrBg,
        foreground: qrFg,
        level:      'M',
      });
    }

    function buildJoinUrl(code) {
      return `${location.origin}/edh_clock/?join=${code}`;
    }

    function fmtMs(ms) {
      if (ms <= 0) return '0:00:00';
      const s   = Math.ceil(ms / 1000);
      const hrs = Math.floor(s / 3600);
      const min = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return `${hrs}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    function escHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  })();
  
