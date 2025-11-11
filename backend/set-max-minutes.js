require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Your wallet address (update this!)
const WALLET_ADDRESS = 'rDy2nkjBcDFXgujtjo663szfcs561wgb98';

async function setMaxMinutes() {
  console.log('⏱️ Setting minutes to 20/20 for testing...');

  const today = new Date().toISOString().split('T')[0]; // UTC date

  try {
    // First, delete any existing game plays for today
    await supabase
      .from('daily_game_plays')
      .delete()
      .eq('wallet_address', WALLET_ADDRESS)
      .eq('play_date', today);

    // Insert 20 minutes of gameplay across all 3 games
    const { error: insertError } = await supabase
      .from('daily_game_plays')
      .insert([
        {
          wallet_address: WALLET_ADDRESS,
          game_id: 'bear-ninja',
          play_date: today,
          minutes_played: 8.0,
          points_earned: 8.0,
          session_count: 3
        },
        {
          wallet_address: WALLET_ADDRESS,
          game_id: 'flappy-bear',
          play_date: today,
          minutes_played: 7.0,
          points_earned: 7.0,
          session_count: 2
        },
        {
          wallet_address: WALLET_ADDRESS,
          game_id: 'bear-jumpventure',
          play_date: today,
          minutes_played: 5.0,
          points_earned: 5.0,
          session_count: 2
        }
      ]);

    if (insertError) {
      console.error('❌ Error inserting game plays:', insertError);
      process.exit(1);
    }

    // Update honey points to 20 (explicit update to avoid upsert issues)
    const { data: updateData, error: updateError } = await supabase
      .from('honey_points')
      .update({
        total_points: 20,
        games_points: 20,
        raiding_points: 0
      })
      .eq('wallet_address', WALLET_ADDRESS)
      .select();

    // If no rows were updated, insert a new record
    if (!updateError && (!updateData || updateData.length === 0)) {
      const { error: insertError } = await supabase
        .from('honey_points')
        .insert({
          wallet_address: WALLET_ADDRESS,
          total_points: 20,
          games_points: 20,
          raiding_points: 0
        });

      if (insertError) {
        console.error('❌ Error inserting honey points:', insertError);
        process.exit(1);
      }
    } else if (updateError) {
      console.error('❌ Error updating honey points:', updateError);
      process.exit(1);
    }

    console.log('✅ Successfully set minutes to 20/20!');
    console.log('📊 You now have:');
    console.log('   - 20/20 minutes played today');
    console.log('   - 20 honey points (games)');
    console.log('🔄 Refresh your browser to see the countdown timer!');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

setMaxMinutes();
