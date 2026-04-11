import { Hono } from 'hono';

export const cpsatApp = new Hono();

cpsatApp.get('/api/v1/health', (c) => {
  return c.json({ ok: true });
});

cpsatApp.post('/api/v1/solve', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (
    !body ||
    typeof body.horizon_days !== 'number' ||
    !Array.isArray(body.assets) ||
    body.assets.length === 0
  ) {
    return c.json(
      { error: 'Missing required fields: horizon_days (number), assets (array)' },
      422
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

  return c.json({
    job_id: jobId,
    status: 'SUCCEEDED',
    solution: {
      horizon_days: body.horizon_days,
      items,
      relationships: Array.isArray(body.relationships) ? body.relationships : [],
    },
  });
});
