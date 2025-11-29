-- Migration: Add lp_reward_forfeited column
-- Run this in Supabase SQL Editor

-- Add column to track forfeited LP rewards for blacklisted wallets
ALTER TABLE airdrop_snapshots
ADD COLUMN IF NOT EXISTS lp_reward_forfeited DECIMAL(20, 6) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN airdrop_snapshots.lp_reward_forfeited IS 'LP rewards that were forfeited due to blacklist (single-side deposit)';
