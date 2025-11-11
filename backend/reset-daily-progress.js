const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function resetAllDailyProgress() {
  console.log('🔄 Resetting daily game progress for ALL users...');

  try {
    // First, get all current daily progress entries
    const { data: entries, error: fetchError } = await supabase
      .from('daily_game_plays')
      .select('*');

    if (fetchError) {
      console.error('❌ Error fetching daily progress:', fetchError);
      return;
    }

    console.log(`📊 Found ${entries?.length || 0} daily progress entries to delete`);

    if (!entries || entries.length === 0) {
      console.log('✅ No daily progress to reset - already clean!');
      return;
    }

    // Delete ALL entries from daily_game_plays table using neq filter
    const { data, error } = await supabase
      .from('daily_game_plays')
      .delete()
      .neq('wallet_address', '___impossible_wallet_value___'); // Match all rows

    if (error) {
      console.error('❌ Error deleting daily progress:', error);
      return;
    }

    console.log('✅ Successfully reset all daily game progress!');
    console.log('📊 All users now show 0.0/20 minutes played today');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

resetAllDailyProgress();
