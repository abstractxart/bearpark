import Phaser from 'phaser';
import { LevelManager } from '../LevelManager.js';
import * as utils from '../utils';

export class TitleScreen extends Phaser.Scene {
  // UI elements
  uiContainer!: Phaser.GameObjects.DOMElement;
  
  // Input controls - HTML event handlers
  keydownHandler?: (event: KeyboardEvent) => void;
  clickHandler?: (event: Event) => void;
  
  // Audio
  backgroundMusic!: Phaser.Sound.BaseSound;
  
  // State flags
  isStarting: boolean = false;

  constructor() {
    super({
      key: "TitleScreen",
    });
    this.isStarting = false;
  }

  init(): void {
    // Reset start flag
    this.isStarting = false;
  }

  create(): void {
    // Initialize sounds first
    this.initializeSounds();
    
    // Create DOM UI (includes background)
    this.createDOMUI();

    // Set up input controls
    this.setupInputs();

    // Play background music
    this.playBackgroundMusic();
    
    // Listen for scene shutdown to cleanup event listeners
    this.events.once('shutdown', () => {
      this.cleanupEventListeners();
    });
  }

  createDOMUI(): void {
    
    // Generate SVG Data URL for clickable container
    let uiHTML = `
      <div id="title-screen-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-supercell flex flex-col justify-center items-center" style="background-image: url('https://cdn-game-mcp.gambo.ai/e6320abd-2bf1-4e02-ac0c-26ec4c9ddec2/uploads/e6320abd-2bf1-4e02-ac0c-26ec4c9ddec2.png'); background-size: cover; background-position: center; background-repeat: no-repeat;">
        <!-- Main Content Container -->
        <div class="flex flex-col items-center justify-center space-y-12 w-full text-center pointer-events-auto h-full">
          
          <!-- Game Title Image Container -->
          <div id="game-title-container" class="flex-shrink-0 flex items-center justify-center">
            <img id="game-title-image" 
                 src="https://cdn-game-mcp.gambo.ai/a056df13-9a9a-453e-8e1a-a3dc0d792aec/uploads/a056df13-9a9a-453e-8e1a-a3dc0d792aec.png" 
                 alt="Bear Ninja" 
                 class="max-h-[400px] object-contain pointer-events-none"
                 style="filter: drop-shadow(4px 4px 8px rgba(0,0,0,0.8));" />
          </div>

          <!-- Tap to Start Button -->
          <div id="tap-to-start-button" class="game-3d-container-clickable-blue-600 px-8 py-4 pointer-events-auto cursor-pointer transform transition-all duration-200 hover:scale-110 active:scale-95" onclick="this.dispatchEvent(new CustomEvent('gameStart', {bubbles: true}))">
            <div class="text-white font-bold text-2xl" style="
              text-shadow: 2px 2px 0px #000000;
              animation: titleBlink 1s ease-in-out infinite alternate;
            ">TAP TO START</div>
          </div>

        </div>

        <!-- Custom Animations and Styles -->
        <style>
          @keyframes titleBlink {
            from { opacity: 0.3; }
            to { opacity: 1; }
          }
        </style>
      </div>
    `;

    // Add DOM element to the scene
    this.uiContainer = utils.initUIDom(this, uiHTML);
  }

  setupInputs(): void {
    // Add HTML event listeners for keyboard and mouse events
    const handleStart = (event: Event) => {
      event.preventDefault();
      this.startGame();
    };

    // Listen for Enter and Space key events on the document
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault();
        this.startGame();
      }
    };

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);
    
    // Listen for the custom gameStart event from the button
    if (this.uiContainer && this.uiContainer.node) {
      this.uiContainer.node.addEventListener('gameStart', handleStart);
      // Also add general click event as fallback
      this.uiContainer.node.addEventListener('click', handleStart);
    }

    // Store event listeners for cleanup
    this.keydownHandler = handleKeyDown;
    this.clickHandler = handleStart;
  }

  initializeSounds(): void {
    // Initialize background music
    try {
      this.backgroundMusic = this.sound.add("ninja_dojo_music", {
        volume: 0.4, // Lower volume for title screen
        loop: true
      });
    } catch (e) {
      console.warn("Background music not found:", e);
    }
  }

  playBackgroundMusic(): void {
    if (this.backgroundMusic) {
      this.backgroundMusic.play();
    }
  }

  startGame(): void {
    // Prevent multiple triggers
    if (this.isStarting) return;
    this.isStarting = true;

    // Clean up event listeners
    this.cleanupEventListeners();

    // Stop background music
    if (this.backgroundMusic) {
      this.backgroundMusic.stop();
    }

    // Add transition effect
    this.cameras.main.fadeOut(500, 0, 0, 0);
    
    // Start first level after delay
    this.time.delayedCall(500, () => {
      const firstLevelScene = LevelManager.getFirstLevelScene();
      if (firstLevelScene) {
        this.scene.start(firstLevelScene);
      } else {
        console.error("No first level scene found in LEVEL_ORDER");
      }
    });
  }

  cleanupEventListeners(): void {
    // Remove HTML event listeners
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    
    if (this.clickHandler && this.uiContainer && this.uiContainer.node) {
      this.uiContainer.node.removeEventListener('gameStart', this.clickHandler);
      this.uiContainer.node.removeEventListener('click', this.clickHandler);
    }
  }

  update(): void {
    // Title screen doesn't need special update logic
  }
}
