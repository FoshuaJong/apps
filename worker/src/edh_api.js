// ─── EDH Clock — Cloudflare Worker API + Durable Object ───────────────────────
//
// Routes (all under /edh/):
//   GET /edh/new           → generate Base-30 5-char room code, return {code}
//   WS  /edh/game/:CODE    → WebSocket upgrade, proxy to EDHClock Durable Object
//
// Durable Object (EDHClock):
//   Uses the Hibernatable WebSocket API so the DO sleeps between messages.
//   All game state is persisted to DO storage so cold-starts are seamless.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Base-30 alphabet — no ambiguous chars (0/O, 1/I)
const B30 = '23456789ABCDEFGHJKLMNPQRSTUVWX';

function generateCode() {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += B30[Math.floor(Math.random() * 30)];
  }
  return code;
}

// ─── Request router ────────────────────────────────────────────────────────────

export async function handleEdhApiRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // GET /edh/new — create a new room
  if (request.method === 'GET' && url.pathname === '/edh/new') {
    const code = generateCode();
    return new Response(JSON.stringify({ code }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  // WS /edh/game/:CODE — join a room via WebSocket
  const wsMatch = url.pathname.match(/^\/edh\/game\/([A-Z2-9]{5})$/);
  if (wsMatch) {
    const code = wsMatch[1];
    const id = env.EDH_CLOCK.idFromName(code);
    const stub = env.EDH_CLOCK.get(id);
    return stub.fetch(request);
  }

  return new Response('Not found', { status: 404, headers: CORS });
}

// ─── Durable Object ────────────────────────────────────────────────────────────

export class EDHClock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  // ── Fetch entry-point ───────────────────────────────────────────────────────

  async fetch(request) {
    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      // Send current state immediately so the client can render before JOIN msg
      const gs = await this._loadState();
      server.send(JSON.stringify({ type: 'GAME_UPDATE', ...gs, serverNow: Date.now() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Expected WebSocket', { status: 426 });
  }

  // ── Hibernatable WS handlers ────────────────────────────────────────────────

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const gs = await this._loadState();

    switch (msg.type) {

      case 'JOIN': {
        const { playerId, name } = msg;
        if (!playerId || !name) break;
        // Attach playerId to this WS so we can identify them on disconnect
        ws.serializeAttachment({ playerId });
        const existing = gs.players.find(p => p.id === playerId);
        if (!existing) {
          if (gs.phase !== 'lobby') break; // no late joins mid-game
          gs.players.push({ id: playerId, name: String(name).slice(0, 24), bankedMs: gs.defaultMs });
        } else {
          existing.name = String(name).slice(0, 24); // allow name refresh on reconnect
        }
        await this._saveState(gs);
        this._broadcast(gs);
        break;
      }

      case 'SET_TIME': {
        if (gs.phase !== 'lobby') break;
        const mins = Number(msg.minutes);
        if (!Number.isFinite(mins) || mins < 1 || mins > 999) break;
        gs.defaultMs = mins * 60 * 1000;
        // Reset all banked times to new default
        for (const p of gs.players) p.bankedMs = gs.defaultMs;
        await this._saveState(gs);
        this._broadcast(gs);
        break;
      }

      case 'START_GAME': {
        if (gs.phase !== 'lobby' || gs.players.length < 2) break;
        gs.phase = 'game';
        gs.currentTurn = 0;
        gs.paused = false;
        gs.turnStartTime = Date.now();
        await this._saveState(gs);
        this._broadcast(gs);
        break;
      }

      case 'PASS_TURN': {
        if (gs.phase !== 'game' || gs.paused) break;
        const att = ws.deserializeAttachment();
        const myIndex = gs.players.findIndex(p => p.id === att?.playerId);
        if (myIndex !== gs.currentTurn) break; // not your turn
        const elapsed = Date.now() - gs.turnStartTime;
        gs.players[gs.currentTurn].bankedMs = Math.max(0, gs.players[gs.currentTurn].bankedMs - elapsed);
        gs.currentTurn = (gs.currentTurn + 1) % gs.players.length;
        gs.turnStartTime = Date.now();
        await this._saveState(gs);
        this._broadcast(gs);
        break;
      }

      case 'PAUSE': {
        if (gs.phase !== 'game' || gs.paused) break;
        const elapsed = Date.now() - gs.turnStartTime;
        gs.players[gs.currentTurn].bankedMs = Math.max(0, gs.players[gs.currentTurn].bankedMs - elapsed);
        gs.paused = true;
        gs.turnStartTime = null;
        await this._saveState(gs);
        this._broadcast(gs);
        break;
      }

      case 'RESUME': {
        if (gs.phase !== 'game' || !gs.paused) break;
        gs.paused = false;
        gs.turnStartTime = Date.now();
        await this._saveState(gs);
        this._broadcast(gs);
        break;
      }

      case 'GET_STATE': {
        // Full state sync for a single reconnecting client
        ws.send(JSON.stringify({ type: 'GAME_UPDATE', ...gs, serverNow: Date.now() }));
        break;
      }
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att?.playerId) return;
    const gs = await this._loadState();
    // Only remove from lobby — in-game we keep the slot so rejoins work
    if (gs.phase === 'lobby') {
      gs.players = gs.players.filter(p => p.id !== att.playerId);
      await this._saveState(gs);
      this._broadcast(gs);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _broadcast(gs) {
    const msg = JSON.stringify({ type: 'GAME_UPDATE', ...gs, serverNow: Date.now() });
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); } catch { /* hibernated or closed */ }
    }
  }

  async _loadState() {
    const stored = await this.state.storage.get('gs');
    if (stored) return stored;
    // Default lobby state
    return {
      phase: 'lobby',
      players: [],
      currentTurn: 0,
      paused: false,
      turnStartTime: null,
      defaultMs: 60 * 60 * 1000, // 60 minutes
    };
  }

  async _saveState(gs) {
    await this.state.storage.put('gs', gs);
  }
}
