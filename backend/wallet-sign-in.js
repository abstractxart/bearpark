// Wallet sign-in for BEAR Park: BEAR Wallet, BEAR Swap and Xaman, one session.
//
// Every route here ends in the same place, issueWalletAuthToken(), so everything
// downstream (requireWalletOwnership, the games, raids) is untouched by which
// wallet the visitor used. What differs is how ownership of the address is proven:
//
//   BEAR Swap   the visitor's vault on swap.bearpark.xyz signs our challenge in a
//               popup; we verify the signature here (POST /challenge → /verify).
//   BEAR Wallet the phone app signs a `bearwallet://sign/<uuid>` request created by
//               BEAR Swap's API. We create it server to server (the API does not
//               admit www.bearpark.xyz as a browser origin), and if the API hands
//               back the signature we verify it here too.
//   Xaman       Xaman's API reports the account that signed a SignIn payload.
//
// Two rules every flow keeps, because the old /api/xaman/payload/:uuid broke both:
//   1. A pending request is bound to whoever created it. Polling needs the
//      poll token returned only to the creator; the uuid alone (which sits in a
//      QR code anyone on a stream can read) is not enough.
//   2. A signed request mints exactly one session. The first successful poll
//      consumes it.

const crypto = require('crypto');
const { deriveAddress, verifyKeypairSignature, convertStringToHex, decode, encode, verifySignature } = require('xrpl');

const BEAR_ISSUER = 'rBEARGUAsyu7tUw53rufQzFdWmJHpJEqFW';
const BEAR_CURRENCY_HEX = '4245415200000000000000000000000000000000';
const BEAR_NFT_ISSUER = 'rBEARbo4Prn33894evmvYcAf9yAQjp4VJF';
const MIN_BEAR_BALANCE = 10000;

const BEAR_WALLET_API = 'https://bear-market-api-production.up.railway.app/api/wallet-connect';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 5 * 60 * 1000;
const ACCESS_CACHE_MS = 60 * 1000;

const XRPL_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HEX = /^[0-9A-Fa-f]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

// The hosts a challenge may name. Anything else gets the canonical domain, so a
// challenge minted from a stray origin still reads as BEAR Park's.
const SIGN_IN_HOSTS = new Set(['bearpark.xyz', 'www.bearpark.xyz', 'localhost', '127.0.0.1']);

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sameSecret(expectedHash, provided) {
  if (typeof provided !== 'string' || !provided) return false;
  const a = Buffer.from(expectedHash, 'hex');
  const b = Buffer.from(sha256(provided), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A Map whose entries expire, swept lazily so no timer keeps the process busy. */
class ExpiringStore {
  constructor() { this.map = new Map(); }
  set(key, value, ttlMs) {
    this.sweep();
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) { this.map.delete(key); return null; }
    return hit.value;
  }
  take(key) {
    const value = this.get(key);
    this.map.delete(key);
    return value;
  }
  sweep() {
    if (this.map.size < 500) return;
    const now = Date.now();
    for (const [key, hit] of this.map) if (now > hit.expiresAt) this.map.delete(key);
  }
}

function signInHost(req) {
  for (const header of [req.headers.origin, req.headers.referer]) {
    if (typeof header !== 'string' || !header) continue;
    try {
      const host = new URL(header).hostname.toLowerCase();
      if (SIGN_IN_HOSTS.has(host)) return host;
    } catch { /* malformed header: fall through to the default */ }
  }
  return 'www.bearpark.xyz';
}

/**
 * The text a wallet signs. Fixed shape on purpose: BEAR Swap's /connect page
 * refuses to sign anything that does not match it (see buildChallengeMessage's
 * twin in BEAR-SWAP-V2 src/pages/connect/signInRequest.ts), so the popup can
 * never be talked into signing an arbitrary message for some other site.
 */
function buildChallengeMessage({ host, nonce, issuedAt, expiresAt }) {
  return [
    'BEAR Park sign-in',
    `Domain: ${host}`,
    'Signing proves you own this wallet. It is free and moves no funds.',
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAt).toISOString()}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join('\n');
}

/**
 * True when `signature` is `publicKey`'s signature over `message` (utf-8, hex
 * encoded as BEAR Wallet and BEAR Swap both sign it) AND the key is `address`'s
 * master key. Never throws.
 */
function verifyWalletSignature({ message, address, publicKey, signature }) {
  try {
    if (!XRPL_ADDRESS.test(address || '')) return false;
    if (!HEX.test(publicKey || '') || !HEX.test(signature || '')) return false;
    if (deriveAddress(publicKey) !== address) return false;
    return verifyKeypairSignature(convertStringToHex(message), signature, publicKey) === true;
  } catch {
    return false;
  }
}

