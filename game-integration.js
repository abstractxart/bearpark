/**
 * BEAR Park Game Integration
 *
 * Add this script to your game to integrate with the BEAR Park leaderboard system.
 *
 * SETUP:
 * 1. Include this script in your game's HTML
 * 2. Set the GAME_ID constant below to match your game
 * 3. Call BEARParkAPI.submitScore(score) when the game ends
 *
 * GAME IDs:
 * - 'flappy-bear' for https://flappy-bear-five.vercel.app/
 * - 'bear-jumpventure' for https://bear-jumpventure.vercel.app/
 * - 'bear-jumpventure-alt' for https://bear-jumpventure1.vercel.app/
 */

const BEAR_API_URL = 'https://bearpark.xyz/api'; // Change to your production API URL
const GAME_ID = 'flappy-bear'; // CHANGE THIS for each game!

const BEARParkAPI = {
  /**
   * Get the wallet address from localStorage (set by bearpark.xyz)
   */
  getWalletAddress() {
    return localStorage.getItem('xaman_wallet_address');
  },

  /**
   * Get the user's display name from localStorage
   */
  getDisplayName() {
    return localStorage.getItem('display_name') || 'Anonymous';
  },

  /**
   * Check if user is authenticated with XAMAN wallet
   */
  isAuthenticated() {
    return !!this.getWalletAddress();
  },

  /**
   * Submit a score to the leaderboard
   * @param {number} score - The player's score
   * @param {object} metadata - Optional metadata (level, time, etc)
   * @returns {Promise<object>} Response with is_high_score flag
   */
  async submitScore(score, metadata = {}) {
    const walletAddress = this.getWalletAddress();

    if (!walletAddress) {
      console.warn('❌ Cannot submit score: User not authenticated with XAMAN wallet');
      return {
        success: false,
        error: 'Not authenticated',
        message: 'Please connect your XAMAN wallet at bearpark.xyz first'
      };
    }

    try {
      const response = await fetch(`${BEAR_API_URL}/leaderboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          game_id: GAME_ID,
          score: score,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            display_name: this.getDisplayName()
          }
        })
      });

      const data = await response.json();

      if (data.success && data.is_high_score) {
        console.log('🎉 NEW HIGH SCORE!', score);
      } else if (data.success) {
        console.log('✅ Score submitted (not a high score)');
      }

      return data;
    } catch (error) {
      console.error('❌ Error submitting score:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Get the leaderboard for this game
   * @param {number} limit - Number of top scores to retrieve (default: 10)
   * @returns {Promise<Array>} Array of leaderboard entries
   */
  async getLeaderboard(limit = 10) {
    try {
      const response = await fetch(`${BEAR_API_URL}/leaderboard/${GAME_ID}?limit=${limit}`);
      const data = await response.json();
      return data.leaderboard || [];
    } catch (error) {
      console.error('❌ Error fetching leaderboard:', error);
      return [];
    }
  },

  /**
   * Get the current user's best score for this game
   * @returns {Promise<object|null>} User's score entry or null
   */
  async getMyScore() {
    const walletAddress = this.getWalletAddress();

    if (!walletAddress) {
      return null;
    }

    try {
      const response = await fetch(`${BEAR_API_URL}/leaderboard/${GAME_ID}/${walletAddress}`);
      const data = await response.json();
      return data.entry || null;
    } catch (error) {
      console.error('❌ Error fetching user score:', error);
      return null;
    }
  },

  /**
   * Display a connection prompt if user is not authenticated
   * Returns a div element you can append to your game
   */
  createConnectPrompt() {
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1a1d22 0%, #0f1114 100%);
      border: 3px solid #edb723;
      border-radius: 16px;
      padding: 16px 20px;
      font-family: 'Bangers', cursive;
      color: #fff;
      z-index: 9999;
      box-shadow: 0 8px 16px rgba(0,0,0,0.5);
    `;

    div.innerHTML = `
      <p style="margin: 0 0 12px 0; font-size: 16px; color: #edb723;">
        🐻 Connect XAMAN Wallet
      </p>
      <p style="margin: 0 0 12px 0; font-size: 14px;">
        Save your high scores!
      </p>
      <a href="https://bearpark.xyz"
         style="display: block; text-align: center; background: #edb723; color: #000;
                padding: 10px; border-radius: 8px; text-decoration: none; font-size: 14px;
                font-weight: bold;">
        Connect at BEARPARK.XYZ
      </a>
    `;

    return div;
  }
};

// Auto-initialize: Show connect prompt if not authenticated
if (!BEARParkAPI.isAuthenticated()) {
  console.log('ℹ️ User not authenticated. Scores will not be saved to leaderboard.');
  console.log('Visit https://bearpark.xyz to connect your XAMAN wallet!');
}

// Make available globally
window.BEARParkAPI = BEARParkAPI;

// Example usage:
console.log(`
🐻 BEAR Park Game Integration Loaded
Game ID: ${GAME_ID}
Authenticated: ${BEARParkAPI.isAuthenticated()}

USAGE EXAMPLES:
--------------
// When game ends:
BEARParkAPI.submitScore(123);

// With metadata:
BEARParkAPI.submitScore(456, { level: 5, time: 60 });

// Get leaderboard:
const leaderboard = await BEARParkAPI.getLeaderboard(10);

// Get my score:
const myScore = await BEARParkAPI.getMyScore();

// Show connect prompt:
if (!BEARParkAPI.isAuthenticated()) {
  document.body.appendChild(BEARParkAPI.createConnectPrompt());
}
`);
