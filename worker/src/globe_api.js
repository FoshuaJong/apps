import { Hono } from 'hono';

// Sort connections and custom cities so that identical logical states always
// produce the same canonical JSON string, regardless of insertion order.
function normalize(state) {
  const out = {};

  if (Array.isArray(state.c)) {
    out.c = state.c
      .slice()
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  }

  if (Array.isArray(state.x)) {
    out.x = state.x.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  if (Array.isArray(state.l)) {
    out.l = state.l.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  if (Array.isArray(state.cc)) {
    out.cc = state.cc; // color index references in `c` are positional — do not reorder
  }

  return out;
}

// SHA-256 of the canonical JSON string, base64url-encoded, truncated to 10 chars.
// 10 base64url chars = 60 bits ≈ 10^18 possible IDs — collision-safe in practice.
async function contentId(canonical) {
  const data = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash).slice(0, 8); // 64 bits → 11 base64url chars
  const b64url = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return b64url.slice(0, 10);
}

export const globeApp = new Hono();

globeApp.post('/api/save', async (c) => {
  const body = await c.req.text();

  let state;
  try {
    state = JSON.parse(body);
  } catch {
    return c.text('Bad JSON', 400);
  }

  if (body.length > 65536) return c.text('State too large', 413);

  const normalized = normalize(state);
  const canonical = JSON.stringify(normalized);
  const id = await contentId(canonical);

  // Content-addressable: only write if this ID isn't already stored.
  const existing = await c.env.GLOBE_LINKS.get(id);
  if (!existing) {
    await c.env.GLOBE_LINKS.put(id, canonical);
  }

  return c.json({ id });
});

globeApp.get('/api/load', async (c) => {
  const id = c.req.query('id');
  if (!id) return c.text('Missing id', 400);
  const data = await c.env.GLOBE_LINKS.get(id);
  if (!data) return c.text('Not found', 404);
  return c.body(data, 200, { 'Content-Type': 'application/json' });
});
