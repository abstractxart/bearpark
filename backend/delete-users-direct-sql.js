require('dotenv').config({ path: '../.env' });
const { Client } = require('pg');

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

async function deleteUsersDirect() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  console.log('🗑️  DELETING USERS USING DIRECT SQL (BYPASSING RLS)\n');
  console.log('='.repeat(100));

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get user info first
    console.log('👥 Users to delete:');
    const getUsersQuery = `
      SELECT wallet_address, display_name
      FROM profiles
      WHERE wallet_address = ANY($1::text[])
      ORDER BY display_name;
    `;
    const usersResult = await client.query(getUsersQuery, [USERS_TO_DELETE]);
    usersResult.rows.forEach(row => {
      console.log(`   - ${row.display_name || 'Unknown'} (${row.wallet_address})`);
    });

    console.log('\n' + '='.repeat(100));
    console.log('\n⚠️  WARNING: This will permanently delete these users!');
    console.log('   Deleting in 3 seconds... Press Ctrl+C to cancel\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Start transaction
    await client.query('BEGIN');

    let totalDeleted = 0;

    // 1. Delete from profiles
    console.log('\n🗑️  Step 1: Deleting from profiles...');
    const profilesResult = await client.query(
      'DELETE FROM profiles WHERE wallet_address = ANY($1::text[])',
      [USERS_TO_DELETE]
    );
    console.log(`   ✅ Deleted ${profilesResult.rowCount} profiles`);
    totalDeleted += profilesResult.rowCount;

    // 2. Delete from users
    console.log('\n🗑️  Step 2: Deleting from users...');
    const usersDelResult = await client.query(
      'DELETE FROM users WHERE wallet_address = ANY($1::text[])',
      [USERS_TO_DELETE]
    );
    console.log(`   ✅ Deleted ${usersDelResult.rowCount} users`);

    // 3. Delete from honey_points
    console.log('\n🗑️  Step 3: Deleting from honey_points...');
    const honeyResult = await client.query(
      'DELETE FROM honey_points WHERE wallet_address = ANY($1::text[])',
      [USERS_TO_DELETE]
    );
    console.log(`   ✅ Deleted ${honeyResult.rowCount} honey_points records`);

    // 4. Delete from game_leaderboards
    console.log('\n🗑️  Step 4: Deleting from game_leaderboards...');
    const leaderboardResult = await client.query(
      'DELETE FROM game_leaderboards WHERE wallet_address = ANY($1::text[])',
      [USERS_TO_DELETE]
    );
    console.log(`   ✅ Deleted ${leaderboardResult.rowCount} leaderboard records`);

    // 5. Delete from daily_game_plays
    console.log('\n🗑️  Step 5: Deleting from daily_game_plays...');
    const gamePlaysResult = await client.query(
      'DELETE FROM daily_game_plays WHERE wallet_address = ANY($1::text[])',
      [USERS_TO_DELETE]
    );
    console.log(`   ✅ Deleted ${gamePlaysResult.rowCount} daily game plays`);

    // 6. Delete from follows (both follower and following)
    console.log('\n🗑️  Step 6: Deleting from follows...');
    const followsResult = await client.query(
      'DELETE FROM follows WHERE follower_wallet = ANY($1::text[]) OR following_wallet = ANY($1::text[])',
      [USERS_TO_DELETE]
    );
    console.log(`   ✅ Deleted ${followsResult.rowCount} follows records`);

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n' + '='.repeat(100));
    console.log('\n✅ SUCCESS! All users deleted from database');
    console.log('\n📊 SUMMARY:');
    console.log(`   Profiles: ${profilesResult.rowCount}`);
    console.log(`   Users: ${usersDelResult.rowCount}`);
    console.log(`   Honey points: ${honeyResult.rowCount}`);
    console.log(`   Leaderboards: ${leaderboardResult.rowCount}`);
    console.log(`   Game plays: ${gamePlaysResult.rowCount}`);
    console.log(`   Follows: ${followsResult.rowCount}`);
    console.log(`\n   Total deleted: ${totalDeleted} users`);

    // Verify
    console.log('\n🔍 Verification...');
    const verifyResult = await client.query(
      'SELECT wallet_address, display_name FROM profiles WHERE wallet_address = ANY($1::text[])',
      [USERS_TO_DELETE]
    );

    if (verifyResult.rowCount === 0) {
      console.log('✅ Verified: All users successfully removed!');
    } else {
      console.log('⚠️  WARNING: Some users still exist:');
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.display_name} (${row.wallet_address})`);
      });
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', err.message);
    console.error('   Transaction rolled back - no changes made');
  } finally {
    await client.end();
    console.log('\n' + '='.repeat(100));
  }
}

deleteUsersDirect();
