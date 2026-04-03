# LinkedIn Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a satirical LinkedIn post generator at `/linkedin_lessons/` — user submits their name and a plain statement, gets back a fake LinkedIn post card with generated headline, comments, and reactions.

**Architecture:** GitHub Pages static frontend POSTs `{ name, text, cfToken }` to a Cloudflare Worker at `/linkedin/api/generate`. The worker enforces a per-IP rate limit (10 req / 10 min), verifies a Cloudflare Turnstile token, then calls the Gemini API with a `responseSchema` to get structured JSON. The frontend renders the result as a fake LinkedIn post card in LinkedIn's authentic light aesthetic.

**Tech Stack:** Vanilla HTML/CSS/JS, Cloudflare Workers (rate limiting binding, Turnstile secret verification), Google Gemini REST API (`gemini-3.1-flash-lite-preview`, structured output via `responseSchema`).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `worker/src/linkedin_api.js` | Rate limit → Turnstile verify → Gemini call → return JSON |
| Modify | `worker/src/index.js` | Add `/linkedin/api/` route |
| Modify | `wrangler.jsonc` | Add `unsafe.bindings` rate limit entry |
| Create | `linkedin_lessons/index.html` | Full frontend: form, Turnstile widget, LinkedIn card UI, copy/share |
| Modify | `index.html` | Add `.app-card` entry for LinkedIn Lessons |
| Modify | `CLAUDE.md` | Add app to site structure section |

---

## Pre-flight: Credentials you need before starting

Before Task 1, collect the following. You will use them in Tasks 5 and 6.

**Cloudflare Turnstile:**
1. Go to Cloudflare Dashboard → Turnstile → Add site
2. Domain: `apps.fong.nz`, Widget type: Managed
3. Note your **Site Key** (public — goes in HTML) and **Secret Key** (goes in worker secret)
4. For local testing use these official Cloudflare test keys instead:
   - Site key (always passes): `1x00000000000000000000AA`
   - Secret key (always passes): `1x0000000000000000000000000000000AA`

**Google AI Studio:**
1. Go to https://aistudio.google.com/apikey
2. Create an API key — note it as `GEMINI_API_KEY`
3. Confirm `gemini-3.1-flash-lite-preview` is available in your project

---

## Task 1: Add rate limit binding to wrangler.jsonc

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Add the `unsafe` block**

