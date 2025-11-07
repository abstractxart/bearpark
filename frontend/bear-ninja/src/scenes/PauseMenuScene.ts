import Phaser from 'phaser';
import * as utils from '../utils';

export class PauseMenuScene extends Phaser.Scene {
  private uiContainer: Phaser.GameObjects.DOMElement | null = null;
  private gameSceneKey: string | null = null;
  private masterVolume: number = 1.0;
  private musicVolume: number = 0.6;
  private sfxVolume: number = 0.3;

  constructor() {
    super({
      key: "PauseMenuScene",
    });
  }

  init(data: { gameSceneKey: string }) {
    this.gameSceneKey = data.gameSceneKey;
    
    // Load saved volume settings
    this.masterVolume = parseFloat(localStorage.getItem('sliceSurge_masterVolume') || '1.0');
    this.musicVolume = parseFloat(localStorage.getItem('sliceSurge_musicVolume') || '0.6');
    this.sfxVolume = parseFloat(localStorage.getItem('sliceSurge_sfxVolume') || '0.3');
  }

  create(): void {
    // Pause the game scene
    if (this.gameSceneKey) {
      this.scene.pause(this.gameSceneKey);
    }
    
    this.createDOMUI();
    this.setupEventListeners();
  }

  createDOMUI(): void {
    const uiHTML = `
      <div id="pause-menu-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[2000] font-supercell flex flex-col justify-center items-center" style="background-color: rgba(0, 0, 0, 0.8);">
        <!-- Main Pause Menu Container -->
        <div class="flex flex-col items-center justify-center gap-4 p-6 text-center pointer-events-auto max-w-sm">
          
          <!-- Pause Title -->
          <div id="pause-title" class="text-white font-bold pointer-events-none" style="
            font-size: 32px;
            text-shadow: 3px 3px 0px #000000;
          ">PAUSED</div>

          <!-- Settings Panel -->
          <div class="game-3d-container-gray-700 p-4 w-full">
            <!-- Volume Controls -->
            <div class="text-white font-bold text-base mb-3">🔊 VOLUME SETTINGS</div>
            
            <!-- Master Volume -->
            <div class="mb-3">
              <div class="text-white text-xs mb-1">Master Volume: <span id="master-volume-display">${Math.round(this.masterVolume * 100)}</span>%</div>
              <input type="range" id="master-volume-slider" min="0" max="100" value="${this.masterVolume * 100}" 
                     class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider">
            </div>
            
            <!-- Music Volume -->
            <div class="mb-3">
              <div class="text-white text-xs mb-1">Music Volume: <span id="music-volume-display">${Math.round(this.musicVolume * 100)}</span>%</div>
              <input type="range" id="music-volume-slider" min="0" max="100" value="${this.musicVolume * 100}" 
                     class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider">
            </div>
            
            <!-- SFX Volume -->
            <div class="mb-3">
              <div class="text-white text-xs mb-1">SFX Volume: <span id="sfx-volume-display">${Math.round(this.sfxVolume * 100)}</span>%</div>
              <input type="range" id="sfx-volume-slider" min="0" max="100" value="${this.sfxVolume * 100}" 
                     class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider">
            </div>
          </div>

          <!-- Buttons Container -->
          <div class="flex flex-col items-center gap-3 w-full">
            <!-- Resume Button -->
            <div id="resume-button" class="game-3d-container-clickable-green-600 px-6 py-2 text-white font-bold pointer-events-auto cursor-pointer w-full text-center" style="
              font-size: 18px;
              text-shadow: 2px 2px 0px #000000;
              animation: blink 1s ease-in-out infinite alternate;
            ">▶️ RESUME</div>
            
            <!-- Restart Button -->
            <div id="restart-button" class="game-3d-container-clickable-orange-600 px-6 py-2 text-white font-bold pointer-events-auto cursor-pointer w-full text-center" style="
              font-size: 16px;
              text-shadow: 2px 2px 0px #000000;
            ">🔄 RESTART</div>
            
            <!-- Main Menu Button -->
            <div id="main-menu-button" class="game-3d-container-clickable-gray-600 px-6 py-2 text-white font-bold pointer-events-auto cursor-pointer w-full text-center" style="
              font-size: 16px;
              text-shadow: 2px 2px 0px #000000;
            ">🏠 MAIN MENU</div>
          </div>

        </div>

        <!-- Custom Styles -->
        <style>
          @keyframes blink {
            from { opacity: 0.6; }
            to { opacity: 1; }
          }
          
          .slider::-webkit-slider-thumb {
            appearance: none;
            height: 20px;
            width: 20px;
            background: #ffd700;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
          }
          
          .slider::-moz-range-thumb {
            height: 20px;
            width: 20px;
            background: #ffd700;
            border-radius: 50%;
            cursor: pointer;
            border: none;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
          }
        </style>
      </div>
    `;

    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  setupEventListeners(): void {
    // Resume button
    const resumeButton = document.getElementById('resume-button');
    if (resumeButton) {
      resumeButton.addEventListener('click', () => this.resumeGame());
    }

    // Restart button
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
      restartButton.addEventListener('click', () => this.restartGame());
    }

    // Main menu button
    const mainMenuButton = document.getElementById('main-menu-button');
    if (mainMenuButton) {
      mainMenuButton.addEventListener('click', () => this.goToMainMenu());
    }

    // Volume sliders
    this.setupVolumeControls();

    // ESC key to resume
    const escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    escKey.on('down', () => this.resumeGame());
  }

