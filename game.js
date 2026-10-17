// Ludo rules. The host's browser runs these; guests only send actions. Tested by test.js.

// Board has n arms (4 for 2-4 players, 5 or 6 otherwise), 13 track squares per arm.
// Token progress p: -1 yard, 0..T main track (relative to own start), T+1..T+5 home column, T+6 finished.
export const last = g => 13 * g.n - 2;
const safe = abs => abs % 13 === 0 || abs % 13 === 8; // start squares + stars

export const legal = (g, c, i) => {
  const p = g.tokens[c][i];
  return p === -1 ? g.dice === 6 : p + g.dice <= last(g) + 6;
};

// Uniform 1..max from the browser's crypto RNG.
const rollDie = (max = 6) => {
  const b = new Uint32Array(1), limit = 2 ** 32 - 2 ** 32 % max;
  do crypto.getRandomValues(b); while (b[0] >= limit);
  return b[0] % max + 1;
};

// bonus: the mover earns another roll (six, capture, or reaching home). captured: tokens sent home.
export function move(g, c, i) {
  const T = last(g), L = 13 * g.n;
  const p = g.tokens[c][i] = g.tokens[c][i] === -1 ? 0 : g.tokens[c][i] + g.dice;
  let captured = 0;
  const abs = (p + 13 * c) % L;
  if (p <= T && !safe(abs)) g.tokens.forEach((t, o) => {
    if (!t || o === c) return;
    t.forEach((q, j) => {
      if (q >= 0 && q <= T && (q + 13 * o) % L === abs) { t[j] = -1; captured++; }
    });
  });
  return { bonus: g.dice === 6 || p === T + 6 || captured > 0, captured };
}

export const TURN_MS = 30000;
const GRACE_MS = 3000;     // covers the move animation everyone watches before the clock means anything
const OFFLINE_MS = 10000;  // a disconnected player's turn is played for them after this
export const MAX_IDLE = 5; // timed-out turns allowed; one more and the player is removed
export const PITY = 6;     // turns stuck in the yard without a 6; the next roll is a 6

