-- Check if follows table has any data
-- Run this in Supabase SQL Editor

-- Count total follow relationships
SELECT COUNT(*) as total_follows FROM follows;

-- Show sample follow relationships (if any exist)
SELECT
  follower_wallet,
  following_wallet,
  created_at
FROM follows
ORDER BY created_at DESC
LIMIT 10;

-- Count follows for AWESOME AMY specifically
SELECT COUNT(*) as awesome_amy_followers
FROM follows
WHERE following_wallet = 'rrs87s...yNUn';

SELECT COUNT(*) as awesome_amy_following
FROM follows
WHERE follower_wallet = 'rrs87s...yNUn';
