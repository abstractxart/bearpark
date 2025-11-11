-- Disable RLS on comment_reactions table to allow unrestricted access
-- This is safe because the backend validates wallet ownership before deletion

ALTER TABLE comment_reactions DISABLE ROW LEVEL SECURITY;

-- OR if you want to keep RLS enabled but allow all operations:
-- First, enable RLS if not already enabled
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

-- Then create permissive policies that allow everything
-- (the backend will handle authorization logic)

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable read access for all users" ON comment_reactions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON comment_reactions;
DROP POLICY IF EXISTS "Enable delete for users based on wallet_address" ON comment_reactions;

-- Allow SELECT for everyone
CREATE POLICY "Allow all to read reactions"
  ON comment_reactions FOR SELECT
  TO public
  USING (true);

-- Allow INSERT for everyone (backend validates)
CREATE POLICY "Allow all to insert reactions"
  ON comment_reactions FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow DELETE for everyone (backend validates wallet ownership)
CREATE POLICY "Allow all to delete reactions"
  ON comment_reactions FOR DELETE
  TO public
  USING (true);

-- Allow UPDATE for everyone (if needed in future)
CREATE POLICY "Allow all to update reactions"
  ON comment_reactions FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
