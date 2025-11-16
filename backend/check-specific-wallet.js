// Check specific wallet points
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APEX_WALLET = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT';

async function checkWallet() {
  console.log(`🔍 Checking wallet: ${APEX_WALLET}\n`);

  // Check users table
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('total_points')
    .eq('wallet_address', APEX_WALLET)
    .single();

  if (userError) {
    console.error('❌ Error fetching from users:', userError);
  } else {
    console.log(`👤 Users table: ${user.total_points} HP`);
  }

  // Check honey_points table
  const { data: honey, error: honeyError } = await supabase
    .from('honey_points')
    .select('total_points')
    .eq('wallet_address', APEX_WALLET)
    .single();

  if (honeyError) {
    console.error('❌ Error fetching from honey_points:', honeyError);
  } else {
    console.log(`🍯 Honey points table: ${honey.total_points} HP`);
  }

  // Sync if different
  if (user && honey && user.total_points !== Math.round(honey.total_points)) {
    console.log('\n⚠️  Tables out of sync! Syncing now...');
    const { error } = await supabase
      .from('users')
      .update({ total_points: Math.round(honey.total_points) })
      .eq('wallet_address', APEX_WALLET);

    if (error) {
      console.error('❌ Sync failed:', error);
    } else {
      console.log(`✅ Synced to ${Math.round(honey.total_points)} HP`);
    }
  } else {
    console.log('\n✅ Tables are in sync!');
  }
}

checkWallet();
