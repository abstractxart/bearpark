/**
 * PongGameOverScene - Game over screen with results and stats submission
 */
import Phaser from 'phaser';
import { PongAPI } from '../PongAPI';
import { PongClient } from '../networking/PongClient';
import type { PlayerData } from '../networking/types';

export class PongGameOverScene extends Phaser.Scene {
  private didWin: boolean = false;
  private yourScore: number = 0;
  private opponentScore: number = 0;
  private opponent: PlayerData | null = null;
  private pongClient: PongClient | null = null;
  private leaderboard: any[] = [];
  private gameStartTime: number = 0; // ⏱️ Track game start time for rewards
  private betAmount: number = 0; // 💰 Bet amount from server

  constructor() {
    super({ key: 'PongGameOverScene' });
  }

  init(data: any) {
    this.didWin = data.didWin;
    this.yourScore = data.yourScore;
    this.opponentScore = data.opponentScore;
    this.opponent = data.opponent;
    this.pongClient = data.pongClient;
    this.gameStartTime = data.gameStartTime || 0; // ⏱️ Receive game start time
    this.betAmount = data.betAmount || 0; // 💰 Receive bet amount
  }

  async create() {
    const { width, height } = this.cameras.main;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a1a, 1).setOrigin(0);

    // "GAME OVER" title
    const gameOverText = this.add.text(
      width / 2,
      100,
      this.didWin ? 'VICTORY!' : 'GAME OVER',
      {
        fontSize: '64px',
        color: this.didWin ? '#07ae08' : '#ffae00',
        fontStyle: 'bold',
        fontFamily: 'Luckiest Guy'
      }
    );
    gameOverText.setOrigin(0.5);
    gameOverText.setStroke('#000000', 6);

    // Star rating (1-5 stars based on score)
    this.displayStarRating(width / 2, 160);

    // 💰 BETTING: Show winnings/losses
    this.displayWinnings(width / 2, 200);

    // Submit result to API FIRST (before displaying stats)
    await this.submitResult();

