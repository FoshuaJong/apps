const JSON_HEADERS = { 'Content-Type': 'application/json' };
const BASE_URL = 'https://mayhemmeta.com/?sort=win_rate&dir=desc';
const SOURCE_URL = `${BASE_URL}&class=All`;
const KV_KEY = 'latest';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const CLASS_ORDER = ['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank'];

export async function handleAramMetaApiRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/aram_meta/api/data' && request.method === 'GET') {
    return handleGetData(env);
  }

  // TEMPORARY: lets the first deploy populate KV without waiting for the
  // 6-hour cron. Remove this route once the cron has run at least once.
  if (url.pathname === '/aram_meta/api/debug-scrape' && request.method === 'GET') {
    return handleDebugScrape(env);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: JSON_HEADERS,
  });
}

async function handleDebugScrape(env) {
  try {
    const data = await scrapeAramMeta(env);
    return new Response(JSON.stringify(data), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

async function handleGetData(env) {
  const cached = await env.ARAM_META_KV.get(KV_KEY);
  if (!cached) {
    return new Response(
      JSON.stringify({ error: 'No data yet — waiting for the first scheduled scrape' }),
      { status: 503, headers: JSON_HEADERS }
    );
  }
  return new Response(cached, { headers: JSON_HEADERS });
}

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

/** Decodes the small set of HTML entities lol-html's text() handler leaves raw. */
function decodeHtmlEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Parses the champion leaderboard table and summary stat cards out of a
 * mayhemmeta.com HTML response using the Workers runtime's built-in
 * HTMLRewriter (no DOM/JS execution needed — the table is server-rendered).
 * @param {Response} response
 */
export async function parseAramMetaHtml(response) {
  const rows = [];
  const panels = [];

  let currentRow = null;
  let currentCell = null;
  let currentPanel = null;
  let currentPanelChild = null;
  let currentOption = null;
  let patch = null;
  let patchCaptured = false;

  const rewriter = new HTMLRewriter()
    .on('tbody tr', {
      element(el) {
        currentRow = { cells: [], href: null, icon: null };
        el.onEndTag(() => {
          rows.push(currentRow);
          currentRow = null;
        });
      },
    })
    .on('tbody tr td', {
      element(el) {
        currentCell = '';
        el.onEndTag(() => {
          if (currentRow) currentRow.cells.push(decodeHtmlEntities(currentCell.trim()));
          currentCell = null;
        });
      },
      text(text) {
        if (currentCell !== null) currentCell += text.text;
      },
    })
    .on('tbody tr td a[href^="/champions/"]', {
      element(el) {
        if (currentRow) currentRow.href = el.getAttribute('href');
      },
    })
    .on('tbody tr td img', {
      element(el) {
        if (currentRow) currentRow.icon = el.getAttribute('src');
      },
    })
    .on('div.panel', {
      element(el) {
        currentPanel = [];
        el.onEndTag(() => {
          panels.push(currentPanel);
          currentPanel = null;
        });
      },
    })
    .on('div.panel div', {
      element(el) {
        currentPanelChild = '';
        el.onEndTag(() => {
          if (currentPanel) currentPanel.push(decodeHtmlEntities(currentPanelChild.trim()));
          currentPanelChild = null;
        });
      },
      text(text) {
        if (currentPanelChild !== null) currentPanelChild += text.text;
      },
    })
    .on('option[selected]', {
      element(el) {
        if (patchCaptured) {
          currentOption = null;
          return;
        }
        currentOption = '';
        el.onEndTag(() => {
          if (currentOption !== null) {
            patch = decodeHtmlEntities(currentOption.trim());
            patchCaptured = true;
          }
          currentOption = null;
        });
      },
      text(text) {
        if (currentOption !== null) currentOption += text.text;
      },
    });

  // Drain the transformed stream so all handlers above actually fire.
  await rewriter.transform(response).arrayBuffer();

  const champions = rows.map(rowToChampion).filter(Boolean);

  return {
    patch,
    scrapedAt: new Date().toISOString(),
    championCount: champions.length,
    meta: panelsToMeta(panels),
    champions,
  };
}

const CHAMPION_COLUMN_COUNT = 13;

function rowToChampion(row) {
  const c = row.cells;
  if (c.length < CHAMPION_COLUMN_COUNT) return null;

  const slugMatch = row.href && row.href.match(/^\/champions\/([^/?]+)/);

  return {
    name: c[1],
    slug: slugMatch ? slugMatch[1] : null,
    iconUrl: row.icon ? `https://mayhemmeta.com${row.icon}` : null,
    tier: c[2],
    winRate: parsePercent(c[3]),
    pickRate: parsePercent(c[4]),
    kills: parseNumber(c[5]),
    deaths: parseNumber(c[6]),
    assists: parseNumber(c[7]),
    damage: parseNumber(c[8]),
    killParticipation: parsePercent(c[9]),
    minions: parseNumber(c[10]),
    ccTime: parseSeconds(c[11]),
    turretDamage: parseNumber(c[12]),
  };
}

function panelsToMeta(panels) {
  const [games, length, topWin, popular] = panels;
  return {
    gamesAnalyzed: games ? games[1] : null,
    avgGameLength: length ? length[1] : null,
    topWinRate: topWin ? { value: topWin[1], detail: topWin[2] } : null,
    mostPopular: popular ? { value: popular[1], detail: popular[2] } : null,
  };
}

function parsePercent(text) {
  if (!text) return null;
  const n = parseFloat(text.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

function parseNumber(text) {
  if (!text) return null;
  const n = parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseSeconds(text) {
  if (!text) return null;
  const n = parseFloat(text.replace('s', ''));
  return Number.isFinite(n) ? n : null;
}
