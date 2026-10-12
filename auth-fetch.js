(function () {
  const AUTH_TOKEN_KEY = 'bearpark_auth_token';
  const AUTH_TOKEN_WALLET_KEY = 'bearpark_auth_token_wallet';
  const allowedHosts = new Set([
    window.location.host,
    'bearpark-api-production.up.railway.app',
    'bearpark-production.up.railway.app'
  ]);

  function normalizeWallet(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function readParentStorage(key) {
    try {
      if (window.parent && window.parent !== window && window.parent.localStorage) {
        return window.parent.localStorage.getItem(key);
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function getCurrentWallet() {
    return normalizeWallet(
      readStorage('bearpark_wallet') ||
      readParentStorage('bearpark_wallet') ||
      readStorage('xaman_wallet_address') ||
      readParentStorage('xaman_wallet_address')
    );
  }

  function getBearparkAuthToken() {
    const token = readStorage(AUTH_TOKEN_KEY);
    const tokenWallet = normalizeWallet(readStorage(AUTH_TOKEN_WALLET_KEY));
    const currentWallet = getCurrentWallet();

    if (!token || !tokenWallet || !currentWallet || tokenWallet !== currentWallet) {
      return null;
    }

    return token;
  }

  function mergeHeaders(baseHeaders, extraHeaders) {
    const merged = new Headers(baseHeaders || {});
    const extra = new Headers(extraHeaders || {});
    extra.forEach((value, key) => merged.set(key, value));
    return merged;
  }

  function getBearparkAuthHeaders(headers) {
    const token = getBearparkAuthToken();
    const mergedHeaders = new Headers(headers || {});

    if (token && !mergedHeaders.has('Authorization')) {
      mergedHeaders.set('Authorization', `Bearer ${token}`);
    }

    return mergedHeaders;
  }

  function isInternalApiRequest(url) {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      return parsedUrl.pathname.startsWith('/api/') && allowedHosts.has(parsedUrl.host);
    } catch (error) {
      return false;
    }
  }

  // The game builds hard-code https://www.bearpark.xyz/api. Wherever a game
  // page actually runs (bearpark.xyz without www, a preview, the local
  // sandbox) its API is this origin's /api (vercel.json rewrites it), so send
  // those calls here: same origin carries the session token, and a local copy
  // can never write to production.
  const siteHosts = new Set(['www.bearpark.xyz', 'bearpark.xyz']);
  function sameOriginApiUrl(url) {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      if (parsedUrl.host !== window.location.host && siteHosts.has(parsedUrl.host) && parsedUrl.pathname.startsWith('/api/')) {
        return window.location.origin + parsedUrl.pathname + parsedUrl.search;
      }
    } catch (error) {
      // not a URL we route
    }
    return null;
  }

  // The park's live session (park/js/core/session.js keys), or null when this
  // browser isn't signed in or its token has run out. Staff pages use it to
  // tell "sign in first" apart from "not staff".
  function getBearparkSession() {
    const wallet = readStorage('bearpark_wallet');
    const token = getBearparkAuthToken();
    if (readStorage('bearpark_auth') !== 'true' || !wallet || !token) return null;
    try {
      const claims = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      if (!claims || !(claims.exp > Date.now())) return null;
    } catch (error) {
      return null;
    }
    return { wallet, token };
  }

  const originalFetch = window.fetch.bind(window);

  window.getBearparkSession = getBearparkSession;
  window.getBearparkAuthToken = getBearparkAuthToken;
  window.getBearparkAuthHeaders = getBearparkAuthHeaders;

  window.fetch = function patchedFetch(input, init) {
    if (input instanceof URL) input = input.href;
    const localUrl = sameOriginApiUrl(typeof input === 'string' ? input : input?.url);
    if (localUrl) input = input instanceof Request ? new Request(localUrl, input) : localUrl;
    const requestUrl = typeof input === 'string' ? input : input?.url;
    if (!requestUrl || !isInternalApiRequest(requestUrl)) {
      return originalFetch(input, init);
    }

    const token = getBearparkAuthToken();
    if (!token) {
      return originalFetch(input, init);
    }

    if (input instanceof Request) {
      const requestInit = {
        ...(init || {}),
        credentials: init?.credentials || input.credentials || 'include',
        headers: mergeHeaders(input.headers, getBearparkAuthHeaders(init?.headers))
      };
      return originalFetch(new Request(input, requestInit));
    }

    return originalFetch(input, {
      ...(init || {}),
      credentials: init?.credentials || 'include',
      headers: getBearparkAuthHeaders(init?.headers)
    });
  };
})();
