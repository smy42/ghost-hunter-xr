// ─────────────────────────────────────────────
// BEREICH: 3D-Modus (Desktop / iPhone)   →  Person B
// ─────────────────────────────────────────────
// Virtueller Raum + Steuerung, wenn kein AR verfügbar ist.
// Das ist auch die Testumgebung für alle, die kein Android-Handy haben.

import * as THREE from 'three';

export const DESKTOP_EYE_HEIGHT = 1.6;

export class DesktopMode {
  private room = new THREE.Group();
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;

    // Einfacher Platzhalter-Raum: Boden + Raster
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a2f3a }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.room.add(floor);
    this.room.add(new THREE.GridHelper(20, 20, 0x4fe39a, 0x3a4150));

    // TODO (Person B): Wände / Möbel (später gern freie Assets)
  }

  /** Startpunkt des Spielers im 3D-Modus – hier spawnen die Geister. */
  get playerPosition(): THREE.Vector3 {
    return new THREE.Vector3(0, DESKTOP_EYE_HEIGHT, 0);
  }

  enable(): void {
    this.scene.add(this.room);
    this.scene.background = new THREE.Color(0x11141b);
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);
    // TODO (Person B): Steuerung aktivieren – Maus zum Umschauen, WASD zum Laufen
    //   Tipp: import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
  }

  disable(): void {
    this.scene.remove(this.room);
    this.scene.background = null; // in AR muss der Hintergrund durchsichtig sein
    // TODO (Person B): Steuerung deaktivieren
  }

  /** Wird jeden Frame aufgerufen. dt = Sekunden seit dem letzten Frame. */
  update(_dt: number): void {
    // TODO (Person B): Bewegung mit WASD
  }
}
