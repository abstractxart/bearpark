// node --test backend/ledger-payout.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { sendPaymentOnce, settleByHash } = require('./ledger-payout');

function fakeWallet() {
  return { sign: (tx) => ({ hash: 'HASH1', tx_blob: 'BLOB', tx }) };
}

function fakeClient(overrides = {}) {
  return {
    ledger: 100,
    async getLedgerIndex() { return this.ledger; },
    async autofill(tx) { return { ...tx, LastLedgerSequence: 120 }; },
    async submitAndWait() { return { result: { validated: true, meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 101 } }; },
    async request() { throw Object.assign(new Error('nf'), { data: { error: 'txnNotFound', searched_all: true } }); },
    ...overrides,
  };
}

test('success is reported as success with the hash', async () => {
  const signed = [];
  const out = await sendPaymentOnce({ client: fakeClient(), wallet: fakeWallet(), payment: {}, onSigned: (s) => signed.push(s) });
  assert.equal(out.status, 'success');
  assert.equal(out.hash, 'HASH1');
  assert.deepEqual(signed, [{ hash: 'HASH1', lastLedger: 120 }]);
});

test('a validated tec result is a definitive failure', async () => {
  const client = fakeClient({ async submitAndWait() { return { result: { validated: true, meta: { TransactionResult: 'tecPATH_DRY' } } }; } });
  const out = await sendPaymentOnce({ client, wallet: fakeWallet(), payment: {} });
  assert.equal(out.status, 'failed');
  assert.equal(out.code, 'tecPATH_DRY');
});

test('autofill failure means nothing was submitted', async () => {
  const client = fakeClient({ async autofill() { throw new Error('no route'); } });
  const out = await sendPaymentOnce({ client, wallet: fakeWallet(), payment: {} });
  assert.equal(out.status, 'not_submitted');
});

test('if recording the hash fails, the payment is not submitted', async () => {
  let submitted = false;
  const client = fakeClient({ async submitAndWait() { submitted = true; return {}; } });
  const out = await sendPaymentOnce({ client, wallet: fakeWallet(), payment: {}, onSigned: async () => { throw new Error('db down'); } });
  assert.equal(out.status, 'not_submitted');
  assert.equal(submitted, false);
});

test('submitAndWait throwing is settled by asking the ledger: found validated -> success', async () => {
  const client = fakeClient({
    async submitAndWait() { throw new Error('The latest ledger sequence 121 is greater than LastLedgerSequence (120)'); },
    async request(req) {
      assert.equal(req.command, 'tx');
      assert.equal(req.max_ledger, 120);
      return { result: { validated: true, meta: { TransactionResult: 'tesSUCCESS' }, ledger_index: 120 } };
    },
  });
  const out = await sendPaymentOnce({ client, wallet: fakeWallet(), payment: {} });
  assert.equal(out.status, 'success', 'validated in its last ledger: must NOT be treated as failed');
});

test('not in any ledger up to LastLedgerSequence (range fully searched) -> failed', async () => {
  const client = fakeClient({
    ledger: 125,
    async submitAndWait() { throw new Error('expired'); },
  });
  const out = await sendPaymentOnce({ client, wallet: fakeWallet(), payment: {} });
  assert.equal(out.status, 'failed');
  assert.equal(out.code, 'expired_unvalidated');
});

test('ledger unreachable after submit -> unknown (never refund)', async () => {
  let calls = 0;
  const client = fakeClient({
    async getLedgerIndex() { calls += 1; if (calls > 1) throw new Error('disconnected'); return 100; },
    async submitAndWait() { throw new Error('socket hang up'); },
  });
  const out = await sendPaymentOnce({ client, wallet: fakeWallet(), payment: {} });
  assert.equal(out.status, 'unknown');
  assert.equal(out.hash, 'HASH1');
});

test('search not complete (searched_all false) stays unknown until the deadline', async () => {
  const client = fakeClient({
    ledger: 125,
    async request() { throw Object.assign(new Error('nf'), { data: { error: 'txnNotFound', searched_all: false } }); },
  });
  const out = await settleByHash(client, { hash: 'H', minLedger: 98, lastLedger: 120, maxWaitMs: 10, pollMs: 1 });
  assert.equal(out.status, 'unknown');
});