Open `wrangler.jsonc` and add the `"unsafe"` key at the top level (after `"migrations"`):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "apps",
  "compatibility_date": "2025-09-27",
  "observability": {
    "enabled": true
  },
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "main": "worker/src/index.js",
  "assets": {
    "directory": ".",
    "not_found_handling": "404-page",
    "binding": "ASSETS"
  },
  "kv_namespaces": [
    {
      "binding": "GLOBE_LINKS",
      "id": "d5b6ef3c82084c6c8f6bd5e82538cfaf",
      "remote": true
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "EDH_CLOCK",
        "class_name": "EDHClock"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["EDHClock"]
    }
  ],
  "unsafe": {
    "bindings": [
      {
        "type": "ratelimit",
        "name": "LIMITER",
        "namespace_id": "1001",
        "simple": {
          "limit": 10,
          "period": 600
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Verify wrangler still parses**

```bash
npx wrangler deploy --dry-run
```

Expected: no schema errors. If wrangler complains about `unsafe`, your wrangler version may be old — run `npm install wrangler@latest` and retry.

- [ ] **Step 3: Commit**

```bash
git add wrangler.jsonc
git commit -m "chore: add rate limit binding for linkedin lessons"
```

---

## Task 2: Create the worker handler

**Files:**
- Create: `worker/src/linkedin_api.js`

- [ ] **Step 1: Create the file**

Create `worker/src/linkedin_api.js` with the full content below:

```javascript
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const JSON_HEADERS = { 'Content-Type': 'application/json', ...CORS };

const SYSTEM_PROMPT = `You are a LinkedIn Thought Leader ghostwriter. Rewrite the user's input in maximum LinkedIn style — short punchy lines, dramatic spacing, humblebrags disguised as vulnerability, vague universal lessons, and contrived metaphors. Every mundane event becomes a life-changing leadership revelation.

headline: A LinkedIn-style professional headline for the user. Use pipe-separated buzzword fragments. Include one fake prestigious ex-employer (ex-McKinsey, ex-Google, ex-Goldman, etc.), one vague identity claim, and one role keyword. Example: "Founder & CEO | Disrupting Disruption | ex-Deloitte | Speaker | Dog Dad"

post_body: The LinkedIn-maxxed rewrite of the user's input. Use heavy line breaks (one sentence per line, blank lines for drama). Open with a hook that overpromises. Include a contrived anecdote where the original event becomes a leadership metaphor. End with a lesson compressed into a moral-sounding takeaway that removes all nuance. Use "I" frequently. Occasional ellipsis for gravitas. No hashtags.

reaction_name: A single plausible full name that would appear as "X and [N] others reacted." Should be a realistic-sounding person — not a celebrity, not a placeholder. Something like "Priya Nair" or "Marcus Webb".

comments: Exactly 3 comment objects. Each commenter should be a distinct LinkedIn archetype. Names should be realistic and diverse. Titles should be buzzword-heavy LinkedIn titles (e.g. "Senior Strategy Lead | Change Maker | LinkedIn Top Voice 2024", "2x Founder | Building in Public | Advisor"). Comments should be short (1–2 sentences), written in the style of LinkedIn users who are trying to sound insightful but are mostly just echoing the same platitudes: affirming, and slightly hollow — the kind that signals engagement with the context, but without saying anything. Occasional emoji.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    post_body: { type: 'STRING' },
    reaction_name: { type: 'STRING' },
    comments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          title: { type: 'STRING' },
          comment: { type: 'STRING' },
        },
        required: ['name', 'title', 'comment'],
      },
    },
  },
  required: ['headline', 'post_body', 'reaction_name', 'comments'],
};

export async function handleLinkedinApiRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  if (url.pathname !== '/linkedin/api/generate' || request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });
  }

  // 1. Rate limit
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success: withinLimit } = await env.LIMITER.limit({ key: ip });
  if (!withinLimit) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: JSON_HEADERS });
  }

  // 2. Parse + validate body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const { name, text, cfToken } = body ?? {};
  if (!name || !text || !cfToken) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: name, text, cfToken' }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  // 3. Turnstile verify
  const tsForm = new FormData();
  tsForm.append('secret', env.TURNSTILE_SECRET_KEY);
  tsForm.append('response', cfToken);
  tsForm.append('remoteip', ip);

  const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: tsForm,
  });
  const tsData = await tsRes.json();
  if (!tsData.success) {
    return new Response(JSON.stringify({ error: 'Turnstile verification failed' }), { status: 403, headers: JSON_HEADERS });
  }

  // 4. Gemini structured output
  const geminiRes = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: `${name} wrote: ${text}` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('Gemini error:', geminiRes.status, errText);
    return new Response(JSON.stringify({ error: 'Gemini API error' }), { status: 500, headers: JSON_HEADERS });
  }

  const geminiData = await geminiRes.json();
  const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    return new Response(JSON.stringify({ error: 'Empty response from Gemini' }), { status: 500, headers: JSON_HEADERS });
  }

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to parse Gemini response' }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/linkedin_api.js
git commit -m "feat: add linkedin lessons worker handler"
```

---

## Task 3: Wire the route in index.js

**Files:**
- Modify: `worker/src/index.js`

- [ ] **Step 1: Add import and route**

Add the import at the top of `worker/src/index.js` and the route inside `handleRequest`:

```javascript
import { handleCpsatApiRequest } from './cpsat_api.js';
import { handleGlobeApiRequest } from './globe_api.js';
import { handleEdhApiRequest, EDHClock } from './edh_api.js';
import { handleLinkedinApiRequest } from './linkedin_api.js';
import { handleStaticRequest } from './static_proxy.js';

