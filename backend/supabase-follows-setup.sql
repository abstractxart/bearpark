-- =====================================================
-- BEAR PARK FOLLOW SYSTEM
-- Twitter-style follow relationships with counts
-- =====================================================

-- Create follows table
CREATE TABLE IF NOT EXISTS follows (
  id BIGSERIAL PRIMARY KEY,
  follower_wallet TEXT NOT NULL,  -- The person who is following
  following_wallet TEXT NOT NULL, -- The person being followed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_wallet, following_wallet),
  -- Prevent self-follows
  CHECK (follower_wallet != following_wallet)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_follows_follower
  ON follows(follower_wallet);

CREATE INDEX IF NOT EXISTS idx_follows_following
  ON follows(following_wallet);

CREATE INDEX IF NOT EXISTS idx_follows_created_at
  ON follows(created_at DESC);

-- Enable Row Level Security
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Create policies for follows
-- Anyone can view follows
CREATE POLICY "Anyone can view follows"
  ON follows FOR SELECT
  USING (true);

-- Anyone can follow someone
CREATE POLICY "Anyone can follow"
  ON follows FOR INSERT
  WITH CHECK (true);

-- Users can only unfollow themselves
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (
    follower_wallet = current_setting('request.jwt.claims', true)::json->>'wallet'
  );

-- Grant permissions
GRANT ALL ON follows TO anon;
GRANT ALL ON follows TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE follows_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE follows_id_seq TO authenticated;

COMMENT ON TABLE follows IS 'Stores Twitter-style follow relationships between users';
COMMENT ON COLUMN follows.follower_wallet IS 'The wallet address of the person who is following';
COMMENT ON COLUMN follows.following_wallet IS 'The wallet address of the person being followed';
