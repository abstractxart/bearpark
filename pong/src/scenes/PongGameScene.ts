/**
 * PongGameScene - Main Pong gameplay scene
 * Displays game state from server and sends paddle input
 */
import Phaser from 'phaser';
import { PongClient } from '../networking/PongClient';
import { Paddle } from '../objects/Paddle';
import { Ball } from '../objects/Ball';
import { BannerDisplay } from '../objects/BannerDisplay';
import { GAME_CONFIG, GameState, PlayerData } from '../networking/types';
import { PongAudioManager } from '../audio/PongAudioManager';
import { UltimateType } from '../objects/UltimateAbility';

export class PongGameScene extends Phaser.Scene {
  private pongClient: PongClient | null = null;
  private opponent: PlayerData | null = null;
  private yourSide: 'left' | 'right' = 'left';
  private betAmount: number = 0;

  // Game objects
  private leftPaddle: Paddle | null = null;
  private rightPaddle: Paddle | null = null;
  private ball: Ball | null = null;
  private leftBanner: BannerDisplay | null = null;
  private rightBanner: BannerDisplay | null = null;

  // UI elements
  private countdownText: Phaser.GameObjects.Text | null = null;
  private centerLine: Phaser.GameObjects.Graphics | null = null;

  // 🔥 JUICE: Background reference for pulse effect
  private background: Phaser.GameObjects.Image | null = null;

  // 🎵 JUICE: Audio manager
  private audioManager: PongAudioManager | null = null;

  // Input tracking
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasd: any = null;
  private isMouseDown: boolean = false;
  private boundMouseDown: ((e: MouseEvent | TouchEvent) => void) | null = null;
  private boundMouseMove: ((e: MouseEvent | TouchEvent) => void) | null = null;
  private boundMouseUp: ((e?: MouseEvent | TouchEvent) => void) | null = null;

  // 🔥 JUICE: Track ball velocity to detect paddle hits
  private lastBallVelocityX: number = 0;
  private lastScore1: number = 0;
  private lastScore2: number = 0;

  // 🚀 ULTIMATE ABILITIES
  private powerHitActive: boolean = false;
  private powerHitGlow: Phaser.GameObjects.Rectangle | null = null;
  private powerHitGlow2: Phaser.GameObjects.Rectangle | null = null;
  private powerHitParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private powerHitBorder: Phaser.GameObjects.Graphics | null = null;

  // ⏱️ HONEY REWARDS: Track gameplay time
  private gameStartTime: number = 0;

  constructor() {
    super({ key: 'PongGameScene' });
  }

  init(data: any) {
    this.pongClient = data.pongClient;
    this.opponent = data.opponent;
    this.yourSide = data.yourSide;
    this.betAmount = data.betAmount || 0;
    console.log(`💰 [GAME SCENE] Received betAmount: ${this.betAmount}`);
  }

  preload() {
    // Load background image
    this.load.image('background', 'https://files.catbox.moe/qnp7wc.png');

    // 🎵 JUICE: Preload audio assets
    if (!this.audioManager) {
      this.audioManager = new PongAudioManager(this);
    }
    this.audioManager.preload();
  }

