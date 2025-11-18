/**
 * BannerDisplay - Displays player name at the top of their half
 */
import Phaser from 'phaser';
import { GAME_CONFIG } from '../networking/types';

export class BannerDisplay extends Phaser.GameObjects.Container {
  private bannerBackground: Phaser.GameObjects.Rectangle | null = null;

  constructor(
    scene: Phaser.Scene,
    side: 'left' | 'right',
    displayName: string
  ) {
    // Position banner near top middle of player's half
    const xPos = side === 'left'
      ? GAME_CONFIG.CANVAS_WIDTH / 4  // Center of left half
      : (GAME_CONFIG.CANVAS_WIDTH * 3) / 4; // Center of right half
    const yPos = 80; // Near the top

    super(scene, xPos, yPos);
    scene.add.existing(this);

    // Banner dimensions
    const bannerWidth = 300;
    const bannerHeight = 60;

    // Simple semi-transparent background
    this.bannerBackground = scene.add.rectangle(
      0, 0,
      bannerWidth, bannerHeight,
      0x000000, 0.3
    );
    this.add(this.bannerBackground);

    // Show player name (centered)
    const nameText = scene.add.text(0, 0, displayName, {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    });
    nameText.setOrigin(0.5);
    this.add(nameText);

    // Set overall alpha
    this.setAlpha(0.85);
  }

  /**
   * Show banner with fade-in animation
   */
  show() {
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.85,
      duration: 500,
      ease: 'Power2'
    });
  }

  /**
   * Hide banner with fade-out animation
   */
  hide() {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 300,
      ease: 'Power2'
    });
  }
}
