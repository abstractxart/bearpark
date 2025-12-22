/**
 * BEAR Park Game Points Helper - Bear Market Edition
 *
 * Call this when a user completes a game to award honey points
 * 1 point per minute, max 20 minutes/day, 0.1 point increments
 */

const GAME_POINTS_CONFIG = {
  POINTS_PER_MINUTE: 1,
  MAX_DAILY_MINUTES: 123,
  // Auto-detect: localhost uses local API, production uses Railway API
  API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://bearpark-production.up.railway.app'
};

/**
 * Award points for completing a game session
 * @param {string} gameId - Unique game identifier (e.g., 'bear-ninja', 'bear-pong')
 * @param {number} minutesPlayed - Minutes played in this session (rounded to 0.1)
 * @returns {Promise<object>} Response with points awarded and daily status
 */
async function awardGamePoints(gameId, minutesPlayed) {
  try {
    // Get wallet from parent window or localStorage
    // Support both bearpark_wallet (main site) and xaman_wallet_address (BEAR PONG)
    const walletAddress = window.parent?.localStorage?.getItem('bearpark_wallet') ||
                          localStorage.getItem('bearpark_wallet') ||
                          localStorage.getItem('xaman_wallet_address');

    if (!walletAddress) {
      console.warn('No wallet connected, cannot award points');
      return {
        success: false,
        message: 'Please connect your wallet first'
      };
    }

    console.log(`🎮 Awarding points for ${gameId} - ${minutesPlayed} minutes...`);

    const response = await fetch(`${GAME_POINTS_CONFIG.API_BASE_URL}/api/games/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        wallet_address: walletAddress,
        game_id: gameId,
        minutes_played: minutesPlayed
      })
    });

    const data = await response.json();

    if (data.success) {
      console.log(`✅ Awarded ${data.points_awarded} points! (${data.minutes_today}/${data.max_minutes} mins today)`);

      // Show game-over style notification
      showPointsNotification(data.points_awarded, data.remaining_minutes, data.minutes_today, data.max_minutes);

      // Trigger event to refresh daily progress widget on main page
      window.dispatchEvent(new CustomEvent('gamePointsAwarded', { detail: data }));

      return data;
    } else {
      console.log(`⚠️ ${data.message}`);

      // Show limit reached notification
      if (data.minutes_today >= data.max_minutes) {
        showLimitNotification();
      }

      return data;
    }

  } catch (error) {
    console.error('Error awarding game points:', error);
    return {
      success: false,
      message: 'Failed to award points'
    };
  }
}

/**
 * Check daily game status without awarding points
 * @param {string} gameId - Unique game identifier
 * @returns {Promise<object>} Daily status info
 */
async function getDailyGameStatus(gameId) {
  try {
    const walletAddress = window.parent?.localStorage?.getItem('bearpark_wallet') ||
                          localStorage.getItem('bearpark_wallet');

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
      `${GAME_POINTS_CONFIG.API_BASE_URL}/api/games/daily-status/${walletAddress}/${gameId}`
    );

    return await response.json();

  } catch (error) {
    console.error('Error fetching daily game status:', error);
    return { success: false };
  }
}

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

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (overlay.parentElement) {
      dismissOverlay();
    }
  }, 5000);
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

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (overlay.parentElement) {
      overlay.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => overlay.remove(), 300);
    }
  }, 5000);
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
  @keyframes rainbowShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
`;
document.head.appendChild(style);

// Export for use in games
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { awardGamePoints, getDailyGameStatus, showCelebration, GAME_POINTS_CONFIG };
}

// IMPORTANT: Expose to window for browser usage
window.awardGamePoints = awardGamePoints;
window.getDailyGameStatus = getDailyGameStatus;
window.showCelebration = showCelebration;