// A WalletConnect wallet that can't sign a plain message proves ownership by
// signing (never submitting) a no-op AccountSet that carries the challenge in a
// memo. Only these fields may appear, so the proof can never be a transaction
// that changes anything.
const TX_PROOF_FIELDS = new Set(['TransactionType', 'Account', 'Memos', 'Fee', 'Sequence', 'LastLedgerSequence',
  'SigningPubKey', 'TxnSignature', 'Flags', 'NetworkID', 'TicketSequence']);

function hexToUtf8(hex) {
  try { return Buffer.from(hex, 'hex').toString('utf8'); } catch { return ''; }
}

/**
 * The account that signed `txBlob`, if it is a valid proof for `message`; else
 * null. `regularKeyOf(account)` answers the account's RegularKey (for wallets
 * that sign with a regular key). Never throws.
 */
async function verifyTxProof({ message, txBlob, address, regularKeyOf }) {
  try {
    if (typeof txBlob !== 'string' || !HEX.test(txBlob) || txBlob.length > 4096) return null;
    const tx = decode(txBlob);
    if (tx.TransactionType !== 'AccountSet' || !XRPL_ADDRESS.test(tx.Account || '')) return null;
    if (address && address !== tx.Account) return null;
    if (Object.keys(tx).some((k) => !TX_PROOF_FIELDS.has(k))) return null;
    if (tx.Flags && Number(tx.Flags) !== 0 && Number(tx.Flags) !== 2147483648) return null; // 0 or tfFullyCanonicalSig only
    const carries = (tx.Memos || []).some((m) => m?.Memo?.MemoData && hexToUtf8(m.Memo.MemoData) === message);
    if (!carries || !tx.SigningPubKey || !tx.TxnSignature) return null;
    if (verifySignature(txBlob) !== true) return null;
    const signer = deriveAddress(tx.SigningPubKey);
    if (signer !== tx.Account) {
      const regular = regularKeyOf ? await regularKeyOf(tx.Account) : null;
      if (!regular || regular !== signer) return null;
    }
    return tx.Account;
  } catch {
    return null;
  }
}

