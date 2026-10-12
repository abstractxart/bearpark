// Who is signed in. One source of truth for the whole site, written in the
// exact storage keys the games and auth-fetch.js already read, so nothing that
// was built against the old gate needs to change:
//
//   bearpark_auth            'true'
//   bearpark_wallet          the address as signed (case-sensitive)
//   bearpark_auth_token      the server's signed wallet_auth token (7 days)
//   bearpark_auth_token_wallet  that token's wallet, lowercase (auth-fetch match)
//   xaman_wallet_address     read by the game bundles and their wrappers
//   display_name / twitter_username   passed to the games
//
// A session is only real while its token is. A stored address without a live
// token is treated as signed out, because every write would 401 anyway.

const KEYS = {
  auth: 'bearpark_auth',
  wallet: 'bearpark_wallet',
  token: 'bearpark_auth_token',
  tokenWallet: 'bearpark_auth_token_wallet',
  gameWallet: 'xaman_wallet_address',
  displayName: 'display_name',
  twitter: 'twitter_username',
  via: 'bearpark_signin_via',
  access: 'bearpark_access',
};

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: the session still works for this page */ }
}

/** The token's claims, decoded for display only. The server verifies it. */
export function tokenClaims(token) {
  try {
    const [payload] = String(token).split('.');
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const listeners = new Set();
let current = load();

function load() {
  const wallet = read(KEYS.wallet);
  const token = read(KEYS.token);
  if (read(KEYS.auth) !== 'true' || !wallet || !token) return null;
  const claims = tokenClaims(token);
  if (!claims?.exp || claims.exp < Date.now() + 60_000) return null;
  if ((read(KEYS.tokenWallet) || '').toLowerCase() !== wallet.toLowerCase()) return null;
  let access = null;
  try { access = JSON.parse(read(KEYS.access) || 'null'); } catch { /* stale cache */ }
  return { wallet, token, via: read(KEYS.via) || 'xaman', expiresAt: claims.exp, access };
}

/** Listeners get (session|null, reason): 'begin' | 'access' | 'end' | 'expire' | 'elsewhere'. */
function emit(reason) {
  for (const fn of listeners) { try { fn(current, reason); } catch { /* one bad listener can't stop the rest */ } }
}

export const session = {
  get: () => current,
  get wallet() { return current?.wallet || null; },
  get token() { return current?.token || null; },

  /** Called by every sign-in flow with the server's answer. */
  begin({ wallet, auth_token: token, via, access }) {
    write(KEYS.auth, 'true');
    write(KEYS.wallet, wallet);
    write(KEYS.token, token);
    write(KEYS.tokenWallet, wallet.toLowerCase());
    write(KEYS.gameWallet, wallet);
    write(KEYS.via, via);
    write(KEYS.access, access ? JSON.stringify(access) : null);
    // A different wallet's name must not follow the new one into the games.
    write(KEYS.displayName, null);
    write(KEYS.twitter, null);
    current = load();
    emit('begin');
    return current;
  },

  setAccess(access) {
    write(KEYS.access, access ? JSON.stringify(access) : null);
    if (current) current = { ...current, access };
    emit('access');
  },

  /** Keep the names the games show in step with the profile. */
  setIdentity({ displayName, twitter } = {}) {
    if (displayName !== undefined) write(KEYS.displayName, displayName || null);
    if (twitter !== undefined) write(KEYS.twitter, twitter || null);
  },

  /** Sign out everywhere this browser knows about, games included. */
  async end() {
    for (const key of Object.values(KEYS)) write(key, null);
    current = null;
    emit('end');
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* offline: local state is already gone */ }
  },

  /** A write came back 401: the token died server-side. */
  expire() {
    if (!current) return;
    write(KEYS.auth, null);
    write(KEYS.token, null);
    write(KEYS.tokenWallet, null);
    current = null;
    emit('expire');
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// Another tab signed in or out.
addEventListener('storage', (e) => {
  if (e.key && !Object.values(KEYS).includes(e.key)) return;
  const next = load();
  if (next?.wallet === current?.wallet && next?.token === current?.token) return;
  current = next;
  emit('elsewhere');
});

// Old gate sessions kept the address in sessionStorage; they never had a token,
// so they can't be migrated into a live session. Clear them so they stop
// confusing the games.
try { sessionStorage.removeItem('bearpark_wallet'); } catch { /* ignore */ }
