// ─────────────────────────────────────────────
// BEREICH: 3D-Modus (Desktop / iPhone)   →  Person B
// ─────────────────────────────────────────────
// Virtueller Raum + Steuerung, wenn kein AR verfügbar ist.
// Das ist auch die Testumgebung für alle, die kein Android-Handy haben.

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const DESKTOP_EYE_HEIGHT = 1.6;

export class DesktopMode {
  private room = new THREE.Group();
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: PointerLockControls;

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;

  private moveSpeed = 3;



  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.controls = new PointerLockControls(this.camera, document.body);

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

  private onClick = (): void => {
  if (!this.controls.isLocked) {
    this.controls.lock();
  }
};

  private onKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
        this.moveForward = true;
        break;
      case 'KeyS':
        this.moveBackward = true;
        break;
      case 'KeyA':
        this.moveLeft = true;
        break;
      case 'KeyD':
        this.moveRight = true;
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
        this.moveForward = false;
        break;
      case 'KeyS':
        this.moveBackward = false;
        break;
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'KeyD':
        this.moveRight = false;
        break;
    }
  };

  enable(): void {
    this.scene.add(this.room);
    this.scene.background = new THREE.Color(0x11141b);
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);

    document.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
  }

  disable(): void {
    this.scene.remove(this.room);
    this.scene.background = null; // in AR muss der Hintergrund durchsichtig sein

    document.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.controls.unlock();
  }

  /** Wird jeden Frame aufgerufen. dt = Sekunden seit dem letzten Frame. */
  update(dt: number): void {
    if (!this.controls.isLocked) return;

    const distance = this.moveSpeed * dt;

    if (this.moveForward) {
      this.controls.moveForward(distance);
    }

    if (this.moveBackward) {
      this.controls.moveForward(-distance);
    }

    if (this.moveLeft) {
      this.controls.moveRight(-distance);
    }

    if (this.moveRight) {
      this.controls.moveRight(distance);
    }
  }
}
