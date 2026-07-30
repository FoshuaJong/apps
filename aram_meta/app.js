(() => {
  const API_URL = '/aram_meta/api/data';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MARGIN = { top: 24, right: 28, bottom: 56, left: 56 };
  const VIEW_W = 960;
  const VIEW_H = 560;
  const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];
  const TIER_COLOR_VAR = { S: '--tier-s', A: '--tier-a', B: '--tier-b', C: '--tier-c', D: '--tier-d' };

  const state = {
    champions: [],
    activeTier: 'all',
    searchTerm: '',
    sortKey: 'winRate',
    sortDir: 'desc',
    viewMode: 'chart',
  };

  const els = {
    metaLine: document.getElementById('metaLine'),
    statGrid: document.getElementById('statGrid'),
    statGames: document.getElementById('statGames'),
    statLength: document.getElementById('statLength'),
    statTopWinRate: document.getElementById('statTopWinRate'),
    statTopWinDetail: document.getElementById('statTopWinDetail'),
    statPopular: document.getElementById('statPopular'),
    statPopularDetail: document.getElementById('statPopularDetail'),
    chartStatus: document.getElementById('chartStatus'),
    chartSvg: document.getElementById('chartSvg'),
    chartWrap: document.getElementById('chartWrap'),
    chartLegend: document.getElementById('chartLegend'),
    legendScale: document.getElementById('legendScale'),
    tooltip: document.getElementById('tooltip'),
    tierFilters: document.getElementById('tierFilters'),
    searchInput: document.getElementById('searchInput'),
    tableToggle: document.getElementById('tableToggle'),
    tableWrap: document.getElementById('tableWrap'),
    dataTable: document.getElementById('dataTable'),
    dataTableBody: document.getElementById('dataTableBody'),
  };

  init();

  async function init() {
    bindControls();
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onData(data);
    } catch (err) {
      showError(err);
    }
  }

  function onData(data) {
    state.champions = Array.isArray(data.champions) ? data.champions : [];
    renderMetaLine(data.patch, data.scrapedAt);
    renderStats(data.meta);
    if (!state.champions.length) {
      showError(new Error('No champion data available'));
      return;
    }
    els.chartStatus.hidden = true;
    els.chartSvg.hidden = false;
    els.chartLegend.hidden = false;
    renderLegend();
    renderChart();
    renderTable();
  }

  function showError(err) {
    els.chartStatus.hidden = false;
    els.chartStatus.classList.add('is-error');
    els.chartStatus.textContent = `Couldn't load data — ${err.message}`;
  }

  function renderMetaLine(patch, scrapedAt) {
    const parts = [];
    if (patch) parts.push(patch);
    if (scrapedAt) parts.push(`Updated ${relativeTime(scrapedAt)}`);
    els.metaLine.textContent = parts.join(' · ') || 'Latest data unavailable';
  }

  function renderStats(meta) {
    if (!meta) return;
    els.statGrid.hidden = false;
    setText(els.statGames, meta.gamesAnalyzed);
    setText(els.statLength, meta.avgGameLength);
    setText(els.statTopWinRate, meta.topWinRate && meta.topWinRate.value);
    setText(els.statTopWinDetail, meta.topWinRate && meta.topWinRate.detail);
    setText(els.statPopular, meta.mostPopular && meta.mostPopular.value);
    setText(els.statPopularDetail, meta.mostPopular && meta.mostPopular.detail);
  }

  function setText(el, value) {
    el.textContent = value || '—';
  }

  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return 'recently';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  // --- Controls ---
  function bindControls() {
    els.tierFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.tier-btn');
      if (!btn) return;
      state.activeTier = btn.dataset.tier;
      [...els.tierFilters.querySelectorAll('.tier-btn')].forEach((b) =>
        b.classList.toggle('is-active', b === btn)
      );
      if (state.champions.length) {
        renderChart();
        renderTable();
      }
    });

    els.searchInput.addEventListener('input', () => {
      state.searchTerm = els.searchInput.value.trim().toLowerCase();
      if (state.champions.length) renderChart();
    });

    els.tableToggle.addEventListener('click', () => {
      state.viewMode = state.viewMode === 'chart' ? 'table' : 'chart';
      const isTable = state.viewMode === 'table';
      els.tableToggle.setAttribute('aria-pressed', String(isTable));
      els.tableToggle.textContent = isTable ? 'View as chart' : 'View as table';
      els.chartWrap.hidden = isTable;
      els.tableWrap.hidden = !isTable;
    });

    els.dataTable.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = key === 'name' || key === 'tier' ? 'asc' : 'desc';
        }
        if (state.champions.length) renderTable();
      });
    });
  }

  function tierColorVar(tier) {
    return `var(${TIER_COLOR_VAR[tier] || '--tier-other'})`;
  }

  function visibleChampions() {
    return state.champions.filter(
      (c) => state.activeTier === 'all' || c.tier === state.activeTier
    );
  }

  // --- Scales ---
  function niceNumber(range, round) {
    const safeRange = range || 1;
    const exponent = Math.floor(Math.log10(safeRange));
    const fraction = safeRange / Math.pow(10, exponent);
    let niceFraction;
    if (round) {
      if (fraction < 1.5) niceFraction = 1;
      else if (fraction < 3) niceFraction = 2;
      else if (fraction < 7) niceFraction = 5;
      else niceFraction = 10;
    } else {
      if (fraction <= 1) niceFraction = 1;
      else if (fraction <= 2) niceFraction = 2;
      else if (fraction <= 5) niceFraction = 5;
      else niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
  }

  function niceScale(min, max, tickCount) {
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const range = niceNumber(max - min, false);
    const step = niceNumber(range / (tickCount - 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    const count = Math.round((niceMax - niceMin) / step) + 1;
    for (let i = 0; i < count; i++) {
      ticks.push(Math.round((niceMin + i * step) * 100) / 100);
    }
    return { min: niceMin, max: niceMax, ticks };
  }

  // --- Chart ---
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function clearSvg() {
    while (els.chartSvg.firstChild) els.chartSvg.removeChild(els.chartSvg.firstChild);
  }

  function renderChart() {
    const champs = state.champions;
    if (!champs.length) return;

    const pickRates = champs.map((c) => c.pickRate).filter((v) => v != null);
    const winRates = champs.map((c) => c.winRate).filter((v) => v != null);
    const xScale = niceScale(0, Math.max(...pickRates), 6);
    const yScale = niceScale(Math.min(...winRates), Math.max(...winRates), 6);

    const innerW = VIEW_W - MARGIN.left - MARGIN.right;
    const innerH = VIEW_H - MARGIN.top - MARGIN.bottom;
    const xPos = (v) => MARGIN.left + ((v - xScale.min) / (xScale.max - xScale.min)) * innerW;
    const yPos = (v) => MARGIN.top + innerH - ((v - yScale.min) / (yScale.max - yScale.min)) * innerH;

    clearSvg();

    const gridGroup = svgEl('g', { class: 'chart-grid' });
    yScale.ticks.forEach((t) => {
      const y = yPos(t);
      gridGroup.appendChild(
        svgEl('line', { class: 'chart-gridline', x1: MARGIN.left, x2: VIEW_W - MARGIN.right, y1: y, y2: y })
      );
      const label = svgEl('text', {
        class: 'chart-tick-label',
        x: MARGIN.left - 10,
        y: y + 3,
        'text-anchor': 'end',
      });
      label.textContent = `${t}%`;
      gridGroup.appendChild(label);
    });
    xScale.ticks.forEach((t) => {
      const x = xPos(t);
      const label = svgEl('text', {
        class: 'chart-tick-label',
        x,
        y: VIEW_H - MARGIN.bottom + 18,
        'text-anchor': 'middle',
      });
      label.textContent = `${t}%`;
      gridGroup.appendChild(label);
    });
    els.chartSvg.appendChild(gridGroup);

    els.chartSvg.appendChild(
      svgEl('line', {
        class: 'chart-axis-line',
        x1: MARGIN.left,
        x2: MARGIN.left,
        y1: MARGIN.top,
        y2: VIEW_H - MARGIN.bottom,
      })
    );
    els.chartSvg.appendChild(
      svgEl('line', {
        class: 'chart-axis-line',
        x1: MARGIN.left,
        x2: VIEW_W - MARGIN.right,
        y1: VIEW_H - MARGIN.bottom,
        y2: VIEW_H - MARGIN.bottom,
      })
    );

    const xTitle = svgEl('text', {
      class: 'chart-axis-title',
      x: MARGIN.left + innerW / 2,
      y: VIEW_H - 12,
      'text-anchor': 'middle',
    });
    xTitle.textContent = 'PICK RATE';
    els.chartSvg.appendChild(xTitle);

    const yTitle = svgEl('text', {
      class: 'chart-axis-title',
      x: 0,
      y: 0,
      transform: `translate(16, ${MARGIN.top + innerH / 2}) rotate(-90)`,
      'text-anchor': 'middle',
    });
    yTitle.textContent = 'WIN RATE';
    els.chartSvg.appendChild(yTitle);

    if (yScale.min < 50 && yScale.max > 50) {
      const y = yPos(50);
      els.chartSvg.appendChild(
        svgEl('line', { class: 'chart-refline', x1: MARGIN.left, x2: VIEW_W - MARGIN.right, y1: y, y2: y })
      );
      const refLabel = svgEl('text', {
        class: 'chart-refline-label',
        x: VIEW_W - MARGIN.right,
        y: y - 4,
        'text-anchor': 'end',
      });
      refLabel.textContent = '50% win rate';
      els.chartSvg.appendChild(refLabel);
    }

    const meanPick = pickRates.reduce((a, b) => a + b, 0) / pickRates.length;
    const meanX = xPos(meanPick);
    els.chartSvg.appendChild(
      svgEl('line', {
        class: 'chart-refline',
        x1: meanX,
        x2: meanX,
        y1: MARGIN.top,
        y2: VIEW_H - MARGIN.bottom,
      })
    );
    const meanLabel = svgEl('text', {
      class: 'chart-refline-label',
      x: meanX + 4,
      y: MARGIN.top + 10,
    });
    meanLabel.textContent = 'mean pick rate';
    els.chartSvg.appendChild(meanLabel);

    const pointsGroup = svgEl('g', { class: 'chart-points' });
    const searchActive = !!state.searchTerm;

    champs.forEach((c) => {
      if (c.pickRate == null || c.winRate == null) return;
      const cx = xPos(c.pickRate);
      const cy = yPos(c.winRate);
      const isVisibleTier = state.activeTier === 'all' || c.tier === state.activeTier;
      const matchesSearch = searchActive && c.name && c.name.toLowerCase().includes(state.searchTerm);

      const g = svgEl('g', { class: 'chart-point-group' });
      if (!isVisibleTier) g.setAttribute('hidden', 'true');

      const dot = svgEl('circle', {
        class: 'chart-point',
        cx,
        cy,
        r: 5,
        fill: tierColorVar(c.tier),
        stroke: 'var(--bg-card)',
        'stroke-width': 2,
      });
      if (searchActive) dot.classList.add(matchesSearch ? 'is-emphasized' : 'is-dimmed');

      const hit = svgEl('circle', {
        class: 'chart-point-hit',
        cx,
        cy,
        r: 12,
        fill: 'transparent',
        tabindex: '0',
        role: 'img',
        'aria-label': `${c.name}, tier ${c.tier}, ${formatPercent(c.winRate)} win rate, ${formatPercent(c.pickRate)} pick rate, ${formatNumber(c.games)} games`,
      });
      const activate = () => {
        if (!matchesSearch) dot.classList.add('is-emphasized');
        showTooltip(c, cx, cy);
      };
      const deactivate = () => {
        if (!matchesSearch) dot.classList.remove('is-emphasized');
        hideTooltip();
      };
      hit.addEventListener('pointerenter', activate);
      hit.addEventListener('pointermove', () => showTooltip(c, cx, cy));
      hit.addEventListener('pointerleave', deactivate);
      hit.addEventListener('focus', activate);
      hit.addEventListener('blur', deactivate);

      g.appendChild(dot);
      g.appendChild(hit);
      pointsGroup.appendChild(g);
    });
    els.chartSvg.appendChild(pointsGroup);
  }

  function showTooltip(champ, cx, cy) {
    const t = els.tooltip;
    t.replaceChildren();

    const name = document.createElement('div');
    name.className = 'tooltip-name';
    name.textContent = champ.name;
    const tierBadge = document.createElement('span');
    tierBadge.className = 'tooltip-tier';
    tierBadge.textContent = champ.tier;
    name.appendChild(tierBadge);
    t.appendChild(name);

    t.appendChild(tooltipRow('Win rate', formatPercent(champ.winRate)));
    t.appendChild(tooltipRow('Pick rate', formatPercent(champ.pickRate)));
    t.appendChild(tooltipRow('Games', formatNumber(champ.games)));
    if (champ.kills != null && champ.deaths != null && champ.assists != null) {
      t.appendChild(tooltipRow('KDA', `${champ.kills} / ${champ.deaths} / ${champ.assists}`));
    }

    t.hidden = false;
    const svgRect = els.chartSvg.getBoundingClientRect();
    const wrapRect = els.chartWrap.getBoundingClientRect();
    const scaleX = svgRect.width / VIEW_W;
    const scaleY = svgRect.height / VIEW_H;
    t.style.left = `${svgRect.left - wrapRect.left + cx * scaleX}px`;
    t.style.top = `${svgRect.top - wrapRect.top + cy * scaleY}px`;
  }

  function tooltipRow(label, value) {
    const row = document.createElement('div');
    row.className = 'tooltip-row';
    const span = document.createElement('span');
    span.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    row.appendChild(span);
    row.appendChild(strong);
    return row;
  }

  function hideTooltip() {
    els.tooltip.hidden = true;
  }

  function renderLegend() {
    els.legendScale.replaceChildren();
    TIER_ORDER.forEach((tier) => {
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = tierColorVar(tier);
      swatch.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = tier;
      swatch.appendChild(label);
      els.legendScale.appendChild(swatch);
    });
  }

  // --- Table ---
  function renderTable() {
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const key = state.sortKey;
    const rows = visibleChampions()
      .slice()
      .sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (typeof av === 'string' || typeof bv === 'string') {
          return String(av || '').localeCompare(String(bv || '')) * dir;
        }
        return ((av ?? 0) - (bv ?? 0)) * dir;
      });

    els.dataTableBody.replaceChildren();
    rows.forEach((c) => {
      const tr = document.createElement('tr');
      tr.appendChild(tableCell(c.name, 'col-name'));
      tr.appendChild(tableCell(c.tier));
      tr.appendChild(tableCell(formatPercent(c.winRate)));
      tr.appendChild(tableCell(formatPercent(c.pickRate)));
      tr.appendChild(tableCell(formatNumber(c.games)));
      els.dataTableBody.appendChild(tr);
    });
  }

  function tableCell(value, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = value == null ? '—' : value;
    return td;
  }

  function formatPercent(n) {
    return n == null ? '—' : `${n.toFixed(1)}%`;
  }

  function formatNumber(n) {
    return n == null ? '—' : n.toLocaleString('en-US');
  }
})();
