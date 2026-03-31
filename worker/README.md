# Worker — apps.fong.nz

Cloudflare Worker that powers `apps.fong.nz`. Routes API calls to handlers; everything else falls through to static assets (GitHub Pages via Cloudflare).

## Routing

| Path prefix | Handler |
|---|---|
| `/cpsat/api/*` | `cpsat_api.js` |
| Everything else | `static_proxy.js` → `env.ASSETS` |

## Local dev

Run from the **repo root** (where `wrangler.jsonc` lives):

```sh
npx wrangler dev
```

The dev server serves both the Worker API and static files locally.

Smoke-test the API:

```sh
curl http://localhost:8787/cpsat/api/v1/health
curl -X POST http://localhost:8787/cpsat/api/v1/solve \
  -H "Content-Type: application/json" \
  -d '{"horizon_days":14,"assets":[{"id":"A1","duration_days":3},{"id":"B2","duration_days":2}],"relationships":[{"type":"together","a":"A1","b":"B2"}]}'
```

## Deploy

```sh
npx wrangler deploy
```

Deploys the Worker to the `apps` Worker on Cloudflare. The custom domain `apps.fong.nz` is already bound to this Worker.

## Adding a new API route

1. Add a handler in `worker/src/` (e.g. `myapp_api.js`)
2. Import and call it in `worker/src/index.js` — add a `pathname.startsWith('/myapp/api/')` branch before the static fallthrough.
3. Static files for the new app go in `/myapp/` at the repo root.

## TODO (security — do not implement until needed)

- Add header-based API key check in `cpsat_api.js` (read key from `env.CPSAT_API_KEY`)
- Add Cloudflare Turnstile token verification before solve calls
- Add rate limiting via Cloudflare Rate Limiting rules or a KV counter
