// node --test backend/honey-guard.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  walletKey,
  createKeyedMutex,
  createRateLimiter,
  classifyLedgerError,
  createAccessGate,
  pickTrueCaseAddress,
  dailyCapForStoredCase,
  claimedClientIp,
} = require('./honey-guard');

const REAL = 'rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('walletKey lowercases and trims', () => {
  assert.equal(walletKey('  rAbC '), 'rabc');
  assert.equal(walletKey(null), '');
});

test('mutex serialises a check-then-act on the same key', async () => {
  const mutex = createKeyedMutex();
  let balance = 100;
  const spend = () => mutex.run('wallet:a', async () => {
    const seen = balance;
    await sleep(5);
    if (seen < 100) return false;
    balance = seen - 100;
    return true;
  });
  const results = await Promise.all([spend(), spend(), spend()]);
  assert.deepEqual(results.filter(Boolean).length, 1);
  assert.equal(balance, 0);
  assert.equal(mutex.pending(), 0);
});

test('mutex lets different keys run in parallel', async () => {
  const mutex = createKeyedMutex();
  const order = [];
  await Promise.all([
    mutex.run('a', async () => { order.push('a1'); await sleep(20); order.push('a2'); }),
    mutex.run('b', async () => { order.push('b1'); await sleep(1); order.push('b2'); }),
  ]);
  assert.deepEqual(order.slice(0, 2).sort(), ['a1', 'b1']);
});

test('mutex is re-entrant within one async chain', async () => {
  const mutex = createKeyedMutex();
  const value = await mutex.run('w', async () => {
    await sleep(1);
    return mutex.run('w', async () => 42);
  });
  assert.equal(value, 42);
});

test('mutex releases the key when the holder throws', async () => {
  const mutex = createKeyedMutex();
  await assert.rejects(mutex.run('w', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await mutex.run('w', async () => 'next'), 'next');
});

test('runAll takes keys in sorted order (no deadlock between opposite orders)', async () => {
  const mutex = createKeyedMutex();
  const results = await Promise.all([
    mutex.runAll(['nft:1', 'wallet:x'], async () => { await sleep(5); return 1; }),
    mutex.runAll(['wallet:x', 'nft:1'], async () => { await sleep(5); return 2; }),
  ]);
  assert.deepEqual(results, [1, 2]);
});

test('rate limiter allows max hits per window, then refuses, then recovers', () => {
  let now = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => now });
  assert.equal(limiter.hit('k').allowed, true);
  assert.equal(limiter.hit('k').allowed, true);
  const third = limiter.hit('k');
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterMs > 0 && third.retryAfterMs <= 1000);
  assert.equal(limiter.hit('other').allowed, true);
  now += 1001;
  assert.equal(limiter.hit('k').allowed, true);
});

test('classifyLedgerError: request errors fail closed, everything else is an outage', () => {
  assert.equal(classifyLedgerError({ data: { error: 'actMalformed' } }), 'rejected');
  assert.equal(classifyLedgerError({ data: { error: 'tooBusy' } }), 'unreachable');
  assert.equal(classifyLedgerError(new Error('All XRPL endpoints unreachable')), 'unreachable');
});

test('access gate: eligible passes, ineligible is refused', async () => {
  const gate = createAccessGate({ checkAccess: async (a) => ({ eligible: a === 'yes' }), log: { warn() {} } });
  assert.equal((await gate.check('yes')).allowed, true);
  const no = await gate.check('no');
  assert.equal(no.allowed, false);
  assert.equal(no.reason, 'not_eligible');
});

test('access gate fails open when the ledger is down', async () => {
  const warnings = [];
  const gate = createAccessGate({
    checkAccess: async () => { throw new Error('All XRPL endpoints unreachable'); },
    log: { warn: (m) => warnings.push(m) },
  });
  const verdict = await gate.check('rSomeone');
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.failOpen, true);
  assert.equal(warnings.length, 1);
});

test('access gate keeps a recently-ineligible wallet out during an outage', async () => {
  let now = 0;
  let down = false;
  const gate = createAccessGate({
    checkAccess: async () => { if (down) throw new Error('timeout'); return { eligible: false }; },
    log: { warn() {} },
    negativeMemoryMs: 1000,
    now: () => now,
  });
  assert.equal((await gate.check('rFarm')).allowed, false);
  down = true;
  now = 500;
  const during = await gate.check('rFarm');
  assert.equal(during.allowed, false);
  assert.equal(during.reason, 'not_eligible_recently');
  now = 5000;
  assert.equal((await gate.check('rFarm')).allowed, true, 'memory expires; outage then fails open');
});

