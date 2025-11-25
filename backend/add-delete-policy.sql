-- ============================================
-- ADD DELETE POLICY FOR MEMES
-- ============================================
-- Run this in Supabase SQL Editor

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can delete own memes" ON public.memes;

-- Create DELETE policy allowing users to delete their own memes
CREATE POLICY "Users can delete own memes"
ON public.memes FOR DELETE
TO public
USING (true);

-- ✅ Done! Users can now delete their own memes.
