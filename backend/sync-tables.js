// Sync users table from honey_points table (honey_points is the source of truth)
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncTables() {
  console.log('🔄 Syncing users table from honey_points table...\n');

  // Get all honey_points (source of truth)
  const { data: honeyPoints, error: honeyError } = await supabase
    .from('honey_points')
    .select('*')
    .order('wallet_address');

  if (honeyError) {
    console.error('❌ Error fetching honey_points:', honeyError);
    return;
  }

  console.log(`📊 Found ${honeyPoints.length} entries in honey_points table\n`);

  let updated = 0;
  let errors = 0;

  for (const hp of honeyPoints) {
    // Update corresponding user (round to integer)
    const roundedPoints = Math.round(hp.total_points);
    const { error } = await supabase
      .from('users')
      .update({ total_points: roundedPoints })
      .eq('wallet_address', hp.wallet_address);

    if (error) {
      console.error(`❌ Error updating ${hp.wallet_address}:`, error.message);
      errors++;
    } else {
      console.log(`✅ ${hp.wallet_address.slice(-6)}: ${hp.total_points} HP`);
      updated++;
    }
  }

  console.log(`\n🎉 Sync complete! Updated ${updated} users, ${errors} errors`);
}

syncTables();