test('access gate fails closed when the ledger rejects the request', async () => {
  const gate = createAccessGate({
    checkAccess: async () => { const e = new Error('bad'); e.data = { error: 'actMalformed' }; throw e; },
    log: { warn() {} },
  });
  const verdict = await gate.check('rbad');
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'ledger_rejected');
});

test('pickTrueCaseAddress accepts only the checksum-valid spelling', () => {
  const lower = REAL.toLowerCase();
  assert.equal(pickTrueCaseAddress(lower, [lower, REAL]), REAL);
  assert.equal(pickTrueCaseAddress(lower, [lower]), null, 'a lowercased address fails the checksum');
  assert.equal(pickTrueCaseAddress(lower, ['rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh']), null, 'another wallet is not this one');
  assert.equal(pickTrueCaseAddress(lower, [undefined, 42, REAL]), REAL);
  const swapped = REAL.slice(0, 5) + REAL[5].toLowerCase() + REAL.slice(6);
  assert.notEqual(swapped, REAL);
  assert.equal(pickTrueCaseAddress(lower, [swapped]), null, 'one flipped letter fails the checksum');
});

test('dailyCapForStoredCase subtracts minutes stored under other cases', () => {
  assert.deepEqual(dailyCapForStoredCase({ maxMinutes: 123, allCaseMinutes: 0, storedCaseMinutes: 0 }), { effectiveMax: 123, otherCaseMinutes: 0 });
  assert.deepEqual(dailyCapForStoredCase({ maxMinutes: 123, allCaseMinutes: 100, storedCaseMinutes: 40 }), { effectiveMax: 63, otherCaseMinutes: 60 });
  // the SP then allows effectiveMax - storedCase = 23 more minutes: 100 + 23 = 123 total
  assert.deepEqual(dailyCapForStoredCase({ maxMinutes: 123, allCaseMinutes: 200, storedCaseMinutes: 0 }), { effectiveMax: 0, otherCaseMinutes: 200 });
  assert.deepEqual(dailyCapForStoredCase({ maxMinutes: 123, allCaseMinutes: 10, storedCaseMinutes: 50 }), { effectiveMax: 123, otherCaseMinutes: 0 }, 'stored never exceeds all');
});

test('ipKey: IPv4 as is (mapped, with a port), IPv6 by its /56, junk safe', () => {
  const { ipKey } = require('./honey-guard');
  assert.equal(ipKey('1.2.3.4'), '1.2.3.4');
  assert.equal(ipKey('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(ipKey('1.2.3.4:5678'), '1.2.3.4');
  assert.equal(ipKey('2001:db8:abcd:12:1:2:3:4'), ipKey('2001:db8:abcd:ff:9:9:9:9'));
  assert.notEqual(ipKey('2001:db8:abcd:12::1'), ipKey('2001:db8:abce:12::1'));
  assert.equal(ipKey('[2001:db8::1]:443'), ipKey('2001:db8::2'));
  assert.equal(ipKey(''), 'unknown');
  assert.equal(ipKey(undefined), 'unknown');
});

test('claimedClientIp takes the first forwarded hop', () => {
  assert.equal(claimedClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '1.2.3.4');
  assert.equal(claimedClientIp({ headers: {}, ip: '9.9.9.9' }), '9.9.9.9');
});

test('outage: known holders keep earning, unknown newcomers are capped', async () => {
  let now = 0;
  let down = false;
  const gate = createAccessGate({
    checkAccess: async (a) => { if (down) throw new Error('rate limit: units quota exhausted'); return { eligible: a === 'holder' }; },
    log: { warn() {} },
    unknownFailOpenMax: 2,
    unknownFailOpenWindowMs: 1000,
    now: () => now,
  });
  assert.equal((await gate.check('holder')).allowed, true);
  down = true;
  now = 10;
  assert.equal((await gate.check('new1')).allowed, true);
  assert.equal((await gate.check('new2')).allowed, true);
  const third = await gate.check('new3');
  assert.equal(third.allowed, false);
  assert.equal(third.reason, 'ledger_unavailable');
  assert.equal((await gate.check('new1')).allowed, true, 'an admitted wallet keeps its place in the window');
  assert.equal((await gate.check('holder')).allowed, true, 'a known holder is never capped');
  now = 2000;
  assert.equal((await gate.check('new3')).allowed, true, 'the allowance refills');
});

test('isXrplRateLimitError spots hub quota errors', () => {
  const { isXrplRateLimitError } = require('./honey-guard');
  assert.equal(isXrplRateLimitError(new Error('rate limit: units quota (500000 per 3600s) exhausted')), true);
  assert.equal(isXrplRateLimitError({ data: { error: 'slowDown' } }), true);
  assert.equal(isXrplRateLimitError(new Error('actNotFound')), false);
});
