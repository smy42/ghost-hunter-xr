// Gemeinsame Typen für alle Bereiche.
// ⚠️ Änderungen hier bitte im Team absprechen – alle Bereiche hängen davon ab.

import type * as THREE from 'three';

/**
 * Geistertypen:
 * - normal:  normal fangen
 * - fast:    "flink" – braucht mehr Taps, Fangbalken sinkt schneller
 * - evil:    "böse" – NICHT fangen! Sonst kommen alle gefangenen Geister wieder frei
 * - timeadd: Bonus – fangen gibt +10 Sekunden
 */
export type GhostType = 'normal' | 'fast' | 'evil' | 'timeadd';

/** Ein Geist in der Szene. Wird von ghosts/ erzeugt, von game/ gefangen, von ui/ gezählt. */
export interface Ghost {
  id: number;
  type: GhostType;
  /** Das 3D-Objekt in der Szene (Position, Rotation, Modell). */
  object: THREE.Object3D;
  /** true, sobald der Geist gefangen wurde. */
  caught: boolean;
}

/** In welchem Modus läuft das Spiel gerade? */
export type GameMode = 'desktop' | 'ar';

/** Zustand einer Runde – das, was die Anzeige (ui/) darstellen muss. */
export type RoundStatus = 'playing' | 'won' | 'lost';

export interface GameSnapshot {
  ghostsLeft: number;
  ghostsTotal: number;
  score: number;
  /** Vergangene Zeit in Sekunden. */
  time: number;
  status: RoundStatus;
}
