/**
 * PongBettingLobbyScene - Players set their bets and ready up before game starts
 */
import Phaser from 'phaser';
import { PongClient } from '../networking/PongClient';
import type { PlayerData } from '../networking/types';
import { PongAPI } from '../PongAPI';

export class PongBettingLobbyScene extends Phaser.Scene {
  private pongClient: PongClient | null = null;
  private opponent: PlayerData | null = null;
  private yourSide: 'left' | 'right' = 'left';

  private myBetAmount: number = 0;
  private opponentBetAmount: number = 0;
  private finalBetAmount: number = 0;
  private myHoneyBalance: number = 0;

  private isReady: boolean = false;
  private opponentIsReady: boolean = false;

  private countdown: number = 30;
  private countdownText: Phaser.GameObjects.Text | null = null;
  private timerEvent: Phaser.Time.TimerEvent | null = null;

  private readyButton: Phaser.GameObjects.Container | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private opponentBetText: Phaser.GameObjects.Text | null = null;
  private yourBetText: Phaser.GameObjects.Text | null = null;
  private betSelectorContainer: Phaser.GameObjects.Container | null = null;

  private myAvatarUrl: string | null = null;
  private opponentAvatarUrl: string | null = null;
  private myAvatarIsAnimated: boolean = false;
  private opponentAvatarIsAnimated: boolean = false;

  // Stats for intimidation factor 🔥
  private myStats: { wins: number; losses: number; winRate: number } | null = null;
  private opponentStats: { wins: number; losses: number; winRate: number } | null = null;

  constructor() {
    super({ key: 'PongBettingLobbyScene' });
  }

  init(data: any) {
    this.pongClient = data.pongClient;
    this.opponent = data.opponent;
    this.yourSide = data.yourSide;

    // Reset state
    this.myBetAmount = 0;
    this.opponentBetAmount = 0;
    this.finalBetAmount = 0;
    this.isReady = false;
    this.opponentIsReady = false;
    this.countdown = 30;

    // Get avatar URLs and animation flags from BEARpark
    this.myAvatarUrl = PongAPI.getAvatarUrl();
    this.myAvatarIsAnimated = localStorage.getItem('avatar_is_animated') === 'true';
    this.opponentAvatarUrl = this.opponent?.avatarUrl || null;
    this.opponentAvatarIsAnimated = this.opponent?.avatarIsAnimated || false;

    console.log('🖼️ [BETTING LOBBY] My avatar:', this.myAvatarUrl, 'isAnimated:', this.myAvatarIsAnimated);
    console.log('🖼️ [BETTING LOBBY] Opponent avatar:', this.opponentAvatarUrl, 'isAnimated:', this.opponentAvatarIsAnimated);
  }

