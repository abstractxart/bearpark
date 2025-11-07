import Phaser from 'phaser';

interface TriggerOrigin {
  x: number;
  y: number;
}

interface ZoneWithOwner extends Phaser.GameObjects.Zone {
  owner?: any;  // Any type of object that can be the owner of the trigger
}

/**
 * Create collision trigger - useful for attack area detection, etc.
 * @param owner - The owner of the trigger (usually the character)
 */
export const createTrigger = (
    scene: Phaser.Scene,
    owner: any,
    x: number,
    y: number,
    width: number,
    height: number,
    origin: TriggerOrigin = { x: 0.5, y: 0.5 }
): ZoneWithOwner => {
    const zoneWithOwner = scene.add.zone(x, y, width, height).setOrigin(origin.x, origin.y) as ZoneWithOwner;
    zoneWithOwner.owner = owner;
    scene.physics.add.existing(zoneWithOwner);
    (zoneWithOwner.body as Phaser.Physics.Arcade.Body).setAllowGravity(false); // Not affected by gravity
    (zoneWithOwner.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    return zoneWithOwner;
};

/**
 * Initialize UI DOM element for UI scenes
 * IMPORTANT: Always use this instead of add.dom and createFromHTML
 */
export const initUIDom = (scene: Phaser.Scene, html: string): Phaser.GameObjects.DOMElement => {
  const dom = scene.add.dom(0, 0, 'div', 'width: 100%; height: 100%;').setHTML(html);
  dom.pointerEvents = 'none';
  dom.setOrigin(0, 0);
  dom.setScrollFactor(0);
  return dom;
}

/**
 * Create a decoration and add it to a group
 * Used to create and set decoration size and position, each decoration type needs different height settings
 * but different variants of the same decoration type should have the same height
 * The height of each decoration is determined by its relative height to a person in reality, where each person is 128px tall
 */
export const createDecoration = (
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  key: string,
  x: number,
  y: number,
  maxDisplayHeight: number
): Phaser.GameObjects.Image => {
  const decoration = scene.add.image(x, y, key);
  initScale(decoration, { x: 0.5, y: 1.0 }, undefined, maxDisplayHeight);
  group.add(decoration);
  return decoration;
}

/**
 * Update melee attack trigger position and size based on character facing direction
 * Supports 4 directions: left, right, up, down
 * @param attackRange - Attack forward distance (how far the attack reaches)
 * @param attackWidth - Attack coverage width (perpendicular to attack direction)
 */
export const updateMeleeTrigger = (
  character: any,
  meleeTrigger: ZoneWithOwner,
  facingDirection: "left" | "right" | "up" | "down",
  attackRange: number,
  attackWidth: number
): void => {

  if (facingDirection !== "up" && facingDirection !== "down" && facingDirection !== "left" && facingDirection !== "right") { 
    throw new Error("updateMeleeTrigger input parameter facingDirection only supports up, down, left, right values");
  }

  const characterBody = character.body as Phaser.Physics.Arcade.Body;
  const triggerBody = meleeTrigger.body as Phaser.Physics.Arcade.Body;

  let triggerX = 0;
  let triggerY = 0;

  const characterCenterX = characterBody.center.x;
  const characterCenterY = characterBody.center.y;

  switch (facingDirection) {
    case "right":
      triggerX = characterCenterX + attackRange / 2; // Offset to the right of character center
      triggerY = characterCenterY;
      triggerBody.setSize(attackRange, attackWidth);
      break;
    case "left":
      triggerX = characterCenterX - attackRange / 2; // Offset to the left of character center
      triggerY = characterCenterY;
      triggerBody.setSize(attackRange, attackWidth);
      break;
    case "up":
      triggerX = characterCenterX;
      triggerY = characterCenterY - attackRange / 2; // Offset above character center
      triggerBody.setSize(attackWidth, attackRange);
      break;
    case "down":
      triggerX = characterCenterX;
      triggerY = characterCenterY + attackRange / 2; // Offset below character center
      triggerBody.setSize(attackWidth, attackRange);
      break;
  }

  meleeTrigger.setPosition(triggerX, triggerY);
}

/**
 * Reset origin and offset for sprite after playing animation
 * IMPORTANT: Must be called every time after playing any animation
 * Requires all animation info in animations.json
 */
export const resetOriginAndOffset = (
  sprite: any, 
  facingDirection: "left" | "right" | "up" | "down"
): void => {

  if (facingDirection !== "up" && facingDirection !== "down" && facingDirection !== "left" && facingDirection !== "right") { 
    throw new Error("resetOriginAndOffset input parameter facingDirection only supports up, down, left, right values");
  }

  const animationsData = sprite.scene.cache.json.get("animations");
  if (!animationsData) {
    throw new Error("animations.json is not loaded, please check if the file is in the assets folder");
  } else if (!animationsData.anims) {
    throw new Error("the first key of animations.json must be 'anims', please check the file");
  }

  // Return corresponding origin data based on different animations
  // Get origin data from loaded animations data
  let baseOriginX = 0.5;
  let baseOriginY = 1.0;
  const currentAnim = sprite.anims.currentAnim;
  if (currentAnim) {
    // Find animation config by key from loaded JSON
    const animConfig = animationsData.anims.find((anim: any) => anim.key === currentAnim.key);
    if (animConfig) {
      baseOriginX = animConfig.originX || 0.5;
      baseOriginY = animConfig.originY || 1.0;
    } else {
      console.error(`Animation config not found for key: ${currentAnim.key}`);
    }
  }

  let animOriginX = facingDirection === "left" ? (1 - baseOriginX) : baseOriginX;
  let animOriginY = baseOriginY;
  
  // Set origin
  sprite.setOrigin(animOriginX, animOriginY);
  
  // Calculate offset to align collision box's bottomCenter with animation frame's origin
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  const unscaledBodyWidth = body.sourceWidth
  const unscaledBodyHeight = body.sourceHeight
  body.setOffset(
    sprite.width * animOriginX - unscaledBodyWidth / 2, 
    sprite.height * animOriginY - unscaledBodyHeight
  );
}

/**
 * Initialize sprite scale, size, and offset
 * IMPORTANT: All image assets must use initScale for scaling, DO NOT use setScale or setDisplaySize directly
 */
export const initScale = (
    sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, 
    origin: { x: number; y: number }, 
    maxDisplayWidth?: number,
    maxDisplayHeight?: number, 
    bodyWidthFactorToDisplayWidth?: number,
    bodyHeightFactorToDisplayHeight?: number
): void => {
  sprite.setOrigin(origin.x, origin.y)

  let displayScale
  let displayHeight
  let displayWidth
  if (maxDisplayHeight && maxDisplayWidth) {
    if (sprite.height / sprite.width > maxDisplayHeight / maxDisplayWidth) {
      displayHeight = maxDisplayHeight
      displayScale = maxDisplayHeight / sprite.height
      displayWidth = sprite.width * displayScale
    } else {
      displayWidth = maxDisplayWidth
      displayScale = maxDisplayWidth / sprite.width
      displayHeight = sprite.height * displayScale
    }
  } else if (maxDisplayHeight) {
    displayHeight = maxDisplayHeight
    displayScale = maxDisplayHeight / sprite.height
    displayWidth = sprite.width * displayScale
  } else if (maxDisplayWidth) {
    displayWidth = maxDisplayWidth
    displayScale = maxDisplayWidth / sprite.width
    displayHeight = sprite.height * displayScale
  } else {
    throw new Error("initScale input parameter maxDisplayHeight and maxDisplayWidth cannot be undefined at the same time");
  }

  sprite.setScale(displayScale)
  const displayBodyWidth = displayWidth * bodyWidthFactorToDisplayWidth
  const displayBodyHeight = displayHeight * bodyHeightFactorToDisplayHeight
  
  if (sprite.body instanceof Phaser.Physics.Arcade.Body) {
      // Body.setSize requires the unscaled body size as input, because the size of the Dynamic Body will scale with sprite.setScale
      const unscaledBodyWidth = displayBodyWidth / displayScale
      const unscaledBodyHeight = displayBodyHeight / displayScale 
      sprite.body.setSize(unscaledBodyWidth, unscaledBodyHeight)

      // Body.setOffset requires the unscaled offset as input, because the offset of the Dynamic Body will scale with sprite.setScale
      const unscaledOffsetX = sprite.width * origin.x - unscaledBodyWidth * origin.x
      const unscaledOffsetY = sprite.height * origin.y - unscaledBodyHeight * origin.y
      sprite.body.setOffset(unscaledOffsetX, unscaledOffsetY)
  } else if (sprite.body instanceof Phaser.Physics.Arcade.StaticBody) {
      // StaticBody.setSize requires the scaled body size(displayBodyWidth, displayBodyHeight) as input, because the size of StaticBody will not scale with sprite.setScale
      sprite.body.setSize(displayBodyWidth, displayBodyHeight)

      // **Don't use StaticBody.setOffset**: this function has a serious bug.
      // Use StaticBody.position.set instead
      const displayTopLeft = sprite.getTopLeft();
      const bodyPositionX = displayTopLeft.x + (sprite.displayWidth * origin.x - displayBodyWidth * origin.x);
      const bodyPositionY = displayTopLeft.y + (sprite.displayHeight * origin.y - displayBodyHeight * origin.y);
      sprite.body.position.set(bodyPositionX, bodyPositionY);
  }
}

/**
 * Add collider/overlap with guaranteed parameter order
 * IMPORTANT: Use these instead of scene.physics.add.collider/overlap to avoid internal bugs
 * These functions ensure that the callback always receives parameters in the order (object1, object2)
 */
export const addCollider = (
  scene: Phaser.Scene,
  object1: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  object2: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  collideCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  processCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  callbackContext?: any
): Phaser.Physics.Arcade.Collider => {
  if (shouldSwap(object1, object2)) {
    return scene.physics.add.collider(object1, object2, (obj1: any, obj2: any) => {
      collideCallback?.call(callbackContext, obj2, obj1)
    }, (obj1: any, obj2: any) => {
      processCallback?.call(callbackContext, obj2, obj1)
    }, callbackContext);
  } else {
    return scene.physics.add.collider(object1, object2, collideCallback, processCallback, callbackContext);
  }
};
export const addOverlap = (
  scene: Phaser.Scene,
  object1: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  object2: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  collideCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  processCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  callbackContext?: any
): Phaser.Physics.Arcade.Collider => {
  if (shouldSwap(object1, object2)) {
    return scene.physics.add.overlap(object1, object2, (obj1: any, obj2: any) => {
      collideCallback?.call(callbackContext, obj2, obj1)
    }, (obj1: any, obj2: any) => {
      processCallback?.call(callbackContext, obj2, obj1)
    }, callbackContext);
  } else {
    return scene.physics.add.overlap(object1, object2, collideCallback, processCallback, callbackContext);
  }
};

const shouldSwap = (object1: any, object2: any) => {
  const object1IsPhysicsGroup = object1 && (object1 as any).isParent && !((object1 as any).physicsType === undefined);
  const object1IsTilemap = object1 && (object1 as any).isTilemap;
  const object2IsPhysicsGroup = object2 && (object2 as any).isParent && !((object2 as any).physicsType === undefined);
  const object2IsTilemap = object2 && (object2 as any).isTilemap;

  // In the following cases, Phaser internally calls collideCallback.call(callbackContext, object2, object1), causing parameter order reversal
  return (
      (object1IsPhysicsGroup && !object2IsPhysicsGroup && !object2IsTilemap) ||
      (object1IsTilemap && !object2IsPhysicsGroup && !object2IsTilemap) ||
      (object1IsTilemap && object2IsPhysicsGroup)
  );
}

/**
 * Must use the following method to correctly calculate sprite rotation in radians (e.g., bullets, arrows, etc.)
 * Calculate rotation radians based on asset's current direction and target direction, with coordinate origin at top-left of canvas
 * If currently facing right, direction vector is (1, 0); if currently facing up, direction vector is (0, -1)
 */
export function computeRotation(assetDirection: Phaser.Math.Vector2, targetDirection: Phaser.Math.Vector2) {
  const assetAngle = Math.atan2(assetDirection.y, assetDirection.x);
  const targetAngle = Math.atan2(targetDirection.y, targetDirection.x); 
  return targetAngle - assetAngle;
}

// Leaderboard Management Functions

export interface HighScoreEntry {
  score: number;
  date: string;
  rank: number;
}

/**
 * Get the current high scores leaderboard
 * @returns Array of top 10 high score entries
 */
export function getHighScores(): HighScoreEntry[] {
  const savedScores = localStorage.getItem('sliceSurge_highScores');
  if (!savedScores) {
    return [];
  }
  
  try {
    const scores = JSON.parse(savedScores) as HighScoreEntry[];
    return scores.slice(0, 10); // Ensure we only return top 10
  } catch (e) {
    console.warn('Error parsing high scores:', e);
    return [];
  }
}

/**
 * Add a new score to the leaderboard
 * @param score The score to add
 * @returns The rank of the new score (1-10) or null if it didn't make the top 10
 */
export function addHighScore(score: number): number | null {
  const currentScores = getHighScores();
  
  // Create new entry
  const newEntry: HighScoreEntry = {
    score: score,
    date: new Date().toLocaleDateString(),
    rank: 0 // Will be set after sorting
  };
  
  // Add to scores and sort
  currentScores.push(newEntry);
  currentScores.sort((a, b) => b.score - a.score);
  
  // Keep only top 10
  const top10 = currentScores.slice(0, 10);
  
  // Update ranks
  top10.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  
  // Save to localStorage
  localStorage.setItem('sliceSurge_highScores', JSON.stringify(top10));
  
  // Return the rank if the score made it to top 10
  const newEntryIndex = top10.findIndex(entry => entry === newEntry);
  return newEntryIndex !== -1 ? newEntryIndex + 1 : null;
}

/**
 * Check if a score qualifies for the top 10 leaderboard
 * @param score The score to check
 * @returns true if the score makes the top 10
 */
export function isHighScore(score: number): boolean {
  const currentScores = getHighScores();
  
  // If we have less than 10 scores, any score qualifies
  if (currentScores.length < 10) {
    return true;
  }
  
  // Check if score is higher than the lowest in top 10
  const lowestTopScore = currentScores[currentScores.length - 1].score;
  return score > lowestTopScore;
}

/**
 * Get the rank a score would have in the leaderboard
 * @param score The score to check
 * @returns The rank (1-10) or null if it wouldn't make top 10
 */
export function getScoreRank(score: number): number | null {
  const currentScores = getHighScores();
  
  // Add the score temporarily to see where it would rank
  const tempScores = [...currentScores, { score, date: '', rank: 0 }];
  tempScores.sort((a, b) => b.score - a.score);
  
  const scoreIndex = tempScores.findIndex(entry => entry.score === score && entry.date === '');
  return scoreIndex < 10 ? scoreIndex + 1 : null;
}