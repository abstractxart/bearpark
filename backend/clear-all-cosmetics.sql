-- Clear all cosmetic items from all users for fresh testing
-- Run this in Supabase SQL Editor

-- Delete all user cosmetic purchases
DELETE FROM user_cosmetics;

-- Verify everything is cleared
SELECT
  (SELECT COUNT(*) FROM user_cosmetics) as remaining_cosmetics;
