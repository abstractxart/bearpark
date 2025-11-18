/**
 * BEAR Park Pong API Integration
 * Handles win/loss tracking and leaderboard submission
 * Uses the same API structure as Flappy Bear
 */

const BEAR_API_URL = 'https://www.bearpark.xyz/api';
const GAME_ID = 'bear-pong';

export interface PongScoreSubmissionResult {
  success: boolean;
  is_high_score?: boolean;
  error?: string;
  message?: string;
}

export interface PongStats {
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
}

export class PongAPI {
  /**
   * Get the wallet address from localStorage (set by bearpark.xyz)
   */
  static getWalletAddress(): string | null {
    return localStorage.getItem('xaman_wallet_address');
  }

  /**
   * Get the user's display name from localStorage
   */
  static getDisplayName(): string {
    return localStorage.getItem('display_name') || 'Anonymous';
  }

  /**
   * Get the user's avatar URL from localStorage
   * This is the profile picture set on BEARpark
   */
  static getAvatarUrl(): string | null {
    return localStorage.getItem('avatar_url');
  }

  /**
   * Get the current user's formatted display name with full fallback logic
   */
  static getCurrentUserDisplayName(): string {
    const displayName = localStorage.getItem('display_name');
    if (displayName && displayName.trim() !== '') {
      return displayName;
    }

    const twitterUsername = localStorage.getItem('twitter_username');
    if (twitterUsername && twitterUsername.trim() !== '') {
      return twitterUsername;
    }

    const walletAddress = this.getWalletAddress();
    if (walletAddress) {
      return this.formatWalletAddress(walletAddress);
    }

    return 'Anonymous';
  }

  /**
   * Check if user is authenticated with XAMAN/Joey wallet
   */
  static isAuthenticated(): boolean {
    return !!this.getWalletAddress();
  }

