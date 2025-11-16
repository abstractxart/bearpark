// Check if users and honey_points tables are in sync
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSync() {
  console.log('🔍 Checking database sync...\n');

  // Get all users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('wallet_address, total_points')
    .order('wallet_address');

  if (usersError) {
    console.error('❌ Error fetching users:', usersError);
    return;
  }

  // Get all honey_points
  const { data: honeyPoints, error: honeyError } = await supabase
    .from('honey_points')
    .select('wallet_address, total_points')
    .order('wallet_address');

  if (honeyError) {
    console.error('❌ Error fetching honey_points:', honeyError);
    return;
  }

  console.log(`📊 Users table: ${users.length} entries`);
  console.log(`📊 Honey points table: ${honeyPoints.length} entries\n`);

  // Check for mismatches
  const usersMap = new Map(users.map(u => [u.wallet_address, u.total_points]));
  const honeyMap = new Map(honeyPoints.map(h => [h.wallet_address, h.total_points]));

  let mismatches = 0;

  for (const [wallet, userPoints] of usersMap) {
    const honeyPts = honeyMap.get(wallet);
    if (honeyPts !== undefined && honeyPts !== userPoints) {
      console.log(`⚠️  MISMATCH: ${wallet}`);
      console.log(`   Users table: ${userPoints}`);
      console.log(`   Honey points table: ${honeyPts}\n`);
      mismatches++;
    }
  }

  if (mismatches === 0) {
    console.log('✅ All tables are in sync!');
  } else {
    console.log(`❌ Found ${mismatches} mismatches`);
  }

  // Show summary
  console.log('\n📈 Summary:');
  console.log('Users table points:', users.map(u => `${u.wallet_address.slice(-6)}: ${u.total_points}`).join(', '));
}

checkSync();
