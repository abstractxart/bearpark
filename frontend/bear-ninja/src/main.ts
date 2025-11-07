import Phaser from "phaser";
import { screenSize, debugConfig, renderConfig } from "./gameConfig.json";
import "./styles/tailwind.css";
import { Preloader } from "./scenes/Preloader";
import { TitleScreen } from "./scenes/TitleScreen";
import { FruitSliceGameScene } from "./scenes/FruitSliceGameScene";
import UIScene from "./scenes/UIScene";
import { VictoryUIScene } from "./scenes/VictoryUIScene";
import { GameCompleteUIScene } from "./scenes/GameCompleteUIScene";
import { GameOverUIScene } from "./scenes/GameOverUIScene";
import { PauseMenuScene } from "./scenes/PauseMenuScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: screenSize.width.value,
  height: screenSize.height.value,
  backgroundColor: "#000000",
  parent: 'game-container',
  dom: {
    createContainer: true
  },
  loader: {
    baseURL: '/bear-ninja/',
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      fps: 120,
      debug: debugConfig.debug.value,
      debugShowBody: debugConfig.debug.value,
      debugShowStaticBody: debugConfig.debug.value,
      debugShowVelocity: debugConfig.debug.value,
    },
  },
  pixelArt: renderConfig.pixelArt.value,
};

const game = new Phaser.Game(config);
// Strictly add scenes in the following order: Preloader, TitleScreen, level scenes, UI-related scenes

// Preloader: Load all game resources
game.scene.add("Preloader", Preloader, true);

// TitleScreen
game.scene.add("TitleScreen", TitleScreen);

// Game scenes
game.scene.add("FruitSliceGameScene", FruitSliceGameScene);

// UI-related scenes
game.scene.add("UIScene", UIScene);
game.scene.add("PauseMenuScene", PauseMenuScene);
game.scene.add("VictoryUIScene", VictoryUIScene);
game.scene.add("GameCompleteUIScene", GameCompleteUIScene);
game.scene.add("GameOverUIScene", GameOverUIScene);
