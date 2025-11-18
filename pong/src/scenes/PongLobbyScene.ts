/**
 * PongLobbyScene - Waiting room for matchmaking
 */
import Phaser from 'phaser';
import { PongClient } from '../networking/PongClient';
import { PongAPI } from '../PongAPI';
import { PongAudioManager } from '../audio/PongAudioManager';
import type { PlayerData } from '../networking/types';

export class PongLobbyScene extends Phaser.Scene {
  private pongClient: PongClient | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private queuePositionText: Phaser.GameObjects.Text | null = null;
  private loadingDots: string = '';
  private loadingTimer: Phaser.Time.TimerEvent | null = null;
  private statsText: Phaser.GameObjects.Text | null = null;
  private audioManager: PongAudioManager | null = null;
  private muteButton: Phaser.GameObjects.Container | null = null;
  private muteIcon: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super({ key: 'PongLobbyScene' });
  }

    preload() {
    // Load background image
    this.load.image('lobby-bg', 'https://files.catbox.moe/qnp7wc.png');

    // Load new BEAR logo
    this.load.image('bear-logo', 'bear-logo.png');

    // Load audio assets
    if (!this.audioManager) {
      this.audioManager = new PongAudioManager(this);
    }
    this.audioManager.preload();
  }
  
create() {
    const { width, height } = this.cameras.main;

    // 🎵 PERSISTENT MUSIC: Check if global audio manager already exists (from retry)
    this.audioManager = this.game.registry.get('globalAudioManager');
    if (!this.audioManager) {
      // First time: Create new audio manager and start music
      this.audioManager = new PongAudioManager(this);
      this.audioManager.create();
      this.audioManager.playBackgroundMusic();
      this.game.registry.set('globalAudioManager', this.audioManager);
      console.log('🎵 Created new audio manager - music started');
    } else {
      console.log('🎵 Using existing global audio manager - music continues');
    }

    // 🎨 GODMODE BACKGROUND EFFECTS 💎
    const bg = this.add.image(width / 2, height / 2, 'lobby-bg');
    bg.setDisplaySize(width, height);
    bg.setAlpha(0.9); // Slightly dimmed

    // Add pulsing breathing animation to background
    this.tweens.add({
      targets: bg,
      scale: { from: 1.0, to: 1.05 },
      alpha: { from: 0.9, to: 1.0 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Add rotating color tint effect (cycles through hues)
    this.tweens.add({
      targets: bg,
      tint: { from: 0xffffff, to: 0xffaa88 },
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Dark vignette overlay for intensity
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.35);
    vignette.fillRect(0, 0, width, height);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);

    // 🎊 Floating particles for atmosphere
    this.createFloatingParticles(width, height);

    // 🐻 NEW SLEEK LOGO (PERFECT POSITIONING)
    const logoY = height * 0.44 - 120; // Adjusted down 9%
    const logo = this.add.image(width / 2, logoY, 'bear-logo');
    logo.setScale(0.385); // 10% bigger
    logo.setOrigin(0.5);

    // Add subtle float animation to logo
    this.tweens.add({
      targets: logo,
      y: logoY + 10,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Add glowing effect behind logo
    const logoGlow = this.add.graphics();
    logoGlow.fillStyle(0xffae00, 0.25);
    logoGlow.fillCircle(width / 2, logoY, 90);
    logoGlow.setBlendMode(Phaser.BlendModes.ADD);
    logoGlow.setDepth(-1);
    this.tweens.add({
      targets: logoGlow,
      alpha: { from: 0.15, to: 0.35 },
      scale: { from: 1.0, to: 1.2 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Create top section with player stats
    this.displayPlayerStats();

    // Create matchmaking section
    this.createMatchmakingSection();

    // Create mute button in same position as game scene
    this.createMuteButton();

    // 🎈 SLEEK BUBBLY RETURN BUTTON (Bottom Left)
    const returnButtonContainer = this.add.container(100, height - 60);

    const returnButton = this.add.graphics();
    const buttonWidth = 200;
    const buttonHeight = 50;

    returnButton.fillStyle(0xd94141, 1);
    returnButton.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 25);
    returnButton.lineStyle(3, 0xff5555, 1);
    returnButton.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 25);

    const returnText = this.add.text(0, 0, 'RETURN', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      fontFamily: 'Luckiest Guy'
    });
    returnText.setOrigin(0.5);

    returnButtonContainer.add([returnButton, returnText]);
    returnButtonContainer.setSize(buttonWidth, buttonHeight);
    returnButtonContainer.setInteractive({ useHandCursor: true });

    returnButtonContainer.on('pointerdown', () => {
      this.cancelMatchmaking();
    });

    returnButtonContainer.on('pointerover', () => {
      this.tweens.add({
        targets: returnButtonContainer,
        scale: 1.1,
        duration: 150,
        ease: 'Back.easeOut'
      });
      returnButton.clear();
      returnButton.fillStyle(0xff5555, 1);
      returnButton.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 25);
      returnButton.lineStyle(3, 0xff7777, 1);
      returnButton.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 25);
    });

    returnButtonContainer.on('pointerout', () => {
      this.tweens.add({
        targets: returnButtonContainer,
        scale: 1.0,
        duration: 150,
        ease: 'Back.easeIn'
      });
      returnButton.clear();
      returnButton.fillStyle(0xd94141, 1);
      returnButton.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 25);
      returnButton.lineStyle(3, 0xff5555, 1);
      returnButton.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 25);
    });

    // Add subtle pulse animation to return button
    this.tweens.add({
      targets: returnButtonContainer,
      alpha: { from: 0.9, to: 1.0 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // ESC key to cancel
    this.input.keyboard?.on('keydown-ESC', () => {
      this.cancelMatchmaking();
    });

    // Connect to server and join queue
    this.connectToServer();
  }

  /**
   * Create tri-color ring border (purple, yellow, green)
   */
  private createTriColorRing(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, thickness: number) {
    const colors = [0x680cd9, 0xffae00, 0x07ae08]; // Purple, Yellow, Green
    const segments = 3;
    const anglePerSegment = (Math.PI * 2) / segments;

    for (let i = 0; i < segments; i++) {
      const startAngle = i * anglePerSegment - Math.PI / 2; // Start from top
      const endAngle = (i + 1) * anglePerSegment - Math.PI / 2;

      graphics.lineStyle(thickness, colors[i]);
      graphics.beginPath();
      graphics.arc(x, y, radius, startAngle, endAngle, false);
      graphics.strokePath();
    }
  }

  /**
   * Create bordered section with tri-color border
   */
  private createBorderedSection(x: number, y: number, width: number, height: number): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();

    // Semi-transparent background
    graphics.fillStyle(0x000000, 0.7);
    graphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, 15);

    // Tri-color border (draw 3 colored strokes)
    const colors = [0x680cd9, 0xffae00, 0x07ae08];
    const borderThickness = 4;
    const offset = 2; // Spacing between color layers

    // Draw triple border
    for (let i = 0; i < 3; i++) {
      graphics.lineStyle(borderThickness, colors[i]);
      graphics.strokeRoundedRect(
        x - width / 2 - offset * i,
        y - height / 2 - offset * i,
        width + offset * i * 2,
        height + offset * i * 2,
        15
      );
    }

    return graphics;
  }

  /**
   * Create mute button
   */
  private createMuteButton() {
    // Container for mute button (top-left corner, same as game scene)
    this.muteButton = this.add.container(60, 60);

    // Button background (purple from BEARpark)
    const buttonBg = this.add.circle(0, 0, 30, 0x680cd9);
    buttonBg.setInteractive({ useHandCursor: true });
    this.muteButton.add(buttonBg);

    // Tri-color ring border
    const ringGraphics = this.add.graphics();
    this.createTriColorRing(ringGraphics, 0, 0, 30, 4);
    this.muteButton.add(ringGraphics);

    // Mute icon (speaker with sound waves)
    this.muteIcon = this.add.graphics();
    const isMuted = this.audioManager?.isMutedState() || false;
    this.updateMuteIcon(isMuted); // Show correct initial state
    this.muteButton.add(this.muteIcon);

    // Click handler
    buttonBg.on('pointerdown', () => {
      this.toggleMute();
    });

    // Hover effect
    buttonBg.on('pointerover', () => {
      this.muteButton?.setScale(1.1);
    });

    buttonBg.on('pointerout', () => {
      this.muteButton?.setScale(1);
    });
  }

  /**
   * Update mute icon based on mute state
   */
  private updateMuteIcon(isMuted: boolean) {
    if (!this.muteIcon) return;

    this.muteIcon.clear();
    this.muteIcon.fillStyle(0xfeb501);

    // Draw speaker (trapezoid)
    this.muteIcon.fillRect(-12, -6, 6, 12); // Speaker body
    this.muteIcon.beginPath();
    this.muteIcon.moveTo(-6, -6);
    this.muteIcon.lineTo(0, -10);
    this.muteIcon.lineTo(0, 10);
    this.muteIcon.lineTo(-6, 6);
    this.muteIcon.closePath();
    this.muteIcon.fillPath();

    if (isMuted) {
      // Draw X through speaker
      this.muteIcon.lineStyle(3, 0xff0000); // Red X
      this.muteIcon.beginPath();
      this.muteIcon.moveTo(4, -10);
      this.muteIcon.lineTo(14, 0);
      this.muteIcon.moveTo(14, -10);
      this.muteIcon.lineTo(4, 0);
      this.muteIcon.strokePath();
    } else {
      // Draw sound waves
      this.muteIcon.lineStyle(2, 0xfeb501);

      // Small wave
      this.muteIcon.beginPath();
      this.muteIcon.arc(0, 0, 8, -Math.PI / 4, Math.PI / 4);
      this.muteIcon.strokePath();

      // Medium wave
      this.muteIcon.beginPath();
      this.muteIcon.arc(0, 0, 12, -Math.PI / 4, Math.PI / 4);
      this.muteIcon.strokePath();
    }
  }

  /**
   * Toggle mute state
   */
  private toggleMute() {
    if (this.audioManager) {
      this.audioManager.toggleMute();
      const isMuted = this.audioManager.isMutedState();
      this.updateMuteIcon(isMuted);
    }
  }

  /**
   * Create matchmaking status section with DOPAMINE EFFECTS 🎮
   */
  private createMatchmakingSection() {
    const { width, height } = this.cameras.main;

    // Create bordered section (SMALLER AND CLOSER TO CENTER)
    const sectionX = width / 2 + 200; // Closer to center
    const sectionY = height - 180; // Bottom area (same as stats)
    const sectionWidth = 350; // Reduced from 420
    const sectionHeight = 240; // Reduced from 280

    const matchmakingBox = this.createBorderedSection(sectionX, sectionY, sectionWidth, sectionHeight);

    // Pulsing animation for matchmaking box
    this.tweens.add({
      targets: matchmakingBox,
      alpha: { from: 0.9, to: 1.0 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const statusContainer = this.add.container(sectionX, sectionY);

    // Status text with enhanced glow
    this.statusText = this.add.text(0, -80, 'Searching for\nopponent', {
      fontSize: '26px',
      color: '#ffae00',
      fontFamily: 'Luckiest Guy',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center'
    });
    this.statusText.setOrigin(0.5);
    statusContainer.add(this.statusText);

    // Add bounce animation to status text
    this.tweens.add({
      targets: this.statusText,
      scale: { from: 1.0, to: 1.08 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Queue position text
    this.queuePositionText = this.add.text(0, -10, '', {
      fontSize: '22px',
      color: '#50fa7b',
      fontFamily: 'Luckiest Guy',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.queuePositionText.setOrigin(0.5);
    statusContainer.add(this.queuePositionText);

    // Instructions
    const instructions = this.add.text(0, 25, 'Waiting for another\nplayer to join...', {
      fontSize: '16px',
      color: '#cccccc',
      align: 'center',
      fontFamily: 'Luckiest Guy',
      lineSpacing: 4
    });
    instructions.setOrigin(0.5);
    statusContainer.add(instructions);

    // Enhanced loading animation with multiple rings
    const loadingRing1 = this.add.graphics();
    loadingRing1.lineStyle(5, 0xffae00, 1);
    loadingRing1.arc(0, 75, 25, 0, Math.PI * 1.5, false);
    loadingRing1.strokePath();
    statusContainer.add(loadingRing1);

    const loadingRing2 = this.add.graphics();
    loadingRing2.lineStyle(4, 0x680cd9, 0.7);
    loadingRing2.arc(0, 75, 35, Math.PI, Math.PI * 2.5, false);
    loadingRing2.strokePath();
    statusContainer.add(loadingRing2);

    const loadingRing3 = this.add.graphics();
    loadingRing3.lineStyle(3, 0x50fa7b, 0.5);
    loadingRing3.arc(0, 75, 45, Math.PI * 0.5, Math.PI * 2, false);
    loadingRing3.strokePath();
    statusContainer.add(loadingRing3);

    // Rotate loading animations at different speeds
    this.tweens.add({
      targets: loadingRing1,
      angle: 360,
      duration: 1200,
      repeat: -1,
      ease: 'Linear'
    });

    this.tweens.add({
      targets: loadingRing2,
      angle: -360,
      duration: 1800,
      repeat: -1,
      ease: 'Linear'
    });

    this.tweens.add({
      targets: loadingRing3,
      angle: 360,
      duration: 2400,
      repeat: -1,
      ease: 'Linear'
    });

    // Animated loading dots
    this.loadingTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        this.loadingDots = this.loadingDots.length >= 3 ? '' : this.loadingDots + '.';
        if (this.statusText) {
          this.statusText.setText(`Searching for\nopponent${this.loadingDots}`);
        }
      },
      loop: true
    });
  }


  /**
   * Display player's current stats (bottom left) 📊
   */
  private displayPlayerStats() {
    const stats = PongAPI.getLocalStats();
    const displayName = PongAPI.getCurrentUserDisplayName();
    const { width, height } = this.cameras.main;

    // Create bordered section (SMALLER AND CLOSER TO CENTER)
    const sectionX = width / 2 - 200; // Closer to center
    const sectionY = height - 180; // Bottom area
    const sectionWidth = 350; // Reduced from 420
    const sectionHeight = 240; // Reduced from 280

    const statsBox = this.createBorderedSection(sectionX, sectionY, sectionWidth, sectionHeight);

    // Add subtle pulse to stats box
    this.tweens.add({
      targets: statsBox,
      alpha: { from: 0.95, to: 1.0 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const statsContainer = this.add.container(sectionX, sectionY);

    // Player name with glow
    const nameText = this.add.text(0, -70, `🐻 ${displayName}`, {
      fontSize: '28px',
      color: '#ffae00',
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    });
    nameText.setOrigin(0.5);
    statsContainer.add(nameText);

    // Add subtle bounce to name
    this.tweens.add({
      targets: nameText,
      scale: { from: 1.0, to: 1.05 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Stats title (moved up for visibility)
    const statsTitle = this.add.text(0, -35, 'STATS', {
      fontSize: '22px',
      color: '#ffffff',
      fontFamily: 'Luckiest Guy',
      stroke: '#000000',
      strokeThickness: 3
    });
    statsTitle.setOrigin(0.5);
    statsContainer.add(statsTitle);

    // Stats with enhanced styling
    this.statsText = this.add.text(0, 25, `Wins: ${stats.wins}\nLosses: ${stats.losses}\nWin Rate: ${(stats.winRate * 100).toFixed(1)}%`, {
      fontSize: '20px',
      color: '#50fa7b',
      fontFamily: 'Luckiest Guy',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      lineSpacing: 10
    });
    this.statsText.setOrigin(0.5);
    statsContainer.add(this.statsText);
  }

  /**
   * Fetch player's avatar from BEARpark API
   */
  private async fetchPlayerAvatar(wallet: string): Promise<{ url: string | null; isAnimated: boolean }> {
    try {
      const response = await fetch(`/api/profile/${wallet}`);
      const data = await response.json();

      if (data.success && data.profile && data.profile.avatar_nft) {
        try {
          const avatarData = JSON.parse(data.profile.avatar_nft);
          const url = avatarData.imageUrl || avatarData.fallbackImageUrl || null;
          const isAnimated = avatarData.isAnimated || false;
          return { url, isAnimated };
        } catch (e) {
          // If not JSON, try using it directly as NFT ID
          return { url: `https://nft.xrpl-labs.com/${data.profile.avatar_nft}`, isAnimated: false };
        }
      }

      return { url: null, isAnimated: false };
    } catch (error) {
      console.error('Failed to fetch avatar:', error);
      return { url: null, isAnimated: false };
    }
  }

  /**
   * Connect to Pong server
   */
  private async connectToServer() {
    const serverUrl = 'wss://bear-pong-production.up.railway.app';

    this.pongClient = new PongClient(serverUrl);

    try {
      await this.pongClient.connect();

      // Set up event handlers
      this.setupEventHandlers();

      // Fetch player's avatar from BEARpark API or localStorage
      const wallet = PongAPI.getWalletAddress() || 'guest_' + Date.now();
      const { url: avatarUrl, isAnimated } = await this.fetchPlayerAvatar(wallet);
      console.log('🖼️ Fetched avatar from API:', avatarUrl, 'isAnimated:', isAnimated);

      // If API didn't return an avatar, check localStorage as fallback
      let finalAvatarUrl = avatarUrl;
      let finalIsAnimated = isAnimated;
      if (!finalAvatarUrl) {
        finalAvatarUrl = localStorage.getItem('avatar_url');
        finalIsAnimated = localStorage.getItem('avatar_is_animated') === 'true';
        console.log('📦 Fallback to localStorage avatar:', finalAvatarUrl, 'isAnimated:', finalIsAnimated);
      }

      // Save avatar to localStorage for use in other scenes
      if (finalAvatarUrl) {
        localStorage.setItem('avatar_url', finalAvatarUrl);
        localStorage.setItem('avatar_is_animated', finalIsAnimated ? 'true' : 'false');
        console.log('💾 Saved avatar to localStorage');
      }

      // Join matchmaking queue - IMPORTANT: Send avatar so opponent can see it!
      const playerData: PlayerData = {
        wallet,
        displayName: PongAPI.getCurrentUserDisplayName(),
        avatarUrl: finalAvatarUrl || undefined,
        avatarIsAnimated: finalIsAnimated || undefined
      };

      this.pongClient.joinQueue(playerData);

    } catch (error) {
      console.error('Failed to connect to server:', error);
      this.showConnectionError();
    }
  }

  /**
   * Set up event handlers for server messages
   */
  private setupEventHandlers() {
    if (!this.pongClient) return;

    this.pongClient.on('queue_joined', (position: number) => {
      if (this.queuePositionText) {
        this.queuePositionText.setText(`Queue position: ${position}`);
      }
    });

    this.pongClient.on('match_found', (data: any) => {
      console.log('Match found!', data);
      console.log('🎮 Opponent data:', data.opponent);
      console.log('🖼️ Opponent avatar URL:', data.opponent?.avatarUrl);

      if (this.statusText) {
        this.statusText.setText('Match Found!');
      }

      // Stop loading animation
      if (this.loadingTimer) {
        this.loadingTimer.destroy();
        this.loadingTimer = null;
      }

      // Start game after short delay
      this.time.delayedCall(1000, () => {
        this.startGame(data.opponent, data.yourSide);
      });
    });

    this.pongClient.on('connection_failed', () => {
      this.showConnectionError();
    });

    this.pongClient.on('error', (message: string) => {
      console.error('Server error:', message);
      this.showError(message);
    });
  }

  /**
   * Start the betting lobby (players set bets and ready up)
   */
  private startGame(opponent: PlayerData, yourSide: 'left' | 'right') {
    // Go to betting lobby scene where players set bets and ready up
    this.scene.start('PongBettingLobbyScene', {
      pongClient: this.pongClient,
      opponent: opponent,
      yourSide: yourSide
    });
  }

  /**
   * Cancel matchmaking and close game
   */
  private cancelMatchmaking() {
    // 🎵 Stop music when leaving BEAR PONG (canceling matchmaking)
    if (this.audioManager) {
      this.audioManager.stopBackgroundMusic();
      console.log('🔇 Stopped music - canceling matchmaking');
    }

    if (this.pongClient) {
      this.pongClient.leave();
      this.pongClient.disconnect();
    }

    if (this.loadingTimer) {
      this.loadingTimer.destroy();
    }

    // Show cancel message and redirect
    const cancelText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      'Matchmaking Cancelled',
      {
        fontSize: '36px',
        color: '#ffffff',
        fontFamily: 'Luckiest Guy'
      }
    );
    cancelText.setOrigin(0.5);

    // Redirect after 2 seconds
    this.time.delayedCall(2000, () => {
      window.location.href = '/'; // Go back to main site
    });
  }

  /**
   * Show connection error
   */
  private showConnectionError() {
    if (this.statusText) {
      this.statusText.setText('Failed to connect to server');
      this.statusText.setColor('#ff6b6b');
    }

    if (this.queuePositionText) {
      this.queuePositionText.setText('Please try again later');
    }

    if (this.loadingTimer) {
      this.loadingTimer.destroy();
      this.loadingTimer = null;
    }
  }

  /**
   * Show error message
   */
  private showError(message: string) {
    if (this.queuePositionText) {
      this.queuePositionText.setText(`Error: ${message}`);
      this.queuePositionText.setColor('#ff6b6b');
    }
  }

  /**
   * Create floating particles for dopamine atmosphere 🎊
   */
  private createFloatingParticles(width: number, height: number) {
    // Create 30 floating particles for MAXIMUM DOPAMINE
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);

      const particle = this.add.graphics();
      const color = Phaser.Math.RND.pick([0xffae00, 0x50fa7b, 0x680cd9, 0xfeb501]);
      particle.fillStyle(color, 0.5);
      particle.fillCircle(0, 0, Phaser.Math.Between(3, 7));
      particle.setPosition(x, y);
      particle.setBlendMode(Phaser.BlendModes.ADD);

      // Floating animation - particles rise up
      this.tweens.add({
        targets: particle,
        y: y - Phaser.Math.Between(150, 300),
        alpha: { from: 0.5, to: 0 },
        duration: Phaser.Math.Between(4000, 7000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        onRepeat: () => {
          particle.y = height + 10;
          particle.x = Phaser.Math.Between(0, width);
          particle.alpha = 0.5;
        }
      });

      // Wiggle animation for natural movement
      this.tweens.add({
        targets: particle,
        x: `+=${Phaser.Math.Between(-40, 40)}`,
        duration: Phaser.Math.Between(1500, 2500),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }
}
