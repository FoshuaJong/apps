(() => {
  const API_URL = '/aram_meta/api/data';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MARGIN = { top: 24, right: 28, bottom: 56, left: 56 };
  const VIEW_W = 960;
  const VIEW_H = 560;
  const PORTRAIT_R = 9;
  const CLASS_ORDER = ['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank'];
  const CLASS_SHAPE = {
    Assassin: 'circle',
    Fighter: 'square',
    Mage: 'diamond',
    Marksman: 'triangle',
    Support: 'pentagon',
    Tank: 'hexagon',
  };

  const state = {
    champions: [],
    activeClass: 'all',
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
    classFilters: document.getElementById('classFilters'),
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
    els.classFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.class-btn');
      if (!btn) return;
      state.activeClass = btn.dataset.class;
      [...els.classFilters.querySelectorAll('.class-btn')].forEach((b) =>
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

  function hasClass(c, cls) {
    return Array.isArray(c.classes) && c.classes.includes(cls);
  }

  function visibleChampions() {
    return state.champions.filter(
      (c) => state.activeClass === 'all' || hasClass(c, state.activeClass)
    );
  }

  function polygonPoints(cx, cy, r, sides, rotationDeg) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = ((360 / sides) * i + rotationDeg) * (Math.PI / 180);
      points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
    }
    return points.join(' ');
  }

  const SHAPE_SIDES = { square: 4, diamond: 4, triangle: 3, pentagon: 5, hexagon: 6 };
  const SHAPE_ROTATION = { square: 45, diamond: 0, triangle: -90, pentagon: -90, hexagon: 0 };
  // Each regular polygon's horizontal bounding-box width varies with vertex
  // count/rotation even at equal circumradius (a square's flat side sits at
  // r*cos(45°), a diamond's corner sits at r) — these scale factors correct
  // each shape's radius so its bounding-box width matches the circle's
  // diameter (2 * PORTRAIT_R), keeping visual weight consistent across
  // classes. Verified against the actual rendered SVG geometry.
  const SHAPE_R_SCALE = { circle: 1, square: 1.4142, diamond: 1, triangle: 1.1547, pentagon: 1.0515, hexagon: 1 };

  // Ring outline only (stroke, no fill), reusing the existing
  // .chart-portrait-ring class so hover/emphasis CSS applies unchanged
  // regardless of whether this renders a <circle> or a <polygon>.
  function ringShapeEl(shape, cx, cy, r) {
    const scaledR = r * (SHAPE_R_SCALE[shape] ?? 1);
    const attrs = {
      class: 'chart-portrait-ring',
      fill: 'none',
      stroke: 'var(--accent)',
      'stroke-width': 2,
    };
    if (!shape || shape === 'circle') {
      return svgEl('circle', { ...attrs, cx, cy, r: scaledR });
    }
    return svgEl('polygon', {
      ...attrs,
      points: polygonPoints(cx, cy, scaledR, SHAPE_SIDES[shape], SHAPE_ROTATION[shape]),
    });
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

    const portraitClip = svgEl('clipPath', { id: 'portraitClip' });
    portraitClip.appendChild(svgEl('circle', { cx: PORTRAIT_R, cy: PORTRAIT_R, r: PORTRAIT_R }));
    const defs = svgEl('defs', {});
    defs.appendChild(portraitClip);
    els.chartSvg.appendChild(defs);

    const pointsGroup = svgEl('g', { class: 'chart-points' });
    const searchTerms = state.searchTerm
      ? state.searchTerm.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const searchActive = searchTerms.length > 0;

    champs.forEach((c) => {
      if (c.pickRate == null || c.winRate == null) return;
      const cx = xPos(c.pickRate);
      const cy = yPos(c.winRate);
      const isVisible = state.activeClass === 'all' || hasClass(c, state.activeClass);
      const matchesSearch =
        searchActive && c.name && searchTerms.some((term) => c.name.toLowerCase().includes(term));

      const g = svgEl('g', { class: 'chart-point-group' });
      if (!isVisible) g.setAttribute('hidden', 'true');
      if (searchActive) g.classList.add(matchesSearch ? 'is-emphasized' : 'is-dimmed');

      const dot = svgEl('circle', {
        class: 'chart-point',
        cx,
        cy,
        r: 5,
        fill: 'var(--accent)',
        stroke: 'var(--bg-card)',
        'stroke-width': 2,
      });
      g.appendChild(dot);

      if (c.iconUrl) {
        const portrait = svgEl('g', {
          class: 'chart-portrait',
          transform: `translate(${cx - PORTRAIT_R}, ${cy - PORTRAIT_R})`,
        });
        const image = svgEl('image', {
          class: 'chart-portrait-image',
          href: c.iconUrl,
          width: PORTRAIT_R * 2,
          height: PORTRAIT_R * 2,
          'clip-path': 'url(#portraitClip)',
        });
        const ring = ringShapeEl(CLASS_SHAPE[c.primaryClass], PORTRAIT_R, PORTRAIT_R, PORTRAIT_R);
        image.addEventListener('error', () => portrait.remove(), { once: true });
        portrait.appendChild(image);
        portrait.appendChild(ring);
        g.appendChild(portrait);
      }

      const hit = svgEl('circle', {
        class: 'chart-point-hit',
        cx,
        cy,
        r: 12,
        fill: 'transparent',
        tabindex: '0',
        role: 'link',
        'aria-label': `${c.name}, tier ${c.tier}, ${c.classes && c.classes.length ? c.classes.join('/') : '—'}, ${formatPercent(c.winRate)} win rate, ${formatPercent(c.pickRate)} pick rate. Opens mayhemmeta.com stats page.`,
      });
      const activate = () => {
        if (!matchesSearch) g.classList.add('is-emphasized');
        showTooltip(c, cx, cy);
      };
      const deactivate = () => {
        if (!matchesSearch) g.classList.remove('is-emphasized');
        hideTooltip();
      };
      const openChampionPage = () => {
        if (c.slug) window.open(`https://mayhemmeta.com/champions/${c.slug}`, '_blank', 'noopener');
      };
      hit.addEventListener('pointerenter', activate);
      hit.addEventListener('pointermove', () => showTooltip(c, cx, cy));
      hit.addEventListener('pointerleave', deactivate);
      hit.addEventListener('focus', activate);
      hit.addEventListener('blur', deactivate);
      hit.addEventListener('click', openChampionPage);
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') openChampionPage();
      });

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
    t.appendChild(tooltipRow('Classes', champ.classes && champ.classes.length ? champ.classes.join(', ') : '—'));
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
    CLASS_ORDER.forEach((cls) => {
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      // viewBox has a 2-unit margin beyond the 20x20 shape area so the
      // triangle's miter join (which slightly overshoots its vertex at
      // this stroke-width) doesn't get clipped by the svg's default
      // overflow:hidden.
      const svg = svgEl('svg', { class: 'legend-shape', viewBox: '-2 -2 24 24', width: '14', height: '14' });
      svg.appendChild(ringShapeEl(CLASS_SHAPE[cls], 10, 10, 8));
      swatch.appendChild(svg);
      const label = document.createElement('span');
      label.textContent = cls;
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
      tr.appendChild(tableCell(c.classes && c.classes.length ? c.classes.join(', ') : null));
      tr.appendChild(tableCell(formatPercent(c.winRate)));
      tr.appendChild(tableCell(formatPercent(c.pickRate)));
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
})();
