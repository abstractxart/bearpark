require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Your wallet address (update this!)
const WALLET_ADDRESS = 'rDy2nkjBcDFXgujtjo663szfcs561wgb98';

async function setMaxGames() {
  console.log('🎮 Setting games to 5/5 for testing...');

  const today = new Date().toISOString().split('T')[0]; // UTC date

  try {
    // First, delete any existing game plays for today
    await supabase
      .from('daily_game_plays')
      .delete()
      .eq('wallet_address', WALLET_ADDRESS)
      .eq('play_date', today);

    // Insert 5 game plays for today
    const { error: insertError } = await supabase
      .from('daily_game_plays')
      .insert([
        {
          wallet_address: WALLET_ADDRESS,
          game_id: 'bear-ninja',
          play_date: today,
          plays_count: 2,
          points_earned: 16
        },
        {
          wallet_address: WALLET_ADDRESS,
          game_id: 'flappy-bear',
          play_date: today,
          plays_count: 2,
          points_earned: 16
        },
        {
          wallet_address: WALLET_ADDRESS,
          game_id: 'bear-jumpventure',
          play_date: today,
          plays_count: 1,
          points_earned: 8
        }
      ]);

    if (insertError) {
      console.error('❌ Error inserting game plays:', insertError);
      process.exit(1);
    }

    // Update honey points to 40 (explicit update to avoid upsert issues)
    const { data: updateData, error: updateError } = await supabase
      .from('honey_points')
      .update({
        total_points: 40,
        games_points: 40,
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
          total_points: 40,
          games_points: 40,
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

    console.log('✅ Successfully set games to 5/5!');
    console.log('📊 You now have:');
    console.log('   - 5/5 games played today');
    console.log('   - 40 honey points (games)');
    console.log('🔄 Refresh your browser to see the countdown timer!');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

setMaxGames();
