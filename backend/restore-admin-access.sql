-- Restore admin access for your wallet
-- Run this in your Supabase SQL editor

-- First, check if admin_roles table exists
CREATE TABLE IF NOT EXISTS admin_roles (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin', -- 'master' or 'admin'
  assigned_by TEXT,
  assigned_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  notes TEXT
);

-- Add your wallet as master admin (case-insensitive)
INSERT INTO admin_roles (wallet_address, role, assigned_by, is_active, notes)
VALUES (
  'rkxkymcvcg3bexjqhimaykaadxyqh5mwkt',
  'master',
  'system',
  true,
  'Original master admin - restored after security hardening'
)
ON CONFLICT (wallet_address)
DO UPDATE SET
  is_active = true,
  role = 'master',
  notes = 'Reactivated after security hardening';

-- Verify it worked
SELECT * FROM admin_roles WHERE wallet_address = 'rkxkymcvcg3bexjqhimaykaadxyqh5mwkt';
