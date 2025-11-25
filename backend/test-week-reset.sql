-- ============================================
-- TEST MEME WEEK RESET
-- ============================================
-- Run this in Supabase SQL Editor to test week reset

-- Step 1: Check current week
SELECT
  id,
  week_start,
  week_end,
  NOW() as current_time,
  CASE
    WHEN week_end < NOW() THEN '✅ Week has ended'
    ELSE '⏰ Week still active'
  END as status
FROM public.meme_weeks
ORDER BY week_start DESC
LIMIT 1;

-- Step 2: Force current week to end (FOR TESTING ONLY!)
-- This sets the week_end to 1 hour ago so you can test the reset
UPDATE public.meme_weeks
SET week_end = NOW() - INTERVAL '1 hour'
WHERE id = (
  SELECT id
  FROM public.meme_weeks
  ORDER BY week_start DESC
  LIMIT 1
);

-- Step 3: Verify the week has ended
SELECT
  id,
  week_start,
  week_end,
  NOW() as current_time,
  CASE
    WHEN week_end < NOW() THEN '✅ Week has ended - ready to reset!'
    ELSE '⏰ Week still active'
  END as status
FROM public.meme_weeks
ORDER BY week_start DESC
LIMIT 1;

-- ✅ Now call the reset endpoint:
-- POST https://bearpark.vercel.app/api/memes/reset-week
--
-- This will:
-- 1. Award top 3 memes their honey points (50, 35, 20)
-- 2. Create a new week starting next Monday
-- 3. Return details about winners
