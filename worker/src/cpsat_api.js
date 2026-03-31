const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function handleCpsatApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/cpsat/api/v1/health' && request.method === 'GET') {
    return handleHealth();
  }

  if (path === '/cpsat/api/v1/solve' && request.method === 'POST') {
    return handleSolve(request);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: JSON_HEADERS,
  });
}

function handleHealth() {
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
}

async function handleSolve(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (
    !body ||
    typeof body.horizon_days !== 'number' ||
    !Array.isArray(body.assets) ||
    body.assets.length === 0
  ) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: horizon_days (number), assets (array)' }),
      { status: 422, headers: JSON_HEADERS }
    );
  }

  // TODO: swap in real CP-SAT solver call here (e.g. POST to a backend service with auth key from env)
  const jobId = `demo-${Date.now().toString(36)}`;
  const colors = ['#4f46e5', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a78bfa'];

  const items = body.assets.map((asset, i) => ({
    asset: asset.id,
    start_day: i === 0 ? 1 : i * 2,
    duration_days: asset.duration_days,
    lane: i % 3,
    color: colors[i % colors.length],
  }));

  const response = {
    job_id: jobId,
    status: 'SUCCEEDED',
    solution: {
      horizon_days: body.horizon_days,
      items,
      relationships: Array.isArray(body.relationships) ? body.relationships : [],
    },
  };

  return new Response(JSON.stringify(response), { headers: JSON_HEADERS });
}
