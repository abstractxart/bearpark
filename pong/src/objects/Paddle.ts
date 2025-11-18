/**
 * Paddle - GODMODE Pong paddle with instant responsive controls
 */
import Phaser from 'phaser';
import { GAME_CONFIG } from '../networking/types';

export class Paddle extends Phaser.GameObjects.Container {
  private paddleRect: Phaser.GameObjects.Rectangle;
  private glowOuter: Phaser.GameObjects.Rectangle;
  private glowMid: Phaser.GameObjects.Rectangle;
  private borderYellow: Phaser.GameObjects.Rectangle;
  private borderGreen: Phaser.GameObjects.Rectangle;
  private borderPurple: Phaser.GameObjects.Rectangle;

  // GODMODE: Dual-layer movement system
  private ghostY: number = 0; // Instant target position (ZERO LAG)
  private visualY: number = 0; // Smooth rendered position
  private lastVisualY: number = 0; // For calculating velocity

  // GODMODE: Keyboard velocity system
  private keyboardVelocity: number = 0;
  private keyboardAcceleration: number = 0;
  private lastPointerY: number = 0;

  // Visual effects tracking
  private lastTrailTime: number = 0;
  private color: number;

  // Control flags
  private isLocalPlayer: boolean = false;
  private isUsingPointer: boolean = false; // Track if using mouse/touch input
  private pointerDeadzone: number = 0.5; // Minimum movement to register (REDUCED - was causing missed collisions!)

