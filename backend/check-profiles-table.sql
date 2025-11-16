-- Check if profiles table has follower/following counts stored
SELECT
  wallet_address,
  display_name,
  followers_count,
  following_count
FROM profiles
WHERE wallet_address = 'rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn'
LIMIT 1;

-- Also check the table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name LIKE '%follow%';
