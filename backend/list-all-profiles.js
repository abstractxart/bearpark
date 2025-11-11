require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function listAllProfiles() {
  console.log('👥 COMPLETE LIST OF ALL WALLETS AND USERNAMES\n');
  console.log('='.repeat(100));

  try {
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('display_name', { ascending: true });

    if (profilesError) {
      console.error('❌ Error fetching profiles:', profilesError);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.log('⚠️  No profiles found');
      return;
    }

    console.log(`\n📊 Found ${profiles.length} profiles\n`);
    console.log('='.repeat(100));

    profiles.forEach((profile, index) => {
      console.log(`\n${index + 1}. 👤 ${profile.display_name || 'NO NAME SET'}`);
      console.log(`   Wallet Address: ${profile.wallet_address}`);
      if (profile.avatar_nft) console.log(`   Avatar NFT: ${profile.avatar_nft}`);
      if (profile.created_at) console.log(`   Created: ${new Date(profile.created_at).toLocaleString()}`);
      if (profile.updated_at) console.log(`   Updated: ${new Date(profile.updated_at).toLocaleString()}`);
    });

    console.log('\n' + '='.repeat(100));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total profiles: ${profiles.length}`);
    console.log(`   Profiles with display names: ${profiles.filter(p => p.display_name).length}`);
    console.log(`   Profiles with avatars: ${profiles.filter(p => p.avatar_nft).length}`);

    // Create CSV export
    console.log('\n📄 CSV FORMAT (copy this):');
    console.log('Display Name,Wallet Address,Avatar NFT,Created');
    profiles.forEach(p => {
      console.log(`"${p.display_name || 'NO NAME'}","${p.wallet_address}","${p.avatar_nft || ''}","${p.created_at || ''}"`);
    });

  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

listAllProfiles();
