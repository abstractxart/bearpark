-- BEARPARK PERFORMANCE OPTIMIZATION - Database Indexes
-- Run this in Supabase SQL Editor to massively speed up database queries
-- Expected impact: 10-100x faster queries, especially as user base grows

-- ===================================================================
-- CRITICAL INDEXES - These will have the biggest performance impact
-- ===================================================================

-- Index on profiles.wallet_address (used in every profile lookup)
CREATE INDEX IF NOT EXISTS idx_profiles_wallet
ON profiles(wallet_address);

-- Index on honey_points.wallet_address (used in points fetching)
CREATE INDEX IF NOT EXISTS idx_honey_points_wallet
ON honey_points(wallet_address);

-- Composite index on honey_points for leaderboard queries (total_points + wallet)
CREATE INDEX IF NOT EXISTS idx_honey_points_leaderboard
ON honey_points(total_points DESC, wallet_address);

-- Index on users.wallet_address (general user lookups)
CREATE INDEX IF NOT EXISTS idx_users_wallet
ON users(wallet_address);

-- ===================================================================
-- GAME LEADERBOARD INDEXES
-- ===================================================================

-- Index on game_leaderboards.game_id (used when fetching game-specific leaderboards)
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_game_id
ON game_leaderboards(game_id);

-- Composite index for user's game scores (wallet + game lookup)
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_wallet_game
ON game_leaderboards(wallet_address, game_id);

-- Composite index for game leaderboard sorting (game + score)
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_game_score
ON game_leaderboards(game_id, score DESC);

-- ===================================================================
-- RAID SYSTEM INDEXES
-- ===================================================================

-- Index on raids.is_active (filter active raids quickly)
CREATE INDEX IF NOT EXISTS idx_raids_active
ON raids(is_active, expires_at);

-- Index on raid_completions.wallet_address (check if user completed raid)
CREATE INDEX IF NOT EXISTS idx_raid_completions_wallet
ON raid_completions(wallet_address);

-- Composite index for raid completion checks (wallet + raid)
CREATE INDEX IF NOT EXISTS idx_raid_completions_wallet_raid
ON raid_completions(wallet_address, raid_id);

-- Index on raid_completions.raid_id (get all completions for a raid)
CREATE INDEX IF NOT EXISTS idx_raid_completions_raid_id
ON raid_completions(raid_id);

-- ===================================================================
-- COSMETICS SYSTEM INDEXES
-- ===================================================================

-- Index on user_cosmetics.wallet_address (fetch user's cosmetics inventory)
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_wallet
ON user_cosmetics(wallet_address);

-- Composite index for ownership checks (wallet + cosmetic)
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_wallet_cosmetic
ON user_cosmetics(wallet_address, cosmetic_id);

-- Index on cosmetics_transactions.wallet_address (transaction history)
CREATE INDEX IF NOT EXISTS idx_cosmetics_transactions_wallet
ON cosmetics_transactions(wallet_address);

-- ===================================================================
-- SOCIAL SYSTEM INDEXES
-- ===================================================================

-- Index on follows.follower_wallet (get who a user is following)
CREATE INDEX IF NOT EXISTS idx_follows_follower
ON follows(follower_wallet);

-- Index on follows.following_wallet (get a user's followers)
CREATE INDEX IF NOT EXISTS idx_follows_following
ON follows(following_wallet);

-- Composite index for follow relationship checks
CREATE INDEX IF NOT EXISTS idx_follows_relationship
ON follows(follower_wallet, following_wallet);

-- ===================================================================
-- NOTIFICATION SYSTEM INDEXES
-- ===================================================================

-- Index on notifications.wallet_address (fetch user's notifications)
CREATE INDEX IF NOT EXISTS idx_notifications_wallet
ON notifications(wallet_address);

-- Composite index for unread notifications (wallet + read status)
CREATE INDEX IF NOT EXISTS idx_notifications_wallet_read
ON notifications(wallet_address, is_read);

-- Index on notifications.created_at (sort by newest)
CREATE INDEX IF NOT EXISTS idx_notifications_created
ON notifications(created_at DESC);

-- ===================================================================
-- VERIFICATION QUERIES
-- ===================================================================

-- After running the above, verify indexes were created:
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check index sizes (larger = more data being indexed = bigger performance gain):
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname LIKE 'idx_%'
ORDER BY pg_relation_size(indexrelid) DESC;
