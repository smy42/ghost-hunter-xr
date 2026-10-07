// Gemeinsame Typen für alle Bereiche.
// ⚠️ Änderungen hier bitte im Team absprechen – alle Bereiche hängen davon ab.

import type * as THREE from 'three';

/** Ein Geist in der Szene. Wird von ghosts/ erzeugt, von game/ gefangen, von ui/ gezählt. */
export interface Ghost {
  id: number;
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
