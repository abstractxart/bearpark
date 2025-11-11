-- =====================================================
-- BEAR Park Role Management System
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create admin_roles table
CREATE TABLE IF NOT EXISTS admin_roles (
  wallet_address VARCHAR(255) PRIMARY KEY,
  role VARCHAR(50) NOT NULL, -- 'master', 'admin', 'moderator'
  assigned_by VARCHAR(255) NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  permissions JSONB, -- Custom permissions object
  is_active BOOLEAN DEFAULT true,
  notes TEXT
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_roles_role ON admin_roles(role);
CREATE INDEX IF NOT EXISTS idx_admin_roles_active ON admin_roles(is_active);

-- 3. Insert MASTER account
INSERT INTO admin_roles (wallet_address, role, assigned_by, permissions, notes) VALUES
  ('rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT', 'master', 'system',
   '{"all": true, "assign_roles": true, "delete_roles": true, "manage_admins": true, "manage_moderators": true, "full_access": true}'::jsonb,
   'Master Owner Account - Full System Access')
ON CONFLICT (wallet_address) DO UPDATE
  SET role = 'master',
      permissions = '{"all": true, "assign_roles": true, "delete_roles": true, "manage_admins": true, "manage_moderators": true, "full_access": true}'::jsonb;

-- 4. Enable Row Level Security
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

-- 5. Create policies
CREATE POLICY "Allow admin read access to roles"
  ON admin_roles FOR SELECT
  USING (true);

CREATE POLICY "Allow admin write access to roles"
  ON admin_roles FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- Role Permissions Definitions
-- =====================================================
--
-- MASTER:
--   - Full system access
--   - Can assign/remove any role
--   - Can manage admins and moderators
--   - Access to all features
--
-- ADMIN:
--   - Can manage users (ban, edit names, adjust points)
--   - Can create/delete raids
--   - Can view analytics and logs
--   - Can update game settings
--   - Cannot assign roles
--
-- MODERATOR:
--   - Can edit user names
--   - Can view users and banned users
--   - Can view analytics (read-only)
--   - Cannot ban users or adjust points
--   - Cannot manage raids or settings
--
-- =====================================================
-- Setup Complete!
-- =====================================================
