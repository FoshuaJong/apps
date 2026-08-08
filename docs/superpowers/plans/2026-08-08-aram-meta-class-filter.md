# ARAM Meta Class Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ARAM meta app's tier filter with a class filter (Assassin/Fighter/Mage/Marksman/Support/Tank), scraped from mayhemmeta.com's per-class pages, with class shown on the chart via shape (not color, to preserve the site's monochrome design rule) and tier retained as display-only data.

**Architecture:** The worker fans a single scrape out to 13 parallel fetches (1 full-stats page + 6 per-class pages + 6 per-class `primary=1` pages), builds a slug→classes and slug→primaryClass map from the latter 12, and merges both into each champion object before caching to KV. The frontend swaps its single-select tier filter for a single-select class filter (same interaction pattern), recolors nothing (dots/rings stay the single accent teal), and encodes class as one of six ring shapes per champion's primary class.

**Tech Stack:** Vanilla JS (no framework, no build step), Cloudflare Workers (`HTMLRewriter` for scraping — this only runs in the Workers runtime, not plain Node, so verification uses `wrangler dev` against the real live site rather than a mocked unit test framework — there is none in this repo and none is being introduced). SVG for the chart (hand-built, no charting library).

**Spec:** `docs/superpowers/specs/2026-08-08-aram-meta-class-filter-design.md`

---

## Verified facts used below

Confirmed directly against the live site (`curl -A "Mozilla/5.0" "https://mayhemmeta.com/?sort=win_rate&dir=desc&class=<X>[&primary=1]"`) during planning, since this app's whole job is staying in sync with an external site's real structure:

- `Ahri` (`slug: ahri`) appears on both the `Assassin` and `Mage` class pages → `classes` should end up `['Assassin', 'Mage']`.
- `Ahri` appears on `Mage&primary=1` but **not** `Assassin&primary=1` → `primaryClass` should end up `'Mage'`.
- These are used as the concrete assertion in Task 1's verification step — not a guess.

---

## Task 1: Worker — scrape and merge per-champion class data

**Files:**
- Modify: `worker/src/aram_meta_api.js`

- [ ] **Step 1: Add class scraping and merge logic**

Replace the top of the file (lines 1–2) so the base URL and the full-stats URL are separate (needed because the class fetches reuse the base with a different `class=` value — appending would create a duplicate `class` query param):

```js
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const BASE_URL = 'https://mayhemmeta.com/?sort=win_rate&dir=desc';
const SOURCE_URL = `${BASE_URL}&class=All`;
const CLASS_ORDER = ['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank'];
```

Replace `scrapeAramMeta` (currently lines 49–61) with:

```js
/** Runs on the cron schedule: scrapes mayhemmeta.com and caches the result in KV. */
export async function scrapeAramMeta(env) {
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  if (!res.ok) {
    throw new Error(`mayhemmeta.com fetch failed: HTTP ${res.status}`);
  }

  const [data, classesOf, primaryClassOf] = await Promise.all([
    parseAramMetaHtml(res),
    buildClassMap(false),
    buildClassMap(true),
  ]);

  data.champions = data.champions.map((c) => ({
    ...c,
    classes: classesOf[c.slug] ?? [],
    primaryClass: primaryClassOf[c.slug] ?? null,
  }));

  await env.ARAM_META_KV.put(KV_KEY, JSON.stringify(data));
  return data;
}

/**
 * Builds a slug -> classes map (or slug -> single class when primaryOnly)
 * from the 6 per-class pages. A single failed class fetch degrades to an
 * empty result for that class rather than failing the whole scrape — this
 * is the same class of bug that caused the empty-champion-list outage
 * (a rigid dependency silently zeroing everything out), so the 12 class
 * fetches are deliberately isolated from each other and from the main
 * stats fetch via allSettled.
 */
async function buildClassMap(primaryOnly) {
  const results = await Promise.allSettled(
    CLASS_ORDER.map((cls) => fetchClassSlugs(cls, primaryOnly))
  );

  const map = {};
  results.forEach((result, i) => {
    const cls = CLASS_ORDER[i];
    if (result.status !== 'fulfilled') {
      console.error(
        `ARAM meta: class fetch failed for ${cls}${primaryOnly ? ' (primary)' : ''}: ${result.reason}`
      );
      return;
    }
    for (const slug of result.value) {
      if (primaryOnly) {
        map[slug] = cls;
      } else {
        (map[slug] ??= []).push(cls);
      }
    }
  });
  return map;
}

async function fetchClassSlugs(cls, primaryOnly) {
  const url = `${BASE_URL}&class=${cls}${primaryOnly ? '&primary=1' : ''}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseSlugsHtml(res);
}

