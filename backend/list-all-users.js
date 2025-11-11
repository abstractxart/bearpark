require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function listAllUsers() {
  console.log('📋 Fetching all wallets and usernames...\n');
  console.log('='.repeat(80));

  try {
    // Fetch all users from the users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);

      // Try to get schema info to help debug
      console.log('\n💡 Checking available tables...');
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      if (!tablesError && tables) {
        console.log('Available tables:', tables.map(t => t.table_name).join(', '));
      }

      return;
    }

    if (!users || users.length === 0) {
      console.log('⚠️  No users found in database');
      console.log('\nTrying to find users from honey_points table...\n');

      // Try to get wallet addresses from honey_points table
      const { data: points, error: pointsError } = await supabase
        .from('honey_points')
        .select('*');

      if (pointsError) {
        console.error('❌ Error fetching from honey_points:', pointsError);
        return;
      }

      if (points && points.length > 0) {
        console.log(`Found ${points.length} wallets in honey_points table:\n`);
        points.forEach((p, index) => {
          console.log(`${index + 1}. Wallet: ${p.wallet_address}`);
          console.log(`   Points: ${p.total_points || 0}`);
          console.log(`   Username: ${p.username || 'Not set'}`);
          console.log('');
        });
      }

      return;
    }

    console.log(`\n👥 Found ${users.length} users:\n`);
    console.log('-'.repeat(80));

    users.forEach((user, index) => {
      console.log(`\n${index + 1}. 👤 User Details:`);
      console.log(`   Wallet Address: ${user.wallet_address || 'N/A'}`);
      console.log(`   Username: ${user.username || 'Not set'}`);
      console.log(`   Display Name: ${user.display_name || 'Not set'}`);
      console.log(`   Avatar URL: ${user.avatar_url || 'Not set'}`);
      console.log(`   Created: ${user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}`);
      console.log(`   Last Updated: ${user.updated_at ? new Date(user.updated_at).toLocaleString() : 'N/A'}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Total Users: ${users.length}`);

    // Also check honey_points for comparison
    const { data: honeyPoints } = await supabase
      .from('honey_points')
      .select('wallet_address, username, total_points');

    if (honeyPoints && honeyPoints.length > 0) {
      console.log(`📊 Total wallets with points: ${honeyPoints.length}`);

      // Show users with usernames
      const withUsernames = honeyPoints.filter(p => p.username);
      console.log(`📊 Wallets with usernames set: ${withUsernames.length}`);
    }

  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

listAllUsers();
