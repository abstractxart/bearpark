// Run: node --test backend/daily-board.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isDailyGameId,
  dailyBoardDate,
  isOpenDailyBoard,
  cleanDailyMetadata,
  withoutGhost,
  MAX_GHOST_CHARS,
} = require('./daily-board');

const NOON_UTC = Date.UTC(2026, 9, 10, 12, 0, 0);

test('recognises daily boards and reads their date', () => {
  assert.equal(isDailyGameId('flappy-bear-daily-2026-10-10'), true);
  assert.equal(isDailyGameId('flappy-bear'), false);
  assert.equal(isDailyGameId('bear-pong'), false);
  assert.equal(dailyBoardDate('flappy-bear-daily-2026-10-10'), Date.UTC(2026, 9, 10));
  assert.equal(dailyBoardDate('flappy-bear-daily-2026-02-31'), null);
  assert.equal(dailyBoardDate('flappy-bear-daily-26-10-10'), null);
  assert.equal(dailyBoardDate('flappy-bear-daily-2026-10-10x'), null);
  assert.equal(dailyBoardDate(42), null);
});

test("takes scores for anyone's today, and nothing older or later", () => {
  assert.equal(isOpenDailyBoard('flappy-bear-daily-2026-10-10', NOON_UTC), true);
  // Ahead of UTC (Asia/Pacific) or behind it (the Americas).
  assert.equal(isOpenDailyBoard('flappy-bear-daily-2026-10-11', NOON_UTC), true);
  assert.equal(isOpenDailyBoard('flappy-bear-daily-2026-10-09', NOON_UTC), true);
  assert.equal(isOpenDailyBoard('flappy-bear-daily-2026-10-08', NOON_UTC), false);
  assert.equal(isOpenDailyBoard('flappy-bear-daily-2026-10-12', NOON_UTC), false);
  assert.equal(isOpenDailyBoard('flappy-bear-daily-junk', NOON_UTC), false);
});

test('keeps a well-formed ghost and drops anything else', () => {
  assert.deepEqual(cleanDailyMetadata({ ghost: 'AbC-_9', coins: 3 }), { ghost: 'AbC-_9', coins: 3 });
  assert.deepEqual(cleanDailyMetadata({ ghost: '<script>', coins: 3 }), { coins: 3 });
  assert.deepEqual(cleanDailyMetadata({ ghost: 'A'.repeat(MAX_GHOST_CHARS + 1) }), {});
  assert.deepEqual(cleanDailyMetadata({ ghost: { evil: true } }), {});
  assert.deepEqual(cleanDailyMetadata(null), {});
  assert.deepEqual(cleanDailyMetadata(['x']), {});
});

test('lists carry a ghost flag, not the ghost', () => {
  const e = { score: 9, metadata: { ghost: 'AAAA', pipes: 3 } };
  assert.deepEqual(withoutGhost(e), { score: 9, metadata: { pipes: 3, has_ghost: true } });
  assert.equal(e.metadata.ghost, 'AAAA'); // the original is untouched
  const plain = { score: 1, metadata: { coins: 2 } };
  assert.equal(withoutGhost(plain), plain);
  assert.equal(withoutGhost(null), null);
});
