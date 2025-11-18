-- =====================================================
-- BEAR PARK NOTIFICATIONS TABLE SETUP
-- =====================================================
-- Run this in Supabase SQL Editor to create persistent notifications
-- =====================================================

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('follower', 'reaction', 'bulletin_comment', 'bulletin_reply', 'bulletin_post_reaction', 'bulletin_comment_reaction')),
  data JSONB NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON notifications(wallet_address);
CREATE INDEX IF NOT EXISTS idx_notifications_wallet_read ON notifications(wallet_address, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Composite index for efficient unread queries
CREATE INDEX IF NOT EXISTS idx_notifications_wallet_unread_created
  ON notifications(wallet_address, is_read, created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (true);

-- System can insert notifications (backend will handle authorization)
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (true);

-- Users can delete their own notifications
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;
CREATE POLICY "Users can delete their own notifications" ON notifications
  FOR DELETE USING (true);

-- =====================================================
-- AUTO-CLEANUP FUNCTION
-- =====================================================

-- Function to delete notifications older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Notifications table created!';
  RAISE NOTICE '📋 Table: notifications';
  RAISE NOTICE '🔒 RLS policies enabled for security';
  RAISE NOTICE '📊 Performance indexes created';
  RAISE NOTICE '🧹 Auto-cleanup function ready (call cleanup_old_notifications())';
END $$;
