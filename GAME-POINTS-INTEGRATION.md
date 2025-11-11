# Game Points Integration Guide

## Bear Market Edition: 8 Points/Game, Max 5/Day

### Quick Setup (30 seconds)

**1. Add the helper script to your game HTML:**

```html
<!-- Add before closing </body> tag -->
<script src="../game-points-helper.js"></script>
```

**2. Call when player completes a game:**

```javascript
// When game ends, award points
async function onGameComplete(score) {
  // Your existing game completion code...
  saveHighScore(score);
  showGameOver();

  // Add this line to award honey points:
  await awardGamePoints('your-game-id'); // e.g., 'bear-ninja', 'flappy-bear'
}
```

**That's it!** The helper handles:
- ✅ Daily limits (5 games/day)
- ✅ Point awarding (8 points/game)
- ✅ Success notifications
- ✅ Wallet connection check

---

## Full Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My BEAR Game</title>
</head>
<body>
  <canvas id="gameCanvas"></canvas>

  <!-- Your game code -->
  <script src="mygame.js"></script>

  <!-- Add game points helper -->
  <script src="../game-points-helper.js"></script>

  <script>
    // When game ends
    function gameOver(finalScore) {
      // Show game over screen
      showScore(finalScore);

      // Award honey points (auto-handles limits)
      awardGamePoints('my-game-id').then(result => {
        if (result.success) {
          console.log(`Awarded ${result.points_awarded} points!`);
          console.log(`Games left today: ${result.remaining_plays}`);
        } else {
          console.log(result.message); // "Daily limit reached!"
        }
      });
    }
  </script>
</body>
</html>
```

---

## Advanced Usage

### Check Status Before Starting

```javascript
// Show user how many games they have left
async function showDailyStatus() {
  const status = await getDailyGameStatus('my-game-id');

  if (status.can_earn_points) {
    console.log(`You can earn points ${status.remaining_plays} more times today!`);
  } else {
    console.log('Daily limit reached. Come back tomorrow!');
  }
}
```

### Custom Notifications

```javascript
// Override the notification style
function showPointsNotification(points, remaining) {
  // Your custom notification code here
  alert(`You earned ${points} points! ${remaining} games left today.`);
}
```

---

## Game IDs

Use these standardized IDs:

- `bear-ninja` - BEAR NINJA game
- `flappy-bear` - Flappy BEAR game
- `bear-slice` - Future game
- `your-game-name` - Your new game

---

## Economy Settings

```javascript
POINTS_PER_GAME: 8 points
MAX_DAILY_GAMES: 5 games
TOTAL_DAILY_MAX: 40 points from games
LOTTERY_ENTRY: 1,200 points total
```

**Time to Lottery Entry:**
- Games only: 30 days (40 pts/day)
- Raids only: 20-40 days (60-30 pts/day)
- **Both**: 12-17 days (100-70 pts/day) ✅

---

## Testing

```javascript
// Test in browser console
await awardGamePoints('test-game');
// Should see: "✅ Awarded 8 points! (1/5 today)"

// Check status
const status = await getDailyGameStatus('test-game');
console.log(status);
```

---

## Database Setup

Run this SQL in Supabase first:

```bash
# In Supabase SQL Editor, run:
./backend/supabase-game-points-setup.sql
```

---

## Support

Questions? Check the helper source code:
`frontend/game-points-helper.js`

All the logic is commented and straightforward.
