// Mint sandbox sessions. Same token format as server.js issueWalletAuthToken()
// (type wallet_auth, lowercase wallet, the signed address as `addr`, 7 days),
// signed with the sandbox's WALLET_AUTH_SECRET ("sandbox-secret"), so they are
// only valid against the sandbox backend — production rejects them.
//
//   node mint.js alice            token + a browser snippet that installs the session
//   node mint.js rXXXX…           any address
//   node mint.js --all            every persona

const crypto = require('crypto');
const { PERSONAS } = require('./personas');

const SANDBOX_SECRET = 'sandbox-secret';
const KEY = crypto.createHash('sha256').update(SANDBOX_SECRET).digest(); // server.js hashes the secret first
const TTL = 7 * 24 * 60 * 60 * 1000;
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

function resolveWallet(who) {
  const p = PERSONAS[String(who || '').toLowerCase()];
  if (p) return p.wallet;
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(who || '')) return who;
  throw new Error(`unknown persona or address: ${who}`);
}

function mintToken(who, { ttlMs = TTL } = {}) {
  const wallet = resolveWallet(who);
  const now = Date.now();
  const payload = b64url(JSON.stringify({ type: 'wallet_auth', wallet: wallet.toLowerCase(), iat: now, exp: now + ttlMs, addr: wallet }));
  const sig = b64url(crypto.createHmac('sha256', KEY).update(payload).digest());
  return `${payload}.${sig}`;
}

/** JS that installs the session in a page's localStorage (park/js/core/session.js keys) and opens `route`. */
function browserSnippet(who, route = '#/community') {
  const wallet = resolveWallet(who);
  const token = mintToken(wallet);
  const p = Object.values(PERSONAS).find((x) => x.wallet === wallet);
  const access = { eligible: p ? p.real : true, bear: p?.real ? 10000 : 0, nfts: p?.real ? 1 : 0, sandbox: true };
  return [
    `(() => {`,
    `  const s = localStorage;`,
    `  for (const k of Object.keys(sessionStorage)) if (k.startsWith('bp:warm:')) sessionStorage.removeItem(k);`,
    `  s.setItem('bearpark_auth', 'true');`,
    `  s.setItem('bearpark_wallet', ${JSON.stringify(wallet)});`,
    `  s.setItem('bearpark_auth_token', ${JSON.stringify(token)});`,
    `  s.setItem('bearpark_auth_token_wallet', ${JSON.stringify(wallet.toLowerCase())});`,
    `  s.setItem('xaman_wallet_address', ${JSON.stringify(wallet)});`,
    `  s.setItem('bearpark_signin_via', 'sandbox');`,
    `  s.setItem('bearpark_access', ${JSON.stringify(JSON.stringify(access))});`,
    `  s.removeItem('display_name'); s.removeItem('twitter_username');`,
    `  location.href = '/main.html${route}';`,
    `})();`,
  ].join('\n');
}

module.exports = { mintToken, browserSnippet, resolveWallet, SANDBOX_SECRET };

if (require.main === module) {
  const args = process.argv.slice(2);
  const who = args.includes('--all') ? Object.keys(PERSONAS) : args.filter((a) => !a.startsWith('--'));
  if (!who.length) {
    console.log('usage: node mint.js <alice|bob|carol|dana|…|rADDRESS> [--all]');
    process.exit(1);
  }
  for (const w of who) {
    const wallet = resolveWallet(w);
    console.log(`\n# ${w} — ${wallet}`);
    console.log(`token: ${mintToken(wallet)}`);
    console.log(`\n// paste into the sandbox site's console (or open /__sandbox/as/${w}):\n${browserSnippet(wallet)}`);
  }
}
