/**
 * UltimateAbility - One-time super move per match
 * 🚀 Maximum hype, maximum dopamine
 */

export enum UltimateType {
  TIME_FREEZE = 'time_freeze', // Slow-mo for 3 seconds
  PADDLE_DASH = 'paddle_dash', // Teleport paddle once
  POWER_HIT = 'power_hit'      // Next hit is MEGA POWERFUL (visual juice)
}

export interface UltimateAbilityData {
  type: UltimateType;
  name: string;
  icon: string;
  description: string;
  cooldown: number; // Always Infinity for one-use abilities
}

export const ULTIMATE_ABILITIES: Record<UltimateType, UltimateAbilityData> = {
  [UltimateType.TIME_FREEZE]: {
    type: UltimateType.TIME_FREEZE,
    name: 'TIME FREEZE',
    icon: '⏰',
    description: 'Slow-mo for 3 seconds',
    cooldown: Infinity
  },
  [UltimateType.PADDLE_DASH]: {
    type: UltimateType.PADDLE_DASH,
    name: 'PADDLE DASH',
    icon: '🚀',
    description: 'Teleport to ball',
    cooldown: Infinity
  },
  [UltimateType.POWER_HIT]: {
    type: UltimateType.POWER_HIT,
    name: 'POWER HIT',
    icon: '💪',
    description: 'Next hit is MEGA',
    cooldown: Infinity
  }
};
