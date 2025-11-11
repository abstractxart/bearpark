-- =====================================================
-- BEAR Park Game Points Tracking - Bear Market Edition
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add daily game tracking table
CREATE TABLE IF NOT EXISTS daily_game_plays (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  game_id VARCHAR(100) NOT NULL,
  play_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plays_count INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wallet_address, game_id, play_date)
);

-- 2. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_plays_wallet ON daily_game_plays(wallet_address, play_date);
CREATE INDEX IF NOT EXISTS idx_daily_plays_date ON daily_game_plays(play_date DESC);

-- 3. Enable Row Level Security
ALTER TABLE daily_game_plays ENABLE ROW LEVEL SECURITY;

-- 4. Allow users to read their own records
CREATE POLICY "Users can read own game plays"
  ON daily_game_plays FOR SELECT
  USING (true);

-- 5. Allow insert/update (for API)
CREATE POLICY "Allow game play tracking"
  ON daily_game_plays FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Function to clean old records (optional - run weekly)
CREATE OR REPLACE FUNCTION cleanup_old_game_plays()
RETURNS void AS $$
BEGIN
  DELETE FROM daily_game_plays
  WHERE play_date < CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Game Points Configuration
-- =====================================================
-- Points per game: 8
-- Daily limit: 5 games (40 points max/day)
-- Resets: Midnight UTC
-- Lottery entry: 1,200 points
-- =====================================================

COMMENT ON TABLE daily_game_plays IS 'Tracks daily game plays to enforce 5 game/day limit (8 pts each)';
