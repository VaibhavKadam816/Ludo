// Online Ludo: zero-dependency Node server. Run: node server.js   Test: node server.js test
const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomInt } = require('crypto');

const IDLE = 30 * 60e3; // delete rooms nobody is watching after 30 min
const rooms = new Map();

// Board has n arms (4 for 2-4 players, 5 or 6 otherwise), 13 track squares per arm.
// Token progress p: -1 yard, 0..T main track (relative to own start), T+1..T+5 home column, T+6 finished.
const last = g => 13 * g.n - 2;
const safe = abs => abs % 13 === 0 || abs % 13 === 8; // start squares + stars

const legal = (g, c, i) => {
  const p = g.tokens[c][i];
  return p === -1 ? g.dice === 6 : p + g.dice <= last(g) + 6;
};

// Returns true if the mover earns another roll (six, capture, or reaching home).
function move(g, c, i) {
  const T = last(g), L = 13 * g.n;
  const p = g.tokens[c][i] = g.tokens[c][i] === -1 ? 0 : g.tokens[c][i] + g.dice;
  let bonus = g.dice === 6 || p === T + 6;
  const abs = (p + 13 * c) % L;
  if (p <= T && !safe(abs)) g.tokens.forEach((t, o) => {
    if (!t || o === c) return;
    t.forEach((q, j) => {
      if (q >= 0 && q <= T && (q + 13 * o) % L === abs) { t[j] = -1; bonus = true; }
    });
  });
  return bonus;
}

function pass(g) {
  g.rolled = false;
  g.turn = (g.turn + 1) % g.players.length;
}

function handle(g, id, a) {
  const me = g.players.findIndex(p => p.id === id);
  if (a.type === 'join') {
    if (me >= 0) return;
    if (a.pass !== g.pass) throw 'Wrong room number or passcode';
    if (g.started) throw 'Game already started';
    if (g.players.length >= 6) throw 'Room is full';
    g.players.push({ id, name: String(a.name || '').trim().slice(0, 20) || 'Player' });
    return;
  }
  if (a.type === 'start') {
    if (me !== 0) throw 'Only the host can start';
    if (g.started) throw 'Already started';
    const k = g.players.length;
    if (k < 2) throw 'Need at least 2 players';
    g.n = Math.max(4, k);
    g.tokens = Array(g.n).fill(null);
    const colors = k === 2 ? [0, 2] : [...Array(k).keys()];
    g.players.forEach((p, i) => { p.color = colors[i]; g.tokens[p.color] = [-1, -1, -1, -1]; });
    g.started = true;
    return;
  }
  if (!g.started || g.winner != null) throw 'Game not running';
  if (me !== g.turn) throw 'Not your turn';
  const c = g.players[me].color;
  if (a.type === 'roll') {
    if (g.rolled) throw 'Already rolled';
    g.dice = randomInt(1, 7);
    g.rolled = true;
    g.rolls++;
    g.msg = `${g.players[me].name} rolled ${g.dice}`;
    if (![0, 1, 2, 3].some(i => legal(g, c, i))) { g.msg += ', no moves'; pass(g); }
  } else if (a.type === 'move') {
    const i = a.token;
    if (!g.rolled || !Number.isInteger(i) || i < 0 || i > 3 || !legal(g, c, i)) throw 'Illegal move';
    const bonus = move(g, c, i);
    if (g.tokens[c].every(p => p === last(g) + 6)) g.winner = me;
    else if (bonus) g.rolled = false;
    else pass(g);
  } else throw 'Unknown action';
}
// ponytail: no three-sixes rule, no blockades, no kicking a player who left mid-game

function newRoom() {
  let code;
  do code = randomInt(36 ** 5).toString(36).padStart(5, '0').toUpperCase(); while (rooms.has(code));
  // ponytail: 6-digit passcode with no attempt limit, fine for friends; add rate limiting if rooms get attacked
  const pass = String(randomInt(1e6)).padStart(6, '0');
  const r = { pass, players: [], started: false, n: 4, turn: 0, dice: null, rolled: false, rolls: 0, tokens: [], winner: null, msg: '', clients: new Map() };
  r.timer = setTimeout(() => rooms.delete(code), IDLE);
  rooms.set(code, r);
  return { code, pass };
}

function broadcast(r) {
  const { clients, players, timer, ...rest } = r;
  for (const [res, id] of clients) {
    const state = { ...rest, players: players.map(p => ({ name: p.name, color: p.color })), me: players.findIndex(p => p.id === id) };
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  }
}

if (process.argv[2] === 'test') {
  const assert = require('assert');
  const g = { n: 4, dice: 6, tokens: [[-1, -1, -1, -1], null, [-1, -1, -1, -1], null] };
  assert(legal(g, 0, 0));
  g.dice = 5; assert(!legal(g, 0, 0));                     // need a 6 to leave the yard
  g.dice = 6; assert(move(g, 0, 0)); assert.equal(g.tokens[0][0], 0);
  g.tokens[0][0] = 3; g.tokens[2][0] = 27; g.dice = 2;      // yellow lands on abs 3 -> captures red
  assert(move(g, 2, 0)); assert.equal(g.tokens[0][0], -1);
  g.tokens[0][0] = 8; g.tokens[2][0] = 32; g.dice = 2;      // abs 8 is a star -> safe
  assert(!move(g, 2, 0)); assert.equal(g.tokens[0][0], 8);
  g.tokens[0][1] = 54; g.dice = 3; assert(!legal(g, 0, 1));  // exact roll to finish
  g.dice = 2; assert(move(g, 0, 1)); assert.equal(g.tokens[0][1], 56);
  // 6-arm board: 78 squares, color 5 wraps past square 0 and captures red on abs 7
  const h = { n: 6, dice: 2, tokens: [[7, -1, -1, -1], null, null, null, null, [18, 80, -1, -1]] };
  assert(move(h, 5, 0)); assert.equal(h.tokens[0][0], -1);
  assert(move(h, 5, 1)); assert.equal(h.tokens[5][1], 82);  // 82 = finished on 6 arms
  console.log('ok');
  process.exit(0);
}

setInterval(() => { for (const r of rooms.values()) for (const res of r.clients.keys()) res.write(':\n\n'); }, 25e3); // keep proxies from closing SSE

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, body) => res.writeHead(status, { 'content-type': 'text/plain' }).end(body);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  if (req.method === 'POST' && url.pathname === '/new') return send(200, JSON.stringify(newRoom()));

  if (req.method === 'GET' && url.pathname === '/events') {
    const code = url.searchParams.get('room'), id = url.searchParams.get('id'), r = rooms.get(code);
    if (!r) return send(404, 'No such room');
    if (!r.players.some(p => p.id === id)) return send(403, 'Join first');
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    clearTimeout(r.timer);
    r.clients.set(res, id);
    broadcast(r);
    req.on('close', () => {
      r.clients.delete(res);
      if (!r.clients.size) r.timer = setTimeout(() => rooms.delete(code), IDLE);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/act') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1000) req.destroy(); });
    req.on('end', () => {
      try {
        const a = JSON.parse(body), r = rooms.get(a.room);
        if (!r) throw 'Wrong room number or passcode';
        if (typeof a.id !== 'string' || !a.id || a.id.length > 64) throw 'Bad id';
        handle(r, a.id, a);
        broadcast(r);
        send(200, 'ok');
      } catch (e) {
        send(400, typeof e === 'string' ? e : 'Bad request');
      }
    });
    return;
  }
  send(404, 'Not found');
}).listen(process.env.PORT || 3000, () => console.log(`Ludo on http://localhost:${process.env.PORT || 3000}`));
