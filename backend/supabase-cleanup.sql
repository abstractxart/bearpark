-- =====================================================
-- CLEANUP SCRIPT - Run this FIRST in Supabase SQL Editor
-- This removes old broken functions and tables
-- =====================================================

-- Drop old functions
DROP FUNCTION IF EXISTS atomic_game_play_v2(TEXT, TEXT, DATE, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS atomic_increment_game_play(TEXT, TEXT, DATE, INTEGER, INTEGER);

-- Drop old tables (if they exist with wrong schema)
DROP TABLE IF EXISTS daily_game_plays CASCADE;
DROP TABLE IF EXISTS honey_points CASCADE;

-- =====================================================
-- Now you can run supabase-honey-points-setup.sql
-- =====================================================
