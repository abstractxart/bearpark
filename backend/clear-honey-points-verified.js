require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role key (bypass RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function clearHoneyPointsVerified() {
  console.log('🧹 Clearing ALL honey points and game data WITH VERIFICATION...\n');

  try {
    // STEP 1: Check how many records exist BEFORE deletion
    console.log('📊 STEP 1: Checking current data...');
    console.log('-'.repeat(60));

    const { data: beforeGames, error: beforeGamesError } = await supabase
      .from('daily_game_plays')
      .select('*');

    const { data: beforePoints, error: beforePointsError } = await supabase
      .from('honey_points')
      .select('*');

    if (beforeGamesError || beforePointsError) {
      console.error('❌ Error checking data:', beforeGamesError || beforePointsError);
      process.exit(1);
    }

    console.log(`📋 Found ${beforeGames?.length || 0} daily_game_plays records`);
    console.log(`📋 Found ${beforePoints?.length || 0} honey_points records`);

    if (beforePoints && beforePoints.length > 0) {
      console.log('\n👥 Users with points:');
      beforePoints.forEach(p => {
        console.log(`   - ${p.wallet_address}: ${p.total_points} pts`);
      });
    }

    // STEP 2: Delete all records from daily_game_plays table
    console.log('\n🗑️  STEP 2: Clearing daily game plays...');
    console.log('-'.repeat(60));

    const { error: gamesError, count: gamesCount } = await supabase
      .from('daily_game_plays')
      .delete({ count: 'exact' })
      .neq('wallet_address', ''); // Delete all records

    if (gamesError) {
      console.error('❌ Error clearing daily game plays:', gamesError);
      console.log('\n💡 This might be a Row Level Security (RLS) policy issue.');
      console.log('   You may need to use SUPABASE_SERVICE_ROLE_KEY instead of ANON_KEY');
    } else {
      console.log(`✅ Deleted ${gamesCount || 0} daily_game_plays records`);
    }

    // STEP 3: Delete all records from honey_points table
    console.log('\n🗑️  STEP 3: Clearing honey points...');
    console.log('-'.repeat(60));

    const { error: pointsError, count: pointsCount } = await supabase
      .from('honey_points')
      .delete({ count: 'exact' })
      .neq('wallet_address', ''); // Delete all records

    if (pointsError) {
      console.error('❌ Error clearing honey points:', pointsError);
      console.log('\n💡 This might be a Row Level Security (RLS) policy issue.');
      console.log('   You may need to use SUPABASE_SERVICE_ROLE_KEY instead of ANON_KEY');
    } else {
      console.log(`✅ Deleted ${pointsCount || 0} honey_points records`);
    }

    // STEP 4: Verify deletion
    console.log('\n✅ STEP 4: Verifying deletion...');
    console.log('-'.repeat(60));

    const { data: afterGames } = await supabase
      .from('daily_game_plays')
      .select('*');

    const { data: afterPoints } = await supabase
      .from('honey_points')
      .select('*');

    console.log(`📋 Remaining daily_game_plays: ${afterGames?.length || 0}`);
    console.log(`📋 Remaining honey_points: ${afterPoints?.length || 0}`);

    // STEP 5: Summary
    console.log('\n📋 RESET SUMMARY');
    console.log('='.repeat(60));

    if ((afterGames?.length || 0) === 0 && (afterPoints?.length || 0) === 0) {
      console.log('✅ SUCCESS! All data has been cleared!');
      console.log('🔄 Refresh your browser - you should see 0 points.');
    } else {
      console.log('⚠️  WARNING: Some data remains!');
      console.log('\n🔧 TROUBLESHOOTING:');
      console.log('1. Check Supabase RLS policies - they may be blocking deletes');
      console.log('2. Go to Supabase Dashboard > Authentication > Policies');
      console.log('3. Temporarily disable RLS or add a delete policy');
      console.log('4. Or use SUPABASE_SERVICE_ROLE_KEY instead of ANON_KEY');

      if (afterPoints && afterPoints.length > 0) {
        console.log('\n❌ Users still with points:');
        afterPoints.forEach(p => {
          console.log(`   - ${p.wallet_address}: ${p.total_points} pts`);
        });
      }
    }

  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  }
}

clearHoneyPointsVerified();
