import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cpsatApp } from './cpsat_api.js';
import { globeApp } from './globe_api.js';
import { edhApp } from './edh_api.js';
import { linkedinApp } from './linkedin_api.js';
import { draculaApp } from './dracula_flow_api.js';
import { handleStaticRequest } from './static_proxy.js';

// Named export required by Wrangler for Durable Object class resolution
export { EDHClock } from './edh_api.js';

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.route('/cpsat', cpsatApp);
app.route('/globe', globeApp);
app.route('/edh', edhApp);
app.route('/linkedin', linkedinApp);
app.route('/dracula/api', draculaApp);

// Fallback: serve static assets for all non-API paths
app.all('*', (c) => handleStaticRequest(c.req.raw, c.env, c.executionCtx));

export default app;