  create() {
    const { width, height } = this.cameras.main;

    // 📱 MOBILE FULLSCREEN: Attempt to enter fullscreen mode
    this.attemptFullscreen();

    // 🎵 PERSISTENT MUSIC: Use global audio manager (music continues from lobby)
    this.audioManager = this.game.registry.get('globalAudioManager');
    if (!this.audioManager) {
      // Fallback: create new audio manager if none exists
      this.audioManager = new PongAudioManager(this);
      this.audioManager.create();
      this.audioManager.playBackgroundMusic();
      this.game.registry.set('globalAudioManager', this.audioManager);
      console.log('🎵 Created fallback audio manager in game scene');
    } else {
      console.log('🎵 Using global audio manager - music continues playing');
    }

    // Background image (fill entire canvas)
    this.background = this.add.image(0, 0, 'background').setOrigin(0);
    this.background.setDisplaySize(width, height);

    // Draw yellow borders (top and bottom) - BEARpark aesthetic
    const borderThickness = 8;
    this.add.rectangle(0, 0, width, borderThickness, 0xfeb501).setOrigin(0); // Top border - EXACT BEARpark yellow
    this.add.rectangle(0, height - borderThickness, width, borderThickness, 0xfeb501).setOrigin(0); // Bottom border - EXACT BEARpark yellow

    // Draw center line
    this.drawCenterLine();

    // Create paddles - BEARpark purple/green aesthetic
    const leftPaddleX = 50 + GAME_CONFIG.PADDLE_WIDTH / 2;
    const rightPaddleX = width - 50 - GAME_CONFIG.PADDLE_WIDTH / 2;

    // Create paddles based on which side player is on
    if (this.yourSide === 'left') {
      // You are on the left
      this.leftPaddle = new Paddle(
        this,
        leftPaddleX,
        height / 2,
        0x680cd9 // Purple
      );
      this.leftPaddle.setLocalPlayer(true); // Mark as local player

      this.rightPaddle = new Paddle(
        this,
        rightPaddleX,
        height / 2,
        0x07ae08 // Green
      );
      this.rightPaddle.setLocalPlayer(false); // Mark as opponent
    } else {
      // You are on the right
      this.leftPaddle = new Paddle(
        this,
        leftPaddleX,
        height / 2,
        0x680cd9 // Purple
      );
      this.leftPaddle.setLocalPlayer(false); // Mark as opponent

      this.rightPaddle = new Paddle(
        this,
        rightPaddleX,
        height / 2,
        0x07ae08 // Green
      );
      this.rightPaddle.setLocalPlayer(true); // Mark as local player
    }

    // Create ball
    this.ball = new Ball(this, width / 2, height / 2);

    // Create player banners at top of each half
    this.createPlayerBanners();

    // Create countdown text - BIG and BUBBLY with Luckiest Guy font
    this.countdownText = this.add.text(width / 2, height / 2, '', {
      fontSize: '180px',
      color: '#FFD700',  // Gold
      fontFamily: '"Luckiest Guy", cursive',
      stroke: '#000000',
      strokeThickness: 12,
      shadow: {
        offsetX: 6,
        offsetY: 6,
        color: '#000000',
        blur: 10,
        fill: true
      }
    });
    this.countdownText.setOrigin(0.5);
    this.countdownText.setDepth(1000);  // Always on top

    // Set up input
    this.setupInput();

    // Set up server event handlers
    this.setupServerHandlers();

    // Launch UI overlay scene with opponent and side data
    this.scene.launch('PongUIScene', {
      opponent: this.opponent,
      yourSide: this.yourSide
    });
  }

  /**
   * Draw dashed center line (vertical)
   */
  private drawCenterLine() {
    this.centerLine = this.add.graphics();
    this.centerLine.lineStyle(2, 0x444444);

    const dashLength = 20;
    const gapLength = 15;
    const centerX = this.cameras.main.width / 2;

    for (let y = 0; y < this.cameras.main.height; y += dashLength + gapLength) {
      this.centerLine.lineBetween(centerX, y, centerX, y + dashLength);
    }
  }

