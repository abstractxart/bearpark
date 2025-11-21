// Reset all players to 0 honey points
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
);

const NEW_POINTS = 0;

async function resetAllToZero() {
  console.log(`🧹 Resetting all players to ${NEW_POINTS} honey points...`);

  try {
    // 1. Update users table
    const { data: usersUpdated, error: usersError } = await supabase
      .from('users')
      .update({ total_points: NEW_POINTS })
      .not('wallet_address', 'is', null)
      .select();

    if (usersError) {
      console.error('❌ Error updating users table:', usersError);
      return;
    }

    console.log(`✅ Updated ${usersUpdated?.length || 0} users in users table`);

    // 2. Get all entries from honey_points
    const { data: allPoints, error: fetchError } = await supabase
      .from('honey_points')
      .select('*')
      .not('wallet_address', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching honey_points:', fetchError);
      return;
    }

    console.log(`Found ${allPoints?.length || 0} entries in honey_points table`);

    // 3. Update each entry to 0 points across all categories
    let updated = 0;
    for (const entry of allPoints) {
      const { error: updateError } = await supabase
        .from('honey_points')
        .update({
          total_points: NEW_POINTS,
          raiding_points: NEW_POINTS,
          games_points: NEW_POINTS
        })
        .eq('wallet_address', entry.wallet_address);

      if (updateError) {
        console.error(`❌ Error updating ${entry.wallet_address}:`, updateError);
      } else {
        console.log(`✅ ${entry.wallet_address.slice(-6)}: Reset to ${NEW_POINTS} HP`);
        updated++;
      }
    }

    console.log(`\n🎉 Reset complete! ${updated} players now have ${NEW_POINTS} honey points.`);
    console.log('⚠️  Users will see the new balance next time they log in (localStorage cache will be cleared).');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

resetAllToZero();
