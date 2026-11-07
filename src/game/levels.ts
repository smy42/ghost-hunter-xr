
import type { LevelConfig } from '../types';

const LEVELS: LevelConfig[] = [
  {
    level: 1,
    roundTime: 45,
    radiusScale: 1,
    spawn: {
      mix: { normal: 3, fast: 1, evil: 1, timeadd: 1 },
      minSpacing: 0.6,
      behaviors: ['idle'],
      speed: 0.6,
      fleeDistance: 3,
    },
  },
  {
    level: 2,
    roundTime: 45,
    radiusScale: 1.2,
    spawn: {
      mix: { normal: 3, fast: 1, evil: 1, timeadd: 1 },
      minSpacing: 0.6,
      behaviors: ['wander'],
      speed: 0.7,
      fleeDistance: 3,
    },
  },
  {
    level: 3,
    roundTime: 40,
    radiusScale: 1.4,
    spawn: {
      mix: { normal: 4, fast: 1, evil: 1, timeadd: 1 },
      minSpacing: 0.6,
      behaviors: ['wander', 'flee'],
      speed: 0.8,
      fleeDistance: 3,
    },
  },
  {
    level: 4,
    roundTime: 35,
    radiusScale: 1.4,
    spawn: {
      mix: { normal: 4, fast: 2, evil: 1, timeadd: 1 },
      minSpacing: 0.6,
      behaviors: ['wander', 'flee', 'teleport'],
      speed: 1,
      fleeDistance: 3,
    },
  },
];

/** Konfiguration für das gewünschte Level. */
export function getLevelConfig(level: number): LevelConfig {
  const index = Math.max(
    0,
    Math.min(Math.floor(level) - 1, LEVELS.length - 1),
  );

  return LEVELS[index];
}

