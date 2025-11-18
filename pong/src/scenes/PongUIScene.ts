/**
 * PongUIScene - UI overlay for Pong game
 * Displays score and game info
 */
import Phaser from 'phaser';
import { PlayerData } from '../networking/types';
import { UltimateType, ULTIMATE_ABILITIES } from '../objects/UltimateAbility';
import { PongAPI } from '../PongAPI';

export class PongUIScene extends Phaser.Scene {
  private leftScoreText: Phaser.GameObjects.Text | null = null;
  private rightScoreText: Phaser.GameObjects.Text | null = null;

  // 🔥 JUICE: Combo counter
  private comboText: Phaser.GameObjects.Text | null = null;
  private comboTween: Phaser.Tweens.Tween | null = null;

  // Pause button
  private pauseButton: Phaser.GameObjects.Container | null = null;

  // Mute button
  private muteButton: Phaser.GameObjects.Container | null = null;
  private muteIcon: Phaser.GameObjects.Graphics | null = null;

  // 🚀 SPEED METER: Visual escalation indicator
  private speedMeter: Phaser.GameObjects.Container | null = null;
  private speedFill: Phaser.GameObjects.Rectangle | null = null;
  private speedText: Phaser.GameObjects.Text | null = null;
  private speedWarning: Phaser.GameObjects.Text | null = null;
  private currentSpeed: number = 6;

  // 💰 BETTING: Stakes display
  private stakesText: Phaser.GameObjects.Text | null = null;

  // 🚀 ULTIMATE ABILITIES (All 3!)
  private ultimateButtons: Map<UltimateType, Phaser.GameObjects.Container> = new Map();
  private ultimateUsed: Set<UltimateType> = new Set();  // Track which abilities have been used

  // 🖼️ PLAYER DATA: For displaying avatars
  private opponent: PlayerData | null = null;
  private yourSide: 'left' | 'right' = 'left';
  private myAvatarUrl: string | null = null;
  private opponentAvatarUrl: string | null = null;
  private myAvatarIsAnimated: boolean = false;
  private opponentAvatarIsAnimated: boolean = false;
  private myEquippedRing: any = null;
  private opponentEquippedRing: any = null;

  constructor() {
    super({ key: 'PongUIScene' });
  }

  init(data: any) {
    this.opponent = data.opponent;
    this.yourSide = data.yourSide;

    // Get my avatar from localStorage
    this.myAvatarUrl = PongAPI.getAvatarUrl();
    this.myAvatarIsAnimated = localStorage.getItem('avatar_is_animated') === 'true';

    // Get opponent avatar from opponent data
    this.opponentAvatarUrl = this.opponent?.avatarUrl || null;
    this.opponentAvatarIsAnimated = this.opponent?.avatarIsAnimated || false;

    // 💍 Extract equipped cosmetics directly from opponent data (already sent by server!)
    this.opponentEquippedRing = this.opponent?.equippedCosmetics?.ring || null;
    console.log('✅ Opponent equipped ring (from server data):', this.opponentEquippedRing);
  }

  /**
   * 💍 Wait for my equipped cosmetics to load
   */
  private async waitForCosmetics() {
    await this.fetchMyEquippedCosmetics();
  }

  /**
   * 💍 Fetch MY equipped cosmetics (opponent's come from server data)
   */
  private async fetchMyEquippedCosmetics(): Promise<void> {
    // Use current origin to avoid CORS issues (www.bearpark.xyz vs bearpark.xyz)
    const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;

    // Fetch my equipped cosmetics
    const myWallet = localStorage.getItem('xaman_wallet_address');
    if (myWallet) {
      try {
        const response = await fetch(`${API_BASE}/api/cosmetics/equipped/${myWallet}`);
        const data = await response.json();
        if (data.success && data.equipped.ring) {
          this.myEquippedRing = data.equipped.ring;
          console.log('✅ My equipped ring:', this.myEquippedRing);
        }
      } catch (error) {
        console.error('Failed to fetch my equipped cosmetics:', error);
      }
    }
  }

