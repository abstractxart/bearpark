// Set all players to 5890 honey points
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
);

const NEW_POINTS = 10000;

async function setAllPoints() {
  console.log(`🍯 Setting all players to ${NEW_POINTS} honey points...`);

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

    // 2. Get all entries from honey_points to preserve raiding points
    const { data: allPoints, error: fetchError } = await supabase
      .from('honey_points')
      .select('*')
      .not('wallet_address', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching honey_points:', fetchError);
      return;
    }

    // 3. Update each entry - put ALL points in games so they can be used for betting
    let updated = 0;
    for (const entry of allPoints) {
      const { error: updateError } = await supabase
        .from('honey_points')
        .update({
          total_points: NEW_POINTS,
          raiding_points: 0,
          games_points: NEW_POINTS
        })
        .eq('wallet_address', entry.wallet_address);

      if (updateError) {
        console.error(`❌ Error updating ${entry.wallet_address}:`, updateError);
      } else {
        console.log(`✅ ${entry.wallet_address.slice(-6)}: ${NEW_POINTS} HP (All usable for betting)`);
        updated++;
      }
    }

    console.log(`🎉 All players now have ${NEW_POINTS} honey points! Updated ${updated} entries with correct breakdown.`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

setAllPoints();
