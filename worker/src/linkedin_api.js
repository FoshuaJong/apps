import { Hono } from 'hono';

const SYSTEM_PROMPT = `You are a LinkedIn Thought Leader ghostwriter. Rewrite the user's input in maximum LinkedIn style — short punchy lines, dramatic spacing, humblebrags disguised as vulnerability, vague universal lessons, and contrived metaphors. Every mundane event becomes a life-changing leadership revelation.

Respond with a single JSON object with exactly these keys: headline, post_body, reaction_name, comments.

headline: A LinkedIn-style professional headline for the user. Use pipe-separated buzzword fragments. Include one fake prestigious ex-employer (ex-McKinsey, ex-Google, ex-Goldman, etc.), one vague identity claim, and one role keyword. Example: "Founder & CEO | Disrupting Disruption | ex-Deloitte | Speaker | Dog Dad"

post_body: The LinkedIn-maxxed rewrite of the user's input. IMPORTANT: Use \\n (newline) between every others sentence and \\n\\n (blank line) between thematic breaks — this is essential for the dramatic LinkedIn formatting effect. One sentence per line. Open with a hook that overpromises. Include a contrived anecdote where the original event becomes a leadership metaphor. End with a lesson compressed into a moral-sounding takeaway that removes all nuance. Use "I" frequently. Occasional ellipsis for gravitas. No hashtags.

reaction_name: A single plausible full name that would appear as "X and [N] others reacted." Should be a realistic-sounding person — not a celebrity, not a placeholder. Something like "Priya Nair" or "Marcus Webb".

comments: An array of exactly 3 objects, each with keys: name, title, comment. Each commenter should be a distinct LinkedIn archetype. Names should be realistic and diverse. Titles should be buzzword-heavy LinkedIn titles (e.g. "Senior Strategy Lead | Change Maker | LinkedIn Top Voice 2024", "2x Founder | Building in Public | Advisor"). Comments should be short (1–2 sentences), written in the style of LinkedIn users who are trying to sound insightful but are mostly just echoing the same platitudes: affirming, and slightly hollow — the kind that signals engagement with the context, but without saying anything. Occasional emoji.

Example output shape (values are illustrative only):
{"headline":"...","post_body":"I almost quit.\\n\\nBut then something shifted...\\n\\nThe lesson? Discomfort is just growth in disguise.","reaction_name":"Priya Nair","comments":[{"name":"Marcus Webb","title":"Growth Lead | ex-Uber | Building in Public","comment":"This resonates deeply. 🙌"},{"name":"Fatima Al-Hassan","title":"2x Founder | Advisor | LinkedIn Top Voice 2024","comment":"Needed this today. The lesson is everything."},{"name":"Daniel Park","title":"Senior Strategy Lead | Change Maker","comment":"The metaphor here is spot on. Real leadership is uncomfortable."}]}`;

export const linkedinApp = new Hono();

linkedinApp.post('/api/generate', async (c) => {
  // 1. Rate limit
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const { success: withinLimit } = await c.env.LIMITER.limit({ key: ip });
  if (!withinLimit) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  // 2. Parse + validate body
  if (c.req.header('content-length') && Number(c.req.header('content-length')) > 8192) {
    return c.json({ error: 'Request too large' }, 413);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { name: rawName, text: rawText, cfToken } = body ?? {};
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!name || !text || !cfToken) {
    return c.json(
      { error: 'Missing required fields: name, text, cfToken' },
      400
    );
  }

  if (name.length > 100 || text.length > 2000) {
    return c.json(
      { error: 'Input too long: name max 100 chars, text max 2000 chars' },
      400
    );
  }

  // 3. Turnstile verify
  const tsForm = new FormData();
  tsForm.append('secret', c.env.TURNSTILE_SECRET_KEY);
  tsForm.append('response', cfToken);
  tsForm.append('remoteip', ip);

  let tsData;
  try {
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: tsForm,
    });
    tsData = await tsRes.json();
  } catch {
    return c.json({ error: 'Verification service unavailable' }, 503);
  }
  if (!tsData.success) {
    return c.json({ error: 'Turnstile verification failed' }, 403);
  }

  // 4. Gemini structured output
  const geminiRes = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': c.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: `${name} wrote: ${text}` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('Gemini error:', geminiRes.status, errText);
    return c.json({ error: 'Gemini API error' }, 500);
  }

  const geminiData = await geminiRes.json();
  const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    return c.json({ error: 'Empty response from Gemini' }, 500);
  }

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    return c.json({ error: 'Failed to parse Gemini response' }, 500);
  }

  return c.json(result);
});
