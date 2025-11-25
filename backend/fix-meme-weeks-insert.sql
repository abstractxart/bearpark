-- ============================================
-- FIX MEME_WEEKS INSERT POLICY
-- ============================================
-- Run this in Supabase SQL Editor

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "System can create new weeks" ON public.meme_weeks;

-- Allow inserting new weeks (needed for week reset)
CREATE POLICY "System can create new weeks"
ON public.meme_weeks FOR INSERT
TO public
WITH CHECK (true);

-- Verify policies
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'meme_weeks'
ORDER BY cmd;

-- ✅ Done! Week reset should now work.
