-- =====================================================
-- MIGRATION: Time-Based Honey Points System
-- Changes from game-count to time-based tracking
-- =====================================================

-- 1. Drop old atomic function
DROP FUNCTION IF EXISTS atomic_game_play_v2(TEXT, TEXT, DATE, INTEGER, INTEGER);

-- 2. Drop the view that depends on honey_points columns (we'll recreate it later)
DROP VIEW IF EXISTS honey_points_leaderboard;

-- 3. Add new columns and modify existing columns in daily_game_plays table
ALTER TABLE daily_game_plays
  ADD COLUMN IF NOT EXISTS minutes_played NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 0;

-- Change points_earned from INTEGER to NUMERIC to support decimals (0.1 precision)
ALTER TABLE daily_game_plays
  ALTER COLUMN points_earned TYPE NUMERIC(10, 2);

-- Change honey_points columns from INTEGER to NUMERIC to support decimals
ALTER TABLE honey_points
  ALTER COLUMN total_points TYPE NUMERIC(10, 2),
  ALTER COLUMN games_points TYPE NUMERIC(10, 2),
  ALTER COLUMN raiding_points TYPE NUMERIC(10, 2);

-- 4. Recreate the leaderboard view with NUMERIC columns
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

-- Note: We keep plays_count for backwards compatibility but won't use it

-- 5. Create new atomic time-based function
CREATE OR REPLACE FUNCTION atomic_time_play(
  p_wallet TEXT,
  p_game TEXT,
  p_date DATE,
  p_max_minutes NUMERIC,
  p_minutes_played NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_minutes NUMERIC;
  v_total_pts NUMERIC;
  v_record_id UUID;
  v_points_to_award NUMERIC;
  v_remaining_minutes NUMERIC;
  v_actual_minutes NUMERIC;
BEGIN
  -- Lock THIS game's row for update to prevent race conditions
  SELECT id INTO v_record_id
  FROM daily_game_plays
  WHERE wallet_address = p_wallet
    AND game_id = p_game
    AND play_date = p_date
  FOR UPDATE;

  -- Calculate TOTAL minutes across ALL games for this wallet today
  SELECT COALESCE(SUM(minutes_played), 0) INTO v_total_minutes
  FROM daily_game_plays
  WHERE wallet_address = p_wallet
    AND play_date = p_date;

  -- Calculate remaining minutes
  v_remaining_minutes := p_max_minutes - v_total_minutes;

  -- If already at limit, reject immediately
  IF v_total_minutes >= p_max_minutes THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Daily limit reached! You can play again tomorrow.',
      'minutes_today', v_total_minutes,
      'max_minutes', p_max_minutes,
      'points_awarded', 0,
      'new_total_points', 0
    );
  END IF;

  -- Cap the minutes to remaining time (prevent going over 20)
  v_actual_minutes := LEAST(p_minutes_played, v_remaining_minutes);

  -- Round to 1 decimal place (0.1 precision)
  v_actual_minutes := ROUND(v_actual_minutes, 1);

  -- Calculate points (1 point per minute)
  v_points_to_award := v_actual_minutes;

  -- First time playing THIS specific game today - create new record
  IF v_record_id IS NULL THEN
    INSERT INTO daily_game_plays (
      wallet_address,
      game_id,
      play_date,
      minutes_played,
      points_earned,
      session_count,
      plays_count  -- Set to 1 for compatibility
    )
    VALUES (
      p_wallet,
      p_game,
      p_date,
      v_actual_minutes,
      v_points_to_award,
      1,
      1
    );

    -- Update or insert honey_points
    UPDATE honey_points
    SET
      total_points = COALESCE(total_points, 0) + v_points_to_award,
      games_points = COALESCE(games_points, 0) + v_points_to_award,
      updated_at = NOW()
    WHERE wallet_address = p_wallet
    RETURNING total_points INTO v_total_pts;

    IF v_total_pts IS NULL THEN
      INSERT INTO honey_points (wallet_address, total_points, games_points, raiding_points)
      VALUES (p_wallet, v_points_to_award, v_points_to_award, 0)
      RETURNING total_points INTO v_total_pts;
    END IF;

    -- Return with TOTAL minutes across all games
    RETURN json_build_object(
      'success', true,
      'message', 'You earned ' || ROUND(v_points_to_award, 1) || ' honey points!',
      'minutes_today', v_total_minutes + v_actual_minutes,
      'max_minutes', p_max_minutes,
      'points_awarded', v_points_to_award,
      'new_total_points', v_total_pts,
      'minutes_played', v_actual_minutes
    );
  END IF;

  -- Already played this game before today - increment the values
  UPDATE daily_game_plays
  SET
    minutes_played = minutes_played + v_actual_minutes,
    points_earned = points_earned + v_points_to_award,
    session_count = session_count + 1,
    updated_at = NOW()
  WHERE id = v_record_id;

  -- Update honey_points
  UPDATE honey_points
  SET
    total_points = COALESCE(total_points, 0) + v_points_to_award,
    games_points = COALESCE(games_points, 0) + v_points_to_award,
    updated_at = NOW()
  WHERE wallet_address = p_wallet
  RETURNING total_points INTO v_total_pts;

  IF v_total_pts IS NULL THEN
    INSERT INTO honey_points (wallet_address, total_points, games_points, raiding_points)
    VALUES (p_wallet, v_points_to_award, v_points_to_award, 0)
    RETURNING total_points INTO v_total_pts;
  END IF;

  -- Return with TOTAL minutes across all games
  RETURN json_build_object(
    'success', true,
    'message', 'You earned ' || ROUND(v_points_to_award, 1) || ' honey points!',
    'minutes_today', v_total_minutes + v_actual_minutes,
    'max_minutes', p_max_minutes,
    'points_awarded', v_points_to_award,
    'new_total_points', v_total_pts,
    'minutes_played', v_actual_minutes
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION atomic_time_play TO authenticated, anon, service_role;

-- =====================================================
-- Migration Complete!
-- Run this in Supabase SQL Editor
-- =====================================================
