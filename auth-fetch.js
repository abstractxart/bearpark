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

  const originalFetch = window.fetch.bind(window);

  window.getBearparkAuthToken = getBearparkAuthToken;
  window.getBearparkAuthHeaders = getBearparkAuthHeaders;

  window.fetch = function patchedFetch(input, init) {
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
