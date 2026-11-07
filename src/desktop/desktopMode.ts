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

  /** Erkennt Geräte mit Touch-Bedienung ohne präzisen Mauszeiger. */
  private readonly isTouchDevice = window.matchMedia(
    '(hover: none) and (pointer: coarse)'
  ).matches;

  /** Virtueller Joystick für Smartphones. */
  private joystick = document.createElement('div');
  private joystickKnob = document.createElement('div');

  private joystickX = 0;
  private joystickY = 0;
  private joystickPointerId: number | null = null;

  /** Touch-Steuerung für die Kamera. */
  private lookPointerId: number | null = null;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private readonly touchSensitivity = 0.003;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.controls = new PointerLockControls(this.camera, document.body);
    // Touch-Joystick vorbereiten
    if (this.isTouchDevice) {
      this.joystick.style.cssText = `
    position: fixed;
    left: 25px;
    bottom: 35px;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    border: 2px solid rgba(255, 255, 255, 0.4);
    touch-action: none;
    z-index: 100;
    display: none;
  `;

      this.joystickKnob.style.cssText = `
    position: absolute;
    left: 35px;
    top: 35px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: rgba(120, 255, 190, 0.65);
    pointer-events: none;
  `;

      this.joystick.appendChild(this.joystickKnob);
      document.body.appendChild(this.joystick);
      this.joystick.style.touchAction = 'none';
    }

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

  /** Joystick-Position aus einer Fingerbewegung berechnen. */
  private updateJoystick(clientX: number, clientY: number): void {
    const rect = this.joystick.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;

    const maxDistance = 35;
    const distance = Math.hypot(dx, dy);
    const scale = distance > maxDistance ? maxDistance / distance : 1;

    this.joystickX = (dx * scale) / maxDistance;
    this.joystickY = (dy * scale) / maxDistance;

    this.joystickKnob.style.transform =
      `translate(${dx * scale}px, ${dy * scale}px)`;
  }

  /** Joystick loslassen und Bewegung stoppen. */
  private resetJoystick(): void {
    this.joystickX = 0;
    this.joystickY = 0;
    this.joystickPointerId = null;

    this.joystickKnob.style.transform = 'translate(0px, 0px)';
  }

  private onJoystickDown = (event: PointerEvent): void => {
    if (this.joystickPointerId !== null) return;

    event.preventDefault();
    this.joystickPointerId = event.pointerId;
    this.joystick.setPointerCapture(event.pointerId);
    this.updateJoystick(event.clientX, event.clientY);
  };

  private onJoystickMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) return;

    event.preventDefault();
    this.updateJoystick(event.clientX, event.clientY);
  };

  private onJoystickUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointerId) return;

    this.resetJoystick();
  };

  /** Finger auf der rechten Bildschirmhälfte aufsetzen. */
  private onLookDown = (event: PointerEvent): void => {
    if (!this.isTouchDevice || this.lookPointerId !== null) return;

    // Linke Hälfte ist für den Joystick reserviert
    if (event.clientX < window.innerWidth / 2) return;

    // UI-Buttons dürfen die Kamera nicht bewegen
    if ((event.target as Element).closest('button, .screen')) return;

    event.preventDefault();
    this.lookPointerId = event.pointerId;
    this.lastTouchX = event.clientX;
    this.lastTouchY = event.clientY;
    (event.target as Element).setPointerCapture(event.pointerId);
  };

  /** Kamera durch Fingerbewegung drehen. */
  private onLookMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) return;

    event.preventDefault();

    const deltaX = event.clientX - this.lastTouchX;
    const deltaY = event.clientY - this.lastTouchY;

    this.lastTouchX = event.clientX;
    this.lastTouchY = event.clientY;

    // Horizontal und vertikal umsehen
    this.camera.rotation.order = 'YXZ';

    this.camera.rotation.y -= deltaX * this.touchSensitivity;
    this.camera.rotation.x -= deltaY * this.touchSensitivity;

    // Nicht über Kopf drehen
    const maxPitch = Math.PI / 2 - 0.1;

    this.camera.rotation.x = THREE.MathUtils.clamp(
      this.camera.rotation.x,
      -maxPitch,
      maxPitch
    );
  };

  /** Finger loslassen. */
  private onLookUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) return;

    this.lookPointerId = null;
  };

  /** Startpunkt des Spielers im 3D-Modus – hier spawnen die Geister. */
  get playerPosition(): THREE.Vector3 {
    return new THREE.Vector3(0, DESKTOP_EYE_HEIGHT, 0);
  }

  private onClick = (event: MouseEvent): void => {
    // Auf Touch-Geräten kein Pointer Lock verwenden
    if (this.isTouchDevice) return;

    // Im Menü nicht sperren
    if ((event.target as Element | null)?.closest('.screen')) return;

    this.controls.lock();
  };

  /** Touch-Steuerung nur während der Jagd anzeigen. */
setHunting(active: boolean): void {
  if (!this.isTouchDevice) return;

  const visible = this.joystick.style.display === 'block';

  if (visible === active) return;

  this.joystick.style.display = active ? 'block' : 'none';

  if (!active) {
    this.resetJoystick();
    this.lookPointerId = null;
  }
}


  /** Maus sperren (Cursor weg, Umschauen mit der Maus) – z. B. direkt bei „Start Hunt". */
  lock(): void {
    if (this.isTouchDevice) return;

    this.controls.lock();
  }

  /** Maus wieder freigeben (z. B. wenn ein Screen wie „Hunt Complete" kommt). */
  unlock(): void {
    this.controls.unlock();
  }

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

    if (this.isTouchDevice) {
      this.joystick.style.display = 'none';

      this.joystick.addEventListener('pointerdown', this.onJoystickDown);
      this.joystick.addEventListener('pointermove', this.onJoystickMove);
      this.joystick.addEventListener('pointerup', this.onJoystickUp);
      this.joystick.addEventListener('pointercancel', this.onJoystickUp);

      document.addEventListener('pointerdown', this.onLookDown);
      document.addEventListener('pointermove', this.onLookMove);
      document.addEventListener('pointerup', this.onLookUp);
      document.addEventListener('pointercancel', this.onLookUp);
    }

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

    if (this.isTouchDevice) {
      this.joystick.style.display = 'none';

      this.joystick.removeEventListener('pointerdown', this.onJoystickDown);
      this.joystick.removeEventListener('pointermove', this.onJoystickMove);
      this.joystick.removeEventListener('pointerup', this.onJoystickUp);
      this.joystick.removeEventListener('pointercancel', this.onJoystickUp);

      this.resetJoystick();

      document.removeEventListener('pointerdown', this.onLookDown);
      document.removeEventListener('pointermove', this.onLookMove);
      document.removeEventListener('pointerup', this.onLookUp);
      document.removeEventListener('pointercancel', this.onLookUp);

      this.lookPointerId = null;

    }
  }

  /** Wird jeden Frame aufgerufen. dt = Sekunden seit dem letzten Frame. */
  update(dt: number): void {
    if (!this.isTouchDevice && !this.controls.isLocked) return;

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

    // Bewegung über den virtuellen Joystick
    if (this.isTouchDevice) {
      this.controls.moveForward(-this.joystickY * distance);
      this.controls.moveRight(this.joystickX * distance);
    }
  }
}