  async create() {
    const { width, height } = this.cameras.main;

    // 🚀 RESET: Clear ultimate abilities used set for new game
    this.ultimateUsed.clear();
    this.ultimateButtons.clear();

    // 💍 Wait for my equipped cosmetics to load before rendering avatars
    await this.waitForCosmetics();

    // Left score (large, on left side)
    this.leftScoreText = this.add.text(width / 4, 80, '0', {
      fontSize: '96px',
      color: '#4a90e2',
      fontStyle: 'bold'
    });
    this.leftScoreText.setOrigin(0.5);
    this.leftScoreText.setAlpha(0.6);

    // Right score (large, on right side)
    this.rightScoreText = this.add.text((width * 3) / 4, 80, '0', {
      fontSize: '96px',
      color: '#ff6b6b',
      fontStyle: 'bold'
    });
    this.rightScoreText.setOrigin(0.5);
    this.rightScoreText.setAlpha(0.6);

    // Create pause button (top-right corner)
    this.createPauseButton();

    // Create mute button (top-left corner)
    this.createMuteButton();

    // 🚀 Create speed meter
    this.createSpeedMeter();

    // 💰 Show bet stakes
    this.createStakesDisplay();

    // 🚀 Create ultimate ability button
    this.createUltimateButton();

    // 🖼️ Display player avatars at the top
    this.createAvatarDisplays();

    // ESC key to pause
    this.input.keyboard?.on('keydown-ESC', () => {
      this.pauseGame();
    });

    // 🎮 KEYBOARD SHORTCUTS: Arrow keys for power-ups
    this.input.keyboard?.on('keydown-LEFT', () => {
      console.log('⌨️ LEFT arrow key pressed - activating TIME_FREEZE');
      const timeFreezeButton = this.ultimateButtons.get(UltimateType.TIME_FREEZE);
      if (timeFreezeButton) {
        this.useUltimate(UltimateType.TIME_FREEZE, timeFreezeButton);
      }
    });

    this.input.keyboard?.on('keydown-RIGHT', () => {
      console.log('⌨️ RIGHT arrow key pressed - activating POWER_HIT');
      const powerHitButton = this.ultimateButtons.get(UltimateType.POWER_HIT);
      if (powerHitButton) {
        this.useUltimate(UltimateType.POWER_HIT, powerHitButton);
      }
    });
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
   * Create pause button
   */
  private createPauseButton() {
    const { width } = this.cameras.main;

    // Container for pause button (moved 10% more to the right)
    this.pauseButton = this.add.container(width / 2 + 80 + width * 0.1, 60);

    // Button background (purple from BEARpark)
    const buttonBg = this.add.circle(0, 0, 30, 0x680cd9);
    buttonBg.setInteractive({ useHandCursor: true });
    this.pauseButton.add(buttonBg);

    // Tri-color ring border
    const ringGraphics = this.add.graphics();
    this.createTriColorRing(ringGraphics, 0, 0, 30, 4);
    this.pauseButton.add(ringGraphics);

    // Pause icon (two bars)
    const bar1 = this.add.rectangle(-6, 0, 6, 20, 0xfeb501);
    const bar2 = this.add.rectangle(6, 0, 6, 20, 0xfeb501);
    this.pauseButton.add(bar1);
    this.pauseButton.add(bar2);

    // Click handler
    buttonBg.on('pointerdown', () => {
      this.pauseGame();
    });

    // Hover effect
    buttonBg.on('pointerover', () => {
      this.pauseButton?.setScale(1.1);
    });

    buttonBg.on('pointerout', () => {
      this.pauseButton?.setScale(1);
    });
  }

  /**
   * Create mute button
   */
  private createMuteButton() {
    const { width } = this.cameras.main;

    // Container for mute button (moved 10% more to the left)
    this.muteButton = this.add.container(width / 2 - 80 - width * 0.1, 60);

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
    // Get mute state from game scene's audio manager
    const gameScene = this.scene.get('PongGameScene') as any;
    const isMuted = gameScene?.audioManager?.isMutedState() || false;
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
    // Get audio manager from game scene
    const gameScene = this.scene.get('PongGameScene') as any;
    const audioManager = gameScene?.audioManager;

    if (audioManager) {
      audioManager.toggleMute();
      const isMuted = audioManager.isMutedState();
      this.updateMuteIcon(isMuted);
    }
  }

  /**
   * Pause the game
   */
  private pauseGame() {
    // Get audio manager from game scene
    const gameScene = this.scene.get('PongGameScene') as any;
    const audioManager = gameScene?.audioManager;

    // Pause game and UI scenes
    this.scene.pause('PongGameScene');
    this.scene.pause();

    // Launch pause scene
    this.scene.launch('PongPauseScene', {
      audioManager: audioManager,
      gameScene: gameScene
    });
  }

  /**
   * 🚀 Create speed meter UI
   */
  private createSpeedMeter() {
    const { width } = this.cameras.main;

    // Move speed meter to the TOP (was 130, now 45)
    this.speedMeter = this.add.container(width / 2, 45);

    // Background bar
    const barWidth = 200;
    const barHeight = 10;
    const bg = this.add.rectangle(0, 0, barWidth, barHeight, 0x000000, 0.5);
    this.speedMeter.add(bg);

    // Fill bar (starts empty)
    this.speedFill = this.add.rectangle(-barWidth / 2, 0, 0, barHeight, 0xfeb501);
    this.speedFill.setOrigin(0, 0.5);
    this.speedMeter.add(this.speedFill);

    // Speed label
    this.speedText = this.add.text(0, -20, 'SPEED', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'Luckiest Guy'
    });
    this.speedText.setOrigin(0.5);
    this.speedMeter.add(this.speedText);

    // Warning text (hidden by default)
    this.speedWarning = this.add.text(0, 25, '', {
      fontSize: '18px',
      color: '#ff4500',
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold'
    });
    this.speedWarning.setOrigin(0.5);
    this.speedWarning.setAlpha(0);
    this.speedMeter.add(this.speedWarning);
  }

