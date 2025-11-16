// Find clean589's wallet address
require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function findWallet() {
  // Search in profiles table for wallets ending in h8s6
  const { data: allProfiles, error: profileError } = await supabase
    .from('profiles')
    .select('*');

  if (profileError) {
    console.error('❌ Error fetching profiles:', profileError);
  } else if (allProfiles) {
    console.log(`📊 Total profiles: ${allProfiles.length}\n`);

    const matchingWallets = allProfiles.filter(p =>
      p.wallet_address && p.wallet_address.toLowerCase().endsWith('h8s6')
    );

    if (matchingWallets.length > 0) {
      console.log('✅ Found wallets ending in h8s6:');
      matchingWallets.forEach(profile => {
        console.log(`   Display Name: ${profile.display_name || 'N/A'}`);
        console.log(`   Wallet: ${profile.wallet_address}`);
        console.log(`   Created: ${profile.created_at}\n`);
      });
    } else {
      console.log('❌ No wallets found ending in h8s6');
      console.log('Showing all wallets for reference:');
      allProfiles.slice(0, 10).forEach(p => {
        console.log(`   ${p.display_name || 'No name'}: ${p.wallet_address}`);
      });
    }
  }

  process.exit(0);
}

findWallet();
