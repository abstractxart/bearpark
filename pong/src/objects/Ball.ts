/**
 * Ball - GODMODE Evolution Ball with speed-reactive visual intensity
 * "The ball is not just a game object—it's a visual drug that makes players chase the high"
 */
import Phaser from 'phaser';
import { GAME_CONFIG } from '../networking/types';

export class Ball extends Phaser.GameObjects.Container {
  private ballCore: Phaser.GameObjects.Arc;
  private glowOuter: Phaser.GameObjects.Arc;
  private glowMid: Phaser.GameObjects.Arc;
  private glowInner: Phaser.GameObjects.Arc; // Added for Stage 4 white-hot center

  // Speed tracking for GODMODE evolution
  private currentSpeed: number = GAME_CONFIG.INITIAL_BALL_SPEED;
  private lastX: number = 0;
  private lastY: number = 0;
  private lastVelocityX: number = 0; // Track velocity changes for bounce detection

  // Pulse system
  private pulseTime: number = 0;

  // Trail tracking
  private lastTrailTime: number = 0;

  // Color stops for smooth interpolation
  private readonly COLOR_STOPS = [
    { speed: 6,  color: 0xffffff }, // Pure white (Stage 1)
    { speed: 8,  color: 0xfff8dc }, // Cream white
    { speed: 10, color: 0xfeb501 }, // BEAR gold (Stage 2)
    { speed: 11, color: 0xffa500 }, // Orange transition
    { speed: 13, color: 0xff8c00 }, // Hot orange (Stage 3)
    { speed: 15, color: 0xff4500 }, // Red-orange (Stage 4)
  ];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.lastX = x;
    this.lastY = y;

    // Inner glow for Stage 4 white-hot center (initially hidden)
    this.glowInner = scene.add.arc(0, 0, GAME_CONFIG.BALL_SIZE / 2 + 3, 0, 360, false, 0xffffff, 0);
    this.add(this.glowInner);

    // Outer glow (largest, most transparent)
    this.glowOuter = scene.add.arc(0, 0, GAME_CONFIG.BALL_SIZE / 2 + 12, 0, 360, false, 0xffffff, 0.15);
    this.add(this.glowOuter);

    // Mid glow
    this.glowMid = scene.add.arc(0, 0, GAME_CONFIG.BALL_SIZE / 2 + 6, 0, 360, false, 0xffffff, 0.3);
    this.add(this.glowMid);

    // Core ball (starts white, evolves with speed)
    this.ballCore = scene.add.arc(0, 0, GAME_CONFIG.BALL_SIZE / 2, 0, 360, false, 0xffffff);
    this.add(this.ballCore);

    scene.add.existing(this);