/** Lighter-weight than parseAramMetaHtml: only pulls champion slugs off a class-filtered page. */
async function parseSlugsHtml(response) {
  const slugs = [];

  const rewriter = new HTMLRewriter().on('tbody tr td a[href^="/champions/"]', {
    element(el) {
      const href = el.getAttribute('href');
      const match = href && href.match(/^\/champions\/([^/?]+)/);
      if (match) slugs.push(match[1]);
    },
  });

  await rewriter.transform(response).arrayBuffer();
  return slugs;
}
```

- [ ] **Step 2: Start a local Workers dev server**

Run from the repo root (this is a background/long-running process — start it and move to the next step, don't wait on it):

```bash
npx wrangler dev
```

Expected: it prints a local URL, typically `http://localhost:8787`, and stays running. `wrangler dev` runs the real Workers runtime (`workerd`), so `HTMLRewriter` and real `fetch()` calls to `mayhemmeta.com` behave exactly as they will in production — this is the only way to exercise this code path, since plain Node doesn't have `HTMLRewriter`.

- [ ] **Step 3: Verify the merge against real data**

```bash
curl -s http://localhost:8787/aram_meta/api/debug-scrape > /tmp/aram_scrape.json
node -e "
const data = require('/tmp/aram_scrape.json');
const ahri = data.champions.find((c) => c.slug === 'ahri');
console.log('championCount:', data.championCount);
console.log('ahri.classes:', ahri && ahri.classes);
console.log('ahri.primaryClass:', ahri && ahri.primaryClass);
const missingClasses = data.champions.filter((c) => !c.classes || c.classes.length === 0);
console.log('champions with zero classes:', missingClasses.length);
"
```

Expected:
```
championCount: 173
ahri.classes: [ 'Assassin', 'Mage' ]
ahri.primaryClass: 'Mage'
champions with zero classes: 0
```

