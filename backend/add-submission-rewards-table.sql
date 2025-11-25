-- ============================================
-- TRACK MEME SUBMISSION REWARDS
-- ============================================
-- Run this in Supabase SQL Editor
-- Prevents users from deleting/re-uploading to get 50 points multiple times

-- Create table to track who received submission rewards
CREATE TABLE IF NOT EXISTS public.meme_submission_rewards (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  week_id BIGINT NOT NULL REFERENCES public.meme_weeks(id) ON DELETE CASCADE,
  rewarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wallet_address, week_id) -- One reward per user per week
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_submission_rewards_wallet_week
ON public.meme_submission_rewards(wallet_address, week_id);

-- Enable RLS
ALTER TABLE public.meme_submission_rewards ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Everyone can read submission rewards" ON public.meme_submission_rewards;
DROP POLICY IF EXISTS "System can insert submission rewards" ON public.meme_submission_rewards;

-- Everyone can read (to check if already rewarded)
CREATE POLICY "Everyone can read submission rewards"
ON public.meme_submission_rewards FOR SELECT
TO public
USING (true);

-- Anyone can insert (backend will handle logic)
CREATE POLICY "System can insert submission rewards"
ON public.meme_submission_rewards FOR INSERT
TO public
WITH CHECK (true);

-- ✅ Done! Submission rewards are now tracked per week.