  // 🔥 JUICE: Paddle charging system
  private hitCombo: number = 0; // Consecutive hits without scoring
  private isCharged: boolean = false; // Is paddle currently charged?
  private chargeTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    color: number = 0xffffff
  ) {
    super(scene, x, y);
    this.color = color;

    // Initialize positions
    this.ghostY = y;
    this.visualY = y;
    this.lastVisualY = y;

    // Outer white glow (largest, most transparent)
    this.glowOuter = scene.add.rectangle(
      0,
      0,
      GAME_CONFIG.PADDLE_WIDTH + 20,
      GAME_CONFIG.PADDLE_HEIGHT + 20,
      0xffffff,
      0.15
    );
    this.add(this.glowOuter);

    // Mid white glow
    this.glowMid = scene.add.rectangle(
      0,
      0,
      GAME_CONFIG.PADDLE_WIDTH + 12,
      GAME_CONFIG.PADDLE_HEIGHT + 12,
      0xffffff,
      0.3
    );
    this.add(this.glowMid);

    // Yellow border (outermost)
    this.borderYellow = scene.add.rectangle(
      0,
      0,
      GAME_CONFIG.PADDLE_WIDTH + 8,
      GAME_CONFIG.PADDLE_HEIGHT + 8,
      0xfeb501,
      0.9
    );
    this.add(this.borderYellow);

    // Green border (middle)
    this.borderGreen = scene.add.rectangle(
      0,
      0,
      GAME_CONFIG.PADDLE_WIDTH + 5,
      GAME_CONFIG.PADDLE_HEIGHT + 5,
      0x07ae08,
      0.9
    );
    this.add(this.borderGreen);

    // Purple border (inner)
    this.borderPurple = scene.add.rectangle(
      0,
      0,
      GAME_CONFIG.PADDLE_WIDTH + 2,
      GAME_CONFIG.PADDLE_HEIGHT + 2,
      0x680cd9,
      0.9
    );
    this.add(this.borderPurple);

    // Create paddle rectangle as child at (0, 0) relative to container
    this.paddleRect = scene.add.rectangle(
      0,
      0,
      GAME_CONFIG.PADDLE_WIDTH,
      GAME_CONFIG.PADDLE_HEIGHT,
      color
    );
    this.add(this.paddleRect);

    scene.add.existing(this);

    // Set depth to ensure paddles are visible above background
    this.setDepth(10);
  }

  /**
   * GODMODE: Update paddle with keyboard input (INSTANT RESPONSE)
   */
  updateKeyboardInput(upPressed: boolean, downPressed: boolean) {
    // Switch to keyboard mode
    if (upPressed || downPressed) {
      this.isUsingPointer = false;
    }

    // TIER 3: Keyboard perfection with instant start (REDUCED intensity for smoother control)
    if (upPressed) {
      if (this.keyboardVelocity >= 0) {
        // Just pressed or continuing up - responsive but not jarring
        this.keyboardVelocity = -8; // Reduced from -12
      }
      this.keyboardAcceleration = -0.25; // Reduced from -0.4
    } else if (downPressed) {
      if (this.keyboardVelocity <= 0) {
        // Just pressed or continuing down - responsive but not jarring
        this.keyboardVelocity = 8; // Reduced from 12
      }
      this.keyboardAcceleration = 0.25; // Reduced from 0.4
    } else {
      // No keys pressed: INSTANT STOP
      this.keyboardVelocity = 0;
      this.keyboardAcceleration = 0;
    }

    // Apply velocity to ghost position (INSTANT)
    this.ghostY += this.keyboardVelocity;

    // Apply acceleration for continuous hold (gets FASTER)
    this.keyboardVelocity += this.keyboardAcceleration;
    this.keyboardVelocity = Phaser.Math.Clamp(
      this.keyboardVelocity,
      -GAME_CONFIG.PADDLE_MAX_VELOCITY,
      GAME_CONFIG.PADDLE_MAX_VELOCITY
    );

    // Clamp ghost position to bounds
    this.ghostY = Phaser.Math.Clamp(
      this.ghostY,
      GAME_CONFIG.PADDLE_HEIGHT / 2,
      GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PADDLE_HEIGHT / 2
    );
  }

  /**
   * GODMODE: Update paddle with pointer/touch (INSTANT NEURAL LINK)
   */
  updatePointerInput(pointerY: number, isDown: boolean) {
    if (!isDown) {
      // Pointer released - exit pointer mode
      this.isUsingPointer = false;
      return;
    }

    // Deadzone filter: ignore micro-movements that cause jitter
    const movementDelta = Math.abs(pointerY - this.lastPointerY);
    if (movementDelta < this.pointerDeadzone && this.lastPointerY !== 0) {
      return; // Too small, ignore
    }

    // Switch to pointer mode
    this.isUsingPointer = true;
    this.lastPointerY = pointerY;

    // Reset keyboard velocity when switching to pointer
    this.keyboardVelocity = 0;
    this.keyboardAcceleration = 0;

    // TIER 2: Direct neural link - pointer controls target, lerp provides smoothness
    this.ghostY = pointerY;

    // Clamp to bounds
    this.ghostY = Phaser.Math.Clamp(
      this.ghostY,
      GAME_CONFIG.PADDLE_HEIGHT / 2,
      GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PADDLE_HEIGHT / 2
    );
    // Let the update() loop handle visual smoothing via lerp
  }

  /**
   * GODMODE: Main update loop - called every frame
   */
  update() {
    // TIER 1: Smooth visual catches up to ghost using aggressive lerp
    // POINTER MODE: INSTANT SNAP (no lerp) to match server position exactly!
    if (this.isUsingPointer) {
      // NO LERP for pointer - visual must match ghostY EXACTLY
      this.visualY = this.ghostY;
    } else {
      // Keyboard: smooth lerp for nice feel
      const SNAP_FACTOR = GAME_CONFIG.PADDLE_SNAP_FACTOR;
      this.visualY += (this.ghostY - this.visualY) * SNAP_FACTOR;
    }

    // Update container position
    this.setY(this.visualY);

    // TIER 4: Visual feedback effects (DISABLED for pointer to prevent ghosting)
    if (!this.isUsingPointer) {
      // Only show visual effects during keyboard control
      this.updateSquashStretch();
      this.updateGlowFromSpeed();
      this.updateMotionBlur();
    } else {
      // Pointer mode: Keep paddle at neutral scale (no squash/stretch)
      this.paddleRect.setScale(1, 1);
      this.borderPurple.setScale(1, 1);
      this.borderGreen.setScale(1, 1);
      this.borderYellow.setScale(1, 1);

      // Minimal glow during pointer mode
      this.glowOuter.setAlpha(0.15);
      this.glowMid.setAlpha(0.3);
    }

    // TIER 7: Edge case - wall bounce effect (ONLY for local player)
    if (this.isLocalPlayer) {
      this.handleWallBounce();
    }

    // Store for next frame
    this.lastVisualY = this.visualY;
  }

  /**
   * Update from server position (for multiplayer sync)
   */
  updatePosition(y: number) {
    // Server-authoritative position
    // Smoothly interpolate to server position
    this.ghostY = y;
  }

  /**
   * TIER 4: Squash & stretch for weight feel
   */
  private updateSquashStretch() {
    const velocity = this.visualY - this.lastVisualY;
    const squash = Phaser.Math.Clamp(Math.abs(velocity) / 10, 0, 0.15);

    if (Math.abs(velocity) > 1) {
      // Moving: Stretch in direction of movement
      this.paddleRect.setScale(1 - squash * 0.5, 1 + squash);
      this.borderPurple.setScale(1 - squash * 0.5, 1 + squash);
      this.borderGreen.setScale(1 - squash * 0.5, 1 + squash);
      this.borderYellow.setScale(1 - squash * 0.5, 1 + squash);
    } else {
      // Return to normal
      this.paddleRect.setScale(1, 1);
      this.borderPurple.setScale(1, 1);
      this.borderGreen.setScale(1, 1);
      this.borderYellow.setScale(1, 1);
    }
  }

  /**
   * TIER 4: Glow intensity follows speed
   */
  private updateGlowFromSpeed() {
    const speed = Math.abs(this.keyboardVelocity);
    const glowIntensity = Phaser.Math.Clamp(speed / 35, 0.15, 0.6);

    this.glowOuter.setAlpha(glowIntensity);
    this.glowMid.setAlpha(glowIntensity * 1.5);
  }

  /**
   * TIER 4: Motion blur trail
   */
  private updateMotionBlur() {
    const currentTime = this.scene.time.now;
    const speed = Math.abs(this.visualY - this.lastVisualY);

    // Only create trail if moving fast enough and not too frequent
    if (speed > 3 && currentTime - this.lastTrailTime > 30) {
      const blurIntensity = Phaser.Math.Clamp(speed / 20, 0, 0.4);

      const trail = this.scene.add.rectangle(
        this.x,
        this.lastVisualY,
        GAME_CONFIG.PADDLE_WIDTH,
        GAME_CONFIG.PADDLE_HEIGHT,
        this.color,
        blurIntensity
      );

      // Fade out quickly
      this.scene.tweens.add({
        targets: trail,
        alpha: 0,
        duration: 100,
        ease: 'Power2',
        onComplete: () => trail.destroy()
      });

      this.lastTrailTime = currentTime;
    }
  }

  /**
   * TIER 7: Wall bounce effect
   */
  private handleWallBounce() {
    const minY = GAME_CONFIG.PADDLE_HEIGHT / 2;
    const maxY = GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PADDLE_HEIGHT / 2;

    if (this.ghostY <= minY || this.ghostY >= maxY) {
      // Clamp position
      this.ghostY = Phaser.Math.Clamp(this.ghostY, minY, maxY);

      // Small bounce back
      this.keyboardVelocity *= -0.3;

      // Micro screen shake
      this.scene.cameras.main.shake(50, 0.002);

      // Flash effect (red for wall hit)
      this.flashPaddle(0xff0000, 50);
    }
  }

  /**
   * Flash paddle color for feedback
   */
  private flashPaddle(color: number, duration: number) {
    const originalColor = this.paddleRect.fillColor;

    this.paddleRect.setFillStyle(color);

    this.scene.time.delayedCall(duration, () => {
      this.paddleRect.setFillStyle(originalColor);
    });
  }

  /**
   * Get top Y position
   */
  getTop(): number {
    return this.y - GAME_CONFIG.PADDLE_HEIGHT / 2;
  }

  /**
   * Get bottom Y position
   */
  getBottom(): number {
    return this.y + GAME_CONFIG.PADDLE_HEIGHT / 2;
  }

  /**
   * Get current ghost position (for sending to server)
   */
  getGhostY(): number {
    return this.ghostY;
  }

  /**
   * Set whether this paddle is controlled by the local player
   */
  setLocalPlayer(isLocal: boolean) {
    this.isLocalPlayer = isLocal;
  }

  /**
   * 🔥 JUICE: Trigger charge effect when paddle hits ball
   */
  onHit() {
    this.hitCombo++;
    this.isCharged = true;

    // Stop any existing charge tween
    if (this.chargeTween) {
      this.chargeTween.stop();
    }

    // VISUAL INTENSITY scales with combo (1 hit = gentle glow, 5+ hits = INSANE PULSING)
    const comboIntensity = Math.min(this.hitCombo / 5, 1); // Max at 5 hits

    // BASE GLOW: Instant bright glow
    const baseGlowAlpha = 0.5 + comboIntensity * 0.4; // 0.5 to 0.9
    this.glowOuter.setAlpha(baseGlowAlpha);
    this.glowMid.setAlpha(baseGlowAlpha + 0.2);

    // PULSING GLOW: More pulses = higher combo
    const pulseCount = Math.min(this.hitCombo, 5); // Max 5 pulses
    const pulseDuration = 100; // Each pulse is 100ms

    // Create pulsing sequence
    for (let i = 0; i < pulseCount; i++) {
      this.scene.time.delayedCall(i * pulseDuration, () => {
        // Pulse up
        this.scene.tweens.add({
          targets: [this.glowOuter, this.glowMid],
          scale: 1.15,
          duration: pulseDuration / 2,
          ease: 'Quad.easeOut',
          yoyo: true
        });
      });
    }

    // CHARGE FADE: Glow fades out over 500ms
    this.chargeTween = this.scene.tweens.add({
      targets: [this.glowOuter, this.glowMid],
      alpha: 0.15,
      duration: 500,
      delay: pulseCount * pulseDuration, // After all pulses complete
      ease: 'Power2',
      onComplete: () => {
        this.isCharged = false;
        this.chargeTween = null;
      }
    });

    // SQUASH & STRETCH: Paddle compresses on hit
    this.scene.tweens.add({
      targets: [this.paddleRect, this.borderPurple, this.borderGreen, this.borderYellow],
      scaleY: 0.9,  // Compress vertically by 10%
      duration: 30,
      ease: 'Quad.easeOut',
      yoyo: true
    });
  }

  /**
   * 🔥 JUICE: Reset charge when opponent scores
   */
  resetCharge() {
    this.hitCombo = 0;
    this.isCharged = false;

    if (this.chargeTween) {
      this.chargeTween.stop();
      this.chargeTween = null;
    }

    // Reset glow to normal
    this.glowOuter.setAlpha(0.15);
    this.glowMid.setAlpha(0.3);
    this.glowOuter.setScale(1);
    this.glowMid.setScale(1);
  }

  /**
   * Get current combo count (for UI display)
   */
  getComboCount(): number {
    return this.hitCombo;
  }
}