(`championCount` may drift slightly from 173 if the roster changed since planning — that's fine. `ahri.classes`, `ahri.primaryClass`, and zero-classes-count are the real assertions.) If `champions with zero classes` is nonzero, check the `wrangler dev` terminal output for the `ARAM meta: class fetch failed for ...` warning logged by `buildClassMap` before assuming a code bug — it may be a transient fetch failure against the live site.

- [ ] **Step 4: Commit**

```bash
git add worker/src/aram_meta_api.js
git commit -m "$(cat <<'EOF'
Scrape per-champion class membership for ARAM meta

Fans the scrape out to 13 parallel fetches (main stats page + 6
per-class pages + 6 per-class primary=1 pages) and merges classes /
primaryClass into each champion. The 12 class fetches are isolated
via Promise.allSettled so one failing class degrades to an empty
result for that class rather than breaking the whole scrape.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend — class filter, shape-coded chart, tooltip/table classes

**Files:**
- Modify: `aram_meta/index.html`
- Modify: `aram_meta/style.css`
- Modify: `aram_meta/app.js`

- [ ] **Step 1: `index.html` — swap filter buttons, legend label, table header, hero copy**

Replace the `.tier-filters` block (lines 75–82) with:

```html
        <div class="class-filters" id="classFilters" role="group" aria-label="Filter by class">
          <button class="class-btn is-active" data-class="all" type="button">All</button>
          <button class="class-btn" data-class="Assassin" type="button">Assassin</button>
          <button class="class-btn" data-class="Fighter" type="button">Fighter</button>
          <button class="class-btn" data-class="Mage" type="button">Mage</button>
          <button class="class-btn" data-class="Marksman" type="button">Marksman</button>
          <button class="class-btn" data-class="Support" type="button">Support</button>
          <button class="class-btn" data-class="Tank" type="button">Tank</button>
        </div>
```

Change the legend label (line 93) from `<span class="legend-label">Tier</span>` to `<span class="legend-label">Class</span>`.

Replace the table header row (lines 102–107) with:

```html
            <tr>
              <th data-sort="name">Champion</th>
              <th data-sort="tier">Tier</th>
              <th>Classes</th>
              <th data-sort="winRate">Win rate</th>
              <th data-sort="pickRate">Pick rate</th>
            </tr>
```

Change the hero copy (line 42) from `on a schedule. Brighter dots are higher tier.` to `on a schedule. Shape marks class.`

- [ ] **Step 2: `style.css` — rename filter classes, drop the tier color ramp, add legend-shape**

Rename `.tier-filters` → `.class-filters` and `.tier-btn` → `.class-btn` (lines 95–121) — identical rules, just the selector names:

```css
.class-filters {
  display: flex;
  gap: 0.4rem;
}

.class-btn {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  padding: 0.4rem 0.75rem;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s ease;
}

.class-btn:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.class-btn.is-active {
  background: var(--accent-surface);
  border-color: var(--accent-border-hover);
  color: var(--accent);
}
```

Delete the tier ramp comment + block entirely (lines 192–203 — the `/* Tier ordinal ramp ... */` comment and the `.chart-wrap { --tier-s: ...; }` rule). Nothing references `--tier-*` after Step 3 of this task removes their only consumers in `app.js`.

Replace `.legend-dot` (lines 318–323) with:

```css
.legend-shape {
  flex-shrink: 0;
}
```

In the `@media (max-width: 640px)` block, rename `.tier-filters` to `.class-filters` (line 426).

- [ ] **Step 3: `app.js` — class state, filter, shape rings, legend, tooltip, table**

Replace the constants + state + els block (lines 1–41):

```js
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
```

Replace `bindControls` (lines 113–153, the function that currently binds `els.tierFilters`):

```js
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
```

Replace `tierColorVar` and `visibleChampions` (lines 155–163) with:

```js
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
  // Polygons read slightly smaller than a circle at equal radius — this is a
  // first-pass tuning, adjust after seeing it rendered if a shape looks off.
  const SHAPE_R_SCALE = { circle: 1, square: 1, diamond: 1.15, triangle: 1.2, pentagon: 1.1, hexagon: 1.05 };

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
```

In `renderChart`, find the `champs.forEach((c) => { ... })` block (lines 341–424) and make three targeted changes:

1. Replace the `isVisibleTier` line with a class-based check:

```js
      const isVisible = state.activeClass === 'all' || hasClass(c, state.activeClass);
```

(and update the one usage below it, `if (!isVisibleTier) g.setAttribute('hidden', 'true');`, to `if (!isVisible) g.setAttribute('hidden', 'true');`)

2. Change the dot fill from tier color to the accent:

```js
      const dot = svgEl('circle', {
        class: 'chart-point',
        cx,
        cy,
        r: 5,
        fill: 'var(--accent)',
        stroke: 'var(--bg-card)',
        'stroke-width': 2,
      });
```

3. Replace the portrait ring creation inside `if (c.iconUrl) { ... }` — swap the old `svgEl('circle', { ..., stroke: tierColorVar(c.tier), ... })` ring for:

```js
        const ring = ringShapeEl(CLASS_SHAPE[c.primaryClass], PORTRAIT_R, PORTRAIT_R, PORTRAIT_R);
```

4. Update the `aria-label` on the hit-target circle to include classes instead of just tier:

```js
        'aria-label': `${c.name}, tier ${c.tier}, ${(c.classes || []).join('/')}, ${formatPercent(c.winRate)} win rate, ${formatPercent(c.pickRate)} pick rate. Opens mayhemmeta.com stats page.`,
```

Replace `showTooltip` (lines 428–454) — add a Classes row after Pick rate:

```js
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
```

Replace `renderLegend` (lines 472–486):

```js
  function renderLegend() {
    els.legendScale.replaceChildren();
    CLASS_ORDER.forEach((cls) => {
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      const svg = svgEl('svg', { class: 'legend-shape', viewBox: '0 0 20 20', width: '14', height: '14' });
      svg.appendChild(ringShapeEl(CLASS_SHAPE[cls], 10, 10, 8));
      swatch.appendChild(svg);
      const label = document.createElement('span');
      label.textContent = cls;
      swatch.appendChild(label);
      els.legendScale.appendChild(swatch);
    });
  }
```

Replace `renderTable` (lines 489–512) — add a Classes cell after the Tier cell:

```js
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
```

- [ ] **Step 4: Verify locally with `wrangler dev` + browser**

If the `wrangler dev` server from Task 1 is no longer running, restart it (`npx wrangler dev` from the repo root — it serves the static frontend and the API together, per `worker/README.md`).

Open `http://localhost:8787/aram_meta/` in the browser and check, in order:
1. Filter row shows `All/Assassin/Fighter/Mage/Marksman/Support/Tank` buttons (no more S/A/B/C/D).
2. Clicking a class button (e.g. `Mage`) hides non-matching points on the chart and, after switching to table view, hides non-matching rows.
3. Chart portrait rings show visibly different shapes (circle/square/diamond/triangle/pentagon/hexagon) — zoom in on a few points if needed to confirm they're not all circles.
4. Legend below the chart shows all 6 shapes with class name labels, replacing the old tier legend.
5. Hovering a point shows the tooltip with a "Classes" row listing one or more classes.
6. Table view has a "Classes" column between Tier and Win rate, populated with comma-separated class names.
7. No console errors (check via the browser's dev tools or an equivalent).

Fix anything that doesn't match before moving on.

- [ ] **Step 5: Commit**

```bash
git add aram_meta/index.html aram_meta/style.css aram_meta/app.js
git commit -m "$(cat <<'EOF'
Replace tier filter with class filter on ARAM meta

Filter buttons switch from tier (S/A/B/C/D) to class
(Assassin/Fighter/Mage/Marksman/Support/Tank), single-select, same
interaction pattern as before. Chart dots/rings stay the single
accent teal (monochrome design rule) — class is shown via ring shape
per champion's primary class instead of color. Tier stays as
display-only data in the tooltip and table. Tooltip and table both
gain a Classes field listing every class a champion belongs to.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Deploy and verify in production

**Files:** none (deploy only)

- [ ] **Step 1: Deploy**

```bash
npx wrangler deploy
```

Expected: same output shape as previous deploys — "Uploaded apps", "Deployed apps triggers", a Version ID.

- [ ] **Step 2: Force a rescrape**

The KV JSON shape itself changed (new `classes`/`primaryClass` fields), so the existing cached data won't have them until a fresh scrape runs:

```bash
curl -s -w "\nHTTP %{http_code}\n" https://apps.fong.nz/aram_meta/api/debug-scrape | tail -c 500
```

Expected: `HTTP 200` and a champion list — spot-check that entries have non-empty `classes` arrays.

- [ ] **Step 3: Verify live in the browser**

Open `https://apps.fong.nz/aram_meta/`, repeat the same checklist as Task 2 Step 4 (filter buttons, shape variety, legend, tooltip Classes row, table Classes column), and take a screenshot to confirm.

- [ ] **Step 4: Update `aram_meta/CLAUDE.md`**

Add a line to the "Data flow" or a new short note documenting the 13-fetch scrape (so a future session doesn't rediscover this from scratch the way this one had to for the column-count bug). Insert after the existing "Data flow" numbered list (after point 2, before point 3, renumbering as needed):

```markdown
2a. Alongside the main scrape, 12 more fetches (6 classes × plain +
    `primary=1`) build a slug → classes / slug → primaryClass map,
    merged into each champion. A single failed class fetch degrades
    to an empty result for that class (`Promise.allSettled`) rather
    than failing the whole scrape.
```

```bash
git add aram_meta/CLAUDE.md
git commit -m "$(cat <<'EOF'
Document class-scrape fetch fan-out in aram_meta/CLAUDE.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
