-- =====================================================
-- BEAR PARK COMMENT REACTIONS SYSTEM
-- Adds Facebook/Discord-style reactions to comments
-- =====================================================

-- Create comment_reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES profile_comments(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'laugh', 'heart', 'cry', 'thumbs_down', 'troll')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, wallet_address, reaction_type)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id
  ON comment_reactions(comment_id);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_wallet
  ON comment_reactions(wallet_address);

-- Enable Row Level Security
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

-- Create policies for comment_reactions
-- Anyone can read reactions
CREATE POLICY "Anyone can view reactions"
  ON comment_reactions FOR SELECT
  USING (true);

-- Anyone can add reactions
CREATE POLICY "Anyone can add reactions"
  ON comment_reactions FOR INSERT
  WITH CHECK (true);

-- Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
  ON comment_reactions FOR DELETE
  USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet');

-- Grant permissions
GRANT ALL ON comment_reactions TO anon;
GRANT ALL ON comment_reactions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE comment_reactions_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE comment_reactions_id_seq TO authenticated;

COMMENT ON TABLE comment_reactions IS 'Stores reactions (like, laugh, heart, etc.) on profile comments';
COMMENT ON COLUMN comment_reactions.reaction_type IS 'Type of reaction: like, laugh, heart, cry, thumbs_down, troll';
