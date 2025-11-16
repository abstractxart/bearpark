-- Delete specific players' BEAR PONG scores
-- Run this in your Supabase SQL editor

-- Delete Apex's score
DELETE FROM game_leaderboards
WHERE wallet_address = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT'
AND game_id IN ('pong', 'bear-pong');

-- Delete TEST123's score
DELETE FROM game_leaderboards
WHERE wallet_address = 'rGRuuisahMW6pcWMLVFP1Qtb7YieN5oVR6'
AND game_id IN ('pong', 'bear-pong');

-- Delete oh hai's score
DELETE FROM game_leaderboards
WHERE wallet_address = 'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub'
AND game_id IN ('pong', 'bear-pong');

-- Verify deletion - should show 0 rows
SELECT wallet_address, game_id, score, metadata->>'display_name' as display_name
FROM game_leaderboards
WHERE wallet_address IN (
  'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT',
  'rGRuuisahMW6pcWMLVFP1Qtb7YieN5oVR6',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub'
)
AND game_id IN ('pong', 'bear-pong');

-- Show remaining BEAR PONG leaderboard
SELECT
  wallet_address,
  score as total_wins,
  metadata->>'wins' as wins,
  metadata->>'losses' as losses,
  metadata->>'display_name' as display_name
FROM game_leaderboards
WHERE game_id IN ('pong', 'bear-pong')
ORDER BY score DESC
LIMIT 10;