// Named export required by Wrangler for Durable Object class resolution
export { EDHClock };

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/cpsat/api/')) {
    return handleCpsatApiRequest(request, env);
  }
  if (url.pathname.startsWith('/globe/api/')) {
    return handleGlobeApiRequest(request, env);
  }
  if (url.pathname.startsWith('/edh/')) {
    return handleEdhApiRequest(request, env);
  }
  if (url.pathname.startsWith('/linkedin/api/')) {
    return handleLinkedinApiRequest(request, env);
  }
  return handleStaticRequest(request, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
```

- [ ] **Step 2: Smoke test the route with wrangler dev**

In a terminal, set temp env vars and run wrangler dev:

```bash
GEMINI_API_KEY=placeholder TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA npx wrangler dev
```

In a second terminal, test the route is reachable (expect 400, not 404):

```bash
curl -s -X POST http://localhost:8787/linkedin/api/generate \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

Expected output:
```json
{ "error": "Missing required fields: name, text, cfToken" }
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.js
git commit -m "feat: wire linkedin api route"
```

---

## Task 4: Create the frontend

**Files:**
- Create: `linkedin_lessons/index.html`

- [ ] **Step 1: Create the file**

Create `linkedin_lessons/index.html` with the full content below. Replace `REPLACE_WITH_SITE_KEY` with your Turnstile site key (or the test key `1x00000000000000000000AA` for local dev):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Joshua Fong — LinkedIn Lessons</title>
  <meta name="description" content="Say something real. Get something insufferable.">
  <link rel="icon" type="image/svg+xml" href="../images/favicon.svg">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/variables.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/apps.css">

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

  <style>
    .ll-page {
      padding: var(--nav-offset) 0 6rem;
    }

    .ll-intro {
      margin-bottom: 3rem;
    }

    .ll-intro h1 {
      font-family: var(--font-display);
      font-size: clamp(2rem, 5vw, 3.5rem);
      font-weight: 400;
      color: var(--text-primary);
      margin: 0.5rem 0 1rem;
      line-height: 1.15;
    }

    .ll-desc {
      font-size: 0.95rem;
      color: var(--text-secondary);
      font-weight: 300;
    }

    .ll-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 560px;
    }

    .ll-field {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .ll-field label {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      color: var(--text-muted);
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    .ll-field input,
    .ll-field textarea {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-primary);
      font-family: var(--font-body);
      font-size: 0.9rem;
      font-weight: 300;
      padding: 0.75rem 1rem;
      width: 100%;
      box-sizing: border-box;
      transition: border-color 0.25s ease;
      resize: vertical;
    }

    .ll-field input::placeholder,
    .ll-field textarea::placeholder {
      color: var(--text-muted);
    }

    .ll-field input:focus,
    .ll-field textarea:focus {
      outline: none;
      border-color: var(--accent);
    }

    .ll-form-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .ll-quota-msg {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--text-muted);
      letter-spacing: 0.04em;
      line-height: 1.8;
      margin: 0;
    }

    .ll-output {
      margin-top: 3rem;
      max-width: 560px;
    }

    .ll-output-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
      flex-wrap: wrap;
    }

    /* ─────────────────────────────────────────────
       LinkedIn card — intentionally light/authentic.
       Uses hardcoded colors, not CSS variables.
       This contrast IS the punchline.
    ───────────────────────────────────────────── */
    .li-card {
      background: #ffffff;
      border: 1px solid #e0dfdc;
      color: #000000e6;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 14px;
    }

    .li-header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem 1rem 0;
    }

    .li-avatar {
      width: 48px;
      height: 48px;
      background: #c0c0c0;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .li-meta { flex: 1; }

    .li-name {
      font-weight: 600;
      color: #0a66c2;
      font-size: 14px;
      line-height: 1.4;
    }

    .li-headline {
      font-size: 12px;
      color: #666666;
      line-height: 1.4;
      margin-top: 1px;
    }

    .li-sub {
      font-size: 11px;
      color: #999999;
      margin-top: 2px;
    }

    .li-more {
      background: none;
      border: none;
      color: #666666;
      font-size: 1.25rem;
      cursor: default;
      padding: 0 0.25rem;
      line-height: 1;
    }

    .li-body {
      padding: 0.75rem 1rem 0.5rem;
      line-height: 1.6;
      color: #000000e6;
      font-size: 14px;
      white-space: pre-line;
    }

    .li-reactions {
      padding: 0.5rem 1rem;
      font-size: 12px;
      color: #666666;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .li-divider {
      border: none;
      border-top: 1px solid #e0dfdc;
      margin: 0 1rem;
    }

    .li-action-bar {
      display: flex;
      padding: 0.25rem 0.5rem;
    }

    .li-action {
      flex: 1;
      background: none;
      border: none;
      color: #666666;
      font-size: 13px;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 0.6rem 0.5rem;
      cursor: default;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
    }

    .li-comments {
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .li-comment {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .li-comment-avatar {
      width: 32px;
      height: 32px;
      background: #c0c0c0;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .li-comment-body {
      background: #f3f2ef;
      padding: 0.5rem 0.75rem;
      flex: 1;
    }

    .li-comment-name {
      font-weight: 600;
      font-size: 13px;
      color: #000000e6;
      display: block;
    }

    .li-comment-title {
      font-size: 11px;
      color: #666666;
      display: block;
      margin-bottom: 0.25rem;
    }

    .li-comment-text {
      font-size: 13px;
      color: #000000e6;
      margin: 0;
      line-height: 1.5;
    }

    @media (max-width: 640px) {
      .ll-output-actions {
        flex-direction: column;
      }
      .ll-output-actions button {
        width: 100%;
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <div id="grid-spotlight"></div>
  <script>
    (function(){var g=document.getElementById('grid-spotlight');document.addEventListener('mousemove',function(e){g.style.setProperty('--mx',e.clientX+'px');g.style.setProperty('--my',e.clientY+'px');});document.addEventListener('mouseleave',function(){g.style.setProperty('--mx','-999px');g.style.setProperty('--my','-999px');});})();
  </script>

  <!-- NAV -->
  <nav>
    <div class="container">
      <div class="nav-mark"><span><a href="https://joshua.fong.nz">JF</a></span> / <a href="https://apps.fong.nz">apps</a></div>
      <ul class="nav-links" id="navLinks">
        <li><a href="/">Apps</a></li>
        <li class="nav-sep"></li>
        <li><a href="/linkedin_lessons/" aria-current="page">LinkedIn Lessons</a></li>
      </ul>
      <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>

  <main class="ll-page">
    <div class="container">

      <section class="ll-intro">
        <p class="section-label">linkedin lessons</p>
        <h1>Say it like a thought leader.</h1>
        <p class="ll-desc">Enter something real. Get something insufferable.</p>
      </section>

      <form class="ll-form" id="llForm" novalidate>
        <div class="ll-field">
          <label for="userName">Your name</label>
          <input type="text" id="userName" name="userName" placeholder="Joshua Fong" autocomplete="name" required>
        </div>
        <div class="ll-field">
          <label for="userText">What do you actually want to say?</label>
          <textarea id="userText" name="userText" rows="5" placeholder="I failed my driving test twice." required></textarea>
        </div>
        <div class="cf-turnstile"
             data-sitekey="REPLACE_WITH_SITE_KEY"
             data-callback="onTurnstileSuccess"
             data-expired-callback="onTurnstileExpired"
             data-error-callback="onTurnstileError"
             data-theme="dark"
             data-appearance="interaction-only">
        </div>
        <div class="ll-form-actions">
          <button type="submit" id="submitBtn" class="btn-primary" disabled>Generate</button>
          <p class="ll-quota-msg" id="quotaMsg" hidden>
            You've reached your thought leadership quota.<br>
            The algorithm will allow you back in 10 minutes.
          </p>
        </div>
      </form>

      <div class="ll-output" id="outputSection" hidden>
        <div class="li-card" id="liCard"></div>
        <div class="ll-output-actions">
          <button class="btn-primary" id="copyBtn">Copy post</button>
          <button class="btn-secondary" id="shareBtn" hidden>Share</button>
          <button class="btn-secondary" id="resetBtn">Generate another</button>
        </div>
      </div>

    </div>
  </main>

  <footer>
    <div class="container">
      <p>&copy; 2026 Joshua Fong</p>
      <span class="footer-note"><a href="https://joshua.fong.nz">joshua.fong.nz</a></span>
    </div>
  </footer>

  <script>
    // Mobile nav
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  </script>

  <script>
    const form        = document.getElementById('llForm');
    const submitBtn   = document.getElementById('submitBtn');
    const quotaMsg    = document.getElementById('quotaMsg');
    const outputSection = document.getElementById('outputSection');
    const liCard      = document.getElementById('liCard');
    const copyBtn     = document.getElementById('copyBtn');
    const shareBtn    = document.getElementById('shareBtn');
    const resetBtn    = document.getElementById('resetBtn');

    let cfToken = null;
    let currentPostBody = '';

    // Turnstile callbacks — must be global for data-callback attribute
    window.onTurnstileSuccess = function(token) {
      cfToken = token;
      submitBtn.hidden = false;
      submitBtn.disabled = false;
      quotaMsg.hidden = true;
    };

    window.onTurnstileExpired = function() {
      cfToken = null;
      submitBtn.disabled = true;
    };

    window.onTurnstileError = function() {
      cfToken = null;
      submitBtn.disabled = true;
    };

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderCard(data, userName) {
      const reactionCount = Math.floor(Math.random() * 900) + 100;

      const commentsHtml = data.comments.map(c => `
        <div class="li-comment">
          <div class="li-comment-avatar"></div>
          <div class="li-comment-body">
            <span class="li-comment-name">${escapeHtml(c.name)}</span>
            <span class="li-comment-title">${escapeHtml(c.title)}</span>
            <p class="li-comment-text">${escapeHtml(c.comment)}</p>
          </div>
        </div>
      `).join('');

      liCard.innerHTML = `
        <div class="li-header">
          <div class="li-avatar"></div>
          <div class="li-meta">
            <div class="li-name">${escapeHtml(userName)}</div>
            <div class="li-headline">${escapeHtml(data.headline)}</div>
            <div class="li-sub">1st · 3m · 🌐</div>
          </div>
          <button class="li-more" aria-hidden="true">···</button>
        </div>
        <div class="li-body">${escapeHtml(data.post_body)}</div>
        <div class="li-reactions">
          <span>👍❤️🔥</span>
          <span>${escapeHtml(data.reaction_name)} and ${reactionCount} others</span>
        </div>
        <div class="li-divider"></div>
        <div class="li-action-bar">
          <button class="li-action">👍 Like</button>
          <button class="li-action">💬 Comment</button>
          <button class="li-action">🔁 Repost</button>
          <button class="li-action">✉️ Send</button>
        </div>
        <div class="li-divider"></div>
        <div class="li-comments">${commentsHtml}</div>
      `;
    }

    function resetTurnstile() {
      if (window.turnstile) window.turnstile.reset();
      cfToken = null;
      submitBtn.disabled = true;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('userName').value.trim();
      const text = document.getElementById('userText').value.trim();
      if (!name || !text || !cfToken) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Crafting your personal brand…';
      quotaMsg.hidden = true;

      try {
        const res = await fetch('/linkedin/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, text, cfToken }),
        });

        if (res.status === 429) {
          quotaMsg.hidden = false;
          submitBtn.hidden = true;
          resetTurnstile();
          return;
        }

        if (!res.ok) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Generate';
          resetTurnstile();
          return;
        }

        const data = await res.json();
        currentPostBody = data.post_body;

        renderCard(data, name);
        outputSection.hidden = false;
        outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (navigator.share) shareBtn.hidden = false;

      } catch {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate';
        resetTurnstile();
      }
    });

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentPostBody);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy post'; }, 2000);
      } catch {
        // clipboard unavailable — fail silently
      }
    });

    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ text: currentPostBody });
      } catch {
        // share dismissed or unsupported — fail silently
      }
    });

    resetBtn.addEventListener('click', () => {
      outputSection.hidden = true;
      submitBtn.hidden = false;
      submitBtn.textContent = 'Generate';
      quotaMsg.hidden = true;
      currentPostBody = '';
      liCard.innerHTML = '';
      shareBtn.hidden = true;
      resetTurnstile();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  </script>

</body>
</html>
```

- [ ] **Step 2: End-to-end test with wrangler dev**

In terminal 1:
```bash
GEMINI_API_KEY=your_real_key TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA npx wrangler dev
```

Open `http://localhost:8787/linkedin_lessons/` in a browser.

Verify:
- Page loads with correct nav, heading, form
- Turnstile resolves invisibly → Generate button enables
- Submit with a name and a sentence → loading state shows → LinkedIn card appears
- Card has: name, generated headline, post body, emoji reactions, 3 comments
- "Copy post" copies `post_body` text to clipboard, button says "Copied!" for 2 seconds
- "Generate another" hides card, resets form and scrolls to top

- [ ] **Step 3: Verify 429 UX**

With wrangler dev still running, hit the endpoint 11 times rapidly:

```bash
for i in {1..11}; do
  curl -s -X POST http://localhost:8787/linkedin/api/generate \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","text":"test","cfToken":"1x00000000000000000000BB"}' | jq '.error // "ok"'
done
```

Expected: first 10 return `"ok"` (or Turnstile error — rate limit passes), 11th returns `"Rate limit exceeded"`.

Note: In the browser, after 10 real submissions the quota message replaces the button with the satirical copy.

- [ ] **Step 4: Commit**

```bash
git add linkedin_lessons/index.html
git commit -m "feat: add linkedin lessons frontend"
```

---

## Task 5: Add app card to landing page

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the card**

In `index.html`, inside `.apps-grid`, add this card after the last existing `<a class="app-card">` entry:

```html
<a href="/linkedin_lessons/" class="app-card reveal">
  <p class="app-card-label">Satirical</p>
  <h2>LinkedIn Lessons</h2>
  <p>Enter something real. Get something insufferable. AI-powered LinkedIn thought leadership, on demand.</p>
  <span class="app-card-link">Open app →</span>
</a>
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:8787/` and confirm the new card appears in the grid with the correct label, title, and description. Click it — confirm it navigates to `/linkedin_lessons/`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add linkedin lessons app card to landing page"
```

---

## Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add to site structure**

In `CLAUDE.md`, find the `## Site Structure` section and add:

```markdown
- `/linkedin_lessons/index.html` — LinkedIn Lessons: satirical LinkedIn post generator powered by Gemini
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with linkedin lessons app"
```

---

## Task 7: Configure secrets and deploy

- [ ] **Step 1: Set the worker secrets**

Run these from the repo root (where `wrangler.jsonc` lives):

```bash
npx wrangler secret put GEMINI_API_KEY
# paste your Google AI Studio key when prompted

npx wrangler secret put TURNSTILE_SECRET_KEY
# paste your Turnstile secret key when prompted
```

- [ ] **Step 2: Replace the Turnstile site key in the HTML**

In `linkedin_lessons/index.html`, replace `REPLACE_WITH_SITE_KEY` with your real Turnstile site key:

```html
data-sitekey="YOUR_REAL_SITE_KEY_HERE"
```

Commit:
```bash
git add linkedin_lessons/index.html
git commit -m "chore: set production turnstile site key"
```

- [ ] **Step 3: Deploy**

```bash
npx wrangler deploy
git push origin main
```

Wait ~60 seconds for GitHub Pages to propagate.

- [ ] **Step 4: Production smoke test**

Open `https://apps.fong.nz/linkedin_lessons/` and verify:

1. Page loads correctly on dark background
2. Turnstile resolves invisibly → Generate button enables
3. Submit a real name + sentence → LinkedIn card renders with correct content
4. Card has generated headline, post body with line breaks, reaction emoji + random count, 3 satirical comments
5. "Copy post" works (paste into a notes app to confirm)
6. "Generate another" resets correctly

If the Gemini call fails with a 500, check `wrangler tail` for the actual error:
```bash
npx wrangler tail
```

Common issues:
- Model name wrong → check Google AI Studio for the correct ID
- `responseSchema` type casing wrong → try lowercase `string`/`object`/`array` if uppercase fails
- API key not set → re-run `wrangler secret put GEMINI_API_KEY`
