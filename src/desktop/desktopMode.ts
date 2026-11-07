// ─────────────────────────────────────────────
// BEREICH: 3D-Modus (Desktop)   →  Person B
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

  // UV-Taschenlampe für den 3D-Modus
  private uvLight = new THREE.SpotLight(
    0x9670ff,     // sanftes Violett
    25,           // Intensität
    12,           // Reichweite
    Math.PI / 6,  // schmalerer Lichtkegel
    0.4,          // weicher Rand
    1
  );

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;

  private moveSpeed = 3;

  private readonly isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

  private joystickBase: HTMLDivElement | null = null;
  private joystickKnob: HTMLDivElement | null = null;

  private joystickX = 0;
  private joystickY = 0;

  private lookPointerId: number | null = null;
  private lastTouchX = 0;
  private lastTouchY = 0;

  private readonly touchSensitivity = 0.003;
  private readonly maxPitch = Math.PI / 2 - 0.05;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.controls = new PointerLockControls(this.camera, document.body);
    // UV-Taschenlampe an der Kamera befestigen
    this.uvLight.position.set(0, -0.1, 0);

    // Licht nach vorne ausrichten
    this.uvLight.target.position.set(0, 0, -1);

    this.camera.add(this.uvLight);
    this.camera.add(this.uvLight.target);
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

  private onClick = (event: MouseEvent): void => {
    if (this.isTouchDevice) return;

    // Im Menü nicht sperren
    if ((event.target as Element | null)?.closest('.screen')) return;

    this.controls.lock();
  };

  /** Maus sperren (Cursor weg, Umschauen mit der Maus) – z. B. direkt bei „Start Hunt". */
  lock(): void {
    if (this.isTouchDevice) return;

    this.controls.lock();
  }

  /** Maus wieder freigeben (z. B. wenn ein Screen wie „Hunt Complete" kommt). */
  unlock(): void {
    this.controls.unlock();
  }

  /** UV-Taschenlampe ein- oder ausschalten. */
  setUvLight(on: boolean): void {
    this.uvLight.visible = on;
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

  private createJoystick(): void {
    if (!this.isTouchDevice || this.joystickBase) return;

    const base = document.createElement('div');
    base.style.cssText = `
    position: fixed;
    left: 30px;
    bottom: 35px;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(255, 255, 255, 0.4);
    z-index: 1000;
    touch-action: none;
    user-select: none;
  `;

    const knob = document.createElement('div');
    knob.style.cssText = `
    position: absolute;
    left: 50%;
top: 50%;
transform: translate(-50%, -50%);
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: rgba(79, 227, 154, 0.8);
    pointer-events: none;
  `;

    base.appendChild(knob);
    document.body.appendChild(base);

    this.joystickBase = base;
    this.joystickKnob = knob;
  }


  private setupJoystick(): void {
    const base = this.joystickBase;
    const knob = this.joystickKnob;

    if (!base || !knob) return;

    let activePointerId: number | null = null;
    const maxDistance = 35;

    const resetJoystick = (): void => {
      activePointerId = null;
      this.joystickX = 0;
      this.joystickY = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };

    const updateJoystick = (event: PointerEvent): void => {
      const rect = base.getBoundingClientRect();

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let dx = event.clientX - centerX;
      let dy = event.clientY - centerY;

      const distance = Math.hypot(dx, dy);

      if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
      }

      this.joystickX = dx / maxDistance;
      this.joystickY = dy / maxDistance;

      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    base.addEventListener('pointerdown', (event) => {
      if (activePointerId !== null) return;

      event.preventDefault();
      activePointerId = event.pointerId;
      base.setPointerCapture(event.pointerId);
      updateJoystick(event);
    });

    base.addEventListener('pointermove', (event) => {
      if (event.pointerId !== activePointerId) return;

      event.preventDefault();
      updateJoystick(event);
    });

    base.addEventListener('pointerup', (event) => {
      if (event.pointerId !== activePointerId) return;
      resetJoystick();
    });

    base.addEventListener('pointercancel', (event) => {
      if (event.pointerId !== activePointerId) return;
      resetJoystick();
    });

    base.addEventListener('lostpointercapture', resetJoystick);
  }


  private onTouchLookStart = (event: PointerEvent): void => {
    if (!this.isTouchDevice || this.lookPointerId !== null) return;

    // Nur die rechte Bildschirmhälfte verwenden
    if (event.clientX < window.innerWidth / 2) return;

    // Buttons und Menüs nicht blockieren
    if ((event.target as Element | null)?.closest('button, .screen')) return;

    if (event.pointerType !== 'touch') return;
    event.preventDefault();

    this.lookPointerId = event.pointerId;
    this.lastTouchX = event.clientX;
    this.lastTouchY = event.clientY;
  };

  private onTouchLookMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointerId) return;
    event.preventDefault();

    const deltaX = event.clientX - this.lastTouchX;
    const deltaY = event.clientY - this.lastTouchY;

    this.lastTouchX = event.clientX;
    this.lastTouchY = event.clientY;

    // Horizontal drehen
    this.camera.rotation.y -= deltaX * this.touchSensitivity;

    // Vertikal drehen und begrenzen
    this.camera.rotation.x = THREE.MathUtils.clamp(
      this.camera.rotation.x - deltaY * this.touchSensitivity,
      -this.maxPitch,
      this.maxPitch,
    );
  };

  private onTouchLookEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
    }
  };

  enable(): void {
    this.scene.add(this.room);
    // Kamera zur Szene hinzufügen, damit das UV-Licht funktioniert
    this.scene.add(this.camera);
    this.scene.background = new THREE.Color(0x11141b);
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);

    document.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);

    this.createJoystick();
    this.setupJoystick();

    if (this.isTouchDevice) {
      document.addEventListener('pointerdown', this.onTouchLookStart);
      document.addEventListener('pointermove', this.onTouchLookMove);
      document.addEventListener('pointerup', this.onTouchLookEnd);
      document.addEventListener('pointercancel', this.onTouchLookEnd);
    }

    if (this.isTouchDevice) {
      document.body.style.touchAction = 'none';
    }

  }

  disable(): void {
    this.scene.remove(this.room);
    this.scene.background = null; // in AR muss der Hintergrund durchsichtig sein

    document.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.controls.unlock();

    this.joystickBase?.remove();
    this.joystickBase = null;
    this.joystickKnob = null;
    this.joystickX = 0;
    this.joystickY = 0;

    document.removeEventListener('pointerdown', this.onTouchLookStart);
    document.removeEventListener('pointermove', this.onTouchLookMove);
    document.removeEventListener('pointerup', this.onTouchLookEnd);
    document.removeEventListener('pointercancel', this.onTouchLookEnd);

    this.lookPointerId = null;

    if (this.isTouchDevice) {
      document.body.style.touchAction = '';
    }

  }



  /** Wird jeden Frame aufgerufen. dt = Sekunden seit dem letzten Frame. */
  update(dt: number): void {
    // Desktop benötigt PointerLock, Touch nicht
    if (!this.isTouchDevice && !this.controls.isLocked) return;

    const distance = this.moveSpeed * dt;

    if (this.isTouchDevice) {
      this.controls.moveForward(-this.joystickY * distance);
      this.controls.moveRight(this.joystickX * distance);
      return;
    }

    // WASD-Steuerung für Desktop
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
