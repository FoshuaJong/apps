/**
 * Falls through to Cloudflare's static assets binding.
 * All non-API paths are served from the repo's static files
 * (configured via `assets.directory` in wrangler.jsonc).
 */
export async function handleStaticRequest(request, env, ctx) {
  return env.ASSETS.fetch(request);
}
