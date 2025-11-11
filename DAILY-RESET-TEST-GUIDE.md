# 🧪 Daily Reset System - Complete Test Guide

## Overview
This guide will help you test the UTC midnight daily reset system to ensure 100% functionality.

## What Should Happen at UTC Midnight

1. **Daily game counter resets** from 5/5 to 0/5
2. **Countdown timer stops** and changes to "5 games left"
3. **Player can play 5 more games** to earn another 40 points
4. **Total honey points accumulate** (Day 1: 40 pts → Day 2: 80 pts → Day 3: 120 pts...)
5. **Leaderboard rankings update** based on accumulated points

---

## 🎯 Test Scenario 1: Simulated 10-Second Countdown Reset

### Prerequisites
- You're currently at 5/5 games (40 points earned today)
- Timer shows "Resets in Xh Ym Zs"

### Steps

1. **Open browser console** (F12)

2. **Activate test mode:**
   ```javascript
   TEST_COUNTDOWN_MODE = true
   ```

3. **Watch the countdown** (10 seconds):
   - Timer counts down: "Resets in 0h 0m 10s" → ... → "0h 0m 1s"
   - Color transitions from green → yellow → red

4. **At 0 seconds, verify:**
   - ✅ Console shows: `✅ Daily games reset: {success: true, ...}`
   - ✅ Counter changes to **0/5**
   - ✅ Display shows **"5 GAMES LEFT"** (white text)
   - ✅ "0 pts earned today"
   - ✅ Total honey points still shows **40**

5. **Test playing games again:**
   - Play a game (any of the 3 games)
   - ✅ Verify you earn 8 points
   - ✅ Counter goes to **1/5**
   - ✅ "8 pts earned today"
   - ✅ Total honey points becomes **48**

6. **Play 4 more games:**
   - ✅ After 5 games: Counter shows **5/5**
   - ✅ "40 pts earned today"
   - ✅ Total honey points becomes **80**
   - ✅ Countdown timer appears again
   - ✅ "AMAZING JOB BEAR!" celebration shows

---

## 🎯 Test Scenario 2: Backend Reset Verification

### Run the comprehensive test script:

```bash
cd backend
node test-daily-reset.js
```

### Expected Output:
```
🧪 COMPREHENSIVE DAILY RESET TEST
============================================================

📊 STEP 1: Check Current State
------------------------------------------------------------
✓ Games played today: 5/5
✓ Points earned today: 40
✓ Total honey points: 40
✓ Total games points: 40

🔒 STEP 2: Verify Daily Limit (Should be 5/5)
------------------------------------------------------------
✓ Confirmed at 5/5 limit
✓ Daily game plays records: 3

🔄 STEP 3: Simulate UTC Midnight Reset
------------------------------------------------------------
✓ Deleted daily game plays for today

✅ STEP 4: Verify Post-Reset State
------------------------------------------------------------
✓ Games played today: 0/5 (should be 0)
✓ Points earned today: 0 (should be 0)
✓ Total honey points: 40 (should stay at 40)
✓ Total games points: 40 (should stay at 40)

🎮 STEP 5: Verify Can Play Again
------------------------------------------------------------
✓ Daily plays cleared - player can now play 5 more games
✓ Each game will award 8 points
✓ After 5 games, total will be: 80

📋 TEST SUMMARY
============================================================
✅ Daily plays reset to 0
✅ Points today reset to 0
✅ Total points preserved (40)
✅ Can play 5 more games

🎉 ALL TESTS PASSED! Daily reset system is working correctly.
```

---

## 🎯 Test Scenario 3: Database Verification

### Verify Supabase Data

1. **Go to Supabase Dashboard** → SQL Editor

2. **Check daily_game_plays table:**
   ```sql
   SELECT * FROM daily_game_plays
   WHERE wallet_address = 'YOUR_WALLET'
   AND play_date = CURRENT_DATE
   ORDER BY created_at DESC;
   ```

   **Before reset:** Should show 3 records (bear-ninja, flappy-bear, bear-jumpventure)

   **After reset:** Should show 0 records

3. **Check honey_points table:**
   ```sql
   SELECT * FROM honey_points
   WHERE wallet_address = 'YOUR_WALLET';
   ```

   **Should show:**
   - `total_points`: 40 (or accumulated total)
   - `games_points`: 40 (or accumulated total)
   - `raiding_points`: 0 (unless you completed raids)

