-- =====================================================
-- BEAR Park Points System - Database Schema
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Table 1: Users (wallet to Twitter mapping)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(50) UNIQUE NOT NULL,
  twitter_username VARCHAR(50),
  twitter_user_id VARCHAR(50) UNIQUE,
  twitter_access_token TEXT,
  twitter_refresh_token TEXT,
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: Tweets (track all point-earning tweets)
CREATE TABLE IF NOT EXISTS tweets (
  id BIGSERIAL PRIMARY KEY,
  tweet_id VARCHAR(50) UNIQUE NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(50) REFERENCES users(wallet_address),
  twitter_username VARCHAR(50),
  tweet_text TEXT,
  tweet_url VARCHAR(500),
  points_awarded INTEGER DEFAULT 10,
  is_raid BOOLEAN DEFAULT FALSE,
  raid_id BIGINT REFERENCES raids(id) ON DELETE SET NULL,
  processed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 3: Raids (Discord raid tracking)
CREATE TABLE IF NOT EXISTS raids (
  id BIGSERIAL PRIMARY KEY,
  raid_title VARCHAR(200),
  raid_url VARCHAR(500),
  raid_description TEXT,
  target_account VARCHAR(50),
  points_per_participation INTEGER DEFAULT 20,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(50), -- admin wallet address
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 4: Point Transactions (detailed point history)
CREATE TABLE IF NOT EXISTS point_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(50) REFERENCES users(wallet_address),
  points_change INTEGER NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'tweet', 'raid', 'bonus', 'redemption'
  reference_id BIGINT, -- tweet_id or raid_id
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 5: Pending Tweets (tweets before user connects wallet)
CREATE TABLE IF NOT EXISTS pending_tweets (
  id BIGSERIAL PRIMARY KEY,
  tweet_id VARCHAR(50) UNIQUE NOT NULL,
  twitter_username VARCHAR(50) NOT NULL,
  twitter_user_id VARCHAR(50),
  tweet_text TEXT,
  tweet_url VARCHAR(500),
  points_pending INTEGER DEFAULT 10,
  is_raid BOOLEAN DEFAULT FALSE,
  raid_id BIGINT REFERENCES raids(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claimed BOOLEAN DEFAULT FALSE,
  claimed_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- INDEXES for better performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_twitter_id ON users(twitter_user_id);
CREATE INDEX IF NOT EXISTS idx_tweets_user ON tweets(user_id);
CREATE INDEX IF NOT EXISTS idx_tweets_wallet ON tweets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raids_active ON raids(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pending_username ON pending_tweets(twitter_username);
CREATE INDEX IF NOT EXISTS idx_pending_unclaimed ON pending_tweets(claimed) WHERE claimed = FALSE;

-- =====================================================
-- FUNCTIONS for automatic timestamp updates
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS for common queries
-- =====================================================

-- Leaderboard view
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  u.wallet_address,
  u.twitter_username,
  u.total_points,
  COUNT(t.id) as tweet_count,
  RANK() OVER (ORDER BY u.total_points DESC) as rank
FROM users u
LEFT JOIN tweets t ON u.id = t.user_id
GROUP BY u.id, u.wallet_address, u.twitter_username, u.total_points
ORDER BY u.total_points DESC;

-- Recent activity view
CREATE OR REPLACE VIEW recent_activity AS
SELECT
  pt.wallet_address,
  pt.transaction_type,
  pt.points_change,
  pt.description,
  pt.created_at,
  u.twitter_username
FROM point_transactions pt
JOIN users u ON pt.user_id = u.id
ORDER BY pt.created_at DESC
LIMIT 100;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Optional but recommended
-- =====================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_tweets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (true); -- Public read for leaderboard

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Policy: Anyone can read tweets (for leaderboard)
CREATE POLICY "Tweets are viewable by everyone" ON tweets
  FOR SELECT USING (true);

-- Policy: Point transactions viewable by owner
CREATE POLICY "Users can view own transactions" ON point_transactions
  FOR SELECT USING (
    wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    OR true -- Allow public read for now
  );

-- =====================================================
-- SEED DATA (for testing)
-- =====================================================

-- Insert a test user (you can remove this later)
INSERT INTO users (wallet_address, twitter_username, twitter_user_id, total_points)
VALUES ('rTESTwallet123', 'test_user', '123456789', 50)
ON CONFLICT (wallet_address) DO NOTHING;

-- Insert a test active raid
INSERT INTO raids (raid_title, raid_url, target_account, is_active, created_by)
VALUES (
  'Test Raid - Like and Retweet!',
  'https://twitter.com/bearxrpl/status/123456',
  '@bearxrpl',
  TRUE,
  'admin'
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- USEFUL QUERIES (for admin)
-- =====================================================

-- Check total users
-- SELECT COUNT(*) as total_users FROM users;

-- Check total points distributed
-- SELECT SUM(total_points) as total_points_distributed FROM users;

-- Top 10 users
-- SELECT * FROM leaderboard LIMIT 10;

-- Recent tweets (last 24 hours)
-- SELECT * FROM tweets WHERE created_at > NOW() - INTERVAL '24 hours';

-- Active raids
-- SELECT * FROM raids WHERE is_active = TRUE;

-- Unclaimed pending tweets
-- SELECT COUNT(*) FROM pending_tweets WHERE claimed = FALSE;

-- =====================================================
-- PROFILES & GAME LEADERBOARDS
-- =====================================================

-- Table: User Profiles (NFT avatars and display names)
CREATE TABLE IF NOT EXISTS profiles (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_nft TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: Game Leaderboards (high scores for games)
CREATE TABLE IF NOT EXISTS game_leaderboards (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(50) NOT NULL,
  game_id VARCHAR(100) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One high score per wallet per game
  UNIQUE(wallet_address, game_id)
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);

-- Indexes for game leaderboards
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_game ON game_leaderboards(game_id);
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_score ON game_leaderboards(game_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_wallet ON game_leaderboards(wallet_address);

-- Enable RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (true);

-- Enable RLS for game leaderboards
ALTER TABLE game_leaderboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game leaderboards are viewable by everyone" ON game_leaderboards
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their scores" ON game_leaderboards
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their scores" ON game_leaderboards
  FOR UPDATE USING (true);

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_leaderboards_updated_at BEFORE UPDATE ON game_leaderboards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View: Game leaderboard with profile info and Twitter username
CREATE OR REPLACE VIEW game_leaderboard_with_profiles AS
SELECT
  gl.id,
  gl.wallet_address,
  gl.game_id,
  gl.score,
  gl.metadata,
  gl.created_at,
  gl.updated_at,
  p.display_name,
  p.avatar_nft,
  u.twitter_username,
  RANK() OVER (PARTITION BY gl.game_id ORDER BY gl.score DESC) as rank
FROM game_leaderboards gl
LEFT JOIN profiles p ON gl.wallet_address = p.wallet_address
LEFT JOIN users u ON gl.wallet_address = u.wallet_address
ORDER BY gl.game_id, gl.score DESC;

-- =====================================================
-- DONE! Your database is ready.
-- =====================================================
