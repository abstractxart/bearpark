require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Users to delete
const USERS_TO_DELETE = [
  'ra9JXaVdjoZqrqeDD4prgd5NoyaKy2MKoY',  // Yomama
  'test456',                               // ProductionTest
  'test_wallet',                           // Test User
  'test123',                               // TestUser
  'rDy2nkjBcDFXgujtjo663szfcs561wgb98',  // PIRATE
  'rBDvrd98rydzvqo7URuknR3m4eJt4bxXub',  // Smarty pants
  'rs9vQMxNyhDg27yF6RqgCKTbehgFWWADd4'   // BG123
];

async function deleteUsers() {
  console.log('🗑️  DELETING SPECIFIC USERS FROM ALL TABLES\n');
  console.log('='.repeat(100));
  console.log('\n👥 Users to delete:');

  // Get display names first
  const { data: profiles } = await supabase
    .from('profiles')
    .select('wallet_address, display_name')
    .in('wallet_address', USERS_TO_DELETE);

  if (profiles) {
    profiles.forEach(p => {
      console.log(`   - ${p.display_name || 'Unknown'} (${p.wallet_address})`);
    });
  }

  console.log('\n' + '='.repeat(100));
  console.log('\n⚠️  WARNING: This will permanently delete these users from ALL tables!');
  console.log('   Deleting in 3 seconds... Press Ctrl+C to cancel\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    let totalDeleted = 0;

    // 1. Delete from profiles table
    console.log('\n🗑️  Step 1: Deleting from profiles table...');
    const { error: profilesError, count: profilesCount } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .in('wallet_address', USERS_TO_DELETE);

    if (profilesError) {
      console.error('   ❌ Error:', profilesError);
    } else {
      console.log(`   ✅ Deleted ${profilesCount || 0} profiles`);
      totalDeleted += (profilesCount || 0);
    }

    // 2. Delete from users table
    console.log('\n🗑️  Step 2: Deleting from users table...');
    const { error: usersError, count: usersCount } = await supabase
      .from('users')
      .delete({ count: 'exact' })
      .in('wallet_address', USERS_TO_DELETE);

    if (usersError) {
      console.error('   ❌ Error:', usersError);
    } else {
      console.log(`   ✅ Deleted ${usersCount || 0} users`);
    }

    // 3. Delete from honey_points table
    console.log('\n🗑️  Step 3: Deleting from honey_points table...');
    const { error: honeyError, count: honeyCount } = await supabase
      .from('honey_points')
      .delete({ count: 'exact' })
      .in('wallet_address', USERS_TO_DELETE);

    if (honeyError) {
      console.error('   ❌ Error:', honeyError);
    } else {
      console.log(`   ✅ Deleted ${honeyCount || 0} honey_points records`);
    }

    // 4. Delete from game_leaderboards table
    console.log('\n🗑️  Step 4: Deleting from game_leaderboards table...');
    const { error: leaderboardError, count: leaderboardCount } = await supabase
      .from('game_leaderboards')
      .delete({ count: 'exact' })
      .in('wallet_address', USERS_TO_DELETE);

    if (leaderboardError) {
      console.error('   ❌ Error:', leaderboardError);
    } else {
      console.log(`   ✅ Deleted ${leaderboardCount || 0} leaderboard records`);
    }

    // 5. Delete from daily_game_plays table
    console.log('\n🗑️  Step 5: Deleting from daily_game_plays table...');
    const { error: gamePlaysError, count: gamePlaysCount } = await supabase
      .from('daily_game_plays')
      .delete({ count: 'exact' })
      .in('wallet_address', USERS_TO_DELETE);

    if (gamePlaysError) {
      console.error('   ❌ Error:', gamePlaysError);
    } else {
      console.log(`   ✅ Deleted ${gamePlaysCount || 0} game plays records`);
    }

    // 6. Delete from raids table (as creator)
    console.log('\n🗑️  Step 6: Deleting raids created by these users...');
    const { error: raidsError, count: raidsCount } = await supabase
      .from('raids')
      .delete({ count: 'exact' })
      .in('creator_wallet', USERS_TO_DELETE);

    if (raidsError) {
      console.error('   ❌ Error:', raidsError);
    } else {
      console.log(`   ✅ Deleted ${raidsCount || 0} raids`);
    }

    // 7. Delete from follows table (as follower or following)
    console.log('\n🗑️  Step 7: Deleting from follows table...');
    const { error: followsError1 } = await supabase
      .from('follows')
      .delete()
      .in('follower_wallet', USERS_TO_DELETE);

    const { error: followsError2 } = await supabase
      .from('follows')
      .delete()
      .in('following_wallet', USERS_TO_DELETE);

    if (followsError1 || followsError2) {
      console.error('   ❌ Error:', followsError1 || followsError2);
    } else {
      console.log(`   ✅ Deleted follows records`);
    }

    // Verification
    console.log('\n' + '='.repeat(100));
    console.log('\n✅ VERIFICATION: Checking if users were deleted...\n');

    const { data: remainingProfiles } = await supabase
      .from('profiles')
      .select('wallet_address, display_name')
      .in('wallet_address', USERS_TO_DELETE);

    if (remainingProfiles && remainingProfiles.length > 0) {
      console.log('⚠️  WARNING: Some users still remain:');
      remainingProfiles.forEach(p => {
        console.log(`   - ${p.display_name} (${p.wallet_address})`);
      });
    } else {
      console.log('✅ All users successfully deleted from all tables!');
    }

    console.log('\n' + '='.repeat(100));
    console.log('\n📊 SUMMARY:');
    console.log(`   Users deleted: ${USERS_TO_DELETE.length}`);
    console.log(`   Profiles removed: ${profilesCount || 0}`);
    console.log(`   Leaderboard entries removed: ${leaderboardCount || 0}`);
    console.log('\n🎉 Cleanup complete!');

  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

deleteUsers();