  setupVolumeControls(): void {
    // Master volume
    const masterSlider = document.getElementById('master-volume-slider') as HTMLInputElement;
    const masterDisplay = document.getElementById('master-volume-display');
    
    if (masterSlider && masterDisplay) {
      masterSlider.addEventListener('input', (e) => {
        const value = parseInt((e.target as HTMLInputElement).value) / 100;
        this.masterVolume = value;
        masterDisplay.textContent = Math.round(value * 100).toString();
        this.updateGameVolume();
        this.saveVolumeSettings();
      });
    }

    // Music volume
    const musicSlider = document.getElementById('music-volume-slider') as HTMLInputElement;
    const musicDisplay = document.getElementById('music-volume-display');
    
    if (musicSlider && musicDisplay) {
      musicSlider.addEventListener('input', (e) => {
        const value = parseInt((e.target as HTMLInputElement).value) / 100;
        this.musicVolume = value;
        musicDisplay.textContent = Math.round(value * 100).toString();
        this.updateGameVolume();
        this.saveVolumeSettings();
      });
    }

    // SFX volume
    const sfxSlider = document.getElementById('sfx-volume-slider') as HTMLInputElement;
    const sfxDisplay = document.getElementById('sfx-volume-display');
    
    if (sfxSlider && sfxDisplay) {
      sfxSlider.addEventListener('input', (e) => {
        const value = parseInt((e.target as HTMLInputElement).value) / 100;
        this.sfxVolume = value;
        sfxDisplay.textContent = Math.round(value * 100).toString();
        this.updateGameVolume();
        this.saveVolumeSettings();
      });
    }
  }

  updateGameVolume(): void {
    // Update global sound volume
    this.sound.volume = this.masterVolume;
    
    // Update specific volumes for game scene
    if (this.gameSceneKey) {
      const gameScene = this.scene.get(this.gameSceneKey) as any;
      if (gameScene && gameScene.backgroundMusic) {
        (gameScene.backgroundMusic as any).setVolume(this.musicVolume * this.masterVolume);
      }
      
      // Update SFX volumes for existing sounds
      if (gameScene.fruitSliceSounds) {
        gameScene.fruitSliceSounds.forEach((sound: Phaser.Sound.BaseSound) => {
          (sound as any).setVolume(this.sfxVolume * this.masterVolume);
        });
      }
      
      // Update other SFX sounds
      const sfxSounds = ['bombExplosionSound', 'gameOverSound', 'perfectSliceSound', 'frenzyModeSound', 'spectacularSliceSound', 'onFireModeSound', 'perfectStreakSound', 'nearMissSound', 'personalBestSound'];
      sfxSounds.forEach(soundKey => {
        if (gameScene[soundKey]) {
          (gameScene[soundKey] as any).setVolume(this.sfxVolume * this.masterVolume);
        }
      });
      
      // Update volumes in registry for new sounds
      this.game.registry.set('sfxVolume', this.sfxVolume * this.masterVolume);
      this.game.registry.set('musicVolume', this.musicVolume * this.masterVolume);
    }
  }

  saveVolumeSettings(): void {
    localStorage.setItem('sliceSurge_masterVolume', this.masterVolume.toString());
    localStorage.setItem('sliceSurge_musicVolume', this.musicVolume.toString());
    localStorage.setItem('sliceSurge_sfxVolume', this.sfxVolume.toString());
  }

  resumeGame(): void {
    // Resume the game scene
    if (this.gameSceneKey) {
      this.scene.resume(this.gameSceneKey);
    }
    
    // Close pause menu
    this.scene.stop();
  }

  restartGame(): void {
    // Stop current game scene
    if (this.gameSceneKey) {
      this.scene.stop(this.gameSceneKey);
      this.scene.stop("UIScene");
    }
    
    // Restart the game
    this.scene.start(this.gameSceneKey!);
    this.scene.stop();
  }

  goToMainMenu(): void {
    // Stop all game scenes
    if (this.gameSceneKey) {
      this.scene.stop(this.gameSceneKey);
      this.scene.stop("UIScene");
    }
    
    // Go to title screen
    this.scene.start("TitleScreen");
    this.scene.stop();
  }
}