// Every time the game waits on the current player, they get a fresh 30 s.
const arm = g => { g.deadline = Date.now() + TURN_MS + GRACE_MS; };
const playing = p => !p.left && !p.place; // still has pawns to bring home
export const ordinal = n => n + (n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

function pass(g) {
  g.rolled = false;
  g.sixes = 0;
  do g.turn = (g.turn + 1) % g.players.length; while (!playing(g.players[g.turn]));
}

// The game ends when at most one player still has pawns out; they take the last place.
function checkEnd(g) {
  const rest = g.players.filter(playing);
  if (rest.length > 1) return false;
  if (rest.length) rest[0].place = g.places.push(g.players.indexOf(rest[0]));
  g.done = true;
  return true;
}

function moveToken(g, me, c, i) {
  const { bonus, captured } = move(g, c, i);
  const p = g.players[me];
  p.captures += captured;
  if (g.tokens[c].every(t => t === last(g) + 6)) {
    p.place = g.places.push(me);
    g.msg = `${p.name} finished ${ordinal(p.place)}!`;
    if (!checkEnd(g)) pass(g);
  } else if (bonus) g.rolled = false;
  else pass(g);
}

function startGame(g) {
  const k = g.players.length;
  g.n = Math.max(4, k);
  g.tokens = Array(g.n).fill(null);
  const colors = k === 2 ? [0, 2] : [...Array(k).keys()];
  g.players.forEach((p, i) => { p.color = colors[i]; g.tokens[p.color] = [-1, -1, -1, -1]; });
  g.started = true;
  g.startedAt = Date.now();
  arm(g);
}

// Take a player out of a running game: their pawns leave the board and their turns are skipped.
function remove(g, me, msg) {
  const p = g.players[me];
  Object.assign(p, { left: true, voice: false });
  if (!p.place) g.tokens[p.color] = null; // a finished player's pawns stay home
  g.msg = msg;
  if (g.done || checkEnd(g)) return;
  if (g.turn === me) { pass(g); arm(g); }
}

// Host calls this every second. When the current player's time is up, play for them:
// roll, then move the first legal pawn. Too many timeouts and a guest is removed for good.
// A player who is offline gets only 10 s, so a dropped connection doesn't stall everyone.
export function tick(g, now = Date.now(), online = () => true) {
  if (!g.started || g.done || g.over) return false;
  if (!online(g.turn) && g.deadline > now + OFFLINE_MS) g.deadline = now + OFFLINE_MS;
  if (!(now >= g.deadline)) return false;
  const me = g.turn, p = g.players[me];
  p.idle = (p.idle || 0) + 1;
  if (p.idle > MAX_IDLE && me !== g.hostSeat) { // never the host: their browser runs the game
    p.kicked = true;
    remove(g, me, `${p.name} was removed for not playing`);
    return true;
  }
  if (!g.rolled) handle(g, p.id, { type: 'roll' }, undefined, true);
  if (g.rolled && g.turn === me && !g.done) {
    const i = [0, 1, 2, 3].find(i => legal(g, p.color, i));
    handle(g, p.id, { type: 'move', token: i }, undefined, true);
  }
  g.msg += ' (time ran out)';
  return true;
}

export const newGame = expected => ({ expected: Math.min(6, Math.max(2, expected | 0 || 4)), players: [], started: false, n: 4,
  turn: 0, dice: null, rolled: false, rolls: 0, tokens: [], places: [], done: false, over: false, hostSeat: 0, epoch: 0, msg: '' });

// Apply one player's action to the game, or throw a message for that player.
export function handle(g, id, a, peer, auto = false) {
  if (!a || typeof a.type !== 'string' || typeof id !== 'string' || !id || id.length > 64) throw 'Bad request';
  const me = g.players.findIndex(p => p.id === id);
  if (me >= 0 && peer) g.players[me].peer = peer; // the player may have reconnected with a new connection
  if (a.type === 'join') {
    if (me >= 0) return;
    if (g.started) {
      // After a host handover the new host doesn't know the others' ids: they reclaim their seat.
      const s = g.players[a.seat];
      if (Number.isInteger(a.seat) && s && !s.id && !s.left) return void Object.assign(s, { id, peer });
      throw 'This game has already started';
    }
    if (g.players.length >= 6) throw 'This room is full';
    g.players.push({ id, peer, name: String(a.name || '').trim().slice(0, 20) || 'Player', voice: false, captures: 0 });
    if (g.players.length === g.expected) startGame(g); // everyone the host invited is here
    return;
  }
  if (me < 0) throw 'Join first';
  if (a.type === 'voice') { g.players[me].voice = !!a.on; return; }
  if (a.type === 'leave') {
    if (!g.started) return void g.players.splice(me, 1);
    const p = g.players[me];
    if (p.left) return;
    return remove(g, me, `${p.name} left the game`);
  }
  if (a.type === 'start') {
    if (me !== g.hostSeat) throw 'Only the host can start';
    if (g.started) throw 'Already started';
    if (g.players.length < 2) throw 'Need at least 2 players';
    return startGame(g);
  }
  if (!g.started || g.done || g.over) throw 'Game not running';
  if (me !== g.turn) throw 'Not your turn';
  const p = g.players[me], c = p.color;
  if (!auto) p.idle = 0; // they're here after all
  if (a.type === 'roll') {
    if (g.rolled) throw 'Already rolled';
    const stuck = g.tokens[c].every(t => t === -1 || t === last(g) + 6); // nothing on the board to move
    if (stuck && (p.dry || 0) >= PITY) g.dice = 6;     // 6 turns stuck in the yard: this one's a 6
    else g.dice = rollDie(g.sixes >= 2 ? 5 : 6);         // never more than two sixes in a row
    p.dry = stuck && g.dice !== 6 ? (p.dry || 0) + 1 : 0;
    g.sixes = g.dice === 6 ? (g.sixes || 0) + 1 : 0;
    g.rolled = true;
    g.rolls++;
    g.msg = `${p.name} rolled ${g.dice}`;
    const opts = [0, 1, 2, 3].filter(i => legal(g, c, i));
    if (!opts.length) { g.msg += ', no moves'; pass(g); }
    // Only one real choice (one movable token, or several tokens on the same square): play it.
    else if (new Set(opts.map(i => g.tokens[c][i])).size === 1) moveToken(g, me, c, opts[0]);
  } else if (a.type === 'move') {
    const i = a.token;
    if (!g.rolled || !Number.isInteger(i) || i < 0 || i > 3 || !legal(g, c, i)) throw 'Illegal move';
    moveToken(g, me, c, i);
  } else throw 'Unknown action';
  arm(g);
}
// ponytail: no blockades

// What one player is allowed to see: everything except the other players' secret ids.
// tokens are copied so the host's own screen can compare old and new positions to animate moves.
// timeLeft rather than the deadline itself: players' clocks don't agree with the host's.
export const view = (g, id) => ({ ...g, deadline: undefined, timeLeft: g.deadline ? Math.min(TURN_MS, g.deadline - Date.now()) : null,
  tokens: g.tokens.map(t => t && [...t]), places: [...g.places], me: g.players.findIndex(p => p.id === id),
  players: g.players.map(p => ({ name: p.name, color: p.color, voice: p.voice, left: !!p.left, kicked: !!p.kicked, idle: p.idle || 0,
    dry: p.dry || 0, place: p.place || 0, online: p.online !== false, captures: p.captures, peer: p.peer })) });

// Host handover: a player turns the last game state they saw back into a full game they now run.
// Nobody else's secret id is known, so the other seats stay open until each player reclaims theirs.
export function adopt(s, id, peer) {
  const g = { ...s, players: s.players.map((p, i) => ({ ...p, id: i === s.me ? id : null, peer: i === s.me ? peer : null })),
    hostSeat: s.me, epoch: (s.epoch || 0) + 1, msg: `${s.players[s.me].name} is now the host` };
  delete g.me; delete g.timeLeft;
  arm(g);
  return g;
}
