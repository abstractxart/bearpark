require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const YOUR_WALLET = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT';

async function checkAdminStatus() {
  console.log('🔍 Checking admin status for your wallet...\n');
  console.log('Wallet:', YOUR_WALLET);
  console.log('='.repeat(80));

  try {
    // Check if admin_roles table exists
    const { data: adminRoles, error: rolesError } = await supabase
      .from('admin_roles')
      .select('*')
      .eq('wallet_address', YOUR_WALLET)
      .single();

    if (rolesError) {
      console.log('\n❌ Error fetching admin role:', rolesError.message);

      if (rolesError.code === '42P01' || rolesError.message.includes('does not exist')) {
        console.log('\n⚠️  admin_roles table does not exist!');
        console.log('\n📋 You need to run the setup SQL:');
        console.log('   1. Go to: https://supabase.com/dashboard/project/cfdgdisaexvyrdjjcuss/sql/new');
        console.log('   2. Copy and run: backend/supabase-roles-setup.sql');
        return;
      }

      if (rolesError.code === 'PGRST116') {
        console.log('\n⚠️  Your wallet is NOT in the admin_roles table!');
        console.log('\n📋 Run this SQL to add yourself as master admin:');
        console.log(`
INSERT INTO admin_roles (wallet_address, role, assigned_by, permissions, notes) VALUES
  ('${YOUR_WALLET}', 'master', 'system',
   '{"all": true, "assign_roles": true, "delete_roles": true, "manage_admins": true, "manage_moderators": true, "full_access": true}'::jsonb,
   'Master Owner Account - Full System Access')
ON CONFLICT (wallet_address) DO UPDATE
  SET role = 'master',
      permissions = '{"all": true, "assign_roles": true, "delete_roles": true, "manage_admins": true, "manage_moderators": true, "full_access": true}'::jsonb;
        `);
        return;
      }

      return;
    }

    console.log('\n✅ Admin role found!');
    console.log('\n👤 Your Admin Status:');
    console.log('   Role:', adminRoles.role.toUpperCase());
    console.log('   Active:', adminRoles.is_active ? 'YES' : 'NO');
    console.log('   Assigned by:', adminRoles.assigned_by);
    console.log('   Assigned at:', new Date(adminRoles.assigned_at).toLocaleString());
    console.log('   Notes:', adminRoles.notes || 'None');

    if (adminRoles.permissions) {
      console.log('\n🔑 Permissions:');
      Object.entries(adminRoles.permissions).forEach(([key, value]) => {
        console.log(`   - ${key}: ${value}`);
      });
    }

    if (!adminRoles.is_active) {
      console.log('\n⚠️  WARNING: Your account is INACTIVE!');
      console.log('\n📋 Run this SQL to activate it:');
      console.log(`
UPDATE admin_roles
SET is_active = true
WHERE wallet_address = '${YOUR_WALLET}';
      `);
    } else if (adminRoles.role !== 'master') {
      console.log('\n⚠️  WARNING: You are not a MASTER admin!');
      console.log('\n📋 Run this SQL to upgrade to master:');
      console.log(`
UPDATE admin_roles
SET role = 'master',
    permissions = '{"all": true, "assign_roles": true, "delete_roles": true, "manage_admins": true, "manage_moderators": true, "full_access": true}'::jsonb
WHERE wallet_address = '${YOUR_WALLET}';
      `);
    } else {
      console.log('\n🎉 Everything looks good! You have full admin access.');
    }

    // Check all admins
    console.log('\n' + '='.repeat(80));
    console.log('\n👥 All Admins in System:');

    const { data: allAdmins } = await supabase
      .from('admin_roles')
      .select('*')
      .order('assigned_at', { ascending: false });

    if (allAdmins && allAdmins.length > 0) {
      allAdmins.forEach((admin, index) => {
        console.log(`\n${index + 1}. ${admin.role.toUpperCase()}`);
        console.log(`   Wallet: ${admin.wallet_address}`);
        console.log(`   Active: ${admin.is_active ? 'YES' : 'NO'}`);
        console.log(`   Assigned: ${new Date(admin.assigned_at).toLocaleDateString()}`);
      });
    }

  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

checkAdminStatus();
