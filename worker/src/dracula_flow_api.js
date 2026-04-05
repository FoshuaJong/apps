import verses from './verses.json';

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function handleDraculaApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 🔀 RANDOM
  if (path === "/random") {
    const v = verses[Math.floor(Math.random() * verses.length)];
    return json(v);
  }

  // 🔎 SEARCH
  if (path === "/search") {
    const q = (url.searchParams.get("q") || "").toLowerCase();

    const results = verses.filter(v =>
      v.text.toLowerCase().includes(q)
    );

    return json(results.slice(0, 20));
  }

  // 📅 DAILY (deterministic)
  if (path === "/daily") {
    const day = Math.floor(Date.now() / 86400000);
    const v = verses[day % verses.length];
    return json(v);
  }

  // 🆔 GET BY ID
  if (path.startsWith("/verse/")) {
    const id = parseInt(path.split("/")[2]);
    const v = verses.find(v => v.id === id);

    return v ? json(v) : json({ error: "Not found" });
  }

  // 🧪 ROOT
  return json({
    message: "Dracula Flow API 🧛",
    endpoints: ["/random", "/search?q=", "/daily", "/verse/:id"]
  });
};