/**
 * BEAR Park Game Points Helper - Bear Market Edition
 *
 * Server-tracked activity heartbeats back game rewards.
 * One wallet sign-in should cover the whole session.
 */
const gamePointsApi = (() => {
  const GAME_POINTS_CONFIG = {
    POINTS_PER_MINUTE: 1,
    MAX_DAILY_MINUTES: 123,
    HEARTBEAT_INTERVAL_MS: 15000,
    CLIENT_ACTIVITY_WINDOW_MS: 25000,
    API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3000'
      : ''
  };

  const GAME_SESSION_STORAGE_PREFIX = 'bearpark_game_session_';
  const TRUSTED_ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'touchmove', 'mousedown'];
  const runtimeState = {
    listenersAttached: false,
    visibilityAttached: false,
    heartbeatTimer: null,
    heartbeatPromise: null,
    lastHeartbeatAt: 0,
    lastTrustedActivityAt: 0,
    lastTrustedActivitySampleAt: 0
  };

  function getConnectedWalletAddress() {
    return window.parent?.localStorage?.getItem('bearpark_wallet') ||
      localStorage.getItem('bearpark_wallet') ||
      localStorage.getItem('xaman_wallet_address');
  }

  function getWalletAuthToken(walletAddress) {
    if (!walletAddress) {
      return null;
    }

    if (typeof window.getBearparkAuthToken === 'function') {
      return window.getBearparkAuthToken();
    }

    const authToken = localStorage.getItem('bearpark_auth_token');
    const authTokenWallet = (localStorage.getItem('bearpark_auth_token_wallet') || '').toLowerCase();
    return authToken && authTokenWallet === walletAddress.toLowerCase() ? authToken : null;
  }

  function getProtectedHeaders(walletAddress, baseHeaders) {
    const authToken = getWalletAuthToken(walletAddress);
    if (typeof window.getBearparkAuthHeaders === 'function') {
      return window.getBearparkAuthHeaders(baseHeaders);
    }

    const headers = new Headers(baseHeaders || {});
    if (authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    return headers;
  }

  function getRequestInit(walletAddress, baseHeaders, init = {}) {
    return {
      credentials: 'include',
      ...init,
      headers: getProtectedHeaders(walletAddress, baseHeaders)
    };
  }

  function getGameSessionStorageKey(gameId) {
    return `${GAME_SESSION_STORAGE_PREFIX}${gameId}`;
  }

  function readStoredGameSession(gameId) {
    try {
      const raw = sessionStorage.getItem(getGameSessionStorageKey(gameId));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed?.token || null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredGameSession(gameId, token) {
    try {
      sessionStorage.setItem(getGameSessionStorageKey(gameId), JSON.stringify({ token, createdAt: Date.now() }));
    } catch (error) {
      // Ignore sessionStorage failures.
    }
  }

  function clearStoredGameSession(gameId) {
    try {
      sessionStorage.removeItem(getGameSessionStorageKey(gameId));
    } catch (error) {
      // Ignore sessionStorage failures.
    }
  }

  async function ensureGameSession(gameId, walletAddress) {
    const existingToken = readStoredGameSession(gameId);
    if (existingToken) {
      return existingToken;
    }

    const response = await fetch(
      `${GAME_POINTS_CONFIG.API_BASE_URL}/api/games/session/start`,
      getRequestInit(walletAddress, {
        'Content-Type': 'application/json'
      }, {
        method: 'POST',
        body: JSON.stringify({
          wallet_address: walletAddress,
          game_id: gameId
        })
      })
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.session_token) {
      throw new Error(data.error || 'Failed to start secure game session');
    }

    writeStoredGameSession(gameId, data.session_token);
    runtimeState.lastHeartbeatAt = 0;
    return data.session_token;
  }

  function detectCurrentGameId() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('bear-ninja')) return 'bear-ninja';
    if (path.includes('flappy-bear')) return 'flappy-bear';
    if (path.includes('bear-jumpventure')) return 'bear-jumpventure';
    if (path.includes('pong')) return 'bear-pong';
    return null;
  }

  function hasRecentTrustedActivity() {
    return runtimeState.lastTrustedActivityAt > 0 &&
      (Date.now() - runtimeState.lastTrustedActivityAt) <= GAME_POINTS_CONFIG.CLIENT_ACTIVITY_WINDOW_MS;
  }

  function noteTrustedActivity(event) {
    if (event && event.isTrusted === false) {
      return;
    }

    const now = Date.now();
    if ((now - runtimeState.lastTrustedActivitySampleAt) < 250) {
      return;
    }

    runtimeState.lastTrustedActivityAt = now;
    runtimeState.lastTrustedActivitySampleAt = now;
  }

  function attachRuntimeListeners() {
    if (!runtimeState.listenersAttached) {
      TRUSTED_ACTIVITY_EVENTS.forEach((eventName) => {
        window.addEventListener(eventName, noteTrustedActivity, { passive: true });
      });
      window.addEventListener('focus', noteTrustedActivity);
      runtimeState.listenersAttached = true;
    }

    if (!runtimeState.visibilityAttached) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          primeCurrentGameSession();
        }
      });
      runtimeState.visibilityAttached = true;
    }
  }

  async function sendGameHeartbeat(gameId, walletAddress, sessionToken, { force = false, silent = false } = {}) {
    if (!gameId || !walletAddress || !sessionToken) {
      return { success: false, skipped: true };
    }

    const now = Date.now();
    if (!force && runtimeState.lastHeartbeatAt && (now - runtimeState.lastHeartbeatAt) < (GAME_POINTS_CONFIG.HEARTBEAT_INTERVAL_MS - 1000)) {
      return { success: true, skipped: true };
    }

    const visible = document.visibilityState === 'visible';
    const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    const trustedActivity = hasRecentTrustedActivity();

    if (!force && (!visible || !focused || !trustedActivity)) {
      return { success: true, skipped: true };
    }

    if (runtimeState.heartbeatPromise) {
      return runtimeState.heartbeatPromise;
    }

    runtimeState.heartbeatPromise = (async () => {
      const response = await fetch(
        `${GAME_POINTS_CONFIG.API_BASE_URL}/api/games/session/heartbeat`,
        getRequestInit(walletAddress, {
          'Content-Type': 'application/json'
        }, {
          method: 'POST',
          body: JSON.stringify({
            wallet_address: walletAddress,
            game_id: gameId,
            session_token: sessionToken,
            visible,
            focused,
            trusted_activity: trustedActivity
          })
        })
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        if ([401, 409, 410].includes(response.status)) {
          clearStoredGameSession(gameId);
        }

        const message = data.error || 'Failed to sync game activity';
        if (!silent) {
          throw new Error(message);
        }
        return { success: false, error: message };
      }

      runtimeState.lastHeartbeatAt = now;
      return data;
    })();

    try {
      return await runtimeState.heartbeatPromise;
    } finally {
      runtimeState.heartbeatPromise = null;
    }
  }

  function startHeartbeatLoop() {
    if (runtimeState.heartbeatTimer) {
      return;
    }

    runtimeState.heartbeatTimer = window.setInterval(() => {
      const gameId = detectCurrentGameId();
      const walletAddress = getConnectedWalletAddress();
      if (!gameId || !walletAddress) {
        return;
      }

      ensureGameSession(gameId, walletAddress)
        .then((sessionToken) => sendGameHeartbeat(gameId, walletAddress, sessionToken, { silent: true }))
        .catch(() => { });
    }, GAME_POINTS_CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  function primeCurrentGameSession() {
    attachRuntimeListeners();
    startHeartbeatLoop();

    const gameId = detectCurrentGameId();
    const walletAddress = getConnectedWalletAddress();
    if (!gameId || !walletAddress) {
      return;
    }

    ensureGameSession(gameId, walletAddress).catch(() => { });
  }

  async function awardGamePoints(gameId, minutesPlayed) {
    try {
      const walletAddress = getConnectedWalletAddress();

      if (!walletAddress) {
        console.warn('No wallet connected, cannot award points');
        return {
          success: false,
          message: 'Please connect your wallet first'
        };
      }

      console.log(`Awarding points for ${gameId} - local estimate ${minutesPlayed} minutes...`);

      const sessionToken = await ensureGameSession(gameId, walletAddress);
      await sendGameHeartbeat(gameId, walletAddress, sessionToken, { force: true });

      const response = await fetch(
        `${GAME_POINTS_CONFIG.API_BASE_URL}/api/games/complete`,
        getRequestInit(walletAddress, {
          'Content-Type': 'application/json'
        }, {
          method: 'POST',
          body: JSON.stringify({
            wallet_address: walletAddress,
            game_id: gameId,
            session_token: sessionToken,
            client_minutes_played: minutesPlayed
          })
        })
      );

      const data = await response.json().catch(() => ({}));
      const shouldRotateSession =
        (response.ok && data.success !== undefined) ||
        [401, 409, 410].includes(response.status);

      if (shouldRotateSession) {
        clearStoredGameSession(gameId);
        runtimeState.lastHeartbeatAt = 0;
        ensureGameSession(gameId, walletAddress).catch(() => { });
      }

      if (!response.ok || !data.success) {
        const message = data.error || data.message || 'Failed to award points';
        console.log(`Game claim rejected: ${message}`);

        if (data.minutes_today >= data.max_minutes) {
          showLimitNotification();
        }

        return {
          success: false,
          message,
          minutes_today: data.minutes_today,
          max_minutes: data.max_minutes,
          points_awarded: data.points_awarded || 0
        };
      }

      console.log(`Awarded ${data.points_awarded} points from ${data.tracked_minutes ?? data.minutes_played ?? 0} tracked minutes`);
      showPointsNotification(data.points_awarded, data.remaining_minutes, data.minutes_today, data.max_minutes);
      window.dispatchEvent(new CustomEvent('gamePointsAwarded', { detail: data }));
      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(new CustomEvent('honeyPointsUpdated', { detail: data }));
      }

      return data;
    } catch (error) {
      console.error('Error awarding game points:', error);
      return {
        success: false,
        message: error?.message || 'Failed to award points'
      };
    }
  }

  async function getDailyGameStatus(gameId) {
    try {
      const walletAddress = getConnectedWalletAddress();

      if (!walletAddress) {
        return {
          success: false,
          can_earn_points: false,
          minutes_today: 0,
          max_minutes: GAME_POINTS_CONFIG.MAX_DAILY_MINUTES,
          remaining_minutes: GAME_POINTS_CONFIG.MAX_DAILY_MINUTES
        };
      }

      const response = await fetch(
        `${GAME_POINTS_CONFIG.API_BASE_URL}/api/games/daily-status/${walletAddress}/${gameId}`,
        {
          credentials: 'include'
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Error fetching daily game status:', error);
      return { success: false };
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('load', primeCurrentGameSession);
  }

  return {
    awardGamePoints,
    getDailyGameStatus,
    primeCurrentGameSession,
    GAME_POINTS_CONFIG
  };
})();

const awardGamePoints = gamePointsApi.awardGamePoints;
const getDailyGameStatus = gamePointsApi.getDailyGameStatus;
const primeCurrentGameSession = gamePointsApi.primeCurrentGameSession;
const GAME_POINTS_CONFIG = gamePointsApi.GAME_POINTS_CONFIG;
/**
 * Show points notification - GAME OVER STYLE
 */
function showPointsNotification(points, remaining, minutesToday, maxMinutes) {
  // Create full-screen game-over overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, rgba(75,0,130,0.95) 0%, rgba(0,0,0,0.98) 50%, rgba(25,25,112,0.95) 100%);
    backdrop-filter: blur(10px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease-out;
  `;

  const notification = document.createElement('div');
  notification.style.cssText = `
    background: linear-gradient(135deg, rgba(138,43,226,0.3) 0%, rgba(0,0,0,0.8) 50%, rgba(255,215,0,0.2) 100%);
    border: 5px solid;
    border-image: linear-gradient(135deg, #ffd700 0%, #50fa7b 50%, #bd93f9 100%) 1;
    border-radius: 24px;
    padding: 50px 60px;
    text-align: center;
    font-family: 'Luckiest Guy', cursive, Arial, sans-serif;
    color: white;
    box-shadow: 0 0 40px rgba(255,215,0,0.6), 0 0 80px rgba(138,43,226,0.4), inset 0 0 60px rgba(80,250,123,0.1);
    animation: gameOverPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    max-width: 550px;
    position: relative;
  `;

  // Calculate progress percentage
  const progressPercent = (minutesToday / maxMinutes) * 100;
  const progressColor = minutesToday <= 8 ? '#50fa7b' : minutesToday <= 16 ? '#f1fa8c' : '#ff79c6';

  notification.innerHTML = `
    <div style="font-size: 72px; margin-bottom: 15px; animation: honeyBounce 0.8s ease-in-out infinite; filter: drop-shadow(0 0 20px rgba(255,215,0,0.8));">🍯</div>

    <div style="font-size: 48px; background: linear-gradient(135deg, #ffd700 0%, #50fa7b 50%, #bd93f9 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1.2; margin-bottom: 10px; font-weight: 900; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      +${points.toFixed(1)} HONEY<br>POINTS!
    </div>

    <!-- Progress Bar -->
    <div style="margin: 25px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 20px; color: ${progressColor}; font-weight: 900; text-shadow: 0 0 10px ${progressColor};">
          ${minutesToday.toFixed(1)}/${maxMinutes} MINS
        </span>
        <span style="font-size: 16px; color: #f1fa8c; font-weight: 700;">
          ${minutesToday.toFixed(1)} PTS TODAY
        </span>
      </div>
      <div style="height: 20px; background: rgba(0,0,0,0.5); border-radius: 20px; overflow: hidden; border: 2px solid rgba(255,215,0,0.3); box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);">
        <div style="height: 100%; width: ${progressPercent}%; background: linear-gradient(90deg, #50fa7b 0%, #f1fa8c 50%, #bd93f9 100%); border-radius: 20px; transition: width 0.8s cubic-bezier(0.65, 0, 0.35, 1); box-shadow: 0 0 20px ${progressColor}; position: relative; overflow: hidden;">
          <div style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); animation: shimmerProgress 1.5s infinite;"></div>
        </div>
      </div>
    </div>

    <div style="font-size: 22px; margin-top: 20px; padding: 18px 28px; background: linear-gradient(135deg, rgba(80,250,123,0.2) 0%, rgba(241,250,140,0.2) 50%, rgba(189,147,249,0.2) 100%); border-radius: 15px; border: 2px solid; border-image: linear-gradient(135deg, #50fa7b 0%, #f1fa8c 50%, #bd93f9 100%) 1;">
      ${remaining > 0
        ? `<span style="color: #50fa7b; font-weight: 900; text-shadow: 0 0 10px #50fa7b;">${remaining.toFixed(1)}</span> <span style="color: #f1fa8c;">mins left today! 🎮</span>`
        : `<span style="color: #ff79c6; font-weight: 900; text-shadow: 0 0 10px #ff79c6;">DAILY LIMIT REACHED!</span><br><small style="opacity:0.7; font-size:18px; color: #bd93f9;">Come back tomorrow for more!</small>`
      }
    </div>
    <div style="font-size: 14px; opacity: 0.6; margin-top: 25px; text-transform: uppercase; letter-spacing: 2px; color: #bd93f9;">
      Click anywhere to continue
    </div>
  `;

  overlay.appendChild(notification);
  document.body.appendChild(overlay);

  // Function to dismiss and show celebration if 20/20
  const dismissOverlay = () => {
    overlay.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      overlay.remove();
      // Show celebration if they just hit 20/20 minutes
      if (minutesToday >= maxMinutes && remaining === 0) {
        showCelebration();
      }
    }, 300);
  };

  // Click to dismiss
  overlay.addEventListener('click', dismissOverlay);

  // Auto-dismiss after 3.5 seconds
  setTimeout(() => {
    if (overlay.parentElement) {
      dismissOverlay();
    }
  }, 3500);
}

/**
 * Show limit reached notification - GAME OVER STYLE
 */
function showLimitNotification() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease-out;
  `;

  const notification = document.createElement('div');
  notification.style.cssText = `
    background: linear-gradient(135deg, #1a0000 0%, #2a0000 100%);
    border: 5px solid #ff6b6b;
    border-radius: 24px;
    padding: 50px 60px;
    text-align: center;
    font-family: 'Luckiest Guy', cursive, Arial, sans-serif;
    color: white;
    box-shadow: 0 20px 60px rgba(255,107,107,0.6), inset 0 0 40px rgba(255,107,107,0.1);
    animation: gameOverPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    max-width: 500px;
  `;

  notification.innerHTML = `
    <div style="font-size: 64px; margin-bottom: 20px;">⏰</div>
    <div style="font-size: 42px; color: #ff6b6b; text-shadow: 0 0 20px rgba(255,107,107,0.8), 3px 3px 0px rgba(0,0,0,0.3); line-height: 1.2; margin-bottom: 15px;">
      DAILY LIMIT<br>REACHED!
    </div>
    <div style="font-size: 20px; opacity: 0.9; margin-top: 20px; padding: 15px 25px; background: rgba(255,107,107,0.1); border-radius: 12px; border: 2px solid rgba(255,107,107,0.3);">
      You've maxed out today! 🎮<br>
      <small style="opacity:0.7; font-size:16px; margin-top:8px; display:block;">Come back tomorrow for more honey points!</small>
    </div>
    <div style="font-size: 14px; opacity: 0.6; margin-top: 25px; text-transform: uppercase; letter-spacing: 2px;">
      Click anywhere to continue
    </div>
  `;

  overlay.appendChild(notification);
  document.body.appendChild(overlay);

  // Click to dismiss
  overlay.addEventListener('click', () => {
    overlay.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => overlay.remove(), 300);
  });

  // Auto-dismiss after 3.5 seconds
  setTimeout(() => {
    if (overlay.parentElement) {
      overlay.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => overlay.remove(), 300);
    }
  }, 3500);
}

/**
 * Show "Amazing job BEAR!" celebration when hitting 20/20 minutes
 */
function showCelebration() {
  const celebration = document.createElement('div');
  celebration.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.5);
    background: linear-gradient(135deg, rgba(80,250,123,0.4) 0%, rgba(241,250,140,0.4) 25%, rgba(189,147,249,0.4) 50%, rgba(255,121,198,0.4) 75%, rgba(255,215,0,0.4) 100%);
    backdrop-filter: blur(15px);
    color: #fff;
    padding: 50px 70px;
    border-radius: 30px;
    font-family: 'Luckiest Guy', cursive, Arial, sans-serif;
    font-size: 54px;
    text-align: center;
    z-index: 9999999;
    box-shadow: 0 0 50px rgba(255,215,0,0.8), 0 0 100px rgba(138,43,226,0.6), 0 0 150px rgba(80,250,123,0.4), inset 0 0 80px rgba(241,250,140,0.2);
    animation: celebrationPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
    border: 6px solid;
    border-image: linear-gradient(135deg, #50fa7b 0%, #f1fa8c 25%, #bd93f9 50%, #ff79c6 75%, #ffd700 100%) 1;
  `;

  celebration.innerHTML = `
    <div style="font-size: 90px; margin-bottom: 15px; animation: bounce 1s infinite; filter: drop-shadow(0 0 30px rgba(255,215,0,0.9));">🎉</div>
    <div style="line-height: 1.1; background: linear-gradient(135deg, #50fa7b 0%, #f1fa8c 25%, #bd93f9 50%, #ff79c6 75%, #ffd700 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 900; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5)); background-size: 200% 200%; animation: rainbowShift 3s ease infinite;">
      AMAZING JOB<br>BEAR!
    </div>
    <div style="font-size: 28px; margin-top: 25px; background: linear-gradient(90deg, #ffd700 0%, #50fa7b 50%, #bd93f9 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 700;">
      20/20 MINUTES COMPLETED! 🍯
    </div>
    <div style="font-size: 22px; margin-top: 20px; color: #f1fa8c; opacity: 0.9; font-weight: 600; text-shadow: 0 0 10px #f1fa8c;">
      DAILY MAX REACHED! 🔥
    </div>
  `;

  document.body.appendChild(celebration);

  // Remove after 4 seconds
  setTimeout(() => {
    celebration.style.animation = 'celebrationOut 0.4s ease-out forwards';
    setTimeout(() => celebration.remove(), 400);
  }, 4000);
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes gameOverPop {
    0% { transform: scale(0.5); opacity: 0; }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes honeyBounce {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-15px) rotate(-5deg); }
    75% { transform: translateY(-15px) rotate(5deg); }
  }
  @keyframes shimmerProgress {
    0% { left: -100%; }
    100% { left: 200%; }
  }
  @keyframes celebrationPop {
    0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
    50% { transform: translate(-50%, -50%) scale(1.1); }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  }
  @keyframes celebrationOut {
    0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1.3); opacity: 0; }
  }
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-20px); }
  }
`;
document.head.appendChild(style);

// Export for use in games
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { awardGamePoints, getDailyGameStatus, showCelebration, GAME_POINTS_CONFIG };
}

// Also expose to browser window for games loaded via script tag
if (typeof window !== 'undefined') {
  window.awardGamePoints = awardGamePoints;
  window.getDailyGameStatus = getDailyGameStatus;
  window.showCelebration = showCelebration;
  window.GAME_POINTS_CONFIG = GAME_POINTS_CONFIG;
}
