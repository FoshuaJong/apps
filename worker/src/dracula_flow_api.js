import { Hono } from 'hono';
import verses from './verses.json';

export const draculaApp = new Hono();

draculaApp.get('/random', (c) => {
  const v = verses[Math.floor(Math.random() * verses.length)];
  return new Response(JSON.stringify(v, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});

draculaApp.get('/search', (c) => {
  const q = (c.req.query('q') || '').toLowerCase();
  const results = verses.filter(v => v.text.toLowerCase().includes(q));
  return new Response(JSON.stringify(results.slice(0, 20), null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});

draculaApp.get('/daily', (c) => {
  const day = Math.floor(Date.now() / 86400000);
  const v = verses[day % verses.length];
  return new Response(JSON.stringify(v, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});

draculaApp.get('/verse/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  const v = verses.find(v => v.id === id);
  const data = v ?? { error: 'Not found' };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});

draculaApp.get('/', (c) => {
  return new Response(
    JSON.stringify(
      {
        message: 'Dracula Flow API 🧛',
        endpoints: ['/random', '/search?q=', '/daily', '/verse/:id'],
      },
      null,
      2
    ),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
