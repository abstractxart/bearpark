# 🎮 Game-Specific Integration Code

Copy and paste these code snippets into each game.

---

## 🐦 Flappy BEAR
**URL:** https://flappy-bear-five.vercel.app/

### Add to HTML `<head>` or before closing `</body>`:

```html
<script>
const GAME_ID = 'flappy-bear';
const BEAR_API_URL = 'https://bearpark.xyz/api';

const BEARParkAPI = {
  getWalletAddress() { return localStorage.getItem('xaman_wallet_address'); },
  getDisplayName() { return localStorage.getItem('display_name') || 'Anonymous'; },
  isAuthenticated() { return !!this.getWalletAddress(); },

  async submitScore(score, metadata = {}) {
    const walletAddress = this.getWalletAddress();
    if (!walletAddress) {
      console.log('Not authenticated - score not saved');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${BEAR_API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          game_id: GAME_ID,
          score: score,
          metadata: { ...metadata, display_name: this.getDisplayName() }
        })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
window.BEARParkAPI = BEARParkAPI;
</script>
```

### In your game over function:

```javascript
function gameOver() {
  // Your existing game over code...

  // Submit score to BEAR Park
  BEARParkAPI.submitScore(finalScore, { pipes: pipesCleared }).then(result => {
    if (result.is_high_score) {
      console.log('🎉 NEW HIGH SCORE!');
      // Optional: Show high score animation
    }
  });
}
```

---

## 🦘 BEAR Jump Venture
**URL:** https://bear-jumpventure.vercel.app/

### Add to HTML `<head>` or before closing `</body>`:

```html
<script>
const GAME_ID = 'bear-jumpventure';
const BEAR_API_URL = 'https://bearpark.xyz/api';

const BEARParkAPI = {
  getWalletAddress() { return localStorage.getItem('xaman_wallet_address'); },
  getDisplayName() { return localStorage.getItem('display_name') || 'Anonymous'; },
  isAuthenticated() { return !!this.getWalletAddress(); },

  async submitScore(score, metadata = {}) {
    const walletAddress = this.getWalletAddress();
    if (!walletAddress) {
      console.log('Not authenticated - score not saved');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${BEAR_API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          game_id: GAME_ID,
          score: score,
          metadata: { ...metadata, display_name: this.getDisplayName() }
        })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
window.BEARParkAPI = BEARParkAPI;
</script>
```

### In your game over function:

```javascript
function endGame() {
  // Your existing end game code...

  // Submit score to BEAR Park
  BEARParkAPI.submitScore(finalScore, {
    distance: distanceTraveled,
    jumps: totalJumps
  }).then(result => {
    if (result.is_high_score) {
      console.log('🎉 NEW HIGH SCORE!');
      // Optional: Show high score animation
    }
  });
}
```

---

## 🦘 BEAR Jump Venture (Alt)
**URL:** https://bear-jumpventure1.vercel.app/

### Add to HTML `<head>` or before closing `</body>`:

```html
<script>
const GAME_ID = 'bear-jumpventure-alt';
const BEAR_API_URL = 'https://bearpark.xyz/api';

const BEARParkAPI = {
  getWalletAddress() { return localStorage.getItem('xaman_wallet_address'); },
  getDisplayName() { return localStorage.getItem('display_name') || 'Anonymous'; },
  isAuthenticated() { return !!this.getWalletAddress(); },

  async submitScore(score, metadata = {}) {
    const walletAddress = this.getWalletAddress();
    if (!walletAddress) {
      console.log('Not authenticated - score not saved');
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${BEAR_API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          game_id: GAME_ID,
          score: score,
          metadata: { ...metadata, display_name: this.getDisplayName() }
        })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
window.BEARParkAPI = BEARParkAPI;
</script>
```

### In your game over function:

```javascript
function endGame() {
  // Your existing end game code...

  // Submit score to BEAR Park
  BEARParkAPI.submitScore(finalScore, {
    distance: distanceTraveled,
    jumps: totalJumps
  }).then(result => {
    if (result.is_high_score) {
      console.log('🎉 NEW HIGH SCORE!');
      // Optional: Show high score animation
    }
  });
}
```

---

## 🎨 Optional: Show Connect Prompt

Add this to show a prompt for non-authenticated users:

```javascript
// Check on page load
if (!BEARParkAPI.isAuthenticated()) {
  // Create prompt
  const prompt = document.createElement('div');
  prompt.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 9999;
    background: linear-gradient(135deg, #1a1d22, #0f1114);
    border: 3px solid #edb723; border-radius: 16px;
    padding: 16px 20px; color: #fff;
    font-family: Arial, sans-serif;
    box-shadow: 0 8px 16px rgba(0,0,0,0.5);
    max-width: 250px;
  `;

  prompt.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 8px;">🐻 BEAR Park</div>
    <div style="font-size: 14px; margin-bottom: 12px;">
      Connect your XAMAN wallet to save high scores!
    </div>
    <a href="https://bearpark.xyz" target="_blank"
       style="display: block; background: #edb723; color: #000;
              text-align: center; padding: 10px; border-radius: 8px;
              text-decoration: none; font-weight: bold;">
      Connect Wallet
    </a>
    <div style="text-align: center; margin-top: 8px;">
      <a href="#" onclick="this.parentElement.parentElement.remove(); return false;"
         style="color: #888; font-size: 12px; text-decoration: none;">
        Close
      </a>
    </div>
  `;

  document.body.appendChild(prompt);
}
```

---

## 🧪 Testing Locally

To test without deploying:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Run these commands:

```javascript
// Set fake wallet data
localStorage.setItem('xaman_wallet_address', 'rTestWallet123');
localStorage.setItem('display_name', 'TestPlayer');

// Verify
BEARParkAPI.isAuthenticated(); // Should return true

// Test score submission
BEARParkAPI.submitScore(9999, { test: true });
```

---

## 📊 Viewing Scores

Once integrated, you can view scores:

1. **API Direct:**
   - `GET https://bearpark.xyz/api/leaderboard/flappy-bear`
   - `GET https://bearpark.xyz/api/leaderboard/bear-jumpventure`
   - `GET https://bearpark.xyz/api/leaderboard/bear-jumpventure-alt`

2. **In Browser Console:**
   ```javascript
   fetch('https://bearpark.xyz/api/leaderboard/flappy-bear')
     .then(r => r.json())
     .then(data => console.table(data.leaderboard));
   ```

---

## 🚀 Deployment Checklist

For each game:

- [ ] Add the integration script to HTML
- [ ] Set correct `GAME_ID`
- [ ] Call `BEARParkAPI.submitScore()` when game ends
- [ ] Test locally with fake wallet address
- [ ] Deploy to Vercel
- [ ] Test on production with real XAMAN wallet
- [ ] Verify scores appear in API

---

## 💡 Pro Tips

1. **Multiple difficulty levels?** Include in metadata:
   ```javascript
   BEARParkAPI.submitScore(score, { difficulty: 'hard' });
   ```

2. **Show in-game leaderboard?** Fetch and display:
   ```javascript
   const leaderboard = await BEARParkAPI.getLeaderboard(5);
   // Display top 5 in your UI
   ```

3. **Encourage wallet connection:** Show benefits like "Connect wallet to compete globally!"

4. **Celebrate high scores:**
   ```javascript
   if (result.is_high_score) {
     playVictorySound();
     showConfetti();
   }
   ```
