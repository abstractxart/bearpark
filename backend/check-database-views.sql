-- Check for any database views that might have follower counts
SELECT
  table_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND (view_definition LIKE '%follow%' OR table_name LIKE '%follow%');

-- Also check all columns in the users table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Check the actual follows table to see if it has ANY data at all
SELECT COUNT(*) as total_follow_relationships FROM follows;

-- Get a sample of follow relationships if they exist
SELECT * FROM follows LIMIT 5;
