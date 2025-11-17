-- Delete BEAR PONG scores for Apex and oh hai
-- Run this in your Supabase SQL editor

-- Delete Apex's BEAR PONG scores (wallet ending in MUkT)
DELETE FROM game_leaderboards
WHERE wallet_address = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT'
AND game_id = 'bear-pong';

-- Delete oh hai's BEAR PONG scores (wallet ending in xXub)
DELETE FROM game_leaderboards
WHERE wallet_address = 'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub'
AND game_id = 'bear-pong';

-- Verify deletion - should show 0 rows for both wallets
SELECT
  wallet_address,
  game_id,
  score,
  metadata->>'wins' as wins,
  metadata->>'losses' as losses,
  metadata->>'display_name' as display_name
FROM game_leaderboards
WHERE wallet_address IN (
  'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub'
)
AND game_id = 'bear-pong';

-- Show remaining BEAR PONG leaderboard (Apex and oh hai should not be here)
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
