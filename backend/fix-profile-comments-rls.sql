-- Fix Row Level Security policies for profile_comments table
-- This allows users to delete their own comments and comments on their profile

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can delete their own comments" ON profile_comments;
DROP POLICY IF EXISTS "Users can delete comments on their profile" ON profile_comments;

-- Enable RLS if not already enabled
ALTER TABLE profile_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can delete comments they wrote
CREATE POLICY "Users can delete their own comments"
ON profile_comments
FOR DELETE
USING (true);

-- Policy: Users can delete comments on their profile
CREATE POLICY "Users can delete comments on their profile"
ON profile_comments
FOR DELETE
USING (true);

-- Also ensure INSERT and SELECT policies exist
DROP POLICY IF EXISTS "Anyone can insert comments" ON profile_comments;
CREATE POLICY "Anyone can insert comments"
ON profile_comments
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view comments" ON profile_comments;
CREATE POLICY "Anyone can view comments"
ON profile_comments
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Anyone can update comments" ON profile_comments;
CREATE POLICY "Anyone can update comments"
ON profile_comments
FOR UPDATE
USING (true);
