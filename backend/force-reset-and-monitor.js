require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function forceResetAndMonitor() {
  console.log('🔄 FORCE RESET MODE - Will keep clearing for 30 seconds');
  console.log('⚡ Clear your browser localStorage NOW while this runs!\n');

  let iteration = 0;
  const maxIterations = 30; // Run for 30 seconds

  const intervalId = setInterval(async () => {
    iteration++;

    try {
      // Check if there are any points
      const { data: points } = await supabase
        .from('honey_points')
        .select('*');

      if (points && points.length > 0) {
        console.log(`\n🗑️  Iteration ${iteration}/${maxIterations}: Found ${points.length} records - DELETING...`);

        points.forEach(p => {
          console.log(`   ❌ ${p.wallet_address}: ${p.total_points} pts`);
        });

        // Delete them
        await supabase
          .from('honey_points')
          .delete()
          .neq('wallet_address', '');

        console.log('   ✅ Deleted!');
      } else {
        console.log(`✓ Iteration ${iteration}/${maxIterations}: Database clean (0 points)`);
      }

      // Also clear daily plays
      const { data: plays } = await supabase
        .from('daily_game_plays')
        .select('*');

      if (plays && plays.length > 0) {
        await supabase
          .from('daily_game_plays')
          .delete()
          .neq('wallet_address', '');
      }

      if (iteration >= maxIterations) {
        clearInterval(intervalId);
        console.log('\n✅ DONE! Database should be clear now.');
        console.log('🔄 Refresh your browser - you should see 0 points.');
        process.exit(0);
      }

    } catch (err) {
      console.error('❌ Error:', err);
    }
  }, 1000); // Check every second
}

forceResetAndMonitor();