---

## 🎯 Test Scenario 4: Multi-Day Simulation

### Day 1:
1. Start with 0 points
2. Play 5 games
3. Earn 40 points
4. See countdown timer
5. **Total: 40 points**

### Day 2 (After Reset):
1. Timer resets
2. Play 5 more games
3. Earn 40 more points
4. **Total: 80 points**

### Day 3 (After Reset):
1. Timer resets
2. Play 5 more games
3. Earn 40 more points
4. **Total: 120 points**

---

## ✅ Complete Checklist

### Frontend Tests
- [ ] Countdown timer shows correct time until UTC midnight
- [ ] Timer color changes: green → yellow → red
- [ ] Timer counts down every second
- [ ] At 0 seconds, timer resets and shows "5 games left"
- [ ] Counter shows 0/5 after reset
- [ ] "0 pts earned today" after reset
- [ ] Total honey points preserved after reset
- [ ] Can play games again after reset
- [ ] Counter increments 1/5, 2/5, 3/5, 4/5, 5/5
- [ ] Countdown appears again at 5/5
- [ ] Celebration shows when hitting 5/5

### Backend Tests
- [ ] `/api/games/reset-daily/:wallet` endpoint works
- [ ] `daily_game_plays` records deleted for today
- [ ] `honey_points` total NOT deleted (persists)
- [ ] Can award points again after reset
- [ ] Atomic function prevents race conditions
- [ ] Max 5 games enforced across all games

### Database Tests
- [ ] `daily_game_plays` table cleared for date
- [ ] `honey_points` table preserved
- [ ] `play_date` uses UTC timezone
- [ ] Leaderboard shows accumulated totals

### Edge Cases
- [ ] Reset works at exactly UTC midnight
- [ ] Multiple players can reset simultaneously
- [ ] Player can't exploit by playing during reset
- [ ] Timer synchronizes with server time
- [ ] Works across different timezones (all use UTC)

---

## 🚨 Common Issues & Fixes

### Issue: "Still shows 5/5 after reset"
**Fix:** Clear browser cache (Ctrl+Shift+Delete) and refresh

### Issue: "Total points reset to 0"
**Fix:** Check backend - should only delete `daily_game_plays`, not `honey_points`

### Issue: "Can't play games after reset"
**Fix:** Verify `/api/games/reset-daily` endpoint is being called

### Issue: "Timer doesn't countdown"
**Fix:** Check console for errors, restart PM2 server

---

## 🎉 Success Criteria

**The system works 100% if:**

1. ✅ Countdown reaches 0
2. ✅ Daily plays clear automatically
3. ✅ Counter resets to 0/5
4. ✅ Player can play 5 more games
5. ✅ Points accumulate day over day
6. ✅ No race conditions or exploits
7. ✅ Works for all players simultaneously

---

## 📝 Production Deployment Checklist

Before going live:

- [ ] Run all test scenarios above
- [ ] Verify UTC time calculation is correct
- [ ] Set up cron job for actual midnight reset (optional)
- [ ] Monitor database for the first few days
- [ ] Check leaderboard rankings update correctly
- [ ] Test with multiple wallets/players
- [ ] Verify mobile browser compatibility
- [ ] Test during high traffic

---

## 🔧 Manual Reset (For Testing)

```bash
# Set to 5/5
cd backend
node set-max-games.js

# Clear all data
node clear-honey-points.js

# Test reset
node test-daily-reset.js
```

---

## 📊 Expected Behavior Summary

| Event | Games Played | Points Today | Total Points | Display |
|-------|--------------|--------------|--------------|---------|
| Start Day 1 | 0/5 | 0 | 0 | "5 games left" |
| Play 1 game | 1/5 | 8 | 8 | "4 games left" |
| Play 5 games | 5/5 | 40 | 40 | "Resets in..." |
| UTC Midnight | **0/5** | **0** | **40** | **"5 games left"** |
| Play 1 game | 1/5 | 8 | 48 | "4 games left" |
| Play 5 games | 5/5 | 40 | **80** | "Resets in..." |
| UTC Midnight | **0/5** | **0** | **80** | **"5 games left"** |

---

**System Status:** ✅ Ready for 100% comprehensive testing!