  /**
   * 🚀 Update speed meter (called from game scene)
   */
  updateSpeedMeter(speed: number) {
    if (!this.speedFill || !this.speedText || !this.speedWarning) return;

    this.currentSpeed = speed;

    // Calculate fill percentage (8 = 0%, 20 = 100%)
    const minSpeed = 8;  // 🚀 Updated to match new INITIAL_BALL_SPEED
    const maxSpeed = 35;  // 🚀🔥 BROKEN/BG123 SPEED MODE!
    const fillPercent = Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed));

    // Update fill bar width
    const barWidth = 200;
    this.speedFill.width = barWidth * fillPercent;

    // 🔥 MORE SPEED ZONES for better escalation feel
    let color = 0xfeb501; // Yellow (slow)
    let warningText = '';

    if (speed >= 30) {
      // 🐻 BEAR SPEED - MAXIMUM!
      color = 0xff0000; // Pure red
      warningText = '🐻 BEAR SPEED! 🐻';
      this.speedWarning.setColor('#ff0000');
    } else if (speed >= 25) {
      // 💎 XRP SPEED - Almost max
      color = 0xff1493; // Deep pink (XRP color)
      warningText = '💎 XRP SPEED! 💎';
      this.speedWarning.setColor('#ff1493');
    } else if (speed >= 20) {
      // ⚡ OVERDRIVE - Very fast
      color = 0xff4500; // Red-orange
      warningText = '⚡ OVERDRIVE! ⚡';
      this.speedWarning.setColor('#ff4500');
    } else if (speed >= 16) {
      // 🔥 DANGER ZONE - Getting intense
      color = 0xff6600; // Bright orange
      warningText = '🔥 DANGER ZONE! 🔥';
      this.speedWarning.setColor('#ff6600');
    } else if (speed >= 12) {
      // ⚠️ HEATING UP - Starting to get fast
      color = 0xff8c00; // Dark orange
      warningText = '⚠️ HEATING UP! ⚠️';
      this.speedWarning.setColor('#ff8c00');
    } else if (speed >= 10) {
      // 🌡️ WARMING UP - Light warning
      color = 0xffa500; // Light orange
      warningText = '🌡️ WARMING UP! 🌡️';
      this.speedWarning.setColor('#ffa500');
    }

    this.speedFill.setFillStyle(color);

    // Show warning text if speed is high
    if (warningText) {
      this.speedWarning.setText(warningText);

      // Pulse animation
      this.tweens.add({
        targets: this.speedWarning,
        alpha: 1,
        scale: { from: 1.0, to: 1.2 },
        duration: 500,
        yoyo: true,
        repeat: -1
      });
    } else {
      this.speedWarning.setAlpha(0);
      this.tweens.killTweensOf(this.speedWarning);
    }

    // Update speed text color to match zones
    if (speed >= 30) {
      this.speedText.setColor('#ff0000'); // BEAR SPEED
    } else if (speed >= 25) {
      this.speedText.setColor('#ff1493'); // XRP SPEED
    } else if (speed >= 20) {
      this.speedText.setColor('#ff4500'); // OVERDRIVE
    } else if (speed >= 16) {
      this.speedText.setColor('#ff6600'); // DANGER ZONE
    } else if (speed >= 12) {
      this.speedText.setColor('#ff8c00'); // HEATING UP
    } else if (speed >= 10) {
      this.speedText.setColor('#ffa500'); // WARMING UP
    } else {
      this.speedText.setColor('#feb501'); // Default yellow
    }
  }

  /**
   * 💰 Create stakes display
   */
  private createStakesDisplay() {
    const { width } = this.cameras.main;

    // Get bet amount from localStorage (this is the minimum bet between both players)
    // POT = minimum bet * 2 (both players contribute the same amount)
    const betAmount = parseInt(localStorage.getItem('bearPongCurrentBet') || '10');
    const totalPot = betAmount * 2;

    // Move pot text below speed meter, lowered a smidge from 80 to 95
    this.stakesText = this.add.text(width / 2, 95, `💰 POT: ${totalPot} HONEY 💰`, {
      fontSize: '20px',
      color: '#ffae00',
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    });
    this.stakesText.setOrigin(0.5);

    // Pulse animation
    this.tweens.add({
      targets: this.stakesText,
      scale: { from: 1.0, to: 1.1 },
      duration: 1000,
      yoyo: true,
      repeat: -1
    });
  }

  /**
   * 🚀 Create ultimate ability buttons (TIME_FREEZE and POWER_HIT only)!
   */
  private createUltimateButton() {
    const { width, height } = this.cameras.main;

    // Create only 2 abilities horizontally
    const abilities = [UltimateType.TIME_FREEZE, UltimateType.POWER_HIT];
    const spacing = 180; // Space between buttons
    const startX = width / 2 - spacing / 2; // Center the 2 buttons

    abilities.forEach((abilityType, index) => {
      const abilityData = ULTIMATE_ABILITIES[abilityType];
      const x = startX + (index * spacing);
      const y = height - 70;

      // Create container for this ability
      const container = this.add.container(x, y);

      // Background (button) - SMALLER
      const buttonWidth = 160;
      const buttonHeight = 50;
      const bg = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x680cd9);
      bg.setStrokeStyle(4, 0xffae00);
      bg.setInteractive({ useHandCursor: true });
      container.add(bg);

      // Tri-color ring border
      const ringGraphics = this.add.graphics();
      this.createTriColorRing(ringGraphics, 0, 0, buttonWidth / 2 + 5, 6);
      container.add(ringGraphics);

      // Icon and text
      const label = this.add.text(0, 0, `${abilityData.icon} ${abilityData.name}`, {
        fontSize: '18px', // Smaller for compact buttons
        color: '#ffffff',
        fontFamily: 'Luckiest Guy',
        fontStyle: 'bold'
      });
      label.setOrigin(0.5);
      container.add(label);

      // 🎮 KEYBOARD SHORTCUT INDICATOR: Show arrow key below button
      const arrowKey = abilityType === UltimateType.TIME_FREEZE ? '←' : '→';
      const arrowKeyText = this.add.text(0, 35, arrowKey, {
        fontSize: '24px',
        color: '#ffae00',
        fontFamily: 'Arial',
        fontStyle: 'bold'
      });
      arrowKeyText.setOrigin(0.5);
      container.add(arrowKeyText);

      // Click handler
      bg.on('pointerdown', () => {
        console.log(`🎯 ${abilityData.name} button clicked!`);
        this.useUltimate(abilityType, container);
      });

      // Hover effect
      bg.on('pointerover', () => {
        if (!this.ultimateUsed.has(abilityType)) {
          container.setScale(1.1);
        }
      });

      bg.on('pointerout', () => {
        container.setScale(1);
      });

      // Pulse animation (when available)
      this.tweens.add({
        targets: container,
        scale: { from: 1.0, to: 1.05 },
        duration: 1000,
        yoyo: true,
        repeat: -1
      });

      // Store button reference
      this.ultimateButtons.set(abilityType, container);
    });
  }

  /**
   * 🚀 Use ultimate ability
   */
  private useUltimate(abilityType: UltimateType, container: Phaser.GameObjects.Container) {
    console.log(`🚀 useUltimate(${abilityType}) called, used:`, this.ultimateUsed.has(abilityType));
    if (this.ultimateUsed.has(abilityType)) {
      console.log('⚠️ Ultimate already used, ignoring');
      return;
    }

    this.ultimateUsed.add(abilityType);

    // Visual feedback - button turns gray (bg is at index 0, NOT 1!)
    const bg = container.list[0] as Phaser.GameObjects.Rectangle;
    if (bg) {
      bg.setFillStyle(0x444444);
      bg.setStrokeStyle(4, 0x666666);
    }

    // Stop pulse animation
    this.tweens.killTweensOf(container);

    // Add "USED" text
    const usedText = this.add.text(0, 35, 'USED', {
      fontSize: '16px',
      color: '#888888',
      fontFamily: 'Luckiest Guy'
    });
    usedText.setOrigin(0.5);
    container.add(usedText);

    // Trigger ability effect in game scene
    const gameScene = this.scene.get('PongGameScene') as any;
    console.log('🎮 Game scene:', gameScene);
    console.log('🎮 Has activateUltimate?', gameScene?.activateUltimate);
    console.log('🎮 Ultimate type:', abilityType);

    if (gameScene && gameScene.activateUltimate) {
      console.log('✅ Calling gameScene.activateUltimate()');
      gameScene.activateUltimate(abilityType);
    } else {
      console.error('❌ Game scene not found or missing activateUltimate method!');
    }

    // Epic activation effect
    this.showUltimateActivation(abilityType);
  }

  /**
   * 🔄 REFRESH POWER-UPS: Re-enable all ultimate buttons
   */
  refreshPowerups() {
    console.log('🔄 Refreshing power-ups!');

    // Clear used abilities
    this.ultimateUsed.clear();

    // Re-enable all buttons
    this.ultimateButtons.forEach((container, abilityType) => {
      const abilityData = ULTIMATE_ABILITIES[abilityType];

      // Reset button to original purple color
      const bg = container.list[0] as Phaser.GameObjects.Rectangle;
      if (bg) {
        bg.setFillStyle(0x680cd9);
        bg.setStrokeStyle(4, 0xffae00);
      }

      // Remove "USED" text if it exists (it's the last element added)
      const lastElement = container.list[container.list.length - 1];
      if (lastElement && lastElement.type === 'Text') {
        const textObj = lastElement as Phaser.GameObjects.Text;
        if (textObj.text === 'USED') {
          container.remove(textObj);
          textObj.destroy();
        }
      }

      // Restart pulse animation
      this.tweens.add({
        targets: container,
        scale: { from: 1.0, to: 1.05 },
        duration: 1000,
        yoyo: true,
        repeat: -1
      });
    });
  }

  /**
   * 🚀 Show epic activation effect
   */
  private showUltimateActivation(abilityType: UltimateType) {
    const { width, height } = this.cameras.main;
    const abilityData = ULTIMATE_ABILITIES[abilityType];

    // HUGE text in center
    const activationText = this.add.text(width / 2, height / 2, `${abilityData.icon} ${abilityData.name.toUpperCase()}! ${abilityData.icon}`, {
      fontSize: '72px',
      color: '#ffae00',
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 8
    });
    activationText.setOrigin(0.5);
    activationText.setAlpha(0);

    // Epic animation: Zoom in, hold, zoom out
    this.tweens.add({
      targets: activationText,
      alpha: 1,
      scale: { from: 0, to: 1.5 },
      duration: 300,
      ease: 'Back.out',
      onComplete: () => {
        this.time.delayedCall(800, () => {
          this.tweens.add({
            targets: activationText,
            alpha: 0,
            scale: 2,
            duration: 400,
            ease: 'Power2',
            onComplete: () => activationText.destroy()
          });
        });
      }
    });

    // Screen flash
    const flash = this.add.rectangle(0, 0, width, height, 0xffffff, 0.5);
    flash.setOrigin(0);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      onComplete: () => flash.destroy()
    });
  }

  /**
   * Update score display
   * 🔥 JUICE: MASSIVE POP ANIMATION when score changes
   */
  updateScore(leftScore: number, rightScore: number) {
    const { width, height } = this.cameras.main;

    if (this.leftScoreText) {
      const previousScore = parseInt(this.leftScoreText.text) || 0;
      this.leftScoreText.setText(leftScore.toString());

      // 🔥 JUICE: HUGE score pop animation when score changes
      if (previousScore !== leftScore && leftScore > previousScore) {
        // Create HUGE floating score
        const hugeScore = this.add.text(width / 4, height / 2, leftScore.toString(), {
          fontSize: '256px',
          color: '#4a90e2',
          fontStyle: 'bold'
        });
        hugeScore.setOrigin(0.5);
        hugeScore.setAlpha(1);

        // Animate: HUGE → shrink to normal position
        this.tweens.add({
          targets: hugeScore,
          scale: { from: 1, to: 0.375 }, // 256px → 96px (1/256*96 = 0.375)
          x: width / 4,
          y: 80,
          alpha: 0,
          duration: 800,
          ease: 'Back.in',
          onComplete: () => {
            hugeScore.destroy();
            // Pulse the actual score
            this.tweens.add({
              targets: this.leftScoreText,
              scale: { from: 1.5, to: 1 },
              duration: 400,
              ease: 'Elastic.out'
            });
          }
        });
      }
    }

    if (this.rightScoreText) {
      const previousScore = parseInt(this.rightScoreText.text) || 0;
      this.rightScoreText.setText(rightScore.toString());

      // 🔥 JUICE: HUGE score pop animation when score changes
      if (previousScore !== rightScore && rightScore > previousScore) {
        // Create HUGE floating score
        const hugeScore = this.add.text((width * 3) / 4, height / 2, rightScore.toString(), {
          fontSize: '256px',
          color: '#ff6b6b',
          fontStyle: 'bold'
        });
        hugeScore.setOrigin(0.5);
        hugeScore.setAlpha(1);

        // Animate: HUGE → shrink to normal position
        this.tweens.add({
          targets: hugeScore,
          scale: { from: 1, to: 0.375 }, // 256px → 96px
          x: (width * 3) / 4,
          y: 80,
          alpha: 0,
          duration: 800,
          ease: 'Back.in',
          onComplete: () => {
            hugeScore.destroy();
            // Pulse the actual score
            this.tweens.add({
              targets: this.rightScoreText,
              scale: { from: 1.5, to: 1 },
              duration: 400,
              ease: 'Elastic.out'
            });
          }
        });
      }
    }
  }

  /**
   * 🔥 JUICE: Show combo counter (called from game scene)
   */
  showCombo(combo: number, side: 'left' | 'right') {
    if (combo < 2) return; // Only show 2+ combos

    const { width, height } = this.cameras.main;

    // Stop any existing combo tween
    if (this.comboTween) {
      this.comboTween.stop();
      this.comboText?.destroy();
    }

    // Create combo text
    const x = side === 'left' ? width / 4 : (width * 3) / 4;
    const color = side === 'left' ? '#4a90e2' : '#ff6b6b';

    this.comboText = this.add.text(x, height / 2 + 100, `${combo} HIT COMBO!`, {
      fontSize: '48px',
      color: color,
      fontStyle: 'bold'
    });
    this.comboText.setOrigin(0.5);
    this.comboText.setAlpha(0);

    // Animate: Pop in, pulse, fade out
    this.comboTween = this.tweens.add({
      targets: this.comboText,
      alpha: 1,
      scale: { from: 0, to: 1.2 },
      duration: 200,
      ease: 'Back.out',
      onComplete: () => {
        // Hold for a moment
        this.time.delayedCall(500, () => {
          // Fade out
          this.tweens.add({
            targets: this.comboText,
            alpha: 0,
            scale: 0.8,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
              this.comboText?.destroy();
              this.comboText = null;
            }
          });
        });
      }
    });
  }

  /**
   * 🖼️ Create avatar displays at the top of the screen
   */
  private createAvatarDisplays() {
    const { width } = this.cameras.main;
    const avatarY = 60; // Same Y as pause/mute buttons
    const avatarRadius = 35; // Slightly smaller than lobby

    // Determine which side is which
    const leftSideIsYou = this.yourSide === 'left';
    const leftAvatarUrl = leftSideIsYou ? this.myAvatarUrl : this.opponentAvatarUrl;
    const leftIsAnimated = leftSideIsYou ? this.myAvatarIsAnimated : this.opponentAvatarIsAnimated;
    const leftEquippedRing = leftSideIsYou ? this.myEquippedRing : this.opponentEquippedRing;
    const rightAvatarUrl = leftSideIsYou ? this.opponentAvatarUrl : this.myAvatarUrl;
    const rightIsAnimated = leftSideIsYou ? this.opponentAvatarIsAnimated : this.myAvatarIsAnimated;
    const rightEquippedRing = leftSideIsYou ? this.opponentEquippedRing : this.myEquippedRing;

    // Left avatar (between mute button and left score)
    const leftAvatarX = 150;
    this.createAvatar(leftAvatarX, avatarY, avatarRadius, leftAvatarUrl, leftIsAnimated, 0x4a90e2, leftEquippedRing); // Blue for left

    // Right avatar (between right score and pause button)
    const rightAvatarX = width - 150;
    this.createAvatar(rightAvatarX, avatarY, avatarRadius, rightAvatarUrl, rightIsAnimated, 0xff6b6b, rightEquippedRing); // Red for right
  }

  /**
   * 🖼️ Create a single avatar display
   */
  private createAvatar(x: number, y: number, radius: number, avatarUrl: string | null, isAnimated: boolean, borderColor: number, equippedRing: any = null) {
    if (avatarUrl) {
      // Always use HTML overlay for avatars (textures not shared between scenes)
      this.createHTMLAvatar(x, y, radius, avatarUrl, borderColor, equippedRing);
    } else {
      // No avatar - show placeholder with border
      const borderGraphics = this.add.graphics();
      borderGraphics.lineStyle(4, borderColor, 1);
      borderGraphics.strokeCircle(x, y, radius + 2);

      const placeholder = this.add.circle(x, y, radius, 0x333333);

      // Add initials text (first letter of name)
      // Determine if this is left or right avatar
      const isLeftAvatar = x < this.cameras.main.width / 2;
      let playerName: string;

      if (isLeftAvatar) {
        // Left avatar shows left player's name
        playerName = this.yourSide === 'left' ?
          PongAPI.getCurrentUserDisplayName() :
          (this.opponent?.displayName || 'O');
      } else {
        // Right avatar shows right player's name
        playerName = this.yourSide === 'right' ?
          PongAPI.getCurrentUserDisplayName() :
          (this.opponent?.displayName || 'O');
      }

      const initial = playerName.charAt(0).toUpperCase();

      const initialText = this.add.text(x, y, initial, {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'Luckiest Guy'
      });
      initialText.setOrigin(0.5);
    }
  }

  /**
   * 🖼️ Create HTML overlay for avatar (for GIFs and non-preloaded images)
   */
  private createHTMLAvatar(x: number, y: number, radius: number, avatarUrl: string, borderColor: number, equippedRing: any = null) {
    // Get canvas position
    const canvas = this.game.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const scaledRadius = radius * Math.min(scaleX, scaleY);

    // Create wrapper for avatar + ring
    const wrapper = document.createElement('div');
    wrapper.className = 'pong-ui-avatar-wrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.width = `${scaledRadius * 2}px`;
    wrapper.style.height = `${scaledRadius * 2}px`;
    wrapper.style.left = `${canvasRect.left + scaledX - scaledRadius}px`;
    wrapper.style.top = `${canvasRect.top + scaledY - scaledRadius}px`;
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '10000';

    // 💍 Create cosmetic ring if equipped
    if (equippedRing) {
      // Determine ring image path
      let ringPath;
      if (equippedRing.image_url && (equippedRing.image_url.startsWith('http://') || equippedRing.image_url.startsWith('https://'))) {
        // Already a full URL (e.g., https://files.catbox.moe/8vd6jp.png)
        ringPath = equippedRing.image_url;
      } else {
        // Relative path, construct full URL
        const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
        const ringImage = equippedRing.image_url || equippedRing.name.toLowerCase().replace(/ /g, '-') + '.svg';
        ringPath = `${API_BASE}/cosmetics/${ringImage}`;
      }

      const ringDiv = document.createElement('div');
      ringDiv.className = 'cosmetic-ring';
      ringDiv.style.position = 'absolute';
      ringDiv.style.inset = '-6px';
      ringDiv.style.borderRadius = '50%';
      ringDiv.style.backgroundImage = `url('${ringPath}')`;
      ringDiv.style.backgroundSize = 'cover';
      ringDiv.style.backgroundPosition = 'center';
      ringDiv.style.zIndex = '2';
      ringDiv.style.pointerEvents = 'none';

      // Add animation if ring is animated
      if (equippedRing.is_animated) {
        ringDiv.style.animation = 'spin 3s linear infinite';
      }

      wrapper.appendChild(ringDiv);
      console.log('💍 Rendered cosmetic ring:', equippedRing.name, 'from', ringPath);
    }

    // Create HTML container for avatar
    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'pong-ui-avatar';
    avatarContainer.style.position = 'relative';
    avatarContainer.style.width = '100%';
    avatarContainer.style.height = '100%';
    avatarContainer.style.borderRadius = '50%';
    avatarContainer.style.overflow = 'hidden';
    avatarContainer.style.zIndex = '1';
    avatarContainer.style.border = equippedRing ? 'none' : `4px solid ${this.colorToHex(borderColor)}`;

    // Create image element
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.display = 'block';

    avatarContainer.appendChild(img);
    wrapper.appendChild(avatarContainer);
    document.body.appendChild(wrapper);

    // Add spin animation keyframes if not already present
    if (!document.getElementById('pong-ring-animations')) {
      const style = document.createElement('style');
      style.id = 'pong-ring-animations';
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // Cleanup on scene shutdown
    this.events.once('shutdown', () => {
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    });
  }

  /**
   * Convert Phaser color integer to CSS hex string
   */
  private colorToHex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0');
  }

}