  /**
   * Attempt to enter fullscreen mode on mobile devices
   */
  private attemptFullscreen() {
    try {
      // Skip on iOS (not supported)
      if ((window as any).isIOS) {
        console.log('📱 iOS detected - skipping fullscreen (use viewport instead)');
        return;
      }

      // Use the global enterFullscreen function if available
      if (typeof (window as any).enterFullscreen === 'function') {
        (window as any).enterFullscreen();
        console.log('📱 Game scene triggering fullscreen mode');
      } else {
        // Fallback: direct fullscreen API call
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(err => {
            console.log('Fullscreen request failed:', err);
          });
        } else if ((elem as any).webkitRequestFullscreen) {
          (elem as any).webkitRequestFullscreen();
        }
      }
    } catch (error) {
      console.log('Could not enter fullscreen:', error);
    }
  }

  /**
   * Create player banners at top of each player's half
   */
  private createPlayerBanners() {
    if (this.yourSide === 'left') {
      // You are on the left
      this.leftBanner = new BannerDisplay(
        this,
        'left',
        PongAPI.getCurrentUserDisplayName()
      );

      this.rightBanner = new BannerDisplay(
        this,
        'right',
        this.opponent?.displayName || 'Opponent'
      );
    } else {
      // You are on the right
      this.leftBanner = new BannerDisplay(
        this,
        'left',
        this.opponent?.displayName || 'Opponent'
      );

      this.rightBanner = new BannerDisplay(
        this,
        'right',
        PongAPI.getCurrentUserDisplayName()
      );
    }

    // Show banners with fade-in
    this.leftBanner?.show();
    this.rightBanner?.show();
  }

  /**
   * Set up input controls (GODMODE: instant responsive controls)
   */
  private setupInput() {
    // Keyboard input
    this.cursors = this.input.keyboard?.createCursorKeys() || null;

    this.wasd = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S
    });

    // 🎮 ULTRAWIDE FIX: Use ONLY window-level events (NOT Phaser events) to track mouse EVERYWHERE
    // Phaser pointer events only fire inside canvas - we need to track GLOBALLY

    this.boundMouseDown = (e: MouseEvent | TouchEvent) => {
      this.isMouseDown = true;
      const playerPaddle = this.yourSide === 'left' ? this.leftPaddle : this.rightPaddle;

      // Convert screen Y to game Y coordinate
      const canvas = this.game.canvas;
      const rect = canvas.getBoundingClientRect();
      const scaleY = canvas.height / rect.height;

      let clientY: number;
      if (e instanceof MouseEvent) {
        clientY = e.clientY;
      } else {
        clientY = e.touches[0]?.clientY || 0;
      }

      const gameY = (clientY - rect.top) * scaleY;
      playerPaddle?.updatePointerInput(gameY, true);

      // Stop event from reaching UI buttons
      e.stopPropagation();
    };

    this.boundMouseMove = (e: MouseEvent | TouchEvent) => {
      if (this.isMouseDown) {
        const playerPaddle = this.yourSide === 'left' ? this.leftPaddle : this.rightPaddle;

        // Convert screen Y to game Y coordinate
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleY = canvas.height / rect.height;

        let clientY: number;
        if (e instanceof MouseEvent) {
          clientY = e.clientY;
        } else {
          clientY = e.touches[0]?.clientY || 0;
        }

        const gameY = (clientY - rect.top) * scaleY;
        playerPaddle?.updatePointerInput(gameY, true);

        // Stop event from reaching UI buttons while dragging
        e.stopPropagation();
      }
    };

    this.boundMouseUp = (e?: MouseEvent | TouchEvent) => {
      this.isMouseDown = false;
      const playerPaddle = this.yourSide === 'left' ? this.leftPaddle : this.rightPaddle;
      playerPaddle?.updatePointerInput(0, false);

      // Stop event from reaching UI buttons
      if (e) {
        e.stopPropagation();
      }
    };

    // Add global mouse listeners to window - these fire EVERYWHERE, even outside browser!
    // USE CAPTURE MODE (true) to intercept events BEFORE they reach UI buttons!
    // This prevents pause/mute/powerup buttons from stealing our mouse events
    window.addEventListener('mousedown', this.boundMouseDown as any, true);
    window.addEventListener('mousemove', this.boundMouseMove as any, true);
    window.addEventListener('mouseup', this.boundMouseUp as any, true);

    // Also handle touch events globally with capture
    window.addEventListener('touchstart', this.boundMouseDown as any, true);
    window.addEventListener('touchmove', this.boundMouseMove as any, { passive: false, capture: true });
    window.addEventListener('touchend', this.boundMouseUp as any, true);
  }

  /**
   * Set up server event handlers
   */
  private setupServerHandlers() {
    if (!this.pongClient) return;

    this.pongClient.on('countdown', (count: number) => {
      // Recreate countdown text if it doesn't exist (destroyed after previous countdown)
      if (!this.countdownText) {
        this.countdownText = this.add.text(this.scale.width / 2, this.scale.height / 2, '', {
          fontSize: '180px',
          color: '#FFD700',  // Gold
          fontFamily: '"Luckiest Guy", cursive',
          stroke: '#000000',
          strokeThickness: 12,
        }).setOrigin(0.5);
        this.countdownText.setDepth(1000);  // Always on top
      }

      if (count > 0) {
        this.countdownText.setText(count.toString());
        this.countdownText.setColor('#FFD700');  // Reset to gold
        this.countdownText.setVisible(true);
        this.countdownText.setAlpha(1);

        // 🎆 EXPLOSIVE BOUNCE IN animation
        this.tweens.add({
          targets: this.countdownText,
          scale: { from: 3, to: 1.2 },
          alpha: { from: 0, to: 1 },
          duration: 400,
          ease: 'Back.easeOut',
          onComplete: () => {
            // Gentle pulse
            this.tweens.add({
              targets: this.countdownText,
              scale: { from: 1.2, to: 1 },
              duration: 600,
              ease: 'Sine.easeInOut'
            });
          }
        });
      } else {
        // "GO!" with GREEN color
        this.countdownText.setText('GO!');
        this.countdownText.setColor('#00FF00');  // Bright green
        this.countdownText.setVisible(true);
        this.countdownText.setAlpha(1);

        // ⏱️ HONEY REWARDS: Start tracking game time
        if (!this.gameStartTime) {
          this.gameStartTime = Date.now();
        }

        // �� EXPLOSIVE GO! animation (33% smaller)
        this.tweens.add({
          targets: this.countdownText,
          scale: { from: 2.7, to: 1.0 },
          alpha: { from: 0, to: 1 },
          duration: 300,
          ease: 'Back.easeOut',
          onComplete: () => {
            // Fade out after showing
            this.tweens.add({
              targets: this.countdownText,
              alpha: 0,
              scale: 1.35,
              duration: 500,
              delay: 200,
              ease: 'Power2',
              onComplete: () => {
                this.countdownText?.destroy();
                this.countdownText = null;
              }
            });
          }
        });
      }
    });

    this.pongClient.on("game_state", (state: GameState) => {
      // Send score update to UI scene
      const uiScene = this.scene.get("PongUIScene") as any;
      if (uiScene && uiScene.updateScore) {
        uiScene.updateScore(state.score1, state.score2);
      }

      // 🚀 Update speed meter
      const ballSpeed = Math.sqrt(state.ballVelocityX * state.ballVelocityX + state.ballVelocityY * state.ballVelocityY);
      if (uiScene && uiScene.updateSpeedMeter) {
        uiScene.updateSpeedMeter(ballSpeed);
      }

      // GODMODE BALL EVOLUTION: Update ball with velocity for speed-reactive visuals
      if (this.ball) {
        this.ball.updatePosition(
          state.ballX,
          state.ballY,
          state.ballVelocityX,
          state.ballVelocityY
        );
      }

      // GODMODE: Only update OPPONENT's paddle from server
      // Player's paddle is controlled purely by local input (zero-lag)
      if (this.yourSide === 'left') {
        // You're on left, update opponent (right paddle) from server
        if (this.rightPaddle) {
          this.rightPaddle.updatePosition(state.paddle2Y);
        }
      } else {
        // You're on right, update opponent (left paddle) from server
        if (this.leftPaddle) {
          this.leftPaddle.updatePosition(state.paddle1Y);
        }
      }
    });

    // 🔄 Handle power-ups refresh (when someone scores)
    this.pongClient.on('powerups_refreshed', () => {
      console.log('🔄 Power-ups refreshed message received!');
      const uiScene = this.scene.get('PongUIScene') as any;
      if (uiScene && uiScene.refreshPowerups) {
        uiScene.refreshPowerups();
      }
    });

    // Handle game over
    this.pongClient.on('game_over', (data: { winner: 'left' | 'right', finalScore: { left: number; right: number }, betAmount?: number }) => {
      console.log('🏆 Game over event received:', data);
      // Use betAmount from server if provided, otherwise use the one passed from betting lobby
      const finalBetAmount = data.betAmount ?? this.betAmount;
      console.log(`💰 [GAME SCENE] Using betAmount for game over: ${finalBetAmount} (server: ${data.betAmount}, scene: ${this.betAmount})`);
      this.handleGameOver(data.winner, data.finalScore, finalBetAmount);
    });
  }

  update() {
    // Handle paddle input
    this.handlePaddleInput();

    // Update paddles to sync HTML avatars
    this.leftPaddle?.update();
    this.rightPaddle?.update();

    // 🚀 POWER HIT: Update glow position to follow paddle
    if (this.powerHitActive) {
      const playerPaddle = this.yourSide === 'left' ? this.leftPaddle : this.rightPaddle;
      if (playerPaddle) {
        if (this.powerHitGlow) {
          this.powerHitGlow.setPosition(playerPaddle.x, playerPaddle.y);
        }
        if (this.powerHitGlow2) {
          this.powerHitGlow2.setPosition(playerPaddle.x, playerPaddle.y);
        }
        if (this.powerHitParticles) {
          this.powerHitParticles.setPosition(playerPaddle.x, playerPaddle.y);
        }
      }
    }
  }

  /**
   * Clean up global event listeners when scene shuts down
   */
  shutdown() {
    // Remove global mouse listeners (must use same options as addEventListener!)
    if (this.boundMouseDown) {
      window.removeEventListener('mousedown', this.boundMouseDown as any, true);
      window.removeEventListener('touchstart', this.boundMouseDown as any, true);
    }
    if (this.boundMouseMove) {
      window.removeEventListener('mousemove', this.boundMouseMove as any, true);
      window.removeEventListener('touchmove', this.boundMouseMove as any, { passive: false, capture: true } as any);
    }
    if (this.boundMouseUp) {
      window.removeEventListener('mouseup', this.boundMouseUp as any, true);
      window.removeEventListener('touchend', this.boundMouseUp as any, true);
    }
  }

  /**
   * Handle paddle input and send to server (GODMODE: instant response)
   */
  private handlePaddleInput() {
    if (!this.pongClient) return;

    // Get player's paddle
    const playerPaddle = this.yourSide === 'left' ? this.leftPaddle : this.rightPaddle;
    if (!playerPaddle) return;

    // GODMODE: Update paddle with keyboard input (instant response system)
    const upPressed = !!(this.cursors?.up.isDown || this.wasd?.up.isDown);
    const downPressed = !!(this.cursors?.down.isDown || this.wasd?.down.isDown);
    playerPaddle.updateKeyboardInput(upPressed, downPressed);

    // Send GHOST position to server (instant, zero-lag position)
    this.pongClient.movePaddle(playerPaddle.getGhostY());
  }

  /**
   * Handle game over
   */
  /**
   * 🎉 Show FLASHY BUBBLY countdown (3, 2, 1, GO!) with Luckiest Guy font
   */

  /**
   * ✨ Create particle explosion for countdown
   */

  private handleGameOver(winner: 'left' | 'right', finalScore: { left: number; right: number }, betAmount: number = 0) {
    console.log('Game over!', winner, finalScore, 'Bet amount:', betAmount);

    const didWin = winner === this.yourSide;

    // Stop UI scene
    this.scene.stop('PongUIScene');

    // Start game over scene
    this.scene.start('PongGameOverScene', {
      didWin: didWin,
      yourScore: this.yourSide === 'left' ? finalScore.left : finalScore.right,
      opponentScore: this.yourSide === 'left' ? finalScore.right : finalScore.left,
      opponent: this.opponent,
      pongClient: this.pongClient,
      gameStartTime: this.gameStartTime, // ⏱️ Pass start time for rewards calculation
      betAmount: betAmount // 💰 Pass bet amount
    });
  }

  /**
   * Handle opponent disconnect
   */
  private handleOpponentDisconnect() {
    console.log('Opponent disconnected');

    // Show disconnect message
    const disconnectText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      'Opponent Disconnected\n\nYou Win by Default!',
      {
        fontSize: '32px',
        color: '#ffffff',
        align: 'center'
      }
    );
    disconnectText.setOrigin(0.5);

    // Wait 3 seconds then go to game over
    this.time.delayedCall(3000, () => {
      const yourScore = this.yourSide === 'left' ?
        this.leftPaddle?.getTop() || 0 :
        this.rightPaddle?.getTop() || 0;

      // Get bet amount from localStorage
      const betAmount = parseInt(localStorage.getItem('bearPongCurrentBet') || '0');

      this.handleGameOver(this.yourSide, {
        left: this.yourSide === 'left' ? GAME_CONFIG.WINNING_SCORE : 0,
        right: this.yourSide === 'right' ? GAME_CONFIG.WINNING_SCORE : 0
      }, betAmount);
    });
  }

  /**
   * 🚀 Activate ultimate ability (called from UI scene)
   */
  public activateUltimate(type: UltimateType) {
    console.log(`🚀 Activating ultimate ability: ${type}`);

    // Send to server to actually execute the ability
    if (this.pongClient) {
      this.pongClient.send({
        type: 'use_ultimate',
        abilityType: type
      });
      console.log('✅ Sent use_ultimate message to server');
    } else {
      console.error('❌ No pongClient available to send ultimate!');
    }

    // Local visual effects will be triggered when server confirms
    // (Server sends 'ultimate_activated' message back)
  }

  /**
   * ⏰ TIME FREEZE: ULTRA DRAMATIC SLOW-MO for 4 seconds
   */
  private activateTimeFreeze() {
    console.log('🚀 TIME FREEZE ACTIVATED - ULTRA SLOW-MO!');

    const { width, height } = this.cameras.main;

    // 1. INTENSE BLUE/CYAN TINT OVERLAY (way more opacity)
    const overlay = this.add.rectangle(0, 0, width, height, 0x00ccff, 0.5);
    overlay.setOrigin(0);
    overlay.setDepth(1000);
    overlay.setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Pulse the overlay
    this.tweens.add({
      targets: overlay,
      alpha: { from: 0.4, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1
    });

    // 2. THICK PULSING CYAN BORDER
    const border = this.add.graphics();
    border.lineStyle(15, 0x00ffff, 1);
    border.strokeRect(0, 0, width, height);
    border.setDepth(1001);

    this.tweens.add({
      targets: border,
      alpha: { from: 0.5, to: 1 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });

    // 3. MASSIVE "SLOW-MO" TEXT
    const slowmoText = this.add.text(width / 2, height / 2 - 100, '⏰ SLOW-MO ⏰', {
      fontSize: '96px',
      color: '#00ffff',
      fontFamily: 'Luckiest Guy',
      fontStyle: 'bold',
      stroke: '#0044aa',
      strokeThickness: 8
    });
    slowmoText.setOrigin(0.5);
    slowmoText.setDepth(1002);
    slowmoText.setAlpha(0);

    // Fade in text
    this.tweens.add({
      targets: slowmoText,
      alpha: 1,
      scale: { from: 0.5, to: 1.2 },
      duration: 400,
      ease: 'Back.easeOut'
    });

    // Pulse text
    this.tweens.add({
      targets: slowmoText,
      scale: { from: 1.2, to: 1.4 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 4. VIGNETTE EFFECT (dark edges)
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0);
    vignette.fillRect(0, 0, width, height);

    // Create radial gradient effect (simulate vignette)
    const vignetteCircle = this.add.circle(width / 2, height / 2, Math.max(width, height) * 0.7, 0x000000, 0);
    vignetteCircle.setBlendMode(Phaser.BlendModes.MULTIPLY);
    vignetteCircle.setDepth(999);

    // Darken vignette
    this.tweens.add({
      targets: vignetteCircle,
      alpha: 0.5,
      duration: 300
    });

    // 5. PARTICLE EMITTER - Falling snow/time particles
    const particles = this.add.particles(width / 2, 0, 'background', {
      x: { min: 0, max: width },
      y: { min: -50, max: 0 },
      speedY: { min: 30, max: 80 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.15, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: 0x00ffff,
      blendMode: Phaser.BlendModes.ADD,
      lifespan: 3000,
      frequency: 50,
      quantity: 2
    });
    particles.setDepth(1003);

    // 6. CHROMATIC ABERRATION SIMULATION (split RGB)
    const redOverlay = this.add.rectangle(0, 0, width, height, 0xff0000, 0.08);
    redOverlay.setOrigin(0);
    redOverlay.setDepth(1004);
    redOverlay.setBlendMode(Phaser.BlendModes.ADD);

    const blueOverlay = this.add.rectangle(3, 0, width, height, 0x0000ff, 0.08);
    blueOverlay.setOrigin(0);
    blueOverlay.setDepth(1004);
    blueOverlay.setBlendMode(Phaser.BlendModes.ADD);

    // 7. SCREEN SHAKE
    this.cameras.main.shake(300, 0.003, true);

    // 8. SLOW-MO MOTION TRAILS ON BALL
    // (This will be handled by the server's reduced ball speed)

    // Restore after 4 seconds (real time, not game time)
    this.time.delayedCall(4000, () => {
      // Fade out all effects
      this.tweens.add({
        targets: [overlay, border, slowmoText, vignetteCircle, redOverlay, blueOverlay],
        alpha: 0,
        duration: 500,
        onComplete: () => {
          overlay.destroy();
          border.destroy();
          slowmoText.destroy();
          vignetteCircle.destroy();
          redOverlay.destroy();
          blueOverlay.destroy();
        }
      });

      // Stop particles
      particles.stop();
      this.time.delayedCall(3000, () => particles.destroy());

      console.log('⏰ TIME FREEZE ended');
    });
  }

  /**
   * 🚀 PADDLE DASH: Teleport paddle to ball's Y position
   */
  private activatePaddleDash() {
    console.log('🚀 PADDLE DASH ACTIVATED!');

    const playerPaddle = this.yourSide === 'left' ? this.leftPaddle : this.rightPaddle;
    if (!playerPaddle || !this.ball) return;

    // Get ball Y position
    const targetY = this.ball.y;

    // Particle burst at start position
    this.createDashParticles(playerPaddle.y);

    // Teleport with tween
    this.tweens.add({
      targets: playerPaddle,
      y: targetY,
      duration: 100,
      ease: 'Power2',
      onComplete: () => {
        // Particle burst at end position
        this.createDashParticles(targetY);
      }
    });

    // Screen flash
    const flash = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xffffff, 0.5);
    flash.setOrigin(0);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy()
    });
  }

  /**
   * Create dash particles
   */
  private createDashParticles(y: number) {
    const x = this.yourSide === 'left' ? 50 + GAME_CONFIG.PADDLE_WIDTH / 2 : this.cameras.main.width - 50 - GAME_CONFIG.PADDLE_WIDTH / 2;

    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20;
      const vx = Math.cos(angle) * 200;
      const vy = Math.sin(angle) * 200;

      const particle = this.add.arc(x, y, 5, 0, 360, false, 0xfeb501, 1);

      this.tweens.add({
        targets: particle,
        x: particle.x + vx,
        y: particle.y + vy,
        alpha: 0,
        scale: 0,
        duration: 400,
        ease: 'Power2',
        onComplete: () => particle.destroy()
      });
    }
  }

  /**
   * 💪 POWER HIT: Next hit gets MEGA visual effect
   */
  private activatePowerHit() {
    console.log('🚀 POWER HIT ACTIVATED!');

    this.powerHitActive = true;

    // Visual indicator on paddle
    const playerPaddle = this.yourSide === 'left' ? this.leftPaddle : this.rightPaddle;
    if (!playerPaddle) return;

    // Destroy existing effects if any
    if (this.powerHitGlow) {
      this.tweens.killTweensOf(this.powerHitGlow);
      this.powerHitGlow.destroy();
    }
    if (this.powerHitGlow2) {
      this.tweens.killTweensOf(this.powerHitGlow2);
      this.powerHitGlow2.destroy();
    }
    if (this.powerHitParticles) {
      this.powerHitParticles.stop();
    }
    if (this.powerHitBorder) {
      this.tweens.killTweensOf(this.powerHitBorder);
      this.powerHitBorder.destroy();
    }

    // MASSIVE GLOWING AURA #1 - RED
    this.powerHitGlow = this.add.rectangle(
      playerPaddle.x,
      playerPaddle.y,
      GAME_CONFIG.PADDLE_WIDTH + 60,
      GAME_CONFIG.PADDLE_HEIGHT + 60,
      0xff0000, // Bright red
      0.8
    );
    this.powerHitGlow.setDepth(100); // Above everything
    this.powerHitGlow.setBlendMode(Phaser.BlendModes.ADD); // Additive blending for glow effect

    // SECONDARY GLOW #2 - YELLOW/ORANGE
    this.powerHitGlow2 = this.add.rectangle(
      playerPaddle.x,
      playerPaddle.y,
      GAME_CONFIG.PADDLE_WIDTH + 100,
      GAME_CONFIG.PADDLE_HEIGHT + 100,
      0xffaa00, // Orange
      0.5
    );
    this.powerHitGlow2.setDepth(99);
    this.powerHitGlow2.setBlendMode(Phaser.BlendModes.ADD);

    // INTENSE PULSING ANIMATION - Inner glow
    this.tweens.add({
      targets: this.powerHitGlow,
      alpha: { from: 0.8, to: 1 },
      scale: { from: 1, to: 1.4 },
      duration: 250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // SLOWER PULSE - Outer glow
    this.tweens.add({
      targets: this.powerHitGlow2,
      alpha: { from: 0.3, to: 0.7 },
      scale: { from: 1, to: 1.6 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // PULSING SCREEN BORDER - RED FLASHING
    const { width, height } = this.cameras.main;
    this.powerHitBorder = this.add.graphics();
    this.powerHitBorder.lineStyle(12, 0xff0000, 1);
    this.powerHitBorder.strokeRect(0, 0, width, height);
    this.powerHitBorder.setDepth(1000);

    // Pulse the border
    this.tweens.add({
      targets: this.powerHitBorder,
      alpha: { from: 0.4, to: 1 },
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // SCREEN SHAKE
    this.cameras.main.shake(200, 0.002, true);

    // PARTICLE EMITTER - Fire particles around paddle
    const particles = this.add.particles(playerPaddle.x, playerPaddle.y, 'background', {
      speed: { min: 50, max: 150 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff0000, 0xff4400, 0xffaa00],
      blendMode: Phaser.BlendModes.ADD,
      lifespan: 500,
      frequency: 30,
      quantity: 3,
      emitZone: {
        type: 'edge',
        source: new Phaser.Geom.Rectangle(-10, -60, 20, 120),
        quantity: 24
      }
    });
    particles.setDepth(101);
    this.powerHitParticles = particles;

    console.log('💥 POWER HIT VISUAL EFFECTS ACTIVATED - SUPER INTENSE MODE!');
  }

  /**
   * 🎬 Play visual effects for ultimate abilities (called when server confirms)
   */
  private playUltimateVisualEffects(abilityType: UltimateType, side: 'left' | 'right') {
    switch (abilityType) {
      case UltimateType.TIME_FREEZE:
        this.activateTimeFreeze();
        break;
      case UltimateType.POWER_HIT:
        // Only show visual effects for the player who used it
        if ((side === 'left' && this.yourSide === 'left') || (side === 'right' && this.yourSide === 'right')) {
          this.activatePowerHit();
        }
        break;
    }
  }
}


// Import PongAPI
import { PongAPI } from '../PongAPI';