function createWalletSignIn(deps) {
  const {
    xumm,
    getXrplClient,
    fetchWithTimeout,
    issueWalletAuthToken,
    setWalletAuthCookie,
    isWalletBlacklisted,
    log = console,
  } = deps;

  const challenges = new ExpiringStore();
  const pending = new ExpiringStore();
  const accessCache = new ExpiringStore();

  async function regularKeyOf(account) {
    try {
      const client = await getXrplClient();
      const info = await client.request({ command: 'account_info', account, ledger_index: 'validated' });
      return info.result?.account_data?.RegularKey || null;
    } catch {
      return null;
    }
  }

  /** Does the wallet meet the gate? 10,000 $BEAR, or any BEAR NFT. */
  async function checkAccess(address) {
    const cached = accessCache.get(address);
    if (cached) return cached;

    const client = await getXrplClient();
    let bear = 0;
    let nfts = 0;

    const lines = await client.request({
      command: 'account_lines',
      account: address,
      peer: BEAR_ISSUER,
      ledger_index: 'validated',
    }).catch((err) => {
      if (err?.data?.error === 'actNotFound') return { result: { lines: [] } };
      throw err;
    });
    const line = (lines.result.lines || []).find((l) => l.currency === BEAR_CURRENCY_HEX || l.currency === 'BEAR');
    bear = line ? Math.max(0, Number(line.balance) || 0) : 0;

    if (bear < MIN_BEAR_BALANCE) {
      let marker;
      for (let page = 0; page < 10; page++) {
        const res = await client.request({
          command: 'account_nfts',
          account: address,
          ledger_index: 'validated',
          limit: 400,
          ...(marker ? { marker } : {}),
        }).catch((err) => {
          if (err?.data?.error === 'actNotFound') return { result: { account_nfts: [] } };
          throw err;
        });
        nfts += (res.result.account_nfts || []).filter((n) => n.Issuer === BEAR_NFT_ISSUER).length;
        marker = res.result.marker;
        if (!marker || nfts > 0) break;
      }
    }

    const access = { eligible: bear >= MIN_BEAR_BALANCE || nfts > 0, bear, nfts, minBear: MIN_BEAR_BALANCE };
    accessCache.set(address, access, ACCESS_CACHE_MS);
    return access;
  }

  /** Mint the session every flow ends in. Access is reported, never a reason to refuse it. */
  async function finishSignIn(res, address, via) {
    if (isWalletBlacklisted(address)) {
      return res.status(403).json({ success: false, error: 'This wallet is not allowed in BEAR Park.' });
    }
    const token = issueWalletAuthToken(address);
    setWalletAuthCookie(res, token);
    let access = null;
    try {
      access = await checkAccess(address);
    } catch (err) {
      log.warn('[sign-in] access check failed:', err?.message);
    }
    return res.json({ success: true, status: 'signed', via, wallet: address, auth_token: token, access });
  }

  function register(app, limiter) {
    const guard = limiter || ((req, res, next) => next());

    // ---- BEAR Swap (and any signer of our challenge) ----

    app.post('/api/auth/challenge', guard, (req, res) => {
      const issuedAt = Date.now();
      const expiresAt = issuedAt + CHALLENGE_TTL_MS;
      const challengeId = randomHex(16);
      const message = buildChallengeMessage({ host: signInHost(req), nonce: randomHex(16), issuedAt, expiresAt });
      challenges.set(challengeId, { message }, CHALLENGE_TTL_MS);
      res.json({ success: true, challengeId, message, expiresAt });
    });

    // Proof is either a message signature (BEAR Swap, and WalletConnect wallets
    // with xrpl_signMessage) or a signed no-op transaction (other WalletConnect wallets).
    app.post('/api/auth/verify', guard, async (req, res) => {
      const { challengeId, address, publicKey, signature, txJson, via } = req.body || {};
      // Some wallets answer a sign-only request with the signed tx_json and no blob.
      let { txBlob } = req.body || {};
      if (!txBlob && txJson && typeof txJson === 'object') {
        try { txBlob = encode(txJson); } catch { txBlob = 'invalid'; }
      }
      const challenge = typeof challengeId === 'string' ? challenges.take(challengeId) : null;
      if (!challenge) {
        return res.status(410).json({ success: false, error: 'That sign-in request expired. Try again.' });
      }
      let wallet = null;
      if (txBlob) {
        wallet = await verifyTxProof({ message: challenge.message, txBlob, address, regularKeyOf });
      } else if (verifyWalletSignature({ message: challenge.message, address, publicKey, signature })) {
        wallet = address;
      }
      if (!wallet) {
        return res.status(401).json({ success: false, error: 'The signature did not match this wallet.' });
      }
      return finishSignIn(res, wallet, via === 'walletconnect' ? 'walletconnect' : 'bearswap');
    });

    // ---- BEAR Wallet (phone app, bearwallet://sign/<uuid>) ----

    app.post('/api/auth/bear-wallet/start', guard, async (req, res) => {
      try {
        const upstream = await fetchWithTimeout(`${BEAR_WALLET_API}/payload`, {
          method: 'POST',
          // Server to server: the Origin names us so the phone can say who is asking.
          headers: { 'Content-Type': 'application/json', Origin: 'https://www.bearpark.xyz' },
          body: JSON.stringify({ payloadType: 'signin' }),
        }, 10000);
        const body = await upstream.json().catch(() => null);
        const data = body?.data;
        if (!upstream.ok || !data?.uuid || !UUID.test(data.uuid) || !data.creatorSecret) {
          log.warn('[sign-in] BEAR Wallet payload failed:', upstream.status, body?.error);
          return res.status(502).json({ success: false, error: 'BEAR Wallet could not be reached. Try again in a moment.' });
        }
        const pollToken = randomHex(24);
        pending.set(`bw:${data.uuid}`, {
          creatorSecret: data.creatorSecret,
          challenge: data.challenge || null,
          pollHash: sha256(pollToken),
        }, PENDING_TTL_MS);
        res.json({
          success: true,
          id: data.uuid,
          pollToken,
          deepLink: `bearwallet://sign/${data.uuid}`,
          expiresAt: Date.now() + PENDING_TTL_MS,
        });
      } catch (err) {
        log.warn('[sign-in] BEAR Wallet start error:', err?.message);
        res.status(502).json({ success: false, error: 'BEAR Wallet could not be reached. Try again in a moment.' });
      }
    });

    app.get('/api/auth/bear-wallet/status/:id', async (req, res) => {
      const { id } = req.params;
      const key = `bw:${id}`;
      const entry = UUID.test(id) ? pending.get(key) : null;
      if (!entry) return res.status(410).json({ success: false, status: 'expired' });
      if (!sameSecret(entry.pollHash, req.get('x-poll-token'))) {
        return res.status(403).json({ success: false, error: 'Not your sign-in request.' });
      }
      try {
        const upstream = await fetchWithTimeout(
          `${BEAR_WALLET_API}/payload/${id}?creatorSecret=${encodeURIComponent(entry.creatorSecret)}`,
          { headers: { Origin: 'https://www.bearpark.xyz' } },
          8000,
        );
        if (upstream.status === 404 || upstream.status === 410) {
          pending.take(key);
          return res.json({ success: true, status: 'expired' });
        }
        if (upstream.status === 409) {
          pending.take(key);
          return res.json({ success: true, status: 'rejected' });
        }
        const body = await upstream.json().catch(() => null);
        const data = body?.data || {};
        if (data.status !== 'signed' || !data.walletAddress) {
          return res.json({ success: true, status: data.status === 'opened' ? 'opened' : 'pending' });
        }
        if (!pending.take(key)) return res.status(410).json({ success: false, status: 'expired' });

        const address = data.walletAddress;
        if (!XRPL_ADDRESS.test(address)) {
          return res.status(502).json({ success: false, error: 'BEAR Wallet returned an invalid address.' });
        }
        // If the API passes the proof through, check it ourselves rather than take its word.
        if (data.signature && data.publicKey && entry.challenge &&
            !verifyWalletSignature({ message: entry.challenge, address, publicKey: data.publicKey, signature: data.signature })) {
          return res.status(401).json({ success: false, error: 'The signature did not match this wallet.' });
        }
        return finishSignIn(res, address, 'bearwallet');
      } catch (err) {
        log.warn('[sign-in] BEAR Wallet status error:', err?.message);
        res.json({ success: true, status: 'pending' });
      }
    });

    // ---- Xaman ----

    app.post('/api/auth/xaman/start', guard, async (req, res) => {
      if (!xumm) return res.status(503).json({ success: false, error: 'Xaman sign-in is unavailable right now.' });
      try {
        // The same payload the live gate has always created (proven in production).
        const payload = await xumm.payload.create({ TransactionType: 'SignIn' }, true);
        if (!payload?.uuid) throw new Error('no uuid');
        const pollToken = randomHex(24);
        pending.set(`xa:${payload.uuid}`, { pollHash: sha256(pollToken) }, PENDING_TTL_MS);
        res.json({
          success: true,
          id: payload.uuid,
          pollToken,
          qr: payload.refs?.qr_png || null,
          deepLink: payload.next?.always || null,
          expiresAt: Date.now() + PENDING_TTL_MS,
        });
      } catch (err) {
        log.warn('[sign-in] Xaman start error:', err?.message);
        res.status(502).json({ success: false, error: 'Xaman could not be reached. Try again in a moment.' });
      }
    });

    app.get('/api/auth/xaman/status/:id', async (req, res) => {
      const { id } = req.params;
      const key = `xa:${id}`;
      const entry = UUID.test(id) ? pending.get(key) : null;
      if (!entry) return res.status(410).json({ success: false, status: 'expired' });
      if (!sameSecret(entry.pollHash, req.get('x-poll-token'))) {
        return res.status(403).json({ success: false, error: 'Not your sign-in request.' });
      }
      try {
        const payload = await xumm.payload.get(id);
        const meta = payload?.meta || {};
        if (meta.expired) { pending.take(key); return res.json({ success: true, status: 'expired' }); }
        if (!meta.resolved) return res.json({ success: true, status: meta.opened ? 'opened' : 'pending' });
        if (!meta.signed || !payload?.response?.account) {
          pending.take(key);
          return res.json({ success: true, status: 'rejected' });
        }
        if (!pending.take(key)) return res.status(410).json({ success: false, status: 'expired' });
        return finishSignIn(res, payload.response.account, 'xaman');
      } catch (err) {
        log.warn('[sign-in] Xaman status error:', err?.message);
        res.json({ success: true, status: 'pending' });
      }
    });

    // ---- Access, for a session that already exists ----

    app.get('/api/auth/access/:wallet', async (req, res) => {
      const { wallet } = req.params;
      if (!XRPL_ADDRESS.test(wallet)) return res.status(400).json({ success: false, error: 'Invalid wallet' });
      try {
        res.json({ success: true, access: await checkAccess(wallet) });
      } catch (err) {
        log.warn('[sign-in] access error:', err?.message);
        res.status(503).json({ success: false, error: 'The ledger could not be reached.' });
      }
    });
  }

  return { register, checkAccess };
}

module.exports = {
  createWalletSignIn,
  buildChallengeMessage,
  verifyWalletSignature,
  verifyTxProof,
  ExpiringStore,
  MIN_BEAR_BALANCE,
};
