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

async function resetSpecificWallets() {
  console.log('🧹 Resetting wallets with non-zero points...');

  // Reset all non-zero accounts
  const { data: nonZeroAccounts, error: fetchError } = await supabase
    .from('honey_points')
    .select('*')
    .gt('total_points', 0);

  if (fetchError) {
    console.error('Error fetching accounts:', fetchError);
    return;
  }

  console.log(`Found ${nonZeroAccounts.length} accounts with points to reset`);

  for (const account of nonZeroAccounts) {
    const { error } = await supabase
      .from('honey_points')
      .update({
        total_points: 0,
        raiding_points: 0,
        games_points: 0
      })
      .eq('wallet_address', account.wallet_address);

    if (error) {
      console.error(`❌ Error resetting ${account.wallet_address}:`, error);
    } else {
      console.log(`✅ Reset ${account.wallet_address.slice(-8)}: ${account.total_points} → 0 HP`);
    }
  }

  // Also update users table
  const { error: usersError } = await supabase
    .from('users')
    .update({ total_points: 0 })
    .gt('total_points', 0);

  if (usersError) {
    console.error('Error updating users table:', usersError);
  } else {
    console.log('✅ Updated users table');
  }

  console.log('\n🎉 All accounts now have 0 points!');
}

resetSpecificWallets();
