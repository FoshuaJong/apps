const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function genId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, x => CHARS[x % 62]).join(''); // 8-char base62 ≈ 218T combinations
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function handleGlobeApiRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (request.method === 'POST' && url.pathname === '/globe/api/save') {
    const body = await request.text();
    try { JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }
    if (body.length > 65536) return new Response('State too large', { status: 413 });
    let id;
    for (let i = 0; i < 3; i++) {
      id = genId();
      if (!await env.GLOBE_LINKS.get(id)) break;
    }
    await env.GLOBE_LINKS.put(id, body);
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
