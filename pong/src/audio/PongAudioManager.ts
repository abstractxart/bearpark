/**
 * PongAudioManager - Audio system for BEAR PONG
 * 🔥 JUICE: All the satisfying sounds for maximum dopamine
 *
 * NOTE: This class provides hooks for audio. You need to provide sound files!
 * Recommended sound files:
 * - hit.mp3 / hit.wav - Paddle hit sound (vary pitch based on hit location)
 * - whoosh.mp3 / whoosh.wav - Ball whoosh sound (vary pitch/volume based on speed)
 * - combo2.mp3, combo3.mp3, etc. - Combo sounds (ascending musical notes)
 * - score.mp3 / score.wav - Score sound
 * - perfect.mp3 / perfect.wav - Perfect hit sound
 */

export class PongAudioManager {
  private scene: Phaser.Scene;

  // Sound objects
  private hitSound: Phaser.Sound.BaseSound | null = null;
  private whooshSound: Phaser.Sound.BaseSound | null = null;
  private comboSounds: Map<number, Phaser.Sound.BaseSound> = new Map();
  private scoreSound: Phaser.Sound.BaseSound | null = null;
  private perfectSound: Phaser.Sound.BaseSound | null = null;
  private bgMusic: Phaser.Sound.BaseSound | null = null;

  // Volume controls
  private masterVolume: number = 0.3;  // 🔉 Reduced from 0.7 to 0.3 (less annoying!)
  private musicVolume: number = 0.2;  // 🔉 Reduced from 0.5 to 0.2 (background music quieter)
  private sfxVolume: number = 0.3;  // 🔉 Reduced from 0.7 to 0.3 (sound effects quieter)
  private isMuted: boolean = false;
  private volumeBeforeMute: { master: number; music: number; sfx: number } = { master: 0.3, music: 0.2, sfx: 0.3 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Load mute state from localStorage
    const savedMuteState = localStorage.getItem('bearPongMuted');
    if (savedMuteState === 'true') {
      this.isMuted = true;
      this.masterVolume = 0;
      this.musicVolume = 0;
      this.sfxVolume = 0;
    } else {
      // Use reduced default volumes (not muted)
      this.masterVolume = 0.3;
      this.musicVolume = 0.2;
      this.sfxVolume = 0.3;
    }
  }

  /**
   * Preload all audio assets
   */
  preload() {
    // Load all sound effects from catbox.moe
    this.scene.load.audio('hit', 'https://files.catbox.moe/blmu4h.mp3');
    this.scene.load.audio('whoosh', 'https://files.catbox.moe/e3i5uj.mp3');
    this.scene.load.audio('combo2', 'https://files.catbox.moe/6ho7x5.mp3');
    this.scene.load.audio('combo3', 'https://files.catbox.moe/19lxs0.mp3');
    this.scene.load.audio('combo4', 'https://files.catbox.moe/k9t4e4.mp3');
    this.scene.load.audio('combo5', 'https://files.catbox.moe/aclr7s.mp3');
    this.scene.load.audio('score', 'https://files.catbox.moe/aebxdd.mp3');
    this.scene.load.audio('perfect', 'https://files.catbox.moe/tpt32f.mp3');

    // Load background music
    this.scene.load.audio('bgMusic', 'https://files.catbox.moe/g4jylc.mp3');

    console.log('🔊 Loading audio files from catbox.moe...');
  }

  /**
   * Create sound objects after preload
   */
  create() {
    // Initialize all sound objects
    this.hitSound = this.scene.sound.add('hit', { volume: this.masterVolume * this.sfxVolume });
    this.whooshSound = this.scene.sound.add('whoosh', { volume: this.masterVolume * this.sfxVolume * 0.5, loop: false });
    this.comboSounds.set(2, this.scene.sound.add('combo2', { volume: this.masterVolume * this.sfxVolume }));
    this.comboSounds.set(3, this.scene.sound.add('combo3', { volume: this.masterVolume * this.sfxVolume }));
    this.comboSounds.set(4, this.scene.sound.add('combo4', { volume: this.masterVolume * this.sfxVolume }));
    this.comboSounds.set(5, this.scene.sound.add('combo5', { volume: this.masterVolume * this.sfxVolume }));
    this.scoreSound = this.scene.sound.add('score', { volume: this.masterVolume * this.sfxVolume });
    this.perfectSound = this.scene.sound.add('perfect', { volume: this.masterVolume * this.sfxVolume * 1.2 });

    // Initialize background music (looping)
    this.bgMusic = this.scene.sound.add('bgMusic', {
      volume: this.masterVolume * this.musicVolume,
      loop: true
    });

    console.log('🔊 Audio system initialized - All sounds loaded!');
  }

  /**
   * Play paddle hit sound
   * @param hitPosition -1 to 1 (center of paddle = 0)
   * @param speed Current ball speed
   */
  playHitSound(hitPosition: number, speed: number) {
    if (!this.hitSound) return;

    // Vary pitch based on hit location
    // Center hit = deeper (lower pitch), edge hit = higher pitch
    const pitchVariation = 1.0 + (Math.abs(hitPosition) * 0.3);

    // Vary volume based on speed (reduced for less annoyance)
    const volumeVariation = 0.3 + (speed / 35) * 0.3; // 🔉 0.3 to 0.6 (was 0.5 to 1.0)

    // Play with variations
    this.hitSound.play({
      volume: this.masterVolume * this.sfxVolume * volumeVariation,
      rate: pitchVariation
    });

    console.log(`🔊 Hit sound: pitch=${pitchVariation.toFixed(2)}, volume=${volumeVariation.toFixed(2)}`);
  }

