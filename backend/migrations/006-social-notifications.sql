-- 006: wall notifications (profile_comment, profile_reply) can be stored.
--
-- supabase-notifications-table-setup.sql limited notifications.type to the
-- follower / reaction / bulletin_* types, so every "X commented on your profile"
-- and "X replied to your comment" (on a wall) was refused by the database and
-- only logged. The API now writes them through the same path as every other
-- notification; this lets the table take them.
--
-- Safe to run any time, and more than once. NOT VALID: existing rows are not
-- re-checked (nothing to migrate).

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'follower',
  'reaction',
  'profile_comment',
  'profile_reply',
  'bulletin_comment',
  'bulletin_reply',
  'bulletin_post_reaction',
  'bulletin_comment_reaction'
)) NOT VALID;

-- Wall replies (production has this column; a fresh database from the setup
-- scripts does not).
ALTER TABLE profile_comments ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES profile_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_profile_comments_parent ON profile_comments(parent_id);

-- The notification bell reads "my unread, newest first" and the API folds a
-- repeat reaction into the reactor's unread notification.
CREATE INDEX IF NOT EXISTS idx_notifications_wallet_unread_created
  ON notifications(wallet_address, is_read, created_at DESC);
