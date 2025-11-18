-- =====================================================
-- BEAR PARK BULLETIN POST REACTIONS SETUP
-- =====================================================
-- Run this in Supabase SQL Editor to add post reactions
-- =====================================================

-- Create bulletin_post_reactions table
CREATE TABLE IF NOT EXISTS bulletin_post_reactions (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'laugh', 'heart', 'cry', 'thumbs_down', 'troll')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, wallet_address, reaction_type)
);

-- Index for faster reaction queries
CREATE INDEX IF NOT EXISTS idx_bulletin_post_reactions_post_id ON bulletin_post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_post_reactions_wallet ON bulletin_post_reactions(wallet_address);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE bulletin_post_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can view reactions
DROP POLICY IF EXISTS "Anyone can view post reactions" ON bulletin_post_reactions;
CREATE POLICY "Anyone can view post reactions" ON bulletin_post_reactions FOR SELECT USING (true);

-- Anyone can insert reactions
DROP POLICY IF EXISTS "Anyone can insert post reactions" ON bulletin_post_reactions;
CREATE POLICY "Anyone can insert post reactions" ON bulletin_post_reactions FOR INSERT WITH CHECK (true);

-- Users can delete their own reactions
DROP POLICY IF EXISTS "Users can delete their own post reactions" ON bulletin_post_reactions;
CREATE POLICY "Users can delete their own post reactions" ON bulletin_post_reactions FOR DELETE USING (true);

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Bulletin post reactions table created!';
  RAISE NOTICE '📋 Table: bulletin_post_reactions';
  RAISE NOTICE '🔒 RLS policies enabled for security';
END $$;
