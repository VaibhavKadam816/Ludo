// Rule checks: node test.js
import assert from 'node:assert';
import { legal, move, newGame, handle, view, tick, MAX_IDLE } from './game.js';

const g = { n: 4, dice: 6, tokens: [[-1, -1, -1, -1], null, [-1, -1, -1, -1], null] };
assert(legal(g, 0, 0));
g.dice = 5; assert(!legal(g, 0, 0));                     // need a 6 to leave the yard
g.dice = 6; assert(move(g, 0, 0).bonus); assert.equal(g.tokens[0][0], 0);
g.tokens[0][0] = 3; g.tokens[2][0] = 27; g.dice = 2;      // yellow lands on abs 3 -> captures red
assert.deepEqual(move(g, 2, 0), { bonus: true, captured: 1 }); assert.equal(g.tokens[0][0], -1);
g.tokens[0][0] = 8; g.tokens[2][0] = 32; g.dice = 2;      // abs 8 is a star -> safe
assert(!move(g, 2, 0).bonus); assert.equal(g.tokens[0][0], 8);
g.tokens[0][1] = 54; g.dice = 3; assert(!legal(g, 0, 1));  // exact roll to finish
g.dice = 2; assert(move(g, 0, 1).bonus); assert.equal(g.tokens[0][1], 56);

// 6-arm board: 78 squares, color 5 wraps past square 0 and captures red on abs 7
const h = { n: 6, dice: 2, tokens: [[7, -1, -1, -1], null, null, null, null, [18, 80, -1, -1]] };
assert(move(h, 5, 0).captured); assert.equal(h.tokens[0][0], -1);
assert(move(h, 5, 1).bonus); assert.equal(h.tokens[5][1], 82);  // 82 = finished on 6 arms

// expected players: auto-start when the last one joins
const r = newGame(3);
handle(r, 'a', { type: 'join', name: 'A' }, 'peerA');
handle(r, 'b', { type: 'join', name: 'B' }, 'peerB');
assert(!r.started);
assert.throws(() => handle(r, 'b', { type: 'roll' }));   // not started yet
handle(r, 'c', { type: 'join', name: 'C' }, 'peerC');
assert(r.started); assert.equal(r.n, 4);
assert.throws(() => handle(r, 'd', { type: 'join', name: 'D' }), /already started/);
handle(r, 'a', { type: 'join' }, 'peerA2');               // reconnect: same player, new connection
assert.equal(r.players.length, 3); assert.equal(r.players[0].peer, 'peerA2');

// secret ids never leave the host
const v = view(r, 'b');
assert.equal(v.me, 1); assert(!JSON.stringify(v).includes('"id"'));

// dice are 1-6 and roughly uniform
const counts = [0, 0, 0, 0, 0, 0];
for (let k = 0; k < 6000; k++) { r.turn = 0; r.rolled = false; r.tokens[0] = [-1, -1, -1, -1]; handle(r, 'a', { type: 'roll' }); counts[r.dice - 1]++; }
assert(counts.every(n => n > 850 && n < 1150), counts.join());

// never three sixes in a row; the count resets on a new turn
let maxRun = 0, run = 0;
for (let k = 0; k < 3000; k++) {
  r.rolled = false; r.tokens[0] = [-1, -1, -1, -1];
  if (r.turn !== 0) { r.turn = 0; r.sixes = 0; run = 0; }
  handle(r, 'a', { type: 'roll' });
  run = r.dice === 6 ? run + 1 : 0; maxRun = Math.max(maxRun, run);
  if (r.dice !== 6) { r.turn = 0; r.sixes = 0; run = 0; }
}
assert.equal(maxRun, 2);

// the host's own view is a copy: changing the game afterwards doesn't change it
const before = view(r, 'a'); r.tokens[0][0] = 42; assert.notEqual(before.tokens[0][0], 42);

// auto-move + leave
do { r.turn = 0; r.rolled = false; r.tokens[0] = [10, -1, -1, -1]; handle(r, 'a', { type: 'roll' }); } while (r.dice === 6);
assert.equal(r.tokens[0][0], 10 + r.dice);                 // single choice moved automatically
r.turn = 1; r.rolled = false; handle(r, 'b', { type: 'leave' });
assert.equal(r.turn, 2); assert.equal(r.tokens[1], null);  // turn skips the leaver, tokens gone
handle(r, 'c', { type: 'leave' }); assert.equal(r.winner, 0);
assert.throws(() => handle(r, 'a', null), /Bad request/);

// turn timer: nothing happens before the deadline; after it the host plays the turn for you
const q = newGame(3);
for (const x of ['h', 'g1', 'g2']) handle(q, x, { type: 'join', name: x });
assert(!tick(q, Date.now()));                          // 30 s not up yet
q.turn = 1; q.rolled = false; q.tokens[1] = [10, -1, -1, -1];
assert(tick(q, q.deadline));
assert.equal(q.players[1].idle, 1);
assert(q.turn !== 1 || !q.rolled);                     // turn was played (moved or rolled again on a 6)
assert.equal(view(q, 'g1').timeLeft <= 30000, true);
handle(q, 'g1', { type: 'leave' }); q.players[1].left = false; q.tokens[1] = [10, -1, -1, -1]; // reset for the next check
// acting yourself resets the idle count
q.players[1].idle = 3; q.turn = 1; q.rolled = false; handle(q, 'g1', { type: 'roll' }); assert.equal(q.players[1].idle, 0);
// more than MAX_IDLE timed-out turns: removed for good
q.players[1].idle = MAX_IDLE; q.turn = 1; q.rolled = false;
assert(tick(q, q.deadline + 1));
assert(q.players[1].kicked && q.players[1].left); assert.equal(q.tokens[1], null); assert.equal(q.turn, 2);
// the host is never removed, only auto-played
q.players[0].idle = 99; q.turn = 0; q.rolled = false; tick(q, q.deadline + 1);
assert(!q.players[0].left);

console.log('ok');
