const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Admin Client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function resetSpecificWallet() {
  try {
    console.log('🔍 Searching for wallet containing "rkkk" and "mukt"...');

    // Find the wallet
    const { data: allWallets, error: fetchError } = await supabaseAdmin
      .from('honey_points')
      .select('wallet_address, total_points, raiding_points, games_points');

    if (fetchError) {
      console.error('❌ Error fetching wallets:', fetchError);
      return;
    }

    console.log(`\n📋 All wallets with points > 0:`);
    allWallets
      .filter(w => w.total_points > 0)
      .forEach(w => {
        console.log(`   ${w.wallet_address}: Total=${w.total_points}, Raiding=${w.raiding_points}, Games=${w.games_points}`);
      });

    // Find wallet matching the pattern (case-insensitive)
    const targetWallet = allWallets.find(w =>
      w.wallet_address.toLowerCase().includes('rkk') && w.wallet_address.toLowerCase().includes('mukt')
    );

    if (!targetWallet) {
      console.log('❌ No wallet found matching pattern (contains rkkk or mukt)');
      return;
    }

    console.log(`✅ Found wallet: ${targetWallet.wallet_address}`);
    console.log(`   Current points: Total=${targetWallet.total_points}, Raiding=${targetWallet.raiding_points}, Games=${targetWallet.games_points}`);

    // Reset to 0
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('honey_points')
      .update({
        total_points: 0,
        raiding_points: 0,
        games_points: 0,
        updated_at: new Date().toISOString()
      })
      .eq('wallet_address', targetWallet.wallet_address)
      .select();

    if (updateError) {
      console.error('❌ Error resetting wallet:', updateError);
      return;
    }

    console.log(`✅ Successfully reset ${targetWallet.wallet_address} to 0 points`);
    console.log(`   New points: Total=0, Raiding=0, Games=0`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

resetSpecificWallet();
