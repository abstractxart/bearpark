# 🎮 TIME-BASED HONEY POINTS SYSTEM - COMPLETE IMPLEMENTATION GUIDE

## 📊 SYSTEM OVERVIEW

**OLD SYSTEM:**
- 5 games per day
- 8 points per game
- 40 points max per day

**NEW SYSTEM:**
- 20 minutes per day
- 1 point per minute
- 0.1 point increments (per 6 seconds)
- 20 points max per day
- 10 second minimum session

---

## ✅ COMPLETED CHANGES

### 1. **Database Migration** (`supabase-time-based-migration.sql`)
- Created new atomic function: `atomic_time_play`
- Added columns: `minutes_played`, `session_count`
- Points calculated as: `minutes * 1.0`
- Precision: 1 decimal place (0.1 minutes)

### 2. **Backend Server** (`server.js`)
- Updated `/api/games/complete` endpoint
- Now accepts: `minutes_played` parameter
- Returns: `minutes_today`, `max_minutes`, `remaining_minutes`
- Minimum 10 seconds validation

### 3. **Daily Status Endpoint**
- Changed from games to minutes
- Returns: `minutes_today`, `max_minutes`, `remaining_minutes`

---

## 🚧 REMAINING TASKS

### 1. **Run Database Migration**
```bash
# Go to Supabase Dashboard > SQL Editor
# Run: backend/supabase-time-based-migration.sql
```

### 2. **Update game-points-helper.js**
- Add timer tracking functionality
- Track session start/end time
- Calculate minutes_played
- Send to /api/games/complete

### 3. **Update main.html**
- Change "GAME X/5" → "X.X/20 mins"
- Change "X games left" → "X.X mins left"
- Update progress bar calculations
- Update celebration messages

### 4. **Update Game Pages**
- Add session timer to all 3 games:
  - bear-ninja/index.html
  - flappy-bear/index.html
  - bear-jumpventure/index.html
- Track time from game start to game end
- Pass minutes to awardGamePoints()

### 5. **Update Test Scripts**
- backend/set-max-games.js → set-max-minutes.js
- backend/test-daily-reset.js (update for minutes)
- DAILY-RESET-TEST-GUIDE.md (update docs)

### 6. **Clear Production Data**
```bash
cd backend
node clear-honey-points.js
```

---

## 📝 IMPLEMENTATION STEPS

### STEP 1: Database Migration
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy/paste `supabase-time-based-migration.sql`
4. Click "Run"
5. Verify: `atomic_time_play` function exists

### STEP 2: Restart Backend
```bash
pm2 restart bearpark-api
```

### STEP 3: Update Frontend Files
- game-points-helper.js (time tracking)
- main.html (UI changes)
- All 3 game index.html files (timers)

### STEP 4: Clear Data & Test
```bash
cd backend
node clear-honey-points.js
```

### STEP 5: Test Flow
1. Play game for 1 minute
2. Check: earned 1.0 points
3. Play game for 30 seconds
4. Check: earned 0.5 points
5. Play until 20 minutes
6. Check: countdown appears

---

## 🎯 KEY CHANGES SUMMARY

| Aspect | Old | New |
|--------|-----|-----|
| **Limit Type** | 5 games | 20 minutes |
| **Point Value** | 8 per game | 1 per minute |
| **Max Daily** | 40 points | 20 points |
| **Increment** | 8 (whole game) | 0.1 (per 6 sec) |
| **Display** | "3/5 games" | "10.5/20 mins" |
| **Remaining** | "2 games left" | "9.5 mins left" |
| **Celebration** | "5/5 GAMES" | "20/20 MINUTES" |

---

## ⚠️ BREAKING CHANGES

- `/api/games/complete` now requires `minutes_played`
- Response changed: `plays_today` → `minutes_today`
- `awardGamePoints(gameId)` → `awardGamePoints(gameId, minutesPlayed)`
- All existing data will be cleared

---

## 🔧 NEXT ACTIONS

1. Run database migration in Supabase
2. I'll update all frontend files
3. I'll update test scripts
4. We'll test everything together

**Ready to proceed?**