  /**
   * Submit a win to the leaderboard
   * Wins are stored as the "score" field for leaderboard ranking
   */
  static async submitWin(metadata: Record<string, any> = {}): Promise<PongScoreSubmissionResult> {
    const walletAddress = this.getWalletAddress();

    if (!walletAddress) {
      console.log('ℹ️ Win not submitted - user not authenticated');
      return {
        success: false,
        error: 'Not authenticated',
        message: 'Connect your wallet at bearpark.xyz to save stats!'
      };
    }

    // Get current stats from DATABASE (source of truth), fallback to localStorage
    let wins = 0;
    let losses = 0;

    try {
      const dbStats = await this.getMyStats();
      if (dbStats) {
        // Match BEARpark main website format: wins/losses at top level
        wins = dbStats.wins || dbStats.score || 0;
        losses = dbStats.losses || 0;
        console.log(`📊 [SUBMIT WIN] Current database stats: ${wins}W ${losses}L`);
      } else {
        // No database entry - use localStorage as fallback
        const localStats = this.getLocalStats();
        wins = localStats.wins;
        losses = localStats.losses;
        console.log(`📊 [SUBMIT WIN] No database stats - using localStorage: ${wins}W ${losses}L`);
      }
    } catch (error) {
      console.error('❌ Error fetching database stats, using localStorage:', error);
      const localStats = this.getLocalStats();
      wins = localStats.wins;
      losses = localStats.losses;
    }

    // Increment wins
    wins++;

    // Save locally for offline access
    this.saveLocalStats({ wins, losses, totalGames: wins + losses, winRate: wins / (wins + losses) });

    try {
      const totalGames = wins + losses;
      const winRate = totalGames > 0 ? wins / totalGames : 0;

      const payload = {
        wallet_address: walletAddress,
        game_id: GAME_ID,
        score: wins, // Total wins is the leaderboard score
        // Include at top level for BEARpark main website compatibility
        wins: wins,
        losses: losses,
        win_rate: winRate,
        metadata: {
          ...metadata,
          wins: wins,
          losses: losses,
          total_games: totalGames,
          win_rate: winRate,
          timestamp: new Date().toISOString(),
          display_name: this.getDisplayName(),
          result: 'win'
        }
      };

      console.log(`📤 Submitting win to BEAR Park API...`);

      const response = await fetch(`${BEAR_API_URL}/leaderboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Win submitted to BEAR Park');

        // ✅ SYNC FIX: Verify database actually updated
        console.log('🔍 [WIN VERIFY] Waiting 1 second, then verifying database update...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const verifyStats = await this.getMyStats();
        if (verifyStats) {
          const verifiedWins = verifyStats.wins || verifyStats.score || 0;
          const verifiedLosses = verifyStats.losses || 0;
          console.log(`🔍 [WIN VERIFY] Database shows: ${verifiedWins}W ${verifiedLosses}L`);
          console.log(`🔍 [WIN VERIFY] Expected: ${wins}W ${losses}L`);

          if (verifiedWins === wins && verifiedLosses === losses) {
            console.log('✅ [WIN VERIFY] Database update confirmed!');
          } else {
            console.error('❌ [WIN VERIFY] Database does NOT match! Syncing localStorage from database...');
            // Sync localStorage from database (database is source of truth)
            this.saveLocalStats({
              wins: verifiedWins,
              losses: verifiedLosses,
              totalGames: verifiedWins + verifiedLosses,
              winRate: verifiedWins / (verifiedWins + verifiedLosses)
            });
          }
        }
      }

      return data;
    } catch (error) {
      console.error('❌ Error submitting win to BEAR Park:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Submit a loss (updates stats but doesn't change leaderboard rank)
   */
  static async submitLoss(metadata: Record<string, any> = {}): Promise<PongScoreSubmissionResult> {
    const walletAddress = this.getWalletAddress();

    if (!walletAddress) {
      console.log('ℹ️ Loss not submitted - user not authenticated');
      return {
        success: false,
        error: 'Not authenticated',
        message: 'Connect your wallet at bearpark.xyz to save stats!'
      };
    }

    // Get current stats from DATABASE (source of truth), fallback to localStorage
    let wins = 0;
    let losses = 0;

    try {
      const dbStats = await this.getMyStats();
      if (dbStats) {
        // Match BEARpark main website format: wins/losses at top level
        wins = dbStats.wins || dbStats.score || 0;
        losses = dbStats.losses || 0;
        console.log(`📊 [SUBMIT LOSS] Current database stats: ${wins}W ${losses}L`);
      } else {
        // No database entry - use localStorage as fallback
        const localStats = this.getLocalStats();
        wins = localStats.wins;
        losses = localStats.losses;
        console.log(`📊 [SUBMIT LOSS] No database stats - using localStorage: ${wins}W ${losses}L`);
      }
    } catch (error) {
      console.error('❌ Error fetching database stats, using localStorage:', error);
      const localStats = this.getLocalStats();
      wins = localStats.wins;
      losses = localStats.losses;
    }

    // Increment losses
    losses++;

    // Save locally for offline access
    this.saveLocalStats({ wins, losses, totalGames: wins + losses, winRate: wins / (wins + losses) });

    try {
      const totalGames = wins + losses;
      const winRate = totalGames > 0 ? wins / totalGames : 0;

      const payload = {
        wallet_address: walletAddress,
        game_id: GAME_ID,
        score: wins, // Total wins remains the leaderboard score
        // Include at top level for BEARpark main website compatibility
        wins: wins,
        losses: losses,
        win_rate: winRate,
        metadata: {
          ...metadata,
          wins: wins,
          losses: losses,
          total_games: totalGames,
          win_rate: winRate,
          timestamp: new Date().toISOString(),
          display_name: this.getDisplayName(),
          result: 'loss'
        }
      };

      console.log(`📤 Submitting loss to BEAR Park API...`);

      const response = await fetch(`${BEAR_API_URL}/leaderboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Loss submitted to BEAR Park');

        // ✅ SYNC FIX: Verify database actually updated
        console.log('🔍 [LOSS VERIFY] Waiting 1 second, then verifying database update...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const verifyStats = await this.getMyStats();
        if (verifyStats) {
          const verifiedWins = verifyStats.wins || verifyStats.score || 0;
          const verifiedLosses = verifyStats.losses || 0;
          console.log(`🔍 [LOSS VERIFY] Database shows: ${verifiedWins}W ${verifiedLosses}L`);
          console.log(`🔍 [LOSS VERIFY] Expected: ${wins}W ${losses}L`);

          if (verifiedWins === wins && verifiedLosses === losses) {
            console.log('✅ [LOSS VERIFY] Database update confirmed!');
          } else {
            console.error('❌ [LOSS VERIFY] Database does NOT match! Syncing localStorage from database...');
            // Sync localStorage from database (database is source of truth)
            this.saveLocalStats({
              wins: verifiedWins,
              losses: verifiedLosses,
              totalGames: verifiedWins + verifiedLosses,
              winRate: verifiedWins / (verifiedWins + verifiedLosses)
            });
          }
        }
      }

      return data;
    } catch (error) {
      console.error('❌ Error submitting loss to BEAR Park:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get local stats from localStorage
   */
  static getLocalStats(): PongStats {
    const wins = parseInt(localStorage.getItem('pongWins') || '0');
    const losses = parseInt(localStorage.getItem('pongLosses') || '0');
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? wins / totalGames : 0;

    return { wins, losses, totalGames, winRate };
  }

  /**
   * Save stats to localStorage
   */
  static saveLocalStats(stats: PongStats) {
    localStorage.setItem('pongWins', stats.wins.toString());
    localStorage.setItem('pongLosses', stats.losses.toString());
  }

  /**
   * Get the Pong leaderboard (ranked by total wins)
   */
  static async getLeaderboard(limit: number = 10): Promise<any[]> {
    try {
      const url = `${BEAR_API_URL}/leaderboard/${GAME_ID}?limit=${limit}`;
      console.log('🔍 Fetching Pong leaderboard from:', url);

      const response = await fetch(url);
      const data = await response.json();

      return data.leaderboard || [];
    } catch (error) {
      console.error('❌ Error fetching Pong leaderboard:', error);
      return [];
    }
  }

  /**
   * Get the current user's Pong stats from server
   */
  static async getMyStats(): Promise<any | null> {
    const walletAddress = this.getWalletAddress();

    if (!walletAddress) {
      return null;
    }

    try {
      const response = await fetch(`${BEAR_API_URL}/leaderboard/${GAME_ID}/${walletAddress}`);
      const data = await response.json();
      return data.entry || null;
    } catch (error) {
      console.error('❌ Error fetching user stats from BEAR Park:', error);
      return null;
    }
  }

  /**
   * Format wallet address to show first 4 and last 4 characters
   */
  static formatWalletAddress(walletAddress: string): string {
    if (!walletAddress || walletAddress.length < 8) {
      return walletAddress;
    }
    return `${walletAddress.substring(0, 4)}...${walletAddress.substring(walletAddress.length - 4)}`;
  }

  /**
   * Get display name for a leaderboard entry with fallback logic
   */
  static formatDisplayName(entry: any): string {
    if (entry.display_name) {
      return entry.display_name;
    }

    if (entry.twitter_username) {
      return entry.twitter_username;
    }

    if (entry.wallet_address) {
      return this.formatWalletAddress(entry.wallet_address);
    }

    return 'Anonymous';
  }

  /**
   * Get the user's HONEY balance from BEARpark
   */
  static async getHoneyBalance(): Promise<number> {
    const walletAddress = this.getWalletAddress();

    console.log('🔍 [HONEY DEBUG] Starting balance fetch...');
    console.log('🔍 [HONEY DEBUG] Wallet address from localStorage:', walletAddress);
    console.log('🔍 [HONEY DEBUG] localStorage keys:', Object.keys(localStorage));

    if (!walletAddress) {
      console.log('⚠️ [HONEY DEBUG] No wallet connected - balance is 0');
      return 0;
    }

    try {
      const url = `${BEAR_API_URL}/profile/${walletAddress}`;
      console.log('🔍 [HONEY DEBUG] Fetching from URL:', url);

      const response = await fetch(url);
      console.log('🔍 [HONEY DEBUG] Response status:', response.status);
      console.log('🔍 [HONEY DEBUG] Response ok:', response.ok);

      const data = await response.json();
      console.log('🔍 [HONEY DEBUG] Full API response:', JSON.stringify(data, null, 2));

      if (data.success && data.profile) {
        // Use TOTAL honey
        const totalBalance = data.profile.honey ?? 0;
        console.log(`✅ [HONEY DEBUG] TOTAL HONEY balance: ${totalBalance}`);
        return totalBalance;
      }

      console.log('⚠️ [HONEY DEBUG] Response structure invalid:');
      console.log('  - data.success:', data.success);
      console.log('  - data.profile exists:', !!data.profile);
      return 0;
    } catch (error) {
      console.error('❌ [HONEY DEBUG] Error fetching HONEY balance:', error);
      if (error instanceof Error) {
        console.error('❌ [HONEY DEBUG] Error message:', error.message);
        console.error('❌ [HONEY DEBUG] Error stack:', error.stack);
      }
      return 0;
    }
  }

  /**
   * Get updated balance from database (for syncing localStorage)
   */
  static async getUpdatedBalance(): Promise<{ total: number; raiding: number; games: number } | null> {
    const walletAddress = this.getWalletAddress();

    if (!walletAddress) {
      return null;
    }

    try {
      const response = await fetch(`${BEAR_API_URL}/profile/${walletAddress}`);
      const data = await response.json();

      if (data.success && data.profile) {
        return {
          total: data.profile.honey || 0,
          raiding: data.profile.honey_raiding || 0,
          games: data.profile.honey_games || 0
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching updated balance:', error);
      return null;
    }
  }

  /**
   * 💰 Process betting transaction - Add or subtract HONEY based on win/loss
   * @param didWin - Whether the player won the game
   * @param betAmount - The amount that was bet
   */
  static async processBettingTransaction(didWin: boolean, betAmount: number): Promise<boolean> {
    const walletAddress = this.getWalletAddress();

    console.log(`🔥 [BETTING DEBUG] Starting transaction - didWin: ${didWin}, betAmount: ${betAmount}, wallet: ${walletAddress}`);

    if (!walletAddress) {
      console.log('⚠️ [BETTING] No wallet connected - skipping bet transaction');
      return false;
    }

    // If bet is 0, skip transaction
    if (betAmount === 0) {
      console.log('💰 [BETTING] Bet amount is 0 - no transaction needed');
      return true;
    }

    try {
      // Fetch FULL profile to get raiding_points, games_points breakdown
      const profileResponse = await fetch(`${BEAR_API_URL}/profile/${walletAddress}`);
      const profileData = await profileResponse.json();

      if (!profileData.success || !profileData.profile) {
        console.error('❌ [BETTING] Failed to fetch profile');
        return false;
      }

      const currentRaidingPoints = profileData.profile.honey_raiding || 0;
      const currentGamesPoints = profileData.profile.honey_games || 0;
      const currentTotalPoints = profileData.profile.honey || 0;

      console.log(`💰 [BETTING] Current breakdown: Raiding=${currentRaidingPoints}, Games=${currentGamesPoints}, Total=${currentTotalPoints}`);

      // Calculate new games_points (betting only affects games_points, NOT raiding_points!)
      let newGamesPoints: number;

      if (didWin) {
        // Winner gets NET +betAmount (they win opponent's bet, their own bet stays)
        // Player bets 20, opponent bets 20, pot = 40 → winner gets +20 NET
        newGamesPoints = currentGamesPoints + betAmount;
        console.log(`💰 [BETTING] WIN: Adding ${betAmount} to games (${currentGamesPoints} → ${newGamesPoints})`);
      } else {
        // Loser loses their bet amount from games_points
        newGamesPoints = Math.max(0, currentGamesPoints - betAmount);
        console.log(`💰 [BETTING] LOSS: Subtracting ${betAmount} from games (${currentGamesPoints} → ${newGamesPoints})`);
      }

      // Calculate new total = raiding + games
      const newTotalPoints = currentRaidingPoints + newGamesPoints;
      console.log(`💰 [BETTING] New total: ${currentRaidingPoints} (raiding) + ${newGamesPoints} (games) = ${newTotalPoints}`);

      console.log(`🔥 [BETTING DEBUG] Posting to /api/points with raiding=${currentRaidingPoints}, games=${newGamesPoints}, total=${newTotalPoints}`);

      // Update balance via API - PRESERVE raiding_points!!!
      const response = await fetch(`${BEAR_API_URL}/points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          total_points: newTotalPoints,
          raiding_points: currentRaidingPoints, // PRESERVE raiding points!
          games_points: newGamesPoints
        })
      });

      console.log(`🔥 [BETTING DEBUG] Response status: ${response.status}`);

      const data = await response.json();
      console.log(`🔥 [BETTING DEBUG] Response data:`, data);

      if (!data.success) {
        console.error('❌ [BETTING] Failed to update balance:', data);
        return false;
      }

      console.log(`✅ [BETTING] Transaction complete! New total: ${newTotalPoints} HONEY (Raiding: ${currentRaidingPoints}, Games: ${newGamesPoints})`);

      // 🔍 VERIFICATION: Wait and verify the database actually updated
      console.log('🔍 [BETTING VERIFY] Waiting 1 second, then verifying database update...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Fetch the profile again to verify the update persisted
      const verifyResponse = await fetch(`${BEAR_API_URL}/profile/${walletAddress}`);
      const verifyData = await verifyResponse.json();

      if (verifyData.success && verifyData.profile) {
        const verifiedTotal = verifyData.profile.honey || 0;
        const verifiedGames = verifyData.profile.honey_games || 0;

        console.log(`🔍 [BETTING VERIFY] Database shows: Total=${verifiedTotal}, Games=${verifiedGames}`);
        console.log(`🔍 [BETTING VERIFY] Expected: Total=${newTotalPoints}, Games=${newGamesPoints}`);

        if (verifiedTotal === newTotalPoints && verifiedGames === newGamesPoints) {
          console.log('✅ [BETTING VERIFY] Database update confirmed!');
          return true;
        } else {
          console.error('❌ [BETTING VERIFY] Database does NOT match! Transaction may have failed silently.');
          console.error(`   Expected Total=${newTotalPoints}, Games=${newGamesPoints}`);
          console.error(`   Got Total=${verifiedTotal}, Games=${verifiedGames}`);
          return false;
        }
      } else {
        console.error('❌ [BETTING VERIFY] Could not verify - profile fetch failed');
        return false;
      }
    } catch (error) {
      console.error('❌ [BETTING] Error processing bet transaction:', error);
      return false;
    }
  }
}
