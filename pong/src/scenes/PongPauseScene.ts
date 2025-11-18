/**
 * PongPauseScene - Pause menu with volume controls
 * Styled with BEARpark colors: Purple, Green, Yellow
 */
import Phaser from 'phaser';
import { PongAudioManager } from '../audio/PongAudioManager';

// BEAR Park colors
const COLORS = {
  PURPLE: 0x680cd9,
  GREEN: 0x07ae08,
  YELLOW: 0xfeb501,
  CHARCOAL: 0x141619,
  WHITE: 0xffffff
};

export class PongPauseScene extends Phaser.Scene {
  private audioManager: PongAudioManager | null = null;
  private gameScene: Phaser.Scene | null = null;

  // UI elements
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private container: Phaser.GameObjects.Container | null = null;

  // Slider handles
  private masterHandle: Phaser.GameObjects.Circle | null = null;
  private musicHandle: Phaser.GameObjects.Circle | null = null;
  private sfxHandle: Phaser.GameObjects.Circle | null = null;

  // Slider tracks
  private masterTrack: Phaser.GameObjects.Rectangle | null = null;
  private musicTrack: Phaser.GameObjects.Rectangle | null = null;
  private sfxTrack: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super({ key: 'PongPauseScene' });
  }

  init(data: any) {
    this.audioManager = data.audioManager;
    this.gameScene = data.gameScene;
  }

  create() {
    const { width, height } = this.cameras.main;

    // Darkened overlay
    this.overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85);
    this.overlay.setOrigin(0);
    this.overlay.setInteractive();

    // Container for pause menu
    this.container = this.add.container(width / 2, height / 2);

    // Panel background
    const panelWidth = 500;
    const panelHeight = 300;
    const panel = this.add.rectangle(0, 0, panelWidth, panelHeight, COLORS.CHARCOAL);
    panel.setStrokeStyle(6, COLORS.YELLOW);
    this.container.add(panel);

    // Title with Luckiest Guy font
    const title = this.add.text(0, -50, 'PAUSED', {
      fontFamily: 'Luckiest Guy, Arial Black, Impact',
      fontSize: '56px',
      color: '#feb501'
    });
    title.setOrigin(0.5);
    this.container.add(title);

    // Resume button (centered)
    this.createButton('RESUME', 30, COLORS.GREEN, () => {
      this.resumeGame();
    });

    // Quit button (centered)
    this.createButton('QUIT', 110, COLORS.PURPLE, () => {
      this.quitGame();
    });

    // ESC key to resume
    this.input.keyboard?.on('keydown-ESC', () => {
      this.resumeGame();
    });
  }

  /**
   * Create a volume slider
   */
  private createVolumeSlider(label: string, yOffset: number, value: number, type: 'master' | 'music' | 'sfx') {
    if (!this.container) return;

    const labelText = this.add.text(-70, yOffset, label, {
      fontFamily: 'Luckiest Guy, Arial Black, Impact',
      fontSize: '24px',
      color: '#feb501'
    });
    labelText.setOrigin(1, 0.5); // Right-align to prevent overlap
    this.container.add(labelText);

    // Slider track
    const trackWidth = 200;
    const trackHeight = 8;
    const track = this.add.rectangle(50, yOffset, trackWidth, trackHeight, COLORS.WHITE, 0.3);
    this.container.add(track);

    // Slider fill (colored portion)
    const fillWidth = trackWidth * value;
    const fill = this.add.rectangle(50 - trackWidth / 2 + fillWidth / 2, yOffset, fillWidth, trackHeight);
    fill.setOrigin(0.5);

    // Set fill color based on type
    if (type === 'master') fill.setFillStyle(COLORS.YELLOW);
    else if (type === 'music') fill.setFillStyle(COLORS.PURPLE);
    else fill.setFillStyle(COLORS.GREEN);

    this.container.add(fill);

    // Slider handle
    const handleX = 50 - trackWidth / 2 + trackWidth * value;
    const handle = this.add.circle(handleX, yOffset, 12, COLORS.WHITE);
    handle.setStrokeStyle(3, COLORS.YELLOW);
    handle.setInteractive({ draggable: true, useHandCursor: true });
    this.container.add(handle);

    // Store references
    if (type === 'master') {
      this.masterHandle = handle;
      this.masterTrack = track;
    } else if (type === 'music') {
      this.musicHandle = handle;
      this.musicTrack = track;
    } else {
      this.sfxHandle = handle;
      this.sfxTrack = track;
    }

    // Percentage label
    const percentText = this.add.text(160, yOffset, `${Math.round(value * 100)}%`, {
      fontFamily: 'Luckiest Guy, Arial Black, Impact',
      fontSize: '20px',
      color: '#ffffff'
    });
    percentText.setOrigin(0, 0.5);
    this.container.add(percentText);

    // Drag handler
    handle.on('drag', (pointer: Phaser.Input.Pointer, dragX: number) => {
      const trackLeft = track.x - trackWidth / 2;
      const trackRight = track.x + trackWidth / 2;

      // Clamp handle position
      const clampedX = Phaser.Math.Clamp(
        pointer.x - (this.container?.x || 0),
        trackLeft,
        trackRight
      );

      handle.x = clampedX;

      // Calculate volume (0-1)
      const newVolume = (clampedX - trackLeft) / trackWidth;

      // Update fill
      const newFillWidth = trackWidth * newVolume;
      fill.width = newFillWidth;
      fill.x = track.x - trackWidth / 2 + newFillWidth / 2;

      // Update percentage label
      percentText.setText(`${Math.round(newVolume * 100)}%`);

      // Update audio manager
      if (type === 'master') {
        this.audioManager?.setMasterVolume(newVolume);
      } else if (type === 'music') {
        this.audioManager?.setMusicVolume(newVolume);
      } else {
        this.audioManager?.setSFXVolume(newVolume);
      }
    });
  }

  /**
   * Create a button
   */
  private createButton(text: string, yOffset: number, color: number, callback: () => void) {
    if (!this.container) return;

    const buttonWidth = 300;
    const buttonHeight = 50;

    // Button background
    const button = this.add.rectangle(0, yOffset, buttonWidth, buttonHeight, color);
    button.setStrokeStyle(4, COLORS.YELLOW);
    button.setInteractive({ useHandCursor: true });
    this.container.add(button);

    // Button text
    const buttonText = this.add.text(0, yOffset, text, {
      fontFamily: 'Luckiest Guy, Arial Black, Impact',
      fontSize: '28px',
      color: '#feb501'
    });
    buttonText.setOrigin(0.5);
    this.container.add(buttonText);

    // Hover effect
    button.on('pointerover', () => {
      button.setScale(1.05);
      buttonText.setScale(1.05);
    });

    button.on('pointerout', () => {
      button.setScale(1);
      buttonText.setScale(1);
    });

    button.on('pointerdown', callback);
  }

  /**
   * Resume game
   */
  private resumeGame() {
    // Resume game scene physics/time
    this.scene.resume('PongGameScene');
    this.scene.resume('PongUIScene');

    // Stop pause scene
    this.scene.stop();
  }

  /**
   * Quit game
   */
  private quitGame() {
    // Confirm quit with styled dialog
    const confirmOverlay = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.5);
    confirmOverlay.setOrigin(0);

    const confirmPanel = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      400,
      250,
      COLORS.CHARCOAL
    );
    confirmPanel.setStrokeStyle(6, COLORS.YELLOW);

    const confirmText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 - 40,
      'QUIT GAME?\n\nYou will return to\nBEAR Park',
      {
        fontFamily: 'Luckiest Guy, Arial Black, Impact',
        fontSize: '24px',
        color: '#feb501',
        align: 'center'
      }
    );
    confirmText.setOrigin(0.5);

    // Yes button
    const yesButton = this.add.rectangle(
      this.cameras.main.width / 2 - 80,
      this.cameras.main.height / 2 + 70,
      120,
      45,
      COLORS.GREEN
    );
    yesButton.setStrokeStyle(3, COLORS.YELLOW);
    yesButton.setInteractive({ useHandCursor: true });

    const yesText = this.add.text(
      this.cameras.main.width / 2 - 80,
      this.cameras.main.height / 2 + 70,
      'YES',
      {
        fontFamily: 'Luckiest Guy, Arial Black, Impact',
        fontSize: '24px',
        color: '#feb501'
      }
    );
    yesText.setOrigin(0.5);

    yesButton.on('pointerdown', () => {
      // Stop all scenes
      this.audioManager?.stopBackgroundMusic();
      this.scene.stop('PongGameScene');
      this.scene.stop('PongUIScene');
      this.scene.stop();

      // Redirect to BEAR Park
      window.location.href = '/';
    });

    // No button
    const noButton = this.add.rectangle(
      this.cameras.main.width / 2 + 80,
      this.cameras.main.height / 2 + 70,
      120,
      45,
      COLORS.PURPLE
    );
    noButton.setStrokeStyle(3, COLORS.YELLOW);
    noButton.setInteractive({ useHandCursor: true });

    const noText = this.add.text(
      this.cameras.main.width / 2 + 80,
      this.cameras.main.height / 2 + 70,
      'NO',
      {
        fontFamily: 'Luckiest Guy, Arial Black, Impact',
        fontSize: '24px',
        color: '#feb501'
      }
    );
    noText.setOrigin(0.5);

    noButton.on('pointerdown', () => {
      confirmOverlay.destroy();
      confirmPanel.destroy();
      confirmText.destroy();
      yesButton.destroy();
      yesText.destroy();
      noButton.destroy();
      noText.destroy();
    });
  }
}
