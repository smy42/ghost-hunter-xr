// ─────────────────────────────────────────────
// BEREICH: Gameplay (Zielen, Fangen, Score)   →  Person B
// ─────────────────────────────────────────────
// Hält den Zustand einer Runde. Funktioniert in AR und im 3D-Modus gleich.

import * as THREE from 'three';
import type { Ghost, GameSnapshot, RoundStatus } from '../types';

export class Game {
  private ghosts: Ghost[] = [];
  private score = 0;
  private time = 0;
  private status: RoundStatus = 'playing';
  private camera: THREE.Camera;
  private raycaster = new THREE.Raycaster();
  private targetedGhost: Ghost | null = null;
  private captureProgress = 0;
  private capturePerClick = 20;
  private captureDecay = 10;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  /** Neue Runde mit den übergebenen Geistern starten. */
  start(ghosts: Ghost[]): void {
    this.ghosts = ghosts;
    this.score = 0;
    this.time = 0;
    this.status = 'playing';
    this.targetedGhost = null;
    this.captureProgress = 0;
  }

  /** Wird jeden Frame aufgerufen. dt = Sekunden seit dem letzten Frame. */
  update(dt: number): void {
    if (this.status !== 'playing') return;

    this.time += dt;

    // Laserstrahl aus der Bildschirmmitte
    this.raycaster.setFromCamera(
      new THREE.Vector2(0, 0),
      this.camera
    );

    // Nur Geister berücksichtigen, die noch nicht gefangen sind
    const availableGhosts = this.ghosts.filter(
      (ghost) => !ghost.caught
    );

    // Prüfen, welche Geister der Strahl trifft
    const intersections = this.raycaster.intersectObjects(
      availableGhosts.map((ghost) => ghost.object),
      true
    );

    // Zuerst kein Geist anvisiert
    this.targetedGhost = null;

    if (intersections.length > 0) {
      const hitObject = intersections[0].object;

      // Herausfinden, zu welchem Geist das getroffene Objekt gehört
      this.targetedGhost = availableGhosts.find((ghost) => {
        let object: THREE.Object3D | null = hitObject;

        while (object) {
          if (object === ghost.object) return true;
          object = object.parent;
        }

        return false;
      }) ?? null;
    }
    // Fangfortschritt sinkt automatisch
    this.captureProgress = Math.max(
      0,
      this.captureProgress - this.captureDecay * dt
    );
  }

  /** Wird bei jedem Tap auf den Fang-Button aufgerufen (von ui/). */
  capture(): void {
  if (this.status !== 'playing') return;

  const ghost = this.targetedGhost;

  // Kein Geist anvisiert?
  if (!ghost || ghost.caught) return;

  // Fangbalken füllen
  this.captureProgress = Math.min(
    100,
    this.captureProgress + this.capturePerClick
  );

  // Noch nicht vollständig gefangen
  if (this.captureProgress < 100) return;

  // Geist erfolgreich gefangen!
  ghost.caught = true;
  ghost.object.visible = false;

  this.score += 100;
  this.captureProgress = 0;
  this.targetedGhost = null;

  // Alle Geister gefangen?
  if (this.ghosts.every((g) => g.caught)) {
    this.status = 'won';
  }
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
