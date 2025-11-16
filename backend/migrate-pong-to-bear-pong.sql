-- Migrate BEAR PONG leaderboard data from old game_id to new game_id
-- Run this in your Supabase SQL editor

-- Step 1: Update all 'pong' entries to 'bear-pong'
UPDATE game_leaderboards
SET game_id = 'bear-pong'
WHERE game_id = 'pong';

-- Step 2: Verify migration worked
SELECT game_id, COUNT(*) as player_count, SUM(score) as total_wins
FROM game_leaderboards
WHERE game_id = 'bear-pong'
GROUP BY game_id;

-- Step 3: Show top 10 to verify data looks correct
SELECT
  wallet_address,
  score as total_wins,
  metadata->>'wins' as wins,
  metadata->>'losses' as losses,
  metadata->>'display_name' as display_name
FROM game_leaderboards
WHERE game_id = 'bear-pong'
ORDER BY score DESC
LIMIT 10;
