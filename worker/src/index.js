import { handleCpsatApiRequest } from './cpsat_api.js';
import { handleGlobeApiRequest } from './globe_api.js';
import { handleStaticRequest } from './static_proxy.js';

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/cpsat/api/')) {
    return handleCpsatApiRequest(request, env);
  }
  if (url.pathname.startsWith('/globe/api/')) {
    return handleGlobeApiRequest(request, env);
  }
  return handleStaticRequest(request, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
