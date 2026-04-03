# LinkedIn Lessons — Design Spec
**Date:** 2026-04-04

## Overview

A satirical app at `/linkedin_lessons/` that converts a plain statement into a LinkedIn-maxxed post. The user provides their name and input text; a Cloudflare Worker calls Gemini, which returns structured JSON used to render a fake LinkedIn post card (in LinkedIn's authentic light aesthetic) complete with generated headline, post body, reactions, and three satirical comments.

---

## Architecture

```
[/linkedin_lessons/index.html]  (GitHub Pages / Cloudflare static asset)
        │
        │  user submits { name, text }
        ▼
[Turnstile widget — managed mode]  →  cfToken
        │
        │  POST /linkedin/api/generate
        │  body: { name, text, cfToken }
        ▼
[Cloudflare Worker — linkedin_api.js]
  1. env.LIMITER.limit({ key: clientIP })   → 429 if exceeded
  2. POST challenges.cloudflare.com/turnstile/v0/siteverify  → 403 if invalid
  3. POST generativelanguage.googleapis.com (Gemini)
  4. Parse + validate JSON response
  5. Return { headline, post_body, reaction_name, comments }
        │
        ▼
[Fake LinkedIn post card rendered in page]
```

---

## New Files

| Path | Purpose |
|---|---|
| `/linkedin_lessons/index.html` | App frontend |
| `/worker/src/linkedin_api.js` | Worker handler |

## Modified Files

| Path | Change |
|---|---|
| `/worker/src/index.js` | Add route `POST /linkedin/api/generate` |
| `/wrangler.jsonc` | Add `rate_limits` binding `LIMITER` |
| `/index.html` | Add `.app-card` entry |
| `/CLAUDE.md` | Update site structure section |

---

## Worker: `linkedin_api.js`

### Route
`POST /linkedin/api/generate`

### Request body (JSON)
```json
{ "name": "Joshua Fong", "text": "I failed my driving test twice.", "cfToken": "..." }
```

### Protection layer (in order)
1. **Rate limit** — `env.LIMITER.limit({ key: clientIP })`: 10 requests / 10 minutes per IP. Returns `429` with JSON error if exceeded.
2. **Turnstile verify** — POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `env.TURNSTILE_SECRET_KEY` and the `cfToken`. Returns `403` if `success: false`.
3. **Gemini call** — POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent` with `x-goog-api-key: env.GEMINI_API_KEY` header.

### Gemini request shape

Structured output is enforced via `generationConfig.responseMimeType` and `generationConfig.responseSchema` — not via prompt instructions. The API guarantees the response matches the schema; the system prompt focuses entirely on tone and content.

```json
{
  "system_instruction": { "parts": [{ "text": "<system prompt — tone/content only>" }] },
  "contents": [{ "parts": [{ "text": "<name> wrote: <text>" }] }],
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "properties": {
        "headline":      { "type": "string" },
        "post_body":     { "type": "string" },
        "reaction_name": { "type": "string" },
        "comments": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": {
            "type": "object",
            "properties": {
              "name":    { "type": "string" },
              "title":   { "type": "string" },
              "comment": { "type": "string" }
            },
            "required": ["name", "title", "comment"]
          }
        }
      },
      "required": ["headline", "post_body", "reaction_name", "comments"]
    }
  }
}
```

### System prompt (tone/content only — no format instructions)
```
You are a LinkedIn Thought Leader ghostwriter. Rewrite the user's input in maximum LinkedIn style — short punchy lines, dramatic spacing, humblebrags disguised as vulnerability, vague universal lessons, and contrived metaphors. Every mundane event becomes a life-changing leadership revelation.

headline: A LinkedIn-style professional headline for the user. Use pipe-separated buzzword fragments. Include one fake prestigious ex-employer (ex-McKinsey, ex-Google, ex-Goldman, etc.), one vague identity claim, and one role keyword. Example: "Founder & CEO | Disrupting Disruption | ex-Deloitte | Speaker | Dog Dad"

post_body: The LinkedIn-maxxed rewrite of the user's input. Use heavy line breaks (one sentence per line, blank lines for drama). Open with a hook that overpromises. Include a contrived anecdote where the original event becomes a leadership metaphor. End with a lesson compressed into a moral-sounding takeaway that removes all nuance. Use "I" frequently. Occasional ellipsis for gravitas. No hashtags.

reaction_name: A single plausible full name that would appear as "X and [N] others reacted." Should be a realistic-sounding person — not a celebrity, not a placeholder. Something like "Priya Nair" or "Marcus Webb".

