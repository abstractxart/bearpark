-- =====================================================
-- BEAR PARK PROFILE SYSTEM SETUP
-- Adds bio column and comments system to profiles
-- =====================================================

-- Add bio column to profiles table if it doesn't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Create profile_comments table
CREATE TABLE IF NOT EXISTS profile_comments (
  id BIGSERIAL PRIMARY KEY,
  profile_wallet TEXT NOT NULL,  -- The wallet whose profile is being commented on
  commenter_wallet TEXT NOT NULL, -- The wallet of the person commenting
  commenter_name TEXT,            -- Display name of commenter (cached)
  commenter_avatar TEXT,          -- Avatar of commenter (cached)
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profile_comments_profile_wallet
  ON profile_comments(profile_wallet);

CREATE INDEX IF NOT EXISTS idx_profile_comments_commenter_wallet
  ON profile_comments(commenter_wallet);

CREATE INDEX IF NOT EXISTS idx_profile_comments_created_at
  ON profile_comments(created_at DESC);

-- Enable Row Level Security
ALTER TABLE profile_comments ENABLE ROW LEVEL SECURITY;

-- Create policies for profile_comments
-- Anyone can read comments
CREATE POLICY "Anyone can view comments"
  ON profile_comments FOR SELECT
  USING (true);

-- Anyone can post comments (authenticated users in your app)
CREATE POLICY "Anyone can post comments"
  ON profile_comments FOR INSERT
  WITH CHECK (true);

-- Users can delete their own comments or comments on their profile
CREATE POLICY "Users can delete own comments or comments on their profile"
  ON profile_comments FOR DELETE
  USING (
    commenter_wallet = current_setting('request.jwt.claims', true)::json->>'wallet'
    OR profile_wallet = current_setting('request.jwt.claims', true)::json->>'wallet'
  );

-- Grant permissions
GRANT ALL ON profile_comments TO anon;
GRANT ALL ON profile_comments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE profile_comments_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE profile_comments_id_seq TO authenticated;

-- Create admin_users table for tracking admins and mods
CREATE TABLE IF NOT EXISTS admin_users (
  wallet_address TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'mod', 'owner')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Anyone can read admin status (needed for checking permissions)
CREATE POLICY "Anyone can view admin status"
  ON admin_users FOR SELECT
  USING (true);

GRANT SELECT ON admin_users TO anon;
GRANT SELECT ON admin_users TO authenticated;

-- Insert initial admin/owner (replace with actual wallet address)
-- INSERT INTO admin_users (wallet_address, role)
-- VALUES ('rYourWalletAddressHere', 'owner')
-- ON CONFLICT (wallet_address) DO NOTHING;

COMMENT ON TABLE profile_comments IS 'Stores comments on user profiles';
COMMENT ON TABLE admin_users IS 'Tracks admin, mod, and owner roles for permission management';
COMMENT ON COLUMN profiles.bio IS 'User biography text for profile page';
