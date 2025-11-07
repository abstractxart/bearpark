/**
 * Level Manager - Manages game level order and navigation
 */
export class LevelManager {
  // Level order list - For fruit slicing endless arcade game
  static readonly LEVEL_ORDER: string[] = [
    "FruitSliceGameScene"
  ];

  // Get the key of the next level scene
  static getNextLevelScene(currentSceneKey: string): string | null {
    // For endless arcade game, return null as there's no level progression
    return null;
  }

  // Check if it's the last level
  static isLastLevel(currentSceneKey: string): boolean {
    // Endless arcade game - always last level
    return true;
  }

  // Get the key of the first level scene
  static getFirstLevelScene(): string | null {
    return LevelManager.LEVEL_ORDER.length > 0 ? LevelManager.LEVEL_ORDER[0] : null;
  }
}