comments: Exactly 3 comment objects. Each commenter should be a distinct LinkedIn archetype. Names should be realistic and diverse. Titles should be buzzword-heavy LinkedIn titles (e.g. "Senior Strategy Lead | Change Maker | LinkedIn Top Voice 2024", "2x Founder | Building in Public | Advisor"). Comments should be short (1–2 sentences), that would be typical of a post like this, written in the style of LinkedIn users who are trying to sound insightful but are mostly just echoing the same platitudes: affirming, and slightly hollow — the kind that signals engagement with the context, but without saying anything. Occasional emoji. 
```

### Response (JSON)
```json
{
  "headline": "...",
  "post_body": "...",
  "reaction_name": "...",
  "comments": [ { "name": "...", "title": "...", "comment": "..." } ]
}
```

### Error responses
All errors return `{ "error": "..." }` with appropriate HTTP status:
- `400` — missing/invalid fields
- `403` — Turnstile failed
- `429` — rate limit exceeded (frontend renders satirical quota message, not a generic error)
- `500` — Gemini call failed or JSON parse error

---

## Worker: `wrangler.jsonc` additions

```jsonc
"rate_limits": [
  {
    "binding": "LIMITER",
    "namespace_id": "1001"   // configure actual limit (10 req / 600s) in Cloudflare dashboard
  }
]
```

New secrets to set via `wrangler secret put`:
- `GEMINI_API_KEY`
- `TURNSTILE_SECRET_KEY`

---

## Frontend: `/linkedin_lessons/index.html`

### Page structure (standard site chrome)
- Nav: `JF / apps` mark | Apps | LinkedIn Lessons (active)
- Footer: standard
- Grid spotlight background effect

### Input section
- `.section-label` eyebrow: `linkedin lessons`
- `h1`: "Say it like a thought leader."
- Short descriptor (body font, muted): "Enter something real. Get something insufferable."
- Two inputs:
  - Text input: "Your name" (used in Gemini prompt, also rendered on card)
  - Textarea: "What do you actually want to say?" — no character limit enforced client-side
- Generate button (primary style from `apps.css`)
- Turnstile widget rendered below button (managed mode, invisible to most users)
- Loading state: button text changes to "Crafting your personal brand…", button disabled
- **429 error state:** replace the button area with an in-place message in the site's muted text style — no alert, no red. Message: `"You've reached your thought leadership quota. The algorithm will allow you back in 10 minutes."` Button remains hidden until the user edits their input (which resets the form to idle state).

### Output section (appears after successful response)
The fake LinkedIn post card is rendered in LinkedIn's authentic visual style — light background, not the site's dark theme. This visual contrast is intentional and is the punchline.

**Card anatomy:**
```
┌─────────────────────────────────────────────┐
│  [avatar]  [Name]                            │
│            [Generated headline]              │
│            1st · 3m · 🌐                    │
│                                              │
│  [post_body — with line breaks preserved]   │
│                                              │
│  👍❤️🔥  [reaction_name] and [100–999] others │
│  ─────────────────────────────────────────  │
│  [Like]  [Comment]  [Repost]  [Send]        │
│  ─────────────────────────────────────────  │
│  [avatar] [name]  [title]                   │
│           [comment]                          │
│  (× 3 comments)                             │
└─────────────────────────────────────────────┘
```

**Card styles (inline, scoped to `.li-card`):**
- Background: `#ffffff`, text: `#000000e6`
- LinkedIn blue: `#0a66c2` for name and icon accents
- Avatar: grey placeholder circle (no image)
- Font: system-ui (not site fonts — to look authentic)
- Max-width: 560px, centred
- Sharp corners (site rule applies — `border-radius: 0`)
- Reaction icons: emoji (👍❤️🔥), count: `[reaction_name] and N others` where N is `Math.floor(Math.random() * 900) + 100` — generated client-side on each render
- Action bar: Like / Comment / Repost / Send as text buttons with icons

**Below the card, two actions:**
- **"Copy post"** button — copies `post_body` to clipboard. On click, label changes to "Copied!" for 2 seconds then reverts. Uses `navigator.clipboard.writeText()`.
- **"Share"** button — rendered only if `navigator.share` is available (mobile). Calls `navigator.share({ text: post_body })`. No desktop fallback; Copy handles that case.
- **"Generate another"** button — resets to input state, clearing the card and re-enabling the form.

---

## Rate Limiting Configuration

| Parameter | Value |
|---|---|
| Binding | `LIMITER` |
| Limit | 10 requests |
| Period | 600 seconds (10 minutes) |
| Key | Client IP (`request.headers.get('CF-Connecting-IP')`) |

---

## Environment Variables

| Variable | Location | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Worker secret | Google AI Studio |
| `TURNSTILE_SECRET_KEY` | Worker secret | Cloudflare Turnstile dashboard |
| `TURNSTILE_SITE_KEY` | Frontend HTML (public) | Cloudflare Turnstile dashboard |

---

## CORS

The worker adds CORS headers (`Access-Control-Allow-Origin: *`) matching the pattern in `globe_api.js`. A preflight `OPTIONS` handler is included.

---

## Out of Scope

- Streaming the Gemini response (single JSON blob is simpler and the output is short)
- Sharing as image / download (complex without an external library)
- Shareable links (requires backend persistence)
- Persisting any generated posts
- Any form of user accounts or sessions
