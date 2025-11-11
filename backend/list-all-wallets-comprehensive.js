require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getAllWalletsAndUsernames() {
  console.log('🔍 COMPREHENSIVE WALLET & USERNAME SEARCH\n');
  console.log('='.repeat(100));

  const allWallets = new Map(); // wallet -> {username, display_name, sources: []}

  try {
    // 1. Check users table
    console.log('\n📊 Checking "users" table...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (!usersError && users) {
      console.log(`   Found ${users.length} users`);
      users.forEach(user => {
        if (!allWallets.has(user.wallet_address)) {
          allWallets.set(user.wallet_address, {
            username: user.username || null,
            display_name: user.display_name || null,
            avatar_url: user.avatar_url || null,
            sources: []
          });
        }
        allWallets.get(user.wallet_address).sources.push('users');
      });
    }

    // 2. Check honey_points table
    console.log('\n📊 Checking "honey_points" table...');
    const { data: honeyPoints, error: honeyError } = await supabase
      .from('honey_points')
      .select('*');

    if (!honeyError && honeyPoints) {
      console.log(`   Found ${honeyPoints.length} honey_points records`);
      honeyPoints.forEach(hp => {
        if (!allWallets.has(hp.wallet_address)) {
          allWallets.set(hp.wallet_address, {
            username: hp.username || null,
            display_name: null,
            avatar_url: null,
            sources: []
          });
        }
        const wallet = allWallets.get(hp.wallet_address);
        if (hp.username && !wallet.username) {
          wallet.username = hp.username;
        }
        if (!wallet.sources.includes('honey_points')) {
          wallet.sources.push('honey_points');
        }
      });
    }

    // 3. Check game_leaderboards table
    console.log('\n📊 Checking "game_leaderboards" table...');
    const { data: leaderboards, error: leaderboardError } = await supabase
      .from('game_leaderboards')
      .select('*');

    if (!leaderboardError && leaderboards) {
      console.log(`   Found ${leaderboards.length} game leaderboard records`);
      leaderboards.forEach(lb => {
        if (!allWallets.has(lb.wallet_address)) {
          allWallets.set(lb.wallet_address, {
            username: lb.username || null,
            display_name: null,
            avatar_url: null,
            sources: []
          });
        }
        const wallet = allWallets.get(lb.wallet_address);
        if (lb.username && !wallet.username) {
          wallet.username = lb.username;
        }
        if (!wallet.sources.includes('game_leaderboards')) {
          wallet.sources.push('game_leaderboards');
        }
      });
    }

    // 4. Check daily_game_plays table
    console.log('\n📊 Checking "daily_game_plays" table...');
    const { data: gamePlays, error: gamePlaysError } = await supabase
      .from('daily_game_plays')
      .select('*');

    if (!gamePlaysError && gamePlays) {
      console.log(`   Found ${gamePlays.length} daily game plays records`);
      gamePlays.forEach(gp => {
        if (!allWallets.has(gp.wallet_address)) {
          allWallets.set(gp.wallet_address, {
            username: null,
            display_name: null,
            avatar_url: null,
            sources: []
          });
        }
        if (!allWallets.get(gp.wallet_address).sources.includes('daily_game_plays')) {
          allWallets.get(gp.wallet_address).sources.push('daily_game_plays');
        }
      });
    }

    // 5. Check raids table
    console.log('\n📊 Checking "raids" table...');
    const { data: raids, error: raidsError } = await supabase
      .from('raids')
      .select('*');

    if (!raidsError && raids) {
      console.log(`   Found ${raids.length} raids records`);
      raids.forEach(raid => {
        // Check creator
        if (raid.creator_wallet && !allWallets.has(raid.creator_wallet)) {
          allWallets.set(raid.creator_wallet, {
            username: null,
            display_name: null,
            avatar_url: null,
            sources: []
          });
        }
        if (raid.creator_wallet && !allWallets.get(raid.creator_wallet).sources.includes('raids_creator')) {
          allWallets.get(raid.creator_wallet).sources.push('raids_creator');
        }

        // Check participants (if exists)
        if (raid.participants && Array.isArray(raid.participants)) {
          raid.participants.forEach(participant => {
            if (participant.wallet && !allWallets.has(participant.wallet)) {
              allWallets.set(participant.wallet, {
                username: participant.username || null,
                display_name: null,
                avatar_url: null,
                sources: []
              });
            }
            if (participant.wallet && !allWallets.get(participant.wallet).sources.includes('raids_participant')) {
              allWallets.get(participant.wallet).sources.push('raids_participant');
            }
          });
        }
      });
    }

    // Display Results
    console.log('\n' + '='.repeat(100));
    console.log('\n🎯 ALL WALLETS & USERNAMES FOUND:\n');
    console.log('='.repeat(100));

    let index = 1;
    const walletsArray = Array.from(allWallets.entries());

    walletsArray.forEach(([wallet, info]) => {
      console.log(`\n${index}. 👤 ${info.username || info.display_name || 'NO USERNAME SET'}`);
      console.log(`   Wallet: ${wallet}`);
      if (info.username) console.log(`   Username: ${info.username}`);
      if (info.display_name) console.log(`   Display Name: ${info.display_name}`);
      if (info.avatar_url) console.log(`   Avatar: ${info.avatar_url.substring(0, 50)}...`);
      console.log(`   Found in: ${info.sources.join(', ')}`);
      index++;
    });

    console.log('\n' + '='.repeat(100));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total unique wallets: ${allWallets.size}`);
    console.log(`   Wallets with username: ${walletsArray.filter(([_, info]) => info.username).length}`);
    console.log(`   Wallets with display name: ${walletsArray.filter(([_, info]) => info.display_name).length}`);
    console.log(`   Wallets with no name: ${walletsArray.filter(([_, info]) => !info.username && !info.display_name).length}`);

    // Show breakdown by source
    console.log('\n📋 Breakdown by source:');
    const sourceCounts = {};
    walletsArray.forEach(([_, info]) => {
      info.sources.forEach(source => {
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      });
    });
    Object.entries(sourceCounts).forEach(([source, count]) => {
      console.log(`   - ${source}: ${count} wallets`);
    });

    console.log('\n' + '='.repeat(100));

  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

getAllWalletsAndUsernames();