  /**
   * Play whoosh sound for ball movement
   * @param speed Current ball speed
   */
  playWhooshSound(speed: number) {
    if (!this.whooshSound) return;

    // Pitch and volume scale with speed (reduced significantly)
    const pitch = 0.8 + (speed / 35) * 0.4; // 0.8 to 1.2 (less pitch variation)
    const volume = 0.15 + (speed / 35) * 0.25; // 🔉 0.15 to 0.4 (was 0.3 to 0.8)

    this.whooshSound.play({
      volume: this.masterVolume * this.sfxVolume * volume * 0.3, // 🔉 Much quieter whoosh
      rate: pitch
    });

    console.log(`💨 Whoosh sound: pitch=${pitch.toFixed(2)}, speed=${speed.toFixed(1)}`);
  }

  /**
   * Play combo sound
   * @param combo Combo count (2, 3, 4, etc.)
   */
  playComboSound(combo: number) {
    const comboSound = this.comboSounds.get(Math.min(combo, 5));
    if (!comboSound) return;

    comboSound.play({
      volume: this.masterVolume
    });

    console.log(`🎵 Combo sound: ${combo} HIT COMBO!`);
  }

  /**
   * Play score sound
   */
  playScoreSound() {
    if (!this.scoreSound) return;

    this.scoreSound.play({
      volume: this.masterVolume
    });

    console.log(`🎯 Score sound`);
  }

  /**
   * Play perfect hit sound (center of paddle)
   */
  playPerfectHitSound() {
    if (!this.perfectSound) return;

    this.perfectSound.play({
      volume: this.masterVolume * 1.2 // Louder for perfect hits
    });

    console.log(`⭐ PERFECT HIT sound!`);
  }

  /**
   * Start background music
   */
  playBackgroundMusic() {
    if (!this.bgMusic) return;
    if (!this.bgMusic.isPlaying) {
      this.bgMusic.play();
    }
  }

  /**
   * Stop background music
   */
  stopBackgroundMusic() {
    if (!this.bgMusic) return;
    this.bgMusic.stop();
  }

  /**
   * Set master volume
   * @param volume 0.0 to 1.0
   */
  setMasterVolume(volume: number) {
    this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateAllVolumes();
    console.log(`🔊 Master volume set to ${(this.masterVolume * 100).toFixed(0)}%`);
  }

  /**
   * Set music volume
   * @param volume 0.0 to 1.0
   */
  setMusicVolume(volume: number) {
    this.musicVolume = Phaser.Math.Clamp(volume, 0, 1);
    if (this.bgMusic) {
      this.bgMusic.setVolume(this.masterVolume * this.musicVolume);
    }
    console.log(`🎵 Music volume set to ${(this.musicVolume * 100).toFixed(0)}%`);
  }

  /**
   * Set SFX volume
   * @param volume 0.0 to 1.0
   */
  setSFXVolume(volume: number) {
    this.sfxVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateAllVolumes();
    console.log(`🔊 SFX volume set to ${(this.sfxVolume * 100).toFixed(0)}%`);
  }

  /**
   * Update all sound volumes
   */
  private updateAllVolumes() {
    if (this.hitSound) this.hitSound.setVolume(this.masterVolume * this.sfxVolume);
    if (this.whooshSound) this.whooshSound.setVolume(this.masterVolume * this.sfxVolume * 0.5);
    if (this.scoreSound) this.scoreSound.setVolume(this.masterVolume * this.sfxVolume);
    if (this.perfectSound) this.perfectSound.setVolume(this.masterVolume * this.sfxVolume * 1.2);

    this.comboSounds.forEach((sound) => {
      sound.setVolume(this.masterVolume * this.sfxVolume);
    });

    if (this.bgMusic) {
      this.bgMusic.setVolume(this.masterVolume * this.musicVolume);
    }
  }

  /**
   * Get current volumes
   */
  getVolumes() {
    return {
      master: this.masterVolume,
      music: this.musicVolume,
      sfx: this.sfxVolume
    };
  }

  /**
   * Mute all audio
   */
  mute() {
    if (this.isMuted) return;

    // Store current volumes
    this.volumeBeforeMute = {
      master: this.masterVolume,
      music: this.musicVolume,
      sfx: this.sfxVolume
    };

    // Set all volumes to 0
    this.masterVolume = 0;
    this.musicVolume = 0;
    this.sfxVolume = 0;
    this.isMuted = true;

    // Save to localStorage
    localStorage.setItem('bearPongMuted', 'true');

    this.updateAllVolumes();
    console.log('🔇 Audio muted');
  }

  /**
   * Unmute all audio
   */
  unmute() {
    if (!this.isMuted) return;

    // Restore previous volumes
    this.masterVolume = this.volumeBeforeMute.master;
    this.musicVolume = this.volumeBeforeMute.music;
    this.sfxVolume = this.volumeBeforeMute.sfx;
    this.isMuted = false;

    // Save to localStorage
    localStorage.setItem('bearPongMuted', 'false');

    this.updateAllVolumes();
    console.log('🔊 Audio unmuted');
  }

  /**
   * Toggle mute state
   */
  toggleMute() {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  /**
   * Get mute state
   */
  isMutedState(): boolean {
    return this.isMuted;
  }
}
