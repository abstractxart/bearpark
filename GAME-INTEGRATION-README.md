# 🐻 BEAR Park Game Integration Guide

This guide explains how to integrate your games with the BEAR Park leaderboard system.

## 🎯 Overview

The BEAR Park leaderboard system allows players to:
- Save high scores tied to their XAMAN wallet address
- Compete on global leaderboards across all games
- See their scores on bearpark.xyz

## 🚀 Quick Setup

### Step 1: Add the Integration Script

Add this script to your game's HTML (before your game code):

```html
<script src="https://bearpark.xyz/game-integration.js"></script>
```

OR copy the contents of `game-integration.js` directly into your game's code.

### Step 2: Set Your Game ID

At the top of the script, set the `GAME_ID` constant:

```javascript
const GAME_ID = 'flappy-bear'; // Change this!
```

**Game IDs:**
- `flappy-bear` - https://flappy-bear-five.vercel.app/
- `bear-jumpventure` - https://bear-jumpventure.vercel.app/
- `bear-jumpventure-alt` - https://bear-jumpventure1.vercel.app/

### Step 3: Submit Scores

When the game ends, call:

```javascript
// Simple score submission
BEARParkAPI.submitScore(finalScore);

// With metadata (recommended)
BEARParkAPI.submitScore(finalScore, {
  level: currentLevel,
  time: elapsedTime,
  difficulty: 'hard'
});
```

## 📋 API Reference

### `BEARParkAPI.submitScore(score, metadata)`

Submits a score to the leaderboard.

**Parameters:**
- `score` (number, required) - The player's score
- `metadata` (object, optional) - Additional game data (level, time, etc.)

**Returns:** Promise with response object

**Example:**
```javascript
const result = await BEARParkAPI.submitScore(1234, { level: 5 });
if (result.is_high_score) {
  alert('🎉 NEW HIGH SCORE!');
}
```

### `BEARParkAPI.getLeaderboard(limit)`

Gets the top scores for this game.

**Parameters:**
- `limit` (number, optional, default: 10) - Number of top scores to retrieve

**Returns:** Promise with array of leaderboard entries

**Example:**
```javascript
const topScores = await BEARParkAPI.getLeaderboard(10);
topScores.forEach((entry, index) => {
  console.log(`${index + 1}. ${entry.display_name}: ${entry.score}`);
});
```

### `BEARParkAPI.getMyScore()`

Gets the current user's best score for this game.

**Returns:** Promise with user's score entry or null

**Example:**
```javascript
const myBest = await BEARParkAPI.getMyScore();
if (myBest) {
  console.log(`Your best: ${myBest.score}`);
}
```

### `BEARParkAPI.isAuthenticated()`

Checks if the user has connected their XAMAN wallet.

**Returns:** boolean

**Example:**
```javascript
if (!BEARParkAPI.isAuthenticated()) {
  alert('Connect your wallet at bearpark.xyz to save scores!');
}
```

### `BEARParkAPI.createConnectPrompt()`

Creates a UI element prompting users to connect their wallet.

**Returns:** DOM element

**Example:**
```javascript
if (!BEARParkAPI.isAuthenticated()) {
  document.body.appendChild(BEARParkAPI.createConnectPrompt());
}
```

## 🔐 How Authentication Works

1. Player visits **bearpark.xyz** and connects XAMAN wallet
2. Wallet address is saved to `localStorage` as `xaman_wallet_address`
3. When player visits your game, the integration script reads this from localStorage
4. Scores are submitted with the wallet address to tie them to the player

## 🎮 Complete Game Integration Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Flappy BEAR</title>
</head>
<body>
  <canvas id="gameCanvas"></canvas>

  <!-- Add BEAR Park integration -->
  <script src="https://bearpark.xyz/game-integration.js"></script>

  <script>
    // Your game code
    let score = 0;

    function gameOver() {
      console.log('Game Over! Final score:', score);

      // Submit to leaderboard
      BEARParkAPI.submitScore(score, {
        level: currentLevel,
        time: gameTime
      }).then(result => {
        if (result.is_high_score) {
          showHighScoreAnimation();
        }
      });
    }

    // Show connect prompt if not authenticated
    if (!BEARParkAPI.isAuthenticated()) {
      document.body.appendChild(BEARParkAPI.createConnectPrompt());
    }

    // Load and display leaderboard on game start
    async function showLeaderboard() {
      const leaderboard = await BEARParkAPI.getLeaderboard(10);
      console.log('Top 10 Scores:', leaderboard);

      // Display in UI
      leaderboard.forEach((entry, index) => {
        console.log(`${index + 1}. ${entry.display_name}: ${entry.score}`);
      });
    }
  </script>
</body>
</html>
```

## 🗄️ Database Schema

The backend stores scores in Supabase with this structure:

**Table: `game_leaderboards`**
- `wallet_address` (text) - Player's XAMAN wallet address
- `game_id` (text) - Game identifier
- `score` (integer) - Player's score
- `metadata` (jsonb) - Additional game data
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Table: `profiles`**
- `wallet_address` (text) - Wallet address (primary key)
- `display_name` (text) - Player's chosen name
- `avatar_nft` (text) - Avatar NFT identifier

**View: `game_leaderboard_with_profiles`**
Joins leaderboards with profiles to include display names.

## 🌐 API Endpoints

Base URL: `https://bearpark.xyz/api`

### Submit Score
```
POST /api/leaderboard
Body: {
  "wallet_address": "rXXX...",
  "game_id": "flappy-bear",
  "score": 1234,
  "metadata": {}
}
```

### Get Leaderboard
```
GET /api/leaderboard/:game_id?limit=10
```

### Get User Score
```
GET /api/leaderboard/:game_id/:wallet_address
```

## 🔧 Testing Locally

1. Serve the integration script from your local server
2. Change `BEAR_API_URL` to your local API (http://localhost:3000/api)
3. Use localStorage in dev tools to set a test wallet:
   ```javascript
   localStorage.setItem('xaman_wallet_address', 'rTest123...');
   localStorage.setItem('display_name', 'TestPlayer');
   ```

## 💡 Best Practices

1. **Always check authentication** before relying on score submission
2. **Include metadata** to provide context (level, difficulty, time)
3. **Show connect prompt** to non-authenticated users
4. **Display leaderboards** in-game to encourage competition
5. **Celebrate high scores** with animations/effects

## 📞 Support

Questions? Contact the BEAR Park team or check the main docs at bearpark.xyz!
