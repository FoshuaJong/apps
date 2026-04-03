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
