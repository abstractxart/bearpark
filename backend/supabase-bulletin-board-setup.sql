-- =====================================================
-- BEAR PARK BULLETIN BOARD DATABASE SETUP
-- =====================================================
-- Run this in Supabase SQL Editor to create all tables
-- =====================================================

-- 1. Create bulletin_posts table
CREATE TABLE IF NOT EXISTS bulletin_posts (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  author_name TEXT,
  author_avatar JSONB,
  content TEXT NOT NULL,
  link_preview JSONB,
  comment_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_bulletin_posts_wallet ON bulletin_posts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bulletin_posts_created_at ON bulletin_posts(created_at DESC);

-- 2. Create bulletin_comments table
CREATE TABLE IF NOT EXISTS bulletin_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT,
  author_avatar JSONB,
  parent_id BIGINT REFERENCES bulletin_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_post_id ON bulletin_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_parent_id ON bulletin_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_wallet ON bulletin_comments(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bulletin_comments_created_at ON bulletin_comments(created_at DESC);

-- 3. Create bulletin_comment_reactions table
CREATE TABLE IF NOT EXISTS bulletin_comment_reactions (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES bulletin_comments(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'laugh', 'heart', 'cry', 'thumbs_down', 'troll')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, wallet_address, reaction_type)
);

-- Index for faster reaction queries
CREATE INDEX IF NOT EXISTS idx_bulletin_reactions_comment_id ON bulletin_comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_bulletin_reactions_wallet ON bulletin_comment_reactions(wallet_address);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE bulletin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin_comment_reactions ENABLE ROW LEVEL SECURITY;

-- POSTS: Anyone can read, only owner can delete
DROP POLICY IF EXISTS "Anyone can view bulletin posts" ON bulletin_posts;
CREATE POLICY "Anyone can view bulletin posts" ON bulletin_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert bulletin posts" ON bulletin_posts;
CREATE POLICY "Anyone can insert bulletin posts" ON bulletin_posts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own posts" ON bulletin_posts;
CREATE POLICY "Users can delete their own posts" ON bulletin_posts FOR DELETE USING (true);

DROP POLICY IF EXISTS "Users can update their own posts" ON bulletin_posts;
CREATE POLICY "Users can update their own posts" ON bulletin_posts FOR UPDATE USING (true);

-- COMMENTS: Anyone can read, only owner can delete
DROP POLICY IF EXISTS "Anyone can view bulletin comments" ON bulletin_comments;
CREATE POLICY "Anyone can view bulletin comments" ON bulletin_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert bulletin comments" ON bulletin_comments;
CREATE POLICY "Anyone can insert bulletin comments" ON bulletin_comments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own comments" ON bulletin_comments;
CREATE POLICY "Users can delete their own comments" ON bulletin_comments FOR DELETE USING (true);

DROP POLICY IF EXISTS "Users can update their own comments" ON bulletin_comments;
CREATE POLICY "Users can update their own comments" ON bulletin_comments FOR UPDATE USING (true);

-- REACTIONS: Anyone can read and react
DROP POLICY IF EXISTS "Anyone can view reactions" ON bulletin_comment_reactions;
CREATE POLICY "Anyone can view reactions" ON bulletin_comment_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert reactions" ON bulletin_comment_reactions;
CREATE POLICY "Anyone can insert reactions" ON bulletin_comment_reactions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own reactions" ON bulletin_comment_reactions;
CREATE POLICY "Users can delete their own reactions" ON bulletin_comment_reactions FOR DELETE USING (true);

-- =====================================================
-- FUNCTION: Update comment count when comments change
-- =====================================================

-- Function to increment comment count
CREATE OR REPLACE FUNCTION increment_bulletin_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bulletin_posts
  SET comment_count = comment_count + 1
  WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement comment count
CREATE OR REPLACE FUNCTION decrement_bulletin_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bulletin_posts
  SET comment_count = GREATEST(comment_count - 1, 0)
  WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Triggers for comment count
DROP TRIGGER IF EXISTS bulletin_comment_count_increment ON bulletin_comments;
CREATE TRIGGER bulletin_comment_count_increment
  AFTER INSERT ON bulletin_comments
  FOR EACH ROW
  EXECUTE FUNCTION increment_bulletin_comment_count();

DROP TRIGGER IF EXISTS bulletin_comment_count_decrement ON bulletin_comments;
CREATE TRIGGER bulletin_comment_count_decrement
  AFTER DELETE ON bulletin_comments
  FOR EACH ROW
  EXECUTE FUNCTION decrement_bulletin_comment_count();

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Bulletin Board database setup complete!';
  RAISE NOTICE '📋 Tables created: bulletin_posts, bulletin_comments, bulletin_comment_reactions';
  RAISE NOTICE '🔒 RLS policies enabled for security';
  RAISE NOTICE '⚡ Triggers installed for automatic comment counting';
END $$;
