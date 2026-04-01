const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

export async function handleGlobeApiRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (request.method === 'POST' && url.pathname === '/globe/api/save') {
    const body = await request.text();

    let state;
    try {
      state = JSON.parse(body);
    } catch {
      return new Response('Bad JSON', { status: 400 });
    }

    if (body.length > 65536) return new Response('State too large', { status: 413 });

    const normalized = normalize(state);
    const canonical = JSON.stringify(normalized);
    const id = await contentId(canonical);

    // Content-addressable: only write if this ID isn't already stored.
    const existing = await env.GLOBE_LINKS.get(id);
    if (!existing) {
      await env.GLOBE_LINKS.put(id, canonical);
    }

    return new Response(JSON.stringify({ id }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  if (request.method === 'GET' && url.pathname === '/globe/api/load') {
    const id = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });
    const data = await env.GLOBE_LINKS.get(id);
    if (!data) return new Response('Not found', { status: 404 });
    return new Response(data, { headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  return new Response('Not found', { status: 404 });
}