    // Set depth to ensure ball is visible above background but below UI
    this.setDepth(15);
  }

  /**
   * Update ball position and velocity from server state
   */
  updatePosition(x: number, y: number, velocityX?: number, velocityY?: number) {
    this.setPosition(x, y);

    // Calculate speed from velocity if provided
    if (velocityX !== undefined && velocityY !== undefined) {
      this.currentSpeed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

      // BOUNCE DETECTION: Check if velocity direction changed (indicates paddle hit)
      if (this.lastVelocityX !== 0 && Math.sign(velocityX) !== Math.sign(this.lastVelocityX)) {
        // Velocity flipped horizontally = BOUNCE!
        this.playBounceEffect();
      }

      this.lastVelocityX = velocityX;
    }

    // Update visual evolution
    this.updateVisualEvolution();

    // Auto-trail based on speed
    this.autoTrail();

    // Store position for next frame
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * GODMODE: Update visual evolution based on current speed
   */
  private updateVisualEvolution() {
    const speed = this.currentSpeed;

    // Interpolate color based on speed
    const color = this.interpolateColor(speed);

    // Update all visual elements
    this.ballCore.setFillStyle(color);
    this.glowOuter.setFillStyle(color);
    this.glowMid.setFillStyle(color);

    // Dynamic glow intensity and size based on speed
    const glowIntensity = this.getGlowIntensity(speed);
    const pulseValue = this.getPulseValue(speed);

    // Apply glow with pulse
    this.glowOuter.setAlpha(glowIntensity.outer + pulseValue * 0.1);
    this.glowMid.setAlpha(glowIntensity.mid + pulseValue * 0.15);

    // Stage-specific effects
    if (speed >= 13) {
      // Stage 4: GODMODE - white-hot center
      this.glowInner.setAlpha(0.7 + pulseValue * 0.3);

      // Increase glow radius at max speed
      const maxSpeedBonus = Math.min((speed - 13) / 2, 1);
      this.glowOuter.setScale(1 + maxSpeedBonus * 0.3);
      this.glowMid.setScale(1 + maxSpeedBonus * 0.2);
    } else {
      this.glowInner.setAlpha(0);
      this.glowOuter.setScale(1);
      this.glowMid.setScale(1);
    }

    // Update pulse time
    this.pulseTime += 0.016; // ~60fps
  }

  /**
   * Interpolate color based on speed using color stops
   */
  private interpolateColor(speed: number): number {
    // Clamp speed to our range
    speed = Math.max(6, Math.min(15, speed));

    // Find the two color stops we're between
    let lowerStop = this.COLOR_STOPS[0];
    let upperStop = this.COLOR_STOPS[this.COLOR_STOPS.length - 1];

    for (let i = 0; i < this.COLOR_STOPS.length - 1; i++) {
      if (speed >= this.COLOR_STOPS[i].speed && speed <= this.COLOR_STOPS[i + 1].speed) {
        lowerStop = this.COLOR_STOPS[i];
        upperStop = this.COLOR_STOPS[i + 1];
        break;
      }
    }

    // Calculate interpolation factor
    const t = (speed - lowerStop.speed) / (upperStop.speed - lowerStop.speed);

    // Interpolate RGB channels
    const r1 = (lowerStop.color >> 16) & 0xff;
    const g1 = (lowerStop.color >> 8) & 0xff;
    const b1 = lowerStop.color & 0xff;

    const r2 = (upperStop.color >> 16) & 0xff;
    const g2 = (upperStop.color >> 8) & 0xff;
    const b2 = upperStop.color & 0xff;

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return (r << 16) | (g << 8) | b;
  }

  /**
   * Get glow intensity based on speed stage
   */
  private getGlowIntensity(speed: number): { outer: number; mid: number } {
    if (speed < 8) {
      // Stage 1: Zen Mode - soft, peaceful
      return { outer: 0.15, mid: 0.3 };
    } else if (speed < 11) {
      // Stage 2: Heating Up - moderate
      return { outer: 0.25, mid: 0.45 };
    } else if (speed < 13) {
      // Stage 3: DANGER ZONE - intense
      return { outer: 0.5, mid: 0.65 };
    } else {
      // Stage 4: GODMODE - MAXIMUM OVERDRIVE
      return { outer: 0.7, mid: 0.85 };
    }
  }

  /**
   * Get pulse value based on speed (oscillates between 0 and 1)
   */
  private getPulseValue(speed: number): number {
    // Pulse frequency increases with speed
    const frequency = this.map(speed, 8, 35, 0.5, 3.0);  // 🚀 Updated speed range
    const amplitude = this.map(speed, 8, 35, 0.1, 0.4);  // 🚀 Updated speed range

    return Math.sin(this.pulseTime * frequency * Math.PI * 2) * amplitude;
  }

  /**
   * Auto-trail system that scales with speed
   */
  private autoTrail() {
    const currentTime = this.scene.time.now;
    const speed = this.currentSpeed;

    // Trail frequency increases with speed (REDUCED to prevent visual chaos)
    let trailFrequency = 100; // ms
    if (speed >= 13) {
      trailFrequency = 50; // Stage 4: Moderate trails (was 20ms - too intense!)
    } else if (speed >= 11) {
      trailFrequency = 60; // Stage 3: Moderate trails
    } else if (speed >= 8) {
      trailFrequency = 80; // Stage 2: Light trails
    }

    if (currentTime - this.lastTrailTime > trailFrequency) {
      this.addTrailEffect();
      this.lastTrailTime = currentTime;
    }
  }

  /**
   * Enhanced trail effect that scales with speed
   * CHROMATIC SEPARATION REMOVED - Was causing visual illusion of ball tunneling through paddle
   */
  addTrailEffect() {
    const speed = this.currentSpeed;
    const color = this.interpolateColor(speed);

    // Trail properties scale with speed
    const trailSize = this.map(speed, 8, 35, GAME_CONFIG.BALL_SIZE / 2 + 4, GAME_CONFIG.BALL_SIZE / 2 + 10);  // 🚀 Updated speed range
    const trailAlpha = this.map(speed, 8, 35, 0.15, 0.4);  // 🚀 Updated speed range
    const trailDuration = this.map(speed, 8, 35, 200, 120);  // 🚀 Updated speed range

    const trail = this.scene.add.arc(
      this.x,
      this.y,
      trailSize,
      0,
      360,
      false,
      color,
      trailAlpha
    );

    // CHROMATIC SEPARATION DISABLED
    // The red/yellow ghost balls created visual chaos and made it look like
    // the ball was tunneling through paddles when it was actually bouncing correctly

    this.scene.tweens.add({
      targets: trail,
      alpha: 0,
      duration: trailDuration,
      ease: 'Power2',
      onComplete: () => {
        trail.destroy();
      }
    });
  }

  /**
   * Play bounce effect when ball hits paddle
   * 💥 GODMODE JUICE: Maximum dopamine injection on every hit
   */
  private playBounceEffect() {
    const color = this.interpolateColor(this.currentSpeed);
    const speedRatio = this.currentSpeed / GAME_CONFIG.MAX_BALL_SPEED; // 0.0 to 1.0

    // SQUASH AND STRETCH: Ball compresses on impact then stretches (MORE EXTREME)
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.6,  // More squash (was 0.7)
      scaleY: 1.4,  // More stretch (was 1.3)
      duration: 50,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        // Stretch in direction of movement
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.3,  // More stretch (was 1.2)
          scaleY: 0.7,  // More squash (was 0.8)
          duration: 60,
          ease: 'Quad.easeOut',
          yoyo: true
        });
      }
    });

    // 💥 JUICE: FREEZE FRAME (2-3 frames of pause for impact)
    this.scene.time.addEvent({
      delay: 16, // 1 frame at 60fps
      callback: () => {
        this.scene.time.addEvent({
          delay: 16, // Another frame
          callback: () => {
            // Resume after freeze
          }
        });
      }
    });

    // ⚡ JUICE: INTENSE FLASH (speed-scaled intensity)
    const flashAlpha = this.map(speedRatio, 0, 1, 0.3, 0.8); // White/gold = subtle, Red = INTENSE
    this.scene.tweens.add({
      targets: this.ballCore,
      alpha: flashAlpha,
      duration: 30, // Faster flash (was 40)
      ease: 'Quad.easeOut',
      yoyo: true
    });

    // 🌟 JUICE: WHITE FLASH OVERLAY (makes hit feel POWERFUL)
    const flashOverlay = this.scene.add.arc(
      this.x,
      this.y,
      GAME_CONFIG.BALL_SIZE / 2 + 5,
      0,
      360,
      false,
      0xffffff,
      0.9
    );
    this.scene.tweens.add({
      targets: flashOverlay,
      alpha: 0,
      duration: 100,
      ease: 'Power2',
      onComplete: () => flashOverlay.destroy()
    });

    // 🔥 JUICE: IMPACT RING (speed-scaled size and duration)
    const impactRing = this.scene.add.arc(
      this.x,
      this.y,
      GAME_CONFIG.BALL_SIZE / 2,
      0,
      360,
      false,
      color,
      0.8  // More visible (was 0.6)
    );

    const ringScale = this.map(speedRatio, 0, 1, 2.0, 4.0); // White = small, Red = HUGE
    const ringDuration = this.map(speedRatio, 0, 1, 250, 150); // White = slow, Red = fast

    this.scene.tweens.add({
      targets: impactRing,
      scale: ringScale,
      alpha: 0,
      duration: ringDuration,
      ease: 'Quad.easeOut',
      onComplete: () => impactRing.destroy()
    });

    // 💥 JUICE: PARTICLE EXPLOSION (BEAR Park colors: yellow, purple, green)
    this.createParticleExplosion(color, speedRatio);

    // 📳 JUICE: SCREEN SHAKE (speed-scaled intensity)
    // White ball: 2px shake, Red ball: 10px shake
    const shakeIntensity = this.map(speedRatio, 0, 1, 0.002, 0.012);
    const shakeDuration = this.map(speedRatio, 0, 1, 80, 120); // Red ball = longer shake
    this.scene.cameras.main.shake(shakeDuration, shakeIntensity);
  }

  /**
   * 💥 JUICE: Create particle explosion on paddle hit
   */
  private createParticleExplosion(ballColor: number, speedRatio: number) {
    // BEAR Park color palette
    const colors = [
      0xfeb501, // BEAR yellow
      0x680cd9, // Purple
      0x07ae08, // Green
      ballColor  // Ball's current color
    ];

    // More particles at higher speeds (10-20 particles)
    const particleCount = Math.round(this.map(speedRatio, 0, 1, 10, 20));

    for (let i = 0; i < particleCount; i++) {
      const color = Phaser.Utils.Array.GetRandom(colors);

      // Random angle for spray pattern
      const angle = (Math.PI * 2 * i) / particleCount + Phaser.Math.FloatBetween(-0.3, 0.3);

      // Speed-scaled velocity (white = slow, red = FAST)
      const velocity = this.map(speedRatio, 0, 1, 50, 200);
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity;

      // Particle size (larger at high speeds)
      const size = this.map(speedRatio, 0, 1, 3, 8);

      const particle = this.scene.add.arc(
        this.x,
        this.y,
        size,
        0,
        360,
        false,
        color,
        1
      );

      // Animate particle flying out and fading
      this.scene.tweens.add({
        targets: particle,
        x: particle.x + vx,
        y: particle.y + vy,
        alpha: 0,
        scale: 0,
        duration: this.map(speedRatio, 0, 1, 400, 300), // Faster at high speeds
        ease: 'Power2',
        onComplete: () => particle.destroy()
      });
    }
  }

  /**
   * Utility: Map value from one range to another
   */
  private map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
  }

  /**
   * Get current speed (for debugging/testing)
   */
  getCurrentSpeed(): number {
    return this.currentSpeed;
  }
}
