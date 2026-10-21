// ─────────────────────────────────────────────
// BEREICH: Gameplay (Zielen, Fangen, Score) → Person B
// ─────────────────────────────────────────────

import * as THREE from 'three';
import type { Ghost, GameSnapshot, RoundStatus } from '../types';

export class Game {
  private ghosts: Ghost[] = [];
  private score = 0;
  private time = 0;
  private status: RoundStatus = 'playing';
  private camera: THREE.Camera;

  // Zielen
  private raycaster = new THREE.Raycaster();
  private targetedGhost: Ghost | null = null;

  // Fangmechanik
  private captureProgress = 0;
  private capturePerClick = 20;
  private captureDecay = 10;

  constructor(camera: THREE.Camera) {
    this.camera = camera;
  }

  /** Neue Runde starten. */
  start(ghosts: Ghost[]): void {
    this.ghosts = ghosts;
    this.score = 0;
    this.time = 0;
    this.status = 'playing';
    this.targetedGhost = null;
    this.captureProgress = 0;
  }

  /** Wird jeden Frame aufgerufen. */
  update(dt: number): void {
    if (this.status !== 'playing') return;

    this.time += dt;

    // Strahl aus der Bildschirmmitte
    this.raycaster.setFromCamera(
      new THREE.Vector2(0, 0),
      this.camera
    );

    const availableGhosts = this.ghosts.filter(
      (ghost) => !ghost.caught
    );

    const intersections = this.raycaster.intersectObjects(
      availableGhosts.map((ghost) => ghost.object),
      true
    );

    const previousTarget = this.targetedGhost;
    this.targetedGhost = null;

    if (intersections.length > 0) {
      const hitObject = intersections[0].object;

      this.targetedGhost = availableGhosts.find((ghost) => {
        let object: THREE.Object3D | null = hitObject;

        while (object) {
          if (object === ghost.object) return true;
          object = object.parent;
        }

        return false;
      }) ?? null;
    }

    // Bei Zielwechsel Fortschritt zurücksetzen
    if (previousTarget !== this.targetedGhost) {
      this.captureProgress = 0;
    }

    // Schnelle Geister verlieren Fortschritt schneller
    const decay = this.targetedGhost?.type === 'fast'
      ? this.captureDecay * 2
      : this.captureDecay;

    this.captureProgress = Math.max(
      0,
      this.captureProgress - decay * dt
    );
  }

  /** Fangversuch durch Klick oder E. */
  capture(): void {
    if (this.status !== 'playing') return;

    const ghost = this.targetedGhost;

    if (!ghost || ghost.caught) return;

    // Flinke Geister benötigen mehr Klicks
    const progressPerClick = ghost.type === 'fast'
      ? 10
      : this.capturePerClick;

    this.captureProgress = Math.min(
      100,
      this.captureProgress + progressPerClick
    );

    // Geist noch nicht vollständig gefangen
    if (this.captureProgress < 100) return;

    ghost.caught = true;
    ghost.object.visible = false;

    this.captureProgress = 0;
    this.targetedGhost = null;

    if (ghost.type === 'evil') {
      // Alle gefangenen Geister wieder freilassen
      for (const other of this.ghosts) {
        if (other !== ghost && other.caught) {
          other.caught = false;
          other.object.visible = true;
        }
      }

      // Böser Geist bleibt im Spiel
      ghost.caught = false;
      ghost.object.visible = true;

    } else {
      this.score += 100;
    }

    // Alle erforderlichen Geister gefangen?
    if (this.huntable.every((g) => g.caught)) {
      this.status = 'won';
    }
  }

  /** Böse Geister zählen nicht zum Fangziel. */
  private get huntable(): Ghost[] {
    return this.ghosts.filter((g) => g.type !== 'evil');
  }

  /** Aktueller Spielstand für die UI. */
  get snapshot(): GameSnapshot {
    return {
      ghostsLeft: this.huntable.filter((g) => !g.caught).length,
      ghostsTotal: this.huntable.length,
      score: this.score,
      time: this.time,
      status: this.status,
    };
  }
}