-- =====================================================
-- BEAR Park Honey Points Database Setup
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create honey_points table
CREATE TABLE IF NOT EXISTS honey_points (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) UNIQUE NOT NULL,
  total_points INTEGER DEFAULT 0,
  raiding_points INTEGER DEFAULT 0,
  games_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create daily_game_plays table (tracks daily game limit per user)
CREATE TABLE IF NOT EXISTS daily_game_plays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  game_id VARCHAR(100) NOT NULL,
  play_date DATE NOT NULL,
  plays_count INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wallet_address, game_id, play_date)
);

-- 3. Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_honey_points_wallet ON honey_points(wallet_address);
CREATE INDEX IF NOT EXISTS idx_honey_points_total ON honey_points(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_daily_plays_wallet_game_date ON daily_game_plays(wallet_address, game_id, play_date);

-- 4. Create view that joins honey_points with profiles
CREATE OR REPLACE VIEW honey_points_leaderboard AS
SELECT
  hp.wallet_address,
  hp.total_points,
  hp.raiding_points,
  hp.games_points,
  hp.updated_at,
  p.display_name,
  p.avatar_nft
FROM
  honey_points hp
LEFT JOIN
  profiles p ON hp.wallet_address = p.wallet_address
ORDER BY
  hp.total_points DESC;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE honey_points ENABLE ROW LEVEL SECURITY;

-- 6. Create policies to allow reading
CREATE POLICY "Allow public read access to honey_points"
  ON honey_points
  FOR SELECT
  USING (true);

-- 7. Create policy to allow inserts/updates from backend
CREATE POLICY "Allow insert/update to honey_points"
  ON honey_points
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 8. Atomic Game Play Increment Function V2
-- This prevents race condition exploits
-- Returns JSON for easier backend integration
-- =====================================================

DROP FUNCTION IF EXISTS atomic_game_play_v2(TEXT, TEXT, DATE, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION atomic_game_play_v2(
  p_wallet TEXT,
  p_game TEXT,
  p_date DATE,
  p_max INTEGER,
  p_points INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_plays INTEGER;
  v_total_plays_all_games INTEGER;
  v_total_pts INTEGER;
  v_record_id UUID;
BEGIN
  -- Lock THIS game's row for update to prevent race conditions
  SELECT id, plays_count INTO v_record_id, v_plays
  FROM daily_game_plays
  WHERE wallet_address = p_wallet
    AND game_id = p_game
    AND play_date = p_date
  FOR UPDATE;

  -- Calculate TOTAL plays across ALL games for this wallet today
  SELECT COALESCE(SUM(plays_count), 0) INTO v_total_plays_all_games
  FROM daily_game_plays
  WHERE wallet_address = p_wallet
    AND play_date = p_date;

  -- If already at limit, reject immediately
  IF v_total_plays_all_games >= p_max THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Daily limit reached! You can play again tomorrow.',
      'plays_today', v_total_plays_all_games,
      'max_plays', p_max,
      'points_awarded', 0,
      'new_total_points', 0
    );
  END IF;

  -- First time playing THIS specific game today - create new record
  IF v_record_id IS NULL THEN
    INSERT INTO daily_game_plays (wallet_address, game_id, play_date, plays_count, points_earned)
    VALUES (p_wallet, p_game, p_date, 1, p_points);

    -- Update or insert honey_points
    UPDATE honey_points
    SET
      total_points = COALESCE(total_points, 0) + p_points,
      games_points = COALESCE(games_points, 0) + p_points,
      updated_at = NOW()
    WHERE wallet_address = p_wallet
    RETURNING total_points INTO v_total_pts;

    IF v_total_pts IS NULL THEN
      INSERT INTO honey_points (wallet_address, total_points, games_points, raiding_points)
      VALUES (p_wallet, p_points, p_points, 0)
      RETURNING total_points INTO v_total_pts;
    END IF;

    -- Return with TOTAL plays across all games
    RETURN json_build_object(
      'success', true,
      'message', 'Game completed! You earned ' || p_points || ' honey points.',
      'plays_today', v_total_plays_all_games + 1,
      'max_plays', p_max,
      'points_awarded', p_points,
      'new_total_points', v_total_pts
    );
  END IF;

  -- Already played this game before today - increment the counter
  UPDATE daily_game_plays
  SET
    plays_count = v_plays + 1,
    points_earned = points_earned + p_points,
    updated_at = NOW()
  WHERE id = v_record_id;

  -- Update honey_points
  UPDATE honey_points
  SET
    total_points = COALESCE(total_points, 0) + p_points,
    games_points = COALESCE(games_points, 0) + p_points,
    updated_at = NOW()
  WHERE wallet_address = p_wallet
  RETURNING total_points INTO v_total_pts;

  IF v_total_pts IS NULL THEN
    INSERT INTO honey_points (wallet_address, total_points, games_points, raiding_points)
    VALUES (p_wallet, p_points, p_points, 0)
    RETURNING total_points INTO v_total_pts;
  END IF;

  -- Return with TOTAL plays across all games
  RETURN json_build_object(
    'success', true,
    'message', 'Game completed! You earned ' || p_points || ' honey points.',
    'plays_today', v_total_plays_all_games + 1,
    'max_plays', p_max,
    'points_awarded', p_points,
    'new_total_points', v_total_pts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION atomic_game_play_v2 TO authenticated, anon, service_role;

-- =====================================================
-- 9. Legacy Function (kept for reference, not used)
-- =====================================================

CREATE OR REPLACE FUNCTION atomic_increment_game_play(
  p_wallet_address TEXT,
  p_game_id TEXT,
  p_play_date DATE,
  p_max_daily_games INTEGER,
  p_points_per_game INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  plays_today INTEGER,
  max_plays INTEGER,
  points_awarded INTEGER,
  new_total_points INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_plays INTEGER;
  v_current_points INTEGER;
  v_new_plays INTEGER;
  v_new_points_earned INTEGER;
  v_total_honey_points INTEGER;
  v_record_id UUID;
BEGIN
  -- Start transaction with row-level locking to prevent race conditions
  -- FOR UPDATE locks the row, preventing concurrent updates

  -- Try to get existing daily record with lock
  SELECT id, plays_count, points_earned
  INTO v_record_id, v_current_plays, v_current_points
  FROM daily_game_plays
  WHERE wallet_address = p_wallet_address
    AND game_id = p_game_id
    AND play_date = p_play_date
  FOR UPDATE; -- Wait for lock if another transaction has it

  -- If record doesn't exist, this is the FIRST play today
  IF v_record_id IS NULL THEN
    INSERT INTO daily_game_plays (wallet_address, game_id, play_date, plays_count, points_earned)
    VALUES (p_wallet_address, p_game_id, p_play_date, 1, p_points_per_game)
    RETURNING id INTO v_record_id;

    -- Update honey_points for first play
    UPDATE honey_points
    SET
      total_points = COALESCE(total_points, 0) + p_points_per_game,
      games_points = COALESCE(games_points, 0) + p_points_per_game,
      updated_at = NOW()
    WHERE wallet_address = p_wallet_address
    RETURNING total_points INTO v_total_honey_points;

    -- If honey_points record doesn't exist, create it
    IF v_total_honey_points IS NULL THEN
      INSERT INTO honey_points (wallet_address, total_points, raiding_points, games_points)
      VALUES (p_wallet_address, p_points_per_game, 0, p_points_per_game)
      RETURNING total_points INTO v_total_honey_points;
    END IF;

    -- Return success for first play (1/5)
    RETURN QUERY SELECT
      true::BOOLEAN,
      format('Game completed! You earned %s honey points.', p_points_per_game)::TEXT,
      1::INTEGER,
      p_max_daily_games::INTEGER,
      p_points_per_game::INTEGER,
      v_total_honey_points::INTEGER;

    RETURN; -- Early exit - don't continue to increment logic
  END IF;

  -- Record exists - check if daily limit already reached
  IF v_current_plays >= p_max_daily_games THEN
    RETURN QUERY SELECT
      false::BOOLEAN,
      'Daily limit reached! You can play again tomorrow.'::TEXT,
      v_current_plays::INTEGER,
      p_max_daily_games::INTEGER,
      0::INTEGER,
      0::INTEGER;
    RETURN;
  END IF;

  -- Atomically increment plays and points (for plays 2-5)
  v_new_plays := v_current_plays + 1;
  v_new_points_earned := v_current_points + p_points_per_game;

  UPDATE daily_game_plays
  SET
    plays_count = v_new_plays,
    points_earned = v_new_points_earned,
    updated_at = NOW()
  WHERE id = v_record_id;

  -- Also update honey_points table atomically
  UPDATE honey_points
  SET
    total_points = COALESCE(total_points, 0) + p_points_per_game,
    games_points = COALESCE(games_points, 0) + p_points_per_game,
    updated_at = NOW()
  WHERE wallet_address = p_wallet_address
  RETURNING total_points INTO v_total_honey_points;

  -- If honey_points record doesn't exist, create it
  IF v_total_honey_points IS NULL THEN
    INSERT INTO honey_points (wallet_address, total_points, raiding_points, games_points)
    VALUES (p_wallet_address, p_points_per_game, 0, p_points_per_game)
    RETURNING total_points INTO v_total_honey_points;
  END IF;

  -- Return success result (plays 2-5)
  RETURN QUERY SELECT
    true::BOOLEAN,
    format('Game completed! You earned %s honey points.', p_points_per_game)::TEXT,
    v_new_plays::INTEGER,
    p_max_daily_games::INTEGER,
    p_points_per_game::INTEGER,
    v_total_honey_points::INTEGER;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION atomic_increment_game_play TO authenticated, anon, service_role;

-- =====================================================
-- Setup Complete!
-- =====================================================
