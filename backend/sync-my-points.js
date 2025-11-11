// Quick script to sync your 40 honey points to the database
require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function syncPoints() {
  // Replace with your actual wallet address
  const WALLET_ADDRESS = 'YOUR_WALLET_ADDRESS_HERE';

  const { data, error } = await supabase
    .from('honey_points')
    .upsert({
      wallet_address: WALLET_ADDRESS,
      total_points: 40,
      raiding_points: 40,
      games_points: 0,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'wallet_address'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error syncing points:', error);
  } else {
    console.log('✅ Points synced successfully!', data);
  }
}

syncPoints();