  async create() {
    const { width, height } = this.cameras.main;

    // Preload avatar images FIRST before creating UI
    await this.preloadAvatars();

    // Fetch HONEY balance and stats
    this.myHoneyBalance = await PongAPI.getHoneyBalance();
    console.log(`💰 [BETTING] Your HONEY balance: ${this.myHoneyBalance}`);

    // Fetch my stats for intimidation factor 🔥 - ALWAYS show something!
    const myStatsData = await PongAPI.getMyStats();
    const localStats = PongAPI.getLocalStats();

    // Determine stats source (database > localStorage > default 0-0)
    let wins = 0;
    let losses = 0;
    let winRate = 0;

    if (myStatsData) {
      // Match BEARpark main website format: wins/losses/win_rate at top level
      wins = myStatsData.wins || myStatsData.score || 0;
      losses = myStatsData.losses || 0;
      winRate = myStatsData.win_rate || 0;
      console.log(`📊 [BETTING] Your stats from DATABASE: ${wins}W ${losses}L (${(winRate * 100).toFixed(0)}%)`);
    } else if (localStats.totalGames > 0) {
      wins = localStats.wins;
      losses = localStats.losses;
      winRate = localStats.winRate;
      console.log(`📊 [BETTING] Your stats from LOCALSTORAGE: ${wins}W ${losses}L (${(winRate * 100).toFixed(0)}%)`);
    } else {
      console.log(`📊 [BETTING] No stats found - showing DEFAULT: 0W 0L (0%)`);
    }

    // ALWAYS set myStats (even if 0-0)
    this.myStats = { wins, losses, winRate };

    // Fetch opponent stats for intimidation factor 🔥 - ALWAYS show something!
    let oppWins = 0;
    let oppLosses = 0;
    let oppWinRate = 0;

    // ✅ FIX: Server sends "wallet" not "walletAddress"
    const opponentWallet = (this.opponent as any)?.wallet || (this.opponent as any)?.walletAddress;

    console.log(`🔍 [BETTING] Opponent data:`, this.opponent);
    console.log(`🔍 [BETTING] Opponent wallet:`, opponentWallet);

    if (opponentWallet) {
      try {
        const url = `https://www.bearpark.xyz/api/leaderboard/bear-pong/${opponentWallet}`;
        console.log(`📡 [BETTING] Fetching opponent stats from:`, url);

        const response = await fetch(url);
        const data = await response.json();

        console.log(`📡 [BETTING] Opponent stats API response:`, data);

        if (data.success && data.entry) {
          // Match BEARpark main website format: wins/losses/win_rate at top level
          oppWins = data.entry.wins || data.entry.score || 0;
          oppLosses = data.entry.losses || 0;
          oppWinRate = data.entry.win_rate || 0;
          console.log(`✅ [BETTING] Opponent stats from DATABASE: ${oppWins}W ${oppLosses}L (${(oppWinRate * 100).toFixed(0)}%)`);
        } else {
          console.log(`⚠️ [BETTING] Opponent has no stats in database - showing DEFAULT: 0W 0L (0%)`);
          console.log(`⚠️ [BETTING] Response:`, JSON.stringify(data));
        }
      } catch (error) {
        console.error('❌ [BETTING] Error fetching opponent stats:', error);
        console.log(`📊 [BETTING] Using DEFAULT opponent stats: 0W 0L (0%)`);
      }
    } else {
      console.log(`⚠️ [BETTING] No opponent wallet available!`);
    }

    // ALWAYS set opponentStats (even if 0-0)
    this.opponentStats = { wins: oppWins, losses: oppLosses, winRate: oppWinRate };

    // Background with cool pulsing effect
    const bg = this.add.image(width / 2, height / 2, 'lobby-bg');
    bg.setDisplaySize(width, height);
    bg.setAlpha(0.85); // Slightly dimmed for betting atmosphere

    // Add pulsing breathing animation to background
    this.tweens.add({
      targets: bg,
      scale: { from: 1.0, to: 1.05 },
      alpha: { from: 0.85, to: 0.95 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Add rotating color tint effect (cycles through hues)
    this.tweens.add({
      targets: bg,
      tint: { from: 0xffffff, to: 0xffaa00 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Dark vignette overlay for intensity
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.4);
    vignette.fillRect(0, 0, width, height);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Floating particles for atmosphere 🎊
    this.createFloatingParticles(width, height);

    // Title with MASSIVE bounce animation
    const title = this.add.text(width / 2, 60, 'PLACE YOUR BETS!', {
      fontSize: '56px',
      color: '#ffae00',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    title.setOrigin(0.5);
    title.setStroke('#000000', 6);

    // Make title BOUNCE and glow
    this.tweens.add({
      targets: title,
      scale: { from: 1.0, to: 1.15 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Add glowing effect behind title
    const titleGlow = this.add.graphics();
    titleGlow.fillStyle(0xffae00, 0.3);
    titleGlow.fillCircle(width / 2, 60, 150);
    titleGlow.setBlendMode(Phaser.BlendModes.ADD);
    titleGlow.setDepth(-1);
    this.tweens.add({
      targets: titleGlow,
      alpha: { from: 0.2, to: 0.5 },
      scale: { from: 1.0, to: 1.3 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Display HONEY balance
    const balanceText = this.add.text(width / 2, 130, `Your Balance: ${this.myHoneyBalance} HONEY`, {
      fontSize: '28px',
      color: '#50fa7b',
      fontFamily: 'Luckiest Guy'
    });
    balanceText.setOrigin(0.5);
    balanceText.setStroke('#000000', 4);

    // Countdown timer - MAKE IT PROMINENT
    this.countdownText = this.add.text(width / 2, 180, `Time: ${this.countdown}s`, {
      fontSize: '32px',
      color: '#ffae00',
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold'
    });
    this.countdownText.setOrigin(0.5);
    this.countdownText.setStroke('#000000', 5);
    this.countdownText.setDepth(1000); // Always on top

    // Start 30-second countdown
    this.startCountdown();

    // Display players
    this.displayPlayers(width / 2, 250);

    // Bet selection
    this.createBetSelector(width / 2, 410);

    // Status text
    this.statusText = this.add.text(width / 2, 530, 'Select your bet and click READY', {
      fontSize: '24px',
      color: '#888888',
      fontFamily: 'Luckiest Guy'
    });
    this.statusText.setOrigin(0.5);

    // Ready button
    this.createReadyButton(width / 2, 610);

    // Listen for network messages
    this.setupNetworkListeners();
  }

  /**
   * Preload avatar images before creating UI
   */
  private async preloadAvatars(): Promise<void> {
    return new Promise((resolve) => {
      const avatarsToLoad: string[] = [];

      if (this.myAvatarUrl) {
        avatarsToLoad.push(this.myAvatarUrl);
      }

      if (this.opponentAvatarUrl) {
        avatarsToLoad.push(this.opponentAvatarUrl);
      }

      if (avatarsToLoad.length === 0) {
        console.log('🖼️ No avatars to preload');
        resolve();
        return;
      }

      console.log(`🖼️ Preloading ${avatarsToLoad.length} avatar(s)...`);

      avatarsToLoad.forEach((url) => {
        const key = `avatar_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
        if (!this.textures.exists(key)) {
          this.load.image(key, url);
        }
      });

      this.load.once('complete', () => {
        console.log('✅ Avatars preloaded successfully');
        resolve();
      });

      this.load.start();
    });
  }

  private displayPlayers(x: number, y: number) {
    const container = this.add.container(x, y);

    // You - Profile Picture (far left edge, more centered vertically)
    this.createProfilePicture(container, -320, -30, this.myAvatarUrl, this.myAvatarIsAnimated, 0x07ae08, x, y);

    // You
    const youLabel = this.add.text(-200, -30, 'YOU', {
      fontSize: '24px',
      color: '#07ae08',
      fontFamily: 'Luckiest Guy'
    });
    youLabel.setOrigin(0.5);
    container.add(youLabel);

    const youName = this.add.text(-200, 10, PongAPI.getCurrentUserDisplayName(), {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Luckiest Guy'
    });
    youName.setOrigin(0.5);
    container.add(youName);

    // Show YOUR stats for intimidation factor 🔥 - ALWAYS SHOW!
    const yourWinRate = (this.myStats.winRate * 100).toFixed(0);
    const yourStatsText = this.add.text(-200, 32, `${this.myStats.wins}W ${this.myStats.losses}L (${yourWinRate}%)`, {
      fontSize: '16px',
      color: this.myStats.winRate >= 0.7 ? '#50fa7b' : (this.myStats.winRate >= 0.5 ? '#ffae00' : '#ff4500'),
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold'
    });
    yourStatsText.setOrigin(0.5);
    container.add(yourStatsText);

    // Show YOUR bet selection
    this.yourBetText = this.add.text(-200, 55, `Bet: ${this.myBetAmount} HONEY`, {
      fontSize: '18px',
      color: '#ffae00',
      fontFamily: 'Luckiest Guy'
    });
    this.yourBetText.setOrigin(0.5);
    container.add(this.yourBetText);

    // VS
    const vs = this.add.text(0, -10, 'VS', {
      fontSize: '48px',
      color: '#ffae00',
      fontFamily: 'Luckiest Guy'
    });
    vs.setOrigin(0.5);
    vs.setStroke('#000000', 4);
    container.add(vs);

    // Opponent - Profile Picture (far right edge, more centered vertically)
    this.createProfilePicture(container, 320, -30, this.opponentAvatarUrl, this.opponentAvatarIsAnimated, 0xff4500, x, y);

    // Opponent
    const oppLabel = this.add.text(200, -30, 'OPPONENT', {
      fontSize: '24px',
      color: '#ff4500',
      fontFamily: 'Luckiest Guy'
    });
    oppLabel.setOrigin(0.5);
    container.add(oppLabel);

    const oppName = this.add.text(200, 10, this.opponent?.displayName || 'Opponent', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'Luckiest Guy'
    });
    oppName.setOrigin(0.5);
    container.add(oppName);

    // Show OPPONENT's stats for intimidation factor 🔥 - ALWAYS SHOW!
    const oppWinRate = (this.opponentStats.winRate * 100).toFixed(0);
    const oppStatsText = this.add.text(200, 32, `${this.opponentStats.wins}W ${this.opponentStats.losses}L (${oppWinRate}%)`, {
      fontSize: '16px',
      color: this.opponentStats.winRate >= 0.7 ? '#50fa7b' : (this.opponentStats.winRate >= 0.5 ? '#ffae00' : '#ff4500'),
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold'
    });
    oppStatsText.setOrigin(0.5);
    container.add(oppStatsText);

    // Show OPPONENT's bet selection (MORE PROMINENT)
    this.opponentBetText = this.add.text(200, 55,
      this.opponentBetAmount > 0 ? `Bet: ${this.opponentBetAmount} HONEY` : 'Selecting...', {
      fontSize: '22px',
      color: this.opponentBetAmount > 0 ? '#50fa7b' : '#888888',
      fontFamily: 'Luckiest Guy',
      fontStyle: this.opponentBetAmount > 0 ? 'bold' : 'normal'
    });
    this.opponentBetText.setOrigin(0.5);
    if (this.opponentBetAmount > 0) {
      this.opponentBetText.setStroke('#000000', 3);
    }
    container.add(this.opponentBetText);
  }

  /**
   * Create a profile picture with circular frame and border
   */
  private createProfilePicture(container: Phaser.GameObjects.Container, x: number, y: number, avatarUrl: string | null, isAnimated: boolean, borderColor: number, containerX: number, containerY: number) {
    const radius = 50;

    if (avatarUrl) {
      // Display avatar image (should already be preloaded)
      const avatarKey = `avatar_${avatarUrl.replace(/[^a-zA-Z0-9]/g, '_')}`;

      console.log(`🔍 Looking for texture: ${avatarKey}`);
      console.log(`🔍 Texture exists: ${this.textures.exists(avatarKey)}`);

      if (this.textures.exists(avatarKey)) {
        console.log(`🖼️ Displaying preloaded avatar: ${avatarKey}, isAnimated: ${isAnimated}`);
        this.displayAvatarImage(container, x, y, radius, avatarUrl, avatarKey, isAnimated, borderColor, containerX, containerY);
      } else {
        console.error(`❌ Avatar texture not found: ${avatarKey}`);
        // Fallback to placeholder
        this.createPlaceholder(container, x, y, radius, borderColor);
      }
    } else {
      console.log('🖼️ No avatar URL - showing placeholder');
      this.createPlaceholder(container, x, y, radius, borderColor);
    }
  }

  /**
   * Create placeholder bear emoji
   */
  private createPlaceholder(container: Phaser.GameObjects.Container, x: number, y: number, radius: number, borderColor: number) {
    // Default placeholder (bear icon or generic avatar)
    const placeholder = this.add.circle(x, y, radius, 0x333333);
    container.add(placeholder);

    // Add default bear emoji or "?" text
    const placeholderText = this.add.text(x, y, '🐻', {
      fontSize: '48px',
      color: '#ffae00'
    });
    placeholderText.setOrigin(0.5);
    container.add(placeholderText);

    // Add border
    const borderGraphics = this.add.graphics();
    borderGraphics.lineStyle(4, borderColor, 1);
    borderGraphics.strokeCircle(x, y, radius + 2);
    container.add(borderGraphics);
  }

  /**
   * Display the loaded avatar image with circular mask
   */
  private displayAvatarImage(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    radius: number,
    avatarUrl: string,
    avatarKey: string,
    isAnimated: boolean,
    borderColor: number,
    containerX: number,
    containerY: number
  ) {
    try {
      // Create a circular background
      const circleBg = this.add.circle(x, y, radius, 0x333333);
      container.add(circleBg);

      // Calculate world position
      const worldX = containerX + x;
      const worldY = containerY + y;

      if (isAnimated) {
        // For animated GIFs, use DOM elements positioned over the Phaser canvas
        console.log(`🎬 Displaying ANIMATED avatar at (${worldX}, ${worldY})`);

        // Get canvas position on page to calculate correct DOM positioning
        const canvas = this.game.canvas;
        const canvasRect = canvas.getBoundingClientRect();

        // Calculate scale factor between logical game size and physical canvas size
        const scale = canvasRect.width / this.cameras.main.width;

        // Scale world coordinates and radius to match physical canvas size
        const scaledX = worldX * scale;
        const scaledY = worldY * scale;
        const scaledRadius = radius * scale;

        console.log(`📐 Canvas rect:`, canvasRect);
        console.log(`📐 Game size: ${this.cameras.main.width}x${this.cameras.main.height}`);
        console.log(`📐 Scale factor: ${scale}`);
        console.log(`📐 World position: (${worldX}, ${worldY})`);
        console.log(`📐 Scaled position: (${scaledX}, ${scaledY})`);
        console.log(`📐 Radius: ${radius} -> ${scaledRadius}`);
        console.log(`📐 Final left: ${canvasRect.left + scaledX - scaledRadius}px`);
        console.log(`📐 Final top: ${canvasRect.top + scaledY - scaledRadius}px`);

        // Create DOM container for the avatar
        const avatarContainer = document.createElement('div');
        avatarContainer.style.position = 'fixed';
        avatarContainer.style.width = `${scaledRadius * 2}px`;
        avatarContainer.style.height = `${scaledRadius * 2}px`;
        avatarContainer.style.left = `${canvasRect.left + scaledX - scaledRadius}px`;
        avatarContainer.style.top = `${canvasRect.top + scaledY - scaledRadius}px`;
        avatarContainer.style.borderRadius = '50%';
        avatarContainer.style.overflow = 'hidden';
        avatarContainer.style.pointerEvents = 'none';
        avatarContainer.style.zIndex = '10000';
        avatarContainer.style.border = `4px solid ${this.colorToHex(borderColor)}`;

        // Create the image element
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.display = 'block';

        avatarContainer.appendChild(img);
        document.body.appendChild(avatarContainer);

        // Store reference for cleanup
        this.events.once('shutdown', () => {
          avatarContainer.remove();
        });

        console.log(`✅ Animated avatar displayed as DOM element at (${worldX}, ${worldY})`);
      } else {
        // For static images, use Phaser sprite with circular mask
        const avatar = this.add.sprite(x, y, avatarKey);

        // Calculate scale to fit circle
        const scale = (radius * 2) / Math.min(avatar.width, avatar.height);
        avatar.setScale(scale);

        // Create circular mask using a Graphics object in WORLD coordinates
        const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
        maskShape.fillStyle(0xffffff);
        maskShape.fillCircle(worldX, worldY, radius);

        // Create geometry mask from the shape
        const mask = maskShape.createGeometryMask();

        // Apply mask to avatar
        avatar.setMask(mask);

        // Add to container
        container.add(avatar);

        console.log(`✅ Static avatar displayed with CIRCULAR mask at (${x}, ${y}), world: (${worldX}, ${worldY})`);

        // Add colored border on top
        const borderGraphics = this.add.graphics();
        borderGraphics.lineStyle(4, borderColor, 1);
        borderGraphics.strokeCircle(x, y, radius + 2);
        borderGraphics.setDepth(11);
        container.add(borderGraphics);
      }
    } catch (error) {
      console.error('❌ Error displaying avatar:', error);
      // Fallback to placeholder on error
      this.createPlaceholder(container, x, y, radius, borderColor);
    }
  }

  /**
   * Convert Phaser color integer to CSS hex string
   */
  private colorToHex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0');
  }

  private createBetSelector(x: number, y: number) {
    // Destroy existing bet selector if it exists
    if (this.betSelectorContainer) {
      this.betSelectorContainer.destroy();
    }

    const container = this.add.container(x, y);
    this.betSelectorContainer = container;

    const label = this.add.text(0, -50, 'SELECT BET AMOUNT:', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Luckiest Guy'
    });
    label.setOrigin(0.5);
    container.add(label);

    // All possible bet amounts
    const allBetAmounts = [0, 10, 20, 50, 100, 200, 500, 1000];

    // Filter to only show amounts the player can afford
    const betAmounts = allBetAmounts.filter(amount => amount <= this.myHoneyBalance);

    // If player has 0 HONEY, still show the 0 option so they can play for free
    if (betAmounts.length === 0) {
      betAmounts.push(0);
    }

    const buttonWidth = 100;
    const buttonHeight = 50;
    const spacing = 120;
    const startX = -((betAmounts.length - 1) * spacing) / 2;

    betAmounts.forEach((amount, index) => {
      const btnX = startX + (index * spacing);

      const btnGraphics = this.add.graphics();
      const isSelected = amount === this.myBetAmount;

      btnGraphics.fillStyle(isSelected ? 0x07ae08 : 0x333333, 1);
      btnGraphics.fillRoundedRect(btnX - buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);

      if (isSelected) {
        btnGraphics.lineStyle(3, 0xffae00, 1);
        btnGraphics.strokeRoundedRect(btnX - buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
      }

      const btnText = this.add.text(btnX, 0, `${amount}`, {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'Luckiest Guy'
      });
      btnText.setOrigin(0.5);

      const btnContainer = this.add.container(0, 0);
      btnContainer.add([btnGraphics, btnText]);
      btnContainer.setInteractive(
        new Phaser.Geom.Rectangle(btnX - buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight),
        Phaser.Geom.Rectangle.Contains
      );

      btnContainer.on('pointerdown', () => {
        if (!this.isReady) {
          this.selectBet(amount);
        }
      });

      btnContainer.on('pointerover', () => {
        if (!this.isReady) {
          btnGraphics.clear();
          btnGraphics.fillStyle(0x555555, 1);
          btnGraphics.fillRoundedRect(btnX - buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
        }
      });

      btnContainer.on('pointerout', () => {
        if (!this.isReady) {
          btnGraphics.clear();
          const currentlySelected = amount === this.myBetAmount;
          btnGraphics.fillStyle(currentlySelected ? 0x07ae08 : 0x333333, 1);
          btnGraphics.fillRoundedRect(btnX - buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);

          if (currentlySelected) {
            btnGraphics.lineStyle(3, 0xffae00, 1);
            btnGraphics.strokeRoundedRect(btnX - buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
          }
        }
      });

      container.add(btnContainer);
    });
  }

  private selectBet(amount: number) {
    if (this.isReady) return; // Can't change bet after ready

    this.myBetAmount = amount;
    console.log(`💰 [BETTING] Selected bet amount: ${amount}`);

    // Send bet to server
    if (this.pongClient) {
      this.pongClient.send({ type: 'set_bet', amount });
    }

    // Update minimum bet in localStorage
    this.updateMinimumBet();

    // Update bet displays immediately
    this.updateBetDisplays();

    // Recreate bet selector to show updated selection
    this.createBetSelector(this.cameras.main.width / 2, 410);

    // Flash screen to confirm selection! 💥
    this.flashScreen(0x07ae08);
  }

  private updateMinimumBet() {
    // Calculate minimum bet between both players
    // RULE: If either player bets 0, final bet is 0 (no betting mode)
    let minBet: number;

    if (this.myBetAmount === 0 || this.opponentBetAmount === 0) {
      minBet = 0;
    } else {
      // Both players have bet > 0, use minimum
      minBet = Math.min(this.myBetAmount, this.opponentBetAmount);
    }

    console.log(`💰 [BETTING] Minimum bet: ${minBet} (You: ${this.myBetAmount}, Opponent: ${this.opponentBetAmount})`);
    localStorage.setItem('bearPongCurrentBet', minBet.toString());
  }

  private updateBetDisplays() {
    // Update your bet display
    if (this.yourBetText) {
      this.yourBetText.setText(`Bet: ${this.myBetAmount} HONEY`);
    }

    // Update opponent bet display
    if (this.opponentBetText) {
      const text = this.opponentBetAmount > 0 ? `Bet: ${this.opponentBetAmount} HONEY` : 'Selecting...';
      const color = this.opponentBetAmount > 0 ? '#50fa7b' : '#888888';

      this.opponentBetText.setText(text);
      this.opponentBetText.setColor(color);
      this.opponentBetText.setFontStyle(this.opponentBetAmount > 0 ? 'bold' : 'normal');

      if (this.opponentBetAmount > 0) {
        this.opponentBetText.setStroke('#000000', 3);
      } else {
        this.opponentBetText.setStroke('', 0);
      }
    }

    console.log(`📊 [BETTING] Updated displays - You: ${this.myBetAmount}, Opponent: ${this.opponentBetAmount}`);
  }

  private refreshUI() {
    // Destroy all children except countdown text
    this.children.each((child) => {
      if (child !== this.countdownText) {
        child.destroy();
      }
    });

    const { width, height } = this.cameras.main;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a1a, 1).setOrigin(0);

    // Title
    const title = this.add.text(width / 2, 60, 'PLACE YOUR BETS!', {
      fontSize: '56px',
      color: '#ffae00',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    title.setOrigin(0.5);
    title.setStroke('#000000', 6);

    // Display HONEY balance
    const balanceText = this.add.text(width / 2, 130, `Your Balance: ${this.myHoneyBalance} HONEY`, {
      fontSize: '28px',
      color: '#50fa7b',
      fontFamily: 'Luckiest Guy'
    });
    balanceText.setOrigin(0.5);
    balanceText.setStroke('#000000', 4);

    this.displayPlayers(width / 2, 250);
    this.createBetSelector(width / 2, 410);
    this.statusText = this.add.text(width / 2, 530, 'Select your bet and click READY', {
      fontSize: '24px',
      color: '#888888',
      fontFamily: 'Luckiest Guy'
    });
    this.statusText.setOrigin(0.5);
    this.createReadyButton(width / 2, 610);
  }

  private createReadyButton(x: number, y: number) {
    const buttonWidth = 300;
    const buttonHeight = 60;

    const btnGraphics = this.add.graphics();
    btnGraphics.fillStyle(this.isReady ? 0x666666 : 0x07ae08, 1);
    btnGraphics.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 12);

    const btnText = this.add.text(x, y, this.isReady ? 'WAITING...' : 'READY!', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    btnText.setOrigin(0.5);

    this.readyButton = this.add.container(0, 0);
    this.readyButton.add([btnGraphics, btnText]);

    if (!this.isReady) {
      this.readyButton.setInteractive(
        new Phaser.Geom.Rectangle(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight),
        Phaser.Geom.Rectangle.Contains
      );

      this.readyButton.on('pointerdown', () => {
        this.readyUp();
      });

      this.readyButton.on('pointerover', () => {
        btnGraphics.clear();
        btnGraphics.fillStyle(0x09d00a, 1);
        btnGraphics.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 12);
      });

      this.readyButton.on('pointerout', () => {
        btnGraphics.clear();
        btnGraphics.fillStyle(0x07ae08, 1);
        btnGraphics.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, 12);
      });
    }
  }

  private readyUp() {
    if (this.isReady) return;

    this.isReady = true;
    console.log('✅ [BETTING] You are ready!');

    // Update status
    if (this.statusText) {
      this.statusText.setText(this.opponentIsReady ? 'Both players ready! Starting...' : 'Waiting for opponent...');
      this.statusText.setColor('#07ae08');
    }

    // Send ready to server
    if (this.pongClient) {
      this.pongClient.send({ type: 'ready_to_start' });
    }

    // Recreate button to show waiting state
    if (this.readyButton) {
      this.readyButton.destroy();
    }
    this.createReadyButton(this.cameras.main.width / 2, 580);

    // DON'T overwrite localStorage here - the minimum bet is already stored by updateMinimumBet()!
  }

  private startCountdown() {
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.countdown--;

        if (this.countdownText) {
          this.countdownText.setText(`Time: ${this.countdown}s`);

          if (this.countdown <= 10) {
            this.countdownText.setColor('#ff4500'); // Red when running out of time
            this.countdownText.setFontSize(36); // Bigger when urgent
          }

          // Always keep on top
          this.countdownText.setDepth(1000);
        }

        if (this.countdown <= 0) {
          this.handleTimeout();
        }
      },
      loop: true
    });
  }

  private handleTimeout() {
    console.log('⏰ [BETTING] Countdown expired!');

    if (this.timerEvent) {
      this.timerEvent.destroy();
    }

    // If no one is ready, return to main menu
    if (!this.isReady && !this.opponentIsReady) {
      console.log('❌ [BETTING] No one ready - returning to menu');
      this.returnToMenu();
    } else if (this.isReady || this.opponentIsReady) {
      // If at least one person is ready, start the game with their bet
      console.log('✅ [BETTING] At least one player ready - starting game');
      this.startGame();
    }
  }

  private setupNetworkListeners() {
    if (!this.pongClient) return;

    this.pongClient.on('opponent_bet_set', (data: any) => {
      this.opponentBetAmount = data.amount;
      console.log(`💰 [BETTING] Opponent set bet: ${data.amount}`);

      // DOPAMINE FLASH! 💥
      this.flashScreen(0x50fa7b);

      // Update minimum bet in localStorage
      this.updateMinimumBet();

      // Update bet displays immediately
      this.updateBetDisplays();

      // Update status to show opponent made a selection
      if (this.statusText) {
        this.statusText.setText(`Opponent bet ${data.amount} HONEY!`);
        this.statusText.setColor('#50fa7b');

        // Reset back to default message after 2 seconds
        this.time.delayedCall(2000, () => {
          if (this.statusText && !this.isReady) {
            this.statusText.setText('Select your bet and click READY');
            this.statusText.setColor('#888888');
          }
        });
      }

      // DON'T call refreshUI() - it destroys the bet displays we just updated!
    });

    this.pongClient.on('opponent_ready', () => {
      this.opponentIsReady = true;
      console.log('✅ [BETTING] Opponent is ready!');

      // FLASH when opponent ready! 💥
      this.flashScreen(0x07ae08);

      if (this.statusText) {
        this.statusText.setText(this.isReady ? 'Both players ready! Starting...' : 'Opponent is ready!');
      }

      // If both ready, start game with BIG FLASH! 💥💥💥
      if (this.isReady && this.opponentIsReady) {
        this.flashScreen(0xffae00);
        this.cameras.main.shake(200, 0.003); // Subtle screen shake for excitement
        this.time.delayedCall(1500, () => {
          this.startGame();
        });
      }
    });

    this.pongClient.on('final_bet_amount', (data: any) => {
      this.finalBetAmount = data.amount;
      console.log(`💰 [BETTING] Final bet amount set by server: ${data.amount}`);
      localStorage.setItem('bearPongCurrentBet', this.finalBetAmount.toString());
    });

    this.pongClient.on('betting_timeout', () => {
      console.log('⏰ [BETTING] Server sent timeout signal');
      this.handleTimeout();
    });

    this.pongClient.on('countdown', (data: any) => {
      // Game is starting, transition to game scene
      console.log(`🎮 [BETTING] Game starting countdown: ${data.count}`);
      this.startGame();
    });

    this.pongClient.on('opponent_disconnected', () => {
      console.log('❌ [BETTING] Opponent disconnected');
      this.returnToMenu();
    });
  }

  private startGame() {
    console.log('🎮 [BETTING] Transitioning to game scene...');
    console.log(`💰 [BETTING] Passing betAmount to game scene: ${this.finalBetAmount}`);

    if (this.timerEvent) {
      this.timerEvent.destroy();
    }

    this.scene.start('PongGameScene', {
      pongClient: this.pongClient,
      opponent: this.opponent,
      yourSide: this.yourSide,
      betAmount: this.finalBetAmount
    });
  }

  private returnToMenu() {
    if (this.timerEvent) {
      this.timerEvent.destroy();
    }

    if (this.pongClient) {
      this.pongClient.disconnect();
    }

    window.location.href = '/';
  }

  /**
   * Create floating particles for atmosphere and DOPAMINE 🎊
   */
  private createFloatingParticles(width: number, height: number) {
    // Create 20 floating honey/coin particles
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);

      const particle = this.add.graphics();
      const color = Phaser.Math.RND.pick([0xffae00, 0x50fa7b, 0x680cd9]);
      particle.fillStyle(color, 0.4);
      particle.fillCircle(0, 0, Phaser.Math.Between(4, 8));
      particle.setPosition(x, y);
      particle.setBlendMode(Phaser.BlendModes.ADD);

      // Floating animation
      this.tweens.add({
        targets: particle,
        y: y - Phaser.Math.Between(100, 200),
        alpha: { from: 0.4, to: 0 },
        duration: Phaser.Math.Between(3000, 5000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
        onRepeat: () => {
          particle.y = height + 10;
          particle.x = Phaser.Math.Between(0, width);
          particle.alpha = 0.4;
        }
      });

      // Wiggle animation
      this.tweens.add({
        targets: particle,
        x: `+=${Phaser.Math.Between(-30, 30)}`,
        duration: Phaser.Math.Between(1000, 2000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  /**
   * Flash the screen with excitement! 💥
   */
  private flashScreen(color: number = 0xffae00) {
    const flash = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, color, 0.6);
    flash.setOrigin(0);
    flash.setDepth(5000); // Above everything

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        flash.destroy();
      }
    });
  }

  shutdown() {
    if (this.timerEvent) {
      this.timerEvent.destroy();
    }
  }
}
