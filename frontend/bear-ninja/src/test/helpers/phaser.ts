import Phaser from "phaser";
import { vi } from "vitest";

type HeadlessBootResult<TScene extends Phaser.Scene> = {
  game: Phaser.Game;
  scene: TScene;
};

export function createHeadlessGame(
  configOverrides: Partial<Phaser.Types.Core.GameConfig> = {}
): Phaser.Game {
  const baseConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.HEADLESS,
    width: 1,
    height: 1,
    banner: false,
    audio: { noAudio: true },
    // We run under jsdom; skip feature detection
    customEnvironment: true,
    fps: { target: 60, forceSetTimeOut: true },
    autoFocus: false,
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
  };
  return new Phaser.Game({ ...baseConfig, ...configOverrides });
}

export async function bootScene<TScene extends Phaser.Scene>(
  SceneClass: new (...args: any[]) => TScene,
  configOverrides: Partial<Phaser.Types.Core.GameConfig> = {}
): Promise<HeadlessBootResult<TScene>> {
  const scene = new SceneClass();
  const game = createHeadlessGame({
    scene: [scene],
    ...configOverrides,
  });

  // Wait for scene systems to be ready and create lifecycle to run
  await nextMicroTask();
  await tickFrames(1);

  return { game, scene };
}

export async function tickFrames(frames: number): Promise<void> {
  const msPerFrame = 1000 / 60;
  for (let i = 0; i < frames; i += 1) {
    vi.advanceTimersByTime(msPerFrame);
    await nextMicroTask();
  }
}

export async function destroyGame(game: Phaser.Game): Promise<void> {
  await game.destroy(true);
}

async function nextMicroTask(): Promise<void> {
  await Promise.resolve();
}

export async function waitUntil(
  condition: () => boolean,
  maxFrames: number = 100
): Promise<void> {
  let frames = 0;
  while (!condition()) {
    await tickFrames(1);
    frames++;
    if (frames > maxFrames) {
      throw new Error(
        `Wait until condition timed out after ${maxFrames} frames`
      );
    }
  }
}
