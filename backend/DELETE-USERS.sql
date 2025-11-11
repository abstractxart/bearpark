-- ========================================
-- DELETE SPECIFIC USERS FROM BEARPARK
-- ========================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cfdgdisaexvyrdjjcuss/sql/new
--
-- Users to delete:
-- - Yomama (ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY)
-- - ProductionTest (test456)
-- - Test User (test_wallet)
-- - TestUser (test123)
-- - PIRATE (rDy2nkjBcDFXgujtjo663szfcs561wgb98)
-- - Smarty pants (rBDvrd98rydzvqo7URuknR3m4eJt4bxXub)
-- - BG123 (rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4)
-- ========================================

-- First, let's see who we're deleting
SELECT 'Users to delete:' AS info;
SELECT display_name, wallet_address
FROM profiles
WHERE wallet_address IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

-- Now delete from all tables
-- 1. Delete from profiles
DELETE FROM profiles
WHERE wallet_address IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

-- 2. Delete from users
DELETE FROM users
WHERE wallet_address IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

-- 3. Delete from honey_points
DELETE FROM honey_points
WHERE wallet_address IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

-- 4. Delete from game_leaderboards
DELETE FROM game_leaderboards
WHERE wallet_address IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

-- 5. Delete from daily_game_plays
DELETE FROM daily_game_plays
WHERE wallet_address IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

-- 6. Delete from follows (as follower or following)
DELETE FROM follows
WHERE follower_wallet IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
)
OR following_wallet IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

-- Verification: Check if any users remain
SELECT 'Remaining users (should be 0):' AS info;
SELECT display_name, wallet_address
FROM profiles
WHERE wallet_address IN (
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',
  'test456',
  'test_wallet',
  'test123',
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'
);

SELECT '✅ DONE! Users deleted successfully' AS result;
