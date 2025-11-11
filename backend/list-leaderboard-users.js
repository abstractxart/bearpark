require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function listLeaderboardUsers() {
  console.log('🏆 Fetching all leaderboard users with wallet addresses...\n');
  console.log('='.repeat(100));

  try {
    // Get all game leaderboard entries with profile info
    const { data: leaderboardData, error: leaderboardError } = await supabase
      .from('game_leaderboard_with_profiles')
      .select('*')
      .order('score', { ascending: false });

    if (leaderboardError) {
      console.log('⚠️  game_leaderboard_with_profiles view not found, trying game_leaderboards table...\n');

      // Try direct table
      const { data: scores, error: scoresError } = await supabase
        .from('game_leaderboards')
        .select('*')
        .order('score', { ascending: false });

      if (scoresError) {
        console.error('❌ Error fetching game leaderboards:', scoresError);
        return;
      }

      if (!scores || scores.length === 0) {
        console.log('⚠️  No game scores found');
        return;
      }

      // Get unique wallet addresses
      const uniqueWallets = [...new Set(scores.map(s => s.wallet_address))];

      console.log(`\n📊 Found ${scores.length} total game scores from ${uniqueWallets.length} unique wallets\n`);
      console.log('-'.repeat(100));

      // Fetch user profiles for these wallets
      const { data: profiles } = await supabase
        .from('users')
        .select('*')
        .in('wallet_address', uniqueWallets);

      // Create a map of wallet -> profile
      const profileMap = {};
      if (profiles) {
        profiles.forEach(p => {
          profileMap[p.wallet_address] = p;
        });
      }

      // Group scores by wallet
      const walletScores = {};
      scores.forEach(score => {
        if (!walletScores[score.wallet_address]) {
          walletScores[score.wallet_address] = {
            wallet: score.wallet_address,
            username: score.username || profileMap[score.wallet_address]?.username || 'Not set',
            games: []
          };
        }
        walletScores[score.wallet_address].games.push({
          game: score.game_id,
          score: score.score,
          rank: score.rank || 'N/A'
        });
      });

      // Display results
      let userIndex = 1;
      for (const wallet in walletScores) {
        const user = walletScores[wallet];
        console.log(`\n${userIndex}. 👤 ${user.username.toUpperCase()}`);
        console.log(`   Wallet: ${user.wallet}`);
        console.log(`   Games Played: ${user.games.length}`);
        console.log(`   Scores:`);

        user.games.forEach(game => {
          console.log(`      - ${game.game}: ${game.score} (Rank #${game.rank})`);
        });

        userIndex++;
      }

      console.log('\n' + '='.repeat(100));
      console.log(`\n📊 SUMMARY:`);
      console.log(`   Total unique players: ${uniqueWallets.length}`);
      console.log(`   Total game scores: ${scores.length}`);
      console.log(`   Players with usernames: ${Object.values(walletScores).filter(u => u.username !== 'Not set').length}`);

      return;
    }

    // If we got data from the view
    if (!leaderboardData || leaderboardData.length === 0) {
      console.log('⚠️  No leaderboard data found');
      return;
    }

    console.log(`\n📊 Found ${leaderboardData.length} leaderboard entries\n`);
    console.log('-'.repeat(100));

    // Group by wallet
    const walletMap = {};
    leaderboardData.forEach(entry => {
      const wallet = entry.wallet_address;
      if (!walletMap[wallet]) {
        walletMap[wallet] = {
          wallet: wallet,
          username: entry.username || 'Not set',
          display_name: entry.display_name || 'Not set',
          avatar_url: entry.avatar_url || 'Not set',
          games: []
        };
      }
      walletMap[wallet].games.push({
        game: entry.game_id,
        score: entry.score,
        rank: entry.rank || 'N/A'
      });
    });

    let index = 1;
    for (const wallet in walletMap) {
      const user = walletMap[wallet];
      console.log(`\n${index}. 👤 ${user.username.toUpperCase()}`);
      console.log(`   Wallet: ${user.wallet}`);
      console.log(`   Display Name: ${user.display_name}`);
      console.log(`   Games Played: ${user.games.length}`);
      console.log(`   Scores:`);

      user.games.forEach(game => {
        console.log(`      - ${game.game}: ${game.score} (Rank #${game.rank})`);
      });

      index++;
    }

    console.log('\n' + '='.repeat(100));
    console.log(`\n📊 Total unique players: ${Object.keys(walletMap).length}`);

  } catch (err) {
    console.error('\n❌ Error:', err);
  }
}

listLeaderboardUsers();
