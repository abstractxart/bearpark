require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function clearHoneyPoints() {
  console.log('🧹 Clearing ALL honey points and game data...');

  try {
    // Delete all records from daily_game_plays table
    console.log('🗑️  Clearing daily game plays...');
    const { error: gamesError } = await supabase
      .from('daily_game_plays')
      .delete()
      .neq('wallet_address', ''); // Delete all records

    if (gamesError) {
      console.error('❌ Error clearing daily game plays:', gamesError);
      process.exit(1);
    }

    // Delete all records from honey_points table
    console.log('🗑️  Clearing honey points...');
    const { error: pointsError } = await supabase
      .from('honey_points')
      .delete()
      .neq('wallet_address', ''); // Delete all records

    if (pointsError) {
      console.error('❌ Error clearing honey points:', pointsError);
      process.exit(1);
    }

    console.log('✅ Successfully cleared ALL data!');
    console.log('📊 Database is now reset - ready for fresh data.');
    console.log('🔄 Refresh your browser to see the reset state (0 points, 0/20 minutes used).');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

clearHoneyPoints();
