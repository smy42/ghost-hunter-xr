// ─────────────────────────────────────────────
// BEREICH: Gameplay (Zielen, Fangen, Score)   →  Person B
// ─────────────────────────────────────────────
// Hält den Zustand einer Runde. Funktioniert in AR und im 3D-Modus gleich.

import type * as THREE from 'three';
import type { Ghost, GameSnapshot, RoundStatus } from '../types';

export class Game {
  private ghosts: Ghost[] = [];
  private score = 0;
  private time = 0;
  private status: RoundStatus = 'playing';
  private camera: THREE.Camera;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  /** Neue Runde mit den übergebenen Geistern starten. */
  start(ghosts: Ghost[]): void {
    this.ghosts = ghosts;
    this.score = 0;
    this.time = 0;
    this.status = 'playing';
  }

  /** Wird jeden Frame aufgerufen. dt = Sekunden seit dem letzten Frame. */
  update(dt: number): void {
    if (this.status !== 'playing') return;
    this.time += dt;

    // TODO (Person B): Zielen – liegt ein Geist in der Bildschirmmitte?
    //   Tipp: THREE.Raycaster mit setFromCamera(new THREE.Vector2(0, 0), this.camera)
    void this.camera;

    // TODO (Person B): Fangbalken – sinkt jeden Frame, Tap füllt ihn (siehe capture())
  }

  /** Wird bei jedem Tap auf den Fang-Button aufgerufen (von ui/). */
  capture(): void {
    // TODO (Person B): Fang-Mechanik. Platzhalter: fängt einfach den ersten freien Geist.
    const ghost = this.ghosts.find((g) => !g.caught);
    if (!ghost) return;
    ghost.caught = true;
    ghost.object.visible = false;
    this.score += 100;
    if (this.ghosts.every((g) => g.caught)) this.status = 'won';
  }

  /** Aktueller Stand für die Anzeige (ui/). */
  get snapshot(): GameSnapshot {
    return {
      ghostsLeft: this.ghosts.filter((g) => !g.caught).length,
      ghostsTotal: this.ghosts.length,
      score: this.score,
      time: this.time,
      status: this.status,
    };
  }
}