    // ✅ SYNC FIX: Wait for database to propagate the win/loss
    console.log('⏳ Waiting 2 seconds for database to update...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Score display with gradient border (NOW with updated stats from database)
    this.displayScoreBox(width / 2, 280);

    // ⏱️ Award honey points for gameplay time FIRST (so betting doesn't get overwritten)
    await this.awardHoneyPoints();

    // Wait 2 seconds for:
    // 1. Database to propagate time reward
    // 2. Main page to refetch balance (triggered by gamePointsAwarded event)
    // 3. Popup notification to appear
    // Then betting transaction runs LAST as final update
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 💰 BETTING: Process betting transaction LAST (add/subtract HONEY)
    await this.processBetting();

    // 💰 BETTING: Show big betting results screen (if bet > 0)
    if (this.betAmount > 0) {
      await this.showBettingResultsScreen();

      // Wait 3 more seconds for:
      // 1. gamePointsAwarded event handlers to complete
      // 2. Any main page refetches to finish
      // 3. Database to fully commit betting transaction
      // This prevents the main page from showing stale balance
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Show leaderboard with "TOP 10 PLAYERS" title
    await this.loadAndDisplayLeaderboard(width / 2, 400);

    // Styled buttons (positioned below leaderboard)
    this.createStyledButtons(width / 2, height - 100);
  }

  /**
   * Submit win/loss to BEARpark API
   */
  private async submitResult() {
    try {
      if (this.didWin) {
        await PongAPI.submitWin({
          opponent: this.opponent?.displayName,
          your_score: this.yourScore,
          opponent_score: this.opponentScore
        });
        console.log('✅ Win submitted to BEARpark');
      } else {
        await PongAPI.submitLoss({
          opponent: this.opponent?.displayName,
          your_score: this.yourScore,
          opponent_score: this.opponentScore
        });
        console.log('✅ Loss submitted to BEARpark');
      }
    } catch (error) {
      console.error('❌ Error submitting result:', error);
    }
  }

  /**
   * 💰 Process betting transaction - Add or subtract HONEY based on win/loss
   */
  private async processBetting() {
    console.log(`💰 [BETTING] Processing bet transaction: ${this.didWin ? 'WIN' : 'LOSS'}, bet amount: ${this.betAmount}`);

    try {
      const success = await PongAPI.processBettingTransaction(this.didWin, this.betAmount);

      if (success) {
        console.log(`✅ [BETTING] Betting transaction successful!`);

        // 💾 UPDATE LOCALSTORAGE: Sync localStorage with database to prevent main page from overwriting
        // The main page has logic that syncs "local > backend", so we must update localStorage here
        const newBalance = await PongAPI.getUpdatedBalance();
        if (newBalance !== null) {
          console.log(`💾 [BETTING] Updating localStorage with new balance: ${newBalance.total}`);

          // Main page uses wallet-specific key: honey_points_${walletAddress}
          const walletAddress = PongAPI.getWalletAddress();
          if (walletAddress) {
            const pointsKey = `honey_points_${walletAddress}`;
            localStorage.setItem(pointsKey, JSON.stringify(newBalance));
            console.log(`💾 [BETTING] Updated localStorage key: ${pointsKey}`);
          }
        }
      } else {
        console.log(`⚠️ [BETTING] Betting transaction failed`);
      }
    } catch (error) {
      console.error('❌ [BETTING] Error processing betting transaction:', error);
    }
  }

  /**
   * Display updated player stats
   */
  private displayStats(x: number, y: number) {
    const stats = PongAPI.getLocalStats();

    const statsContainer = this.add.container(x, y);

    // Title
    const statsTitle = this.add.text(0, 0, 'Your Stats', {
      fontSize: '24px',
      color: '#4a90e2',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    statsTitle.setOrigin(0.5);
    statsTitle.setStroke('#000000', 3);
    statsContainer.add(statsTitle);

    // Stats display
    const statsText = this.add.text(
      0,
      40,
      `Wins: ${stats.wins}  |  Losses: ${stats.losses}  |  Win Rate: ${(stats.winRate * 100).toFixed(1)}%`,
      {
        fontSize: '18px',
        color: '#ffffff'
      }
    );
    statsText.setOrigin(0.5);
    statsContainer.add(statsText);

    // Fade in animation
    statsContainer.setAlpha(0);
    this.tweens.add({
      targets: statsContainer,
      alpha: 1,
      duration: 500,
      delay: 300
    });
  }

  /**
   * Load and display leaderboard
   */
  private async loadAndDisplayLeaderboard(x: number, y: number) {
    const leaderboardContainer = this.add.container(x, y);

    // Title
    const title = this.add.text(0, 0, '🏆 TOP 10 PLAYERS 🏆', {
      fontSize: '32px',
      color: '#ffae00',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    title.setOrigin(0.5);
    title.setStroke('#000000', 3);
    leaderboardContainer.add(title);

    // Loading text
    const loadingText = this.add.text(0, 40, 'Loading...', {
      fontSize: '16px',
      color: '#888888'
    });
    loadingText.setOrigin(0.5);
    leaderboardContainer.add(loadingText);

    // Fetch leaderboard
    try {
      this.leaderboard = await PongAPI.getLeaderboard(10);

      // Remove loading text
      loadingText.destroy();

      // Display leaderboard entries
      if (this.leaderboard.length > 0) {
        this.leaderboard.forEach((entry, index) => {
          const displayName = PongAPI.formatDisplayName(entry);
          // Read wins/losses from top level first, then fallback to metadata (for old entries)
          const wins = entry.wins || entry.score || (entry.metadata?.wins) || 0;
          const losses = entry.losses || (entry.metadata?.losses) || 0;

          const entryText = this.add.text(
            0,
            40 + index * 30,
            `${index + 1}. ${displayName} - ${wins}W ${losses}L`,
            {
              fontSize: '18px',
              color: '#ffffff',
              fontFamily: 'Luckiest Guy'
            }
          );
          entryText.setOrigin(0.5);
          leaderboardContainer.add(entryText);
        });
      } else {
        const noDataText = this.add.text(0, 40, 'No leaderboard data yet', {
          fontSize: '16px',
          color: '#888888'
        });
        noDataText.setOrigin(0.5);
        leaderboardContainer.add(noDataText);
      }
    } catch (error) {
      loadingText.setText('Failed to load leaderboard');
      console.error('Error loading leaderboard:', error);
    }

    // Fade in animation
    leaderboardContainer.setAlpha(0);
    this.tweens.add({
      targets: leaderboardContainer,
      alpha: 1,
      duration: 500,
      delay: 600
    });
  }

  /**
   * Create action buttons
   */
  private createButtons(x: number, y: number) {
    // Play Again button
    const playAgainBtn = this.add.text(x, y, '[ Play Again ]', {
      fontSize: '24px',
      color: '#4ade80'
    });
    playAgainBtn.setOrigin(0.5);
    playAgainBtn.setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerover', () => {
      playAgainBtn.setScale(1.1);
    });

    playAgainBtn.on('pointerout', () => {
      playAgainBtn.setScale(1);
    });

    playAgainBtn.on('pointerdown', () => {
      this.playAgain();
    });

    // Main Menu button
    const menuBtn = this.add.text(x, y + 60, '[ Main Menu ]', {
      fontSize: '20px',
      color: '#888888'
    });
    menuBtn.setOrigin(0.5);
    menuBtn.setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => {
      menuBtn.setScale(1.1);
      menuBtn.setColor('#ffffff');
    });

    menuBtn.on('pointerout', () => {
      menuBtn.setScale(1);
      menuBtn.setColor('#888888');
    });

    menuBtn.on('pointerdown', () => {
      this.returnToMenu();
    });

    // Fade in animations
    playAgainBtn.setAlpha(0);
    menuBtn.setAlpha(0);

    this.tweens.add({
      targets: [playAgainBtn, menuBtn],
      alpha: 1,
      duration: 500,
      delay: 900
    });
  }

  /**
   * Play another game
   */
  private playAgain() {
    // Disconnect previous client if exists
    if (this.pongClient) {
      // ✅ FIX: Send "leave" message to server BEFORE disconnecting
      // This tells the server you're intentionally leaving, preventing it from
      // broadcasting "opponent_disconnected" to the other player
      console.log('🚪 Sending leave message to server...');
      this.pongClient.leave();

      // Small delay to ensure leave message is sent before disconnect
      setTimeout(() => {
        if (this.pongClient) {
          this.pongClient.disconnect();
        }
      }, 100);
    }

    // Go back to lobby to find new opponent
    this.scene.start('PongLobbyScene');
  }

  /**
   * Return to main menu
   */
  private returnToMenu() {
    // 🎵 Stop music when leaving BEAR PONG (going back to main site)
    const globalAudioManager = this.game.registry.get('globalAudioManager');
    if (globalAudioManager) {
      globalAudioManager.stopBackgroundMusic();
      console.log('🔇 Stopped music - leaving BEAR PONG');
    }

    // Disconnect client if exists
    if (this.pongClient) {
      // ✅ FIX: Send "leave" message to server BEFORE disconnecting
      // This tells the server you're intentionally leaving, preventing it from
      // broadcasting "opponent_disconnected" to the other player
      console.log('🚪 Sending leave message to server...');
      this.pongClient.leave();

      // Small delay to ensure leave message is sent before disconnect
      setTimeout(() => {
        if (this.pongClient) {
          this.pongClient.disconnect();
        }

        // Force a hard reload to refresh HONEY balance
        // Add cache-busting timestamp to ensure fresh data
        window.location.href = `/?refresh=${Date.now()}`;
      }, 100);
    } else {
      // No client, just reload
      window.location.href = `/?refresh=${Date.now()}`;
    }
  }

  /**
   * Award honey points for gameplay time (time-based rewards system)
   */
  private async awardHoneyPoints() {
    const walletAddress = PongAPI.getWalletAddress();

    if (!walletAddress) {
      console.log('⚠️ [REWARD] No wallet connected - skipping HONEY reward');
      return;
    }

    // Calculate minutes played
    if (!this.gameStartTime) {
      console.log('⚠️ [REWARD] No game start time - skipping HONEY reward');
      return;
    }

    const gameEndTime = Date.now();
    const millisecondsPlayed = gameEndTime - this.gameStartTime;
    const minutesPlayed = millisecondsPlayed / 60000; // Convert to minutes

    console.log(`⏱️ [REWARD] Game duration: ${minutesPlayed.toFixed(2)} minutes`);

    // Ensure minimum 10 seconds (0.166 minutes) for rewards
    if (minutesPlayed < 0.166) {
      console.log('⚠️ [REWARD] Game too short (< 10 seconds) - no rewards');
      return;
    }

    try {
      // Call the global awardGamePoints function from game-points-helper.js
      const awardGamePoints = (window as any).awardGamePoints;

      if (typeof awardGamePoints === 'function') {
        console.log(`🍯 [REWARD] Calling awardGamePoints with ${minutesPlayed.toFixed(2)} minutes...`);
        const result = await awardGamePoints('bear-pong', minutesPlayed);

        if (result && result.success) {
          console.log(`✅ [REWARD] Successfully awarded ${result.points_awarded} HONEY!`);
        } else {
          console.log(`⚠️ [REWARD] ${result?.message || 'Failed to award points'}`);
        }
      } else {
        console.error('❌ [REWARD] awardGamePoints function not found - game-points-helper.js may not be loaded');
      }
    } catch (error) {
      console.error('❌ [REWARD] Error awarding HONEY points:', error);
    }
  }

  /**
   * 💰 Display betting winnings/losses
   */
  private displayWinnings(x: number, y: number) {
    // Don't show anything if bet was 0
    if (this.betAmount === 0) {
      return;
    }

    let text = '';
    let color = '';

    if (this.didWin) {
      text = `+${this.betAmount} HONEY WON! 🎉`;
      color = '#07ae08';
    } else {
      text = `-${this.betAmount} HONEY LOST 😢`;
      color = '#ff4500';
    }

    const winningsText = this.add.text(x, y, text, {
      fontSize: '32px',
      color: color,
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    });
    winningsText.setOrigin(0.5);

    // Pulse animation
    this.tweens.add({
      targets: winningsText,
      scale: { from: 1.0, to: 1.2 },
      duration: 800,
      yoyo: true,
      repeat: -1
    });
  }

  /**
   * 💰 BETTING: Show fullscreen betting results (win/loss)
   */
  private async showBettingResultsScreen(): Promise<void> {
    return new Promise((resolve) => {
      const { width, height } = this.cameras.main;

      // Semi-transparent overlay
      const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85);
      overlay.setOrigin(0);
      overlay.setDepth(1000);
      overlay.setAlpha(0);

      // Determine text and color
      const isWin = this.didWin;
      const amount = this.betAmount; // Winner gets NET +betAmount (won opponent's bet)
      const text = isWin ? `+${amount} HONEY POINTS` : `-${this.betAmount} HONEY POINTS`;
      const color = isWin ? '#07ae08' : '#ff4500'; // Green for win, red for loss

      // Big text display
      const resultText = this.add.text(width / 2, height / 2, text, {
        fontSize: '72px',
        color: color,
        fontFamily: 'Luckiest Guy',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 8
      });
      resultText.setOrigin(0.5);
      resultText.setDepth(1001);
      resultText.setAlpha(0);
      resultText.setScale(0.5);

      // Fade in overlay
      this.tweens.add({
        targets: overlay,
        alpha: 1,
        duration: 300,
        ease: 'Power2'
      });

      // Animate text in
      this.tweens.add({
        targets: resultText,
        alpha: 1,
        scale: 1,
        duration: 500,
        ease: 'Back.easeOut',
        onComplete: () => {
          // Pulse animation
          this.tweens.add({
            targets: resultText,
            scale: { from: 1.0, to: 1.1 },
            duration: 600,
            yoyo: true,
            repeat: 2
          });

          // Wait 2.5 seconds, then fade out
          this.time.delayedCall(2500, () => {
            // Fade out
            this.tweens.add({
              targets: [overlay, resultText],
              alpha: 0,
              duration: 400,
              ease: 'Power2',
              onComplete: () => {
                overlay.destroy();
                resultText.destroy();
                resolve();
              }
            });
          });
        }
      });
    });
  }

  /**
   * Display star rating (1-5 stars based on performance)
   */
  private displayStarRating(x: number, y: number) {
    const stars = this.didWin ? (this.yourScore >= 3 ? 5 : 3) : 1;
    const starSize = 48;
    const spacing = 45;
    const startX = x - (spacing * 2);

    for (let i = 0; i < 5; i++) {
      const star = this.add.text(startX + (i * spacing), y, '★', {
        fontSize: starSize + 'px',
        color: i < stars ? '#FFD700' : '#404040'
      });
      star.setOrigin(0.5);
    }
  }

  /**
   * Display score with gradient border box
   * ✅ SYNC FIX: Now fetches from database to match betting screen and BearPark website
   */
  private async displayScoreBox(x: number, y: number) {
    // ✅ SYNC FIX: Fetch from DATABASE (source of truth), not localStorage
    let wins = 0;
    let losses = 0;
    let winRate = 0;

    const dbStats = await PongAPI.getMyStats();
    if (dbStats) {
      // Match BEARpark main website format: wins/losses at top level
      wins = dbStats.wins || dbStats.score || 0;
      losses = dbStats.losses || 0;
      winRate = dbStats.win_rate || 0;
      console.log(`📊 [GAME OVER] Displaying stats from DATABASE: ${wins}W ${losses}L (${(winRate * 100).toFixed(0)}%)`);
    } else {
      // Fallback to localStorage only if database fails
      const localStats = PongAPI.getLocalStats();
      wins = localStats.wins;
      losses = localStats.losses;
      winRate = localStats.winRate;
      console.log(`📊 [GAME OVER] Database failed - displaying stats from LOCALSTORAGE: ${wins}W ${losses}L (${(winRate * 100).toFixed(0)}%)`);
    }

    const { width } = this.cameras.main;

    // Box dimensions
    const boxWidth = width * 0.85;
    const boxHeight = 120;
    const graphics = this.add.graphics();

    // Rainbow gradient border
    graphics.lineStyle(5, 0x680cd9, 1);
    graphics.strokeRoundedRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 15);


    // Inner box
    graphics.fillStyle(0x2a2a2a, 0.95);
    graphics.fillRoundedRect(x - boxWidth / 2 + 5, y - boxHeight / 2 + 5, boxWidth - 10, boxHeight - 10, 12);

    // Score title
    const scoreTitle = this.add.text(x, y - 30, 'YOUR SCORE', {
      fontSize: '26px',
      color: '#ffae00',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    scoreTitle.setOrigin(0.5);
    scoreTitle.setStroke('#000000', 3);

    // Score value (total wins)
    const scoreValue = this.add.text(x, y + 10, wins.toString(), {
      fontSize: '60px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    scoreValue.setOrigin(0.5);

    // Win badge
    const winsText = this.add.text(x, y + 40, `🏆 ${wins} WIN${wins !== 1 ? 'S' : ''}`, {
      fontSize: '20px',
      color: '#FFD700',
      fontFamily: 'Luckiest Guy'
    });
    winsText.setOrigin(0.5);
  }

  /**
   * Create styled buttons side-by-side (not blocking leaderboard)
   */
  private createStyledButtons(x: number, y: number) {
    const { width } = this.cameras.main;
    const buttonWidth = width * 0.28; // Much smaller buttons (28% width)
    const buttonHeight = 45; // Compact height
    const spacing = 15; // Gap between buttons

    // Calculate positions for side-by-side layout (spread apart by 15% each direction)
    const leftButtonX = x - buttonWidth / 2 - spacing / 2 - (width * 0.15);
    const rightButtonX = x + buttonWidth / 2 + spacing / 2 + (width * 0.15);

    // "TAP TO RETRY" button (LEFT)
    const retryGraphics = this.add.graphics();
    retryGraphics.fillStyle(0x07ae08, 1);
    retryGraphics.fillRoundedRect(leftButtonX - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 10);

    const retryText = this.add.text(leftButtonX, y, 'TAP TO RETRY', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    retryText.setOrigin(0.5);

    const retryContainer = this.add.container(0, 0);
    retryContainer.add([retryGraphics, retryText]);
    retryContainer.setInteractive(
      new Phaser.Geom.Rectangle(leftButtonX - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight),
      Phaser.Geom.Rectangle.Contains
    );

    retryContainer.on('pointerdown', () => {
      this.playAgain();
    });

    retryContainer.on('pointerover', () => {
      retryGraphics.clear();
      retryGraphics.fillStyle(0x09d00a, 1);
      retryGraphics.fillRoundedRect(leftButtonX - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 10);
    });

    retryContainer.on('pointerout', () => {
      retryGraphics.clear();
      retryGraphics.fillStyle(0x07ae08, 1);
      retryGraphics.fillRoundedRect(leftButtonX - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 10);
    });

    // "BACK TO BEARPARK" button (RIGHT)
    const menuGraphics = this.add.graphics();

    // Yellow filled button
    menuGraphics.fillStyle(0xffae00, 1);
    menuGraphics.fillRoundedRect(rightButtonX - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 10);

    const menuText = this.add.text(rightButtonX, y, 'BACK TO BEARPARK', {
      fontSize: '17px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    menuText.setOrigin(0.5);

    const menuContainer = this.add.container(0, 0);
    menuContainer.add([menuGraphics, menuText]);
    menuContainer.setInteractive(
      new Phaser.Geom.Rectangle(rightButtonX - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight),
      Phaser.Geom.Rectangle.Contains
    );

    menuContainer.on('pointerdown', () => {
      this.returnToMenu();
    });

    menuContainer.on('pointerover', () => {
      menuText.setColor('#ffae00');
    });

    menuContainer.on('pointerout', () => {
      menuText.setColor('#ffffff');
    });
  }
}
