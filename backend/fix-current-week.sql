-- ============================================
-- FIX CURRENT MEME WEEK - Sunday 00:00 UTC Reset
-- Run this in Supabase SQL Editor to create a valid new week
-- ============================================

-- Step 1: Check current week status
SELECT
    id,
    week_start,
    week_end,
    NOW() as current_time,
    CASE
        WHEN NOW() > week_end THEN 'EXPIRED'
        ELSE 'ACTIVE'
    END as status
FROM public.meme_weeks
ORDER BY week_start DESC
LIMIT 1;

-- Step 2: Create a new week ending next Sunday at 00:00 UTC
DO $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_week_start TIMESTAMPTZ;
    v_week_end TIMESTAMPTZ;
    v_days_until_sunday INTEGER;
    v_current_dow INTEGER;
BEGIN
    -- Get current day of week in UTC (0=Sunday, 6=Saturday)
    v_current_dow := EXTRACT(DOW FROM v_now AT TIME ZONE 'UTC');

    -- Calculate days until next Sunday
    v_days_until_sunday := (7 - v_current_dow) % 7;
    IF v_days_until_sunday = 0 THEN
        v_days_until_sunday := 7; -- If it's Sunday, go to NEXT Sunday
    END IF;

    -- Set week start to now
    v_week_start := v_now;

    -- Calculate next Sunday at 00:00 UTC as week end
    v_week_end := DATE_TRUNC('day', (v_now AT TIME ZONE 'UTC') + (v_days_until_sunday || ' days')::INTERVAL) AT TIME ZONE 'UTC';

    RAISE NOTICE 'Creating new week: % to %', v_week_start, v_week_end;
    RAISE NOTICE 'Days until Sunday: %', v_days_until_sunday;

    -- Insert the new week
    INSERT INTO public.meme_weeks (week_start, week_end)
    VALUES (v_week_start, v_week_end);

    RAISE NOTICE 'New week created successfully!';
END $$;

-- Step 3: Verify the new week was created
SELECT
    id,
    week_start,
    week_end,
    NOW() as current_time,
    week_end - NOW() as time_remaining,
    CASE
        WHEN NOW() > week_end THEN 'EXPIRED'
        ELSE 'ACTIVE'
    END as status
FROM public.meme_weeks
ORDER BY week_start DESC
LIMIT 3;
