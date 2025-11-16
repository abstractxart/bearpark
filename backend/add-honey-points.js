// Script to add honey points to specific wallets
require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function addHoneyPoints(walletAddress, pointsToAdd) {
  // First, get current points
  const { data: currentData, error: fetchError } = await supabase
    .from('honey_points')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error(`❌ Error fetching current points for ${walletAddress}:`, fetchError);
    return;
  }

  const currentTotalPoints = currentData?.total_points || 0;
  const currentRaidingPoints = currentData?.raiding_points || 0;
  const currentGamesPoints = currentData?.games_points || 0;

  const newTotalPoints = currentTotalPoints + pointsToAdd;

  // Update or insert
  const { data, error } = await supabase
    .from('honey_points')
    .upsert({
      wallet_address: walletAddress,
      total_points: newTotalPoints,
      raiding_points: currentRaidingPoints + pointsToAdd, // Adding to raiding points
      games_points: currentGamesPoints,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'wallet_address'
    })
    .select()
    .single();

  if (error) {
    console.error(`❌ Error adding points for ${walletAddress}:`, error);
  } else {
    console.log(`✅ Added ${pointsToAdd} honey points to ${walletAddress}`);
    console.log(`   Previous total: ${currentTotalPoints} HP`);
    console.log(`   New total: ${newTotalPoints} HP`);
  }
}

async function main() {
  console.log('🍯 Adding honey points...\n');

  // Apex wallet (rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT)
  await addHoneyPoints('rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT', 5000);

  // Clean589 wallet (rUDb8QY1EUFqbivAYPyWR3t9Q4EJUmH8s6)
  await addHoneyPoints('rUDb8QY1EUFqbivAYPyWR3t9Q4EJUmH8s6', 5000);

  console.log('\n✅ Done!');
  process.exit(0);
}

main();
