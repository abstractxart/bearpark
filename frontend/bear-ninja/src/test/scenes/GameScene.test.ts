import { describe, it, expect, afterEach } from "vitest";
import Phaser from "phaser";
import {
  bootScene,
  destroyGame,
  tickFrames,
  waitUntil,
} from "../helpers/phaser";
import GameScene from "../../scenes/GameScene";

/// IMPORTANT: Be aware that tests run in a headless environment, so loading
/// resources like fonts or images or audio is not possible. Write tests that
/// don't rely on resources.

let currentGame: Phaser.Game | null = null;

afterEach(async () => {
  if (currentGame) {
    await destroyGame(currentGame);
    currentGame = null;
  }
});

describe("GameScene (HEADLESS)", () => {
  it("boots and runs at least a few frames without errors", async () => {
    const { game, scene } = await bootScene(GameScene);
    currentGame = game;

    // Wait 100 frames for the scene to be active
    await waitUntil(() => scene.scene?.isActive(), 100);

    // Tick frame 5 times
    await tickFrames(5);

    expect(scene.scene.isActive()).toBe(true);
  });
});
