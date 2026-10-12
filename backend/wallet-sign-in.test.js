// node --test backend/wallet-sign-in.test.js
const test = require('node:test');
const assert = require('node:assert');
const { Wallet, convertStringToHex } = require('xrpl');
const keypairs = require('ripple-keypairs');
const { buildChallengeMessage, verifyWalletSignature, ExpiringStore, createWalletSignIn } = require('./wallet-sign-in');

const message = buildChallengeMessage({
  host: 'www.bearpark.xyz', nonce: 'ab'.repeat(16), issuedAt: 0, expiresAt: 300000,
});

function signAs(wallet, text = message) {
  return keypairs.sign(convertStringToHex(text), wallet.privateKey);
}

test('the challenge names the domain and the nonce', () => {
  assert.match(message, /^BEAR Park sign-in\nDomain: www\.bearpark\.xyz\n/);
  assert.match(message, /\nNonce: (ab){16}\n/);
});

for (const algorithm of ['ed25519', 'ecdsa-secp256k1']) {
  test(`a ${algorithm} master key's signature verifies`, () => {
    const w = Wallet.generate(algorithm);
    assert.equal(verifyWalletSignature({ message, address: w.classicAddress, publicKey: w.publicKey, signature: signAs(w) }), true);
  });
}

test('a signature over different text is refused', () => {
  const w = Wallet.generate();
  const signature = signAs(w, message.replace('www.bearpark.xyz', 'evil.example'));
  assert.equal(verifyWalletSignature({ message, address: w.classicAddress, publicKey: w.publicKey, signature }), false);
});

test("someone else's key cannot claim an address", () => {
  const victim = Wallet.generate();
  const attacker = Wallet.generate();
  assert.equal(verifyWalletSignature({ message, address: victim.classicAddress, publicKey: attacker.publicKey, signature: signAs(attacker) }), false);
});

test('junk input is refused without throwing', () => {
  assert.equal(verifyWalletSignature({ message, address: 'nope', publicKey: 'zz', signature: '00' }), false);
  assert.equal(verifyWalletSignature({}), false);
});

test('an expiring store hands a value out once', () => {
  const store = new ExpiringStore();
  store.set('k', 1, 1000);
  assert.equal(store.take('k'), 1);
  assert.equal(store.take('k'), null);
  store.set('old', 1, -1);
  assert.equal(store.get('old'), null);
});

// The routes, against a fake app. No network: the ledger and Xaman are stubbed.
function harness() {
  const routes = {};
  const app = {
    get: (p, ...h) => { routes[`GET ${p}`] = h.at(-1); },
    post: (p, ...h) => { routes[`POST ${p}`] = h.at(-1); },
  };
  const issued = [];
  const signIn = createWalletSignIn({
    xumm: {
      payload: {
        create: async () => ({ uuid: '11111111-2222-3333-4444-555555555555', refs: { qr_png: 'qr' }, next: { always: 'link' } }),
        get: async () => ({ meta: { resolved: true, signed: true }, response: { account: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' } }),
      },
    },
    getXrplClient: async () => ({
      request: async ({ command }) => (command === 'account_lines'
        ? { result: { lines: [{ currency: '4245415200000000000000000000000000000000', balance: '12000' }] } }
        : { result: { account_nfts: [] } }),
    }),
    fetchWithTimeout: async () => { throw new Error('offline'); },
    issueWalletAuthToken: (w) => { issued.push(w); return `token-${issued.length}`; },
    setWalletAuthCookie: () => {},
    isWalletBlacklisted: () => false,
    log: { warn() {} },
  });
  signIn.register(app);
  const call = (key, { body = {}, params = {}, headers = {} } = {}) => new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); },
    };
    routes[key]({ body, params, headers, get: (h) => headers[h.toLowerCase()] }, res);
  });
  return { call, issued };
}

test('challenge → verify signs in once, and the challenge cannot be replayed', async () => {
  const { call, issued } = harness();
  const w = Wallet.generate();
  const { body: ch } = await call('POST /api/auth/challenge', { headers: { origin: 'https://www.bearpark.xyz' } });
  const proof = { challengeId: ch.challengeId, address: w.classicAddress, publicKey: w.publicKey, signature: signAs(w, ch.message) };
  const first = await call('POST /api/auth/verify', { body: proof });
  assert.equal(first.status, 200);
  assert.equal(first.body.wallet, w.classicAddress);
  assert.equal(first.body.access.eligible, true);
  const again = await call('POST /api/auth/verify', { body: proof });
  assert.equal(again.status, 410);
  assert.equal(issued.length, 1);
});

test('a Xaman request is bound to its creator and mints one session', async () => {
  const { call, issued } = harness();
  const { body: start } = await call('POST /api/auth/xaman/start');
  const params = { id: start.id };
  const stranger = await call('GET /api/auth/xaman/status/:id', { params, headers: { 'x-poll-token': 'guess' } });
  assert.equal(stranger.status, 403);
  const mine = await call('GET /api/auth/xaman/status/:id', { params, headers: { 'x-poll-token': start.pollToken } });
  assert.equal(mine.body.status, 'signed');
  const replay = await call('GET /api/auth/xaman/status/:id', { params, headers: { 'x-poll-token': start.pollToken } });
  assert.equal(replay.status, 410);
  assert.equal(issued.length, 1);
});

// ---- WalletConnect: a signed (never submitted) no-op AccountSet as proof ----
const { verifyTxProof } = require('./wallet-sign-in');
const { convertStringToHex: hex } = require('xrpl');

function proofTx(account, text, extra = {}) {
  return {
    TransactionType: 'AccountSet',
    Account: account,
    Fee: '12',
    Sequence: 5,
    LastLedgerSequence: 1,
    Memos: [{ Memo: { MemoType: hex('bearpark/sign-in'), MemoData: hex(text) } }],
    ...extra,
  };
}

for (const algorithm of ['ed25519', 'ecdsa-secp256k1']) {
  test(`a ${algorithm} wallet proves itself with a signed AccountSet`, async () => {
    const w = Wallet.generate(algorithm);
    const { tx_blob } = w.sign(proofTx(w.classicAddress, message));
    assert.equal(await verifyTxProof({ message, txBlob: tx_blob }), w.classicAddress);
  });
}

test('a transaction proof for another challenge is refused', async () => {
  const w = Wallet.generate();
  const { tx_blob } = w.sign(proofTx(w.classicAddress, message.replace('Nonce', 'Nonse')));
  assert.equal(await verifyTxProof({ message, txBlob: tx_blob }), null);
});

test('a proof that would change anything (Domain, SetFlag) is refused', async () => {
  const w = Wallet.generate();
  for (const extra of [{ Domain: hex('evil.example') }, { SetFlag: 8 }]) {
    const { tx_blob } = w.sign(proofTx(w.classicAddress, message, extra));
    assert.equal(await verifyTxProof({ message, txBlob: tx_blob }), null);
  }
});

test("a proof signed by someone else's key is refused unless it is the regular key", async () => {
  const owner = Wallet.generate();
  const other = Wallet.generate();
  const { tx_blob } = other.sign(proofTx(owner.classicAddress, message));
  assert.equal(await verifyTxProof({ message, txBlob: tx_blob, regularKeyOf: async () => null }), null);
  assert.equal(await verifyTxProof({ message, txBlob: tx_blob, regularKeyOf: async () => other.classicAddress }), owner.classicAddress);
});

test('junk blobs are refused without throwing', async () => {
  assert.equal(await verifyTxProof({ message, txBlob: 'zz' }), null);
  assert.equal(await verifyTxProof({ message, txBlob: '12000022' }), null);
});
