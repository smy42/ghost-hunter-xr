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
  private wallColliders: THREE.Box3[] = [];
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
    // Haunted House – dunkler Holzboden
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({
        color: 0x49352e,
        roughness: 0.95,
        metalness: 0,
      }),
    );

    floor.rotation.x = -Math.PI / 2;
    this.room.add(floor);

    // Dezente Holzdielen
    const plankMaterial = new THREE.MeshStandardMaterial({
      color: 0x241a18,
    });

    for (let x = -10; x <= 10; x += 1) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.005, 20),
        plankMaterial,
      );

      line.position.set(x, 0.004, 0);
      this.room.add(line);
    }

    // Schwache Grundbeleuchtung für das Haunted House
    const ambientLight = new THREE.AmbientLight(0x8b88a8, 1.2);
    this.room.add(ambientLight);

    // Haunted House – Außenwände
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x514b55,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    const wallHeight = 3.5;
    const wallThickness = 0.3;
    const houseSize = 20;

    const createWall = (
      width: number,
      depth: number,
      x: number,
      z: number,
    ): void => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(width, wallHeight, depth),
        wallMaterial,
      );

      wall.position.set(x, wallHeight / 2, z);
      this.room.add(wall);
      // Kollisionsbereich der Wand speichern
      wall.updateMatrixWorld(true);
      this.wallColliders.push(new THREE.Box3().setFromObject(wall));
    };

    // Hintere und vordere Wand
    createWall(houseSize, wallThickness, 0, -10);
    createWall(houseSize, wallThickness, 0, 10);

    // Linke und rechte Wand
    createWall(wallThickness, houseSize, -10, 0);
    createWall(wallThickness, houseSize, 10, 0);

    // Vier Zimmer mit zentralem Flur (Breite 3 m).
    // Türöffnungen bei z = -5 und z = 5, jeweils 2 m breit.
    for (const x of [-1.5, 1.5]) {
      createWall(wallThickness, 4, x, -8);
      createWall(wallThickness, 8, x, 0);
      createWall(wallThickness, 4, x, 8);
    }
    createWall(8.5, wallThickness, -5.75, 0);
    createWall(8.5, wallThickness, 5.75, 0);

    // ─────────────────────────────────────────
    // Haunted House – Wohnzimmer
    // ─────────────────────────────────────────

    // Materialien
    const sofaMaterial = new THREE.MeshStandardMaterial({
      color: 0x512b38,
      roughness: 0.95,
    });

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x35231c,
      roughness: 0.9,
    });

    const carpetMaterial = new THREE.MeshStandardMaterial({
      color: 0x463247,
      roughness: 1,
    });

    // Hilfsfunktion für einfache Möbelteile
    const createFurniturePart = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
      solid = false,
    ): void => {
      const part = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material,
      );

      part.position.set(x, y, z);
      this.room.add(part);
      if (solid) {
        part.updateMatrixWorld(true);
        this.wallColliders.push(new THREE.Box3().setFromObject(part));
      }
    };

    // Alter Teppich
    createFurniturePart(
      3.5, 0.02, 2.5,
      -6, 0.025, -5,
      carpetMaterial,
    );

    // Sofa – Sitzfläche
    createFurniturePart(
      2.8, 0.45, 1,
      -6, 0.45, -7,
      sofaMaterial,
    );

    // Sofa – Rückenlehne
    createFurniturePart(
      2.8, 1, 0.3,
      -6, 0.85, -7.55,
      sofaMaterial,
    );

    // Sofa – Armlehnen
    createFurniturePart(
      0.3, 0.7, 1,
      -7.55, 0.65, -7,
      sofaMaterial,
    );

    createFurniturePart(
      0.3, 0.7, 1,
      -4.45, 0.65, -7,
      sofaMaterial,
    );

    // Couchtisch – Tischplatte
    createFurniturePart(
      1.8, 0.15, 0.9,
      -6, 0.55, -5,
      woodMaterial,
    );

    // Couchtisch – vier Beine
    for (const x of [-6.7, -5.3]) {
      for (const z of [-5.3, -4.7]) {
        createFurniturePart(
          0.12, 0.5, 0.12,
          x, 0.25, z,
          woodMaterial,
        );
      }
    }

    // Möbelkollisionen als kompakte Boxen (ohne Teppiche).
    const addFurnitureCollider = (x: number, z: number, w: number, d: number): void => {
      this.wallColliders.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, 0, z - d / 2),
        new THREE.Vector3(x + w / 2, 2.8, z + d / 2),
      ));
    };
    addFurnitureCollider(-6, -7.15, 3.2, 1.4); // Sofa
    addFurnitureCollider(-6, -5, 1.8, 0.9);    // Couchtisch

    // Alter Fernseher gegenüber dem Sofa (Blickrichtung zur hinteren Wand).
    // Fernseher steht an der Trennwand bei z = 0, weit weg vom Türdurchgang.
    const tvCase = new THREE.MeshStandardMaterial({ color: 0x201b20, roughness: 0.75 });
    const tvScreen = new THREE.MeshBasicMaterial({ color: 0x253c37 });
    const tvGlow = new THREE.MeshBasicMaterial({ color: 0x7ba69b, transparent: true, opacity: 0.55 });
    // Niedriges TV-Möbel an der Wand
    createFurniturePart(2.5, 0.55, 0.55, -6, 0.275, -0.65, woodMaterial);
    // Fernseher: Bildschirm zeigt zum Sofa (Richtung -Z)
    createFurniturePart(2.0, 1.15, 0.18, -6, 1.32, -0.65, tvCase);
    createFurniturePart(1.78, 0.92, 0.025, -6, 1.34, -0.755, tvScreen);
    // Dezente, unheimliche grüne Bildstörung
    createFurniturePart(1.62, 0.018, 0.03, -6, 1.42, -0.78, tvGlow);
    createFurniturePart(1.45, 0.014, 0.03, -6, 1.16, -0.78, tvGlow);
    // Standfuß
    createFurniturePart(0.22, 0.16, 0.2, -6, 0.68, -0.65, tvCase);
    addFurnitureCollider(-6, -0.65, 2.5, 0.55);

    // Schlafzimmer (rechts oben): Bett an der Rückwand, Schrank seitlich.
    const bedWood = new THREE.MeshStandardMaterial({ color: 0x38251e, roughness: 0.9 });
    const mattress = new THREE.MeshStandardMaterial({ color: 0xb5a99b, roughness: 1 });
    const blanket = new THREE.MeshStandardMaterial({ color: 0x59313d, roughness: 1 });
    const pillow = new THREE.MeshStandardMaterial({ color: 0xc9c0b5, roughness: 1 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xa68a56, metalness: 0.35, roughness: 0.55 });

    createFurniturePart(2.4, 0.35, 3.2, 5.5, 0.35, -7.8, bedWood);
    createFurniturePart(2.2, 0.25, 3, 5.5, 0.65, -7.8, mattress);
    createFurniturePart(2.2, 0.08, 1.9, 5.5, 0.82, -7.35, blanket);
    createFurniturePart(2.5, 1.4, 0.2, 5.5, 0.9, -9.5, bedWood);
    for (const x of [4.95, 6.05]) {
      createFurniturePart(0.85, 0.12, 0.55, x, 0.84, -8.8, pillow);
    }
    createFurniturePart(0.8, 0.7, 0.7, 7.5, 0.35, -8.5, bedWood);
    createFurniturePart(0.7, 2.5, 1.5, 9.35, 1.25, -3, bedWood);
    createFurniturePart(0.035, 2.2, 0.035, 8.98, 1.25, -3, brass);
    createFurniturePart(2.8, 0.02, 2, 5.5, 0.025, -4.3, carpetMaterial);
    addFurnitureCollider(5.5, -7.8, 2.5, 3.4);
    addFurnitureCollider(7.5, -8.5, 0.8, 0.7);
    addFurnitureCollider(9.35, -3, 0.7, 1.5);

    // Küche (links unten): Küchenzeile an der Außenwand und Esstisch.
    const counter = new THREE.MeshStandardMaterial({ color: 0x65534a, roughness: 0.9 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x888080, roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.65, metalness: 0.2 });
    createFurniturePart(0.85, 0.85, 4.8, -9.15, 0.425, 5, counter);
    createFurniturePart(0.95, 0.12, 4.9, -9.15, 0.91, 5, stone);
    // Zwei dunkle Herdplatten auf der Arbeitsplatte
    for (const z of [3.9, 4.5]) {
      createFurniturePart(0.45, 0.025, 0.45, -9.15, 0.99, z, iron);
    }
    // Spüle und Wasserhahn
    createFurniturePart(0.65, 0.02, 0.8, -9.15, 0.99, 6.3, iron);
    createFurniturePart(0.06, 0.45, 0.06, -9.15, 1.22, 6.3, brass);
    // Esstisch mit vier Beinen
    createFurniturePart(1.7, 0.12, 1.2, -5.7, 0.8, 6.7, woodMaterial);
    for (const x of [-6.35, -5.05]) {
      for (const z of [6.25, 7.15]) {
        createFurniturePart(0.12, 0.74, 0.12, x, 0.37, z, woodMaterial);
      }
    }
    // Zwei einfache Hocker
    for (const z of [5.6, 7.8]) {
      createFurniturePart(0.65, 0.12, 0.65, -5.7, 0.52, z, counter);
      createFurniturePart(0.18, 0.48, 0.18, -5.7, 0.24, z, woodMaterial);
    }
    addFurnitureCollider(-9.15, 5, 0.95, 4.9);
    addFurnitureCollider(-5.7, 6.7, 1.8, 1.3);
    addFurnitureCollider(-5.7, 5.6, 0.65, 0.65);
    addFurnitureCollider(-5.7, 7.8, 0.65, 0.65);

    // Abstellraum (rechts unten): Regale, Kisten und ein alter Schrank.
    const shelf = new THREE.MeshStandardMaterial({ color: 0x46332b, roughness: 1 });
    const crate = new THREE.MeshStandardMaterial({ color: 0x76543a, roughness: 1 });
    for (const z of [2.5, 4.5, 6.5, 8.5]) {
      createFurniturePart(0.85, 0.1, 1.6, 9, 0.5, z, shelf);
      createFurniturePart(0.85, 0.1, 1.6, 9, 1.3, z, shelf);
      createFurniturePart(0.85, 0.1, 1.6, 9, 2.1, z, shelf);
    }
    for (const z of [2.2, 3.8, 5.4, 7, 8.6]) {
      createFurniturePart(0.12, 2.5, 0.12, 9.4, 1.25, z, shelf);
    }
    createFurniturePart(1.2, 1.1, 1.2, 5.5, 0.55, 8.7, crate);
    createFurniturePart(0.9, 0.65, 0.9, 7.2, 0.325, 8.9, crate);
    createFurniturePart(1.4, 2, 0.65, 5, 1, 0.52, shelf);
    addFurnitureCollider(9, 5.5, 0.9, 8.3);
    addFurnitureCollider(5.5, 8.7, 1.2, 1.2);
    addFurnitureCollider(7.2, 8.9, 0.9, 0.9);
    addFurnitureCollider(5, 0.52, 1.4, 0.65);

    // ─────────────────────────────────────────
    // Spukhaus-Dekoration: Wandbilder, Lampen, Kerzen und Spinnweben
    // Alles bewusst an den Wänden bzw. in Ecken platziert.
    // Keine zusätzlichen Hindernisse in den Laufwegen.
    // ─────────────────────────────────────────
    const goldFrame = new THREE.MeshStandardMaterial({ color: 0x73562f, metalness: 0.35, roughness: 0.6 });
    const painting = new THREE.MeshStandardMaterial({ color: 0x171921, roughness: 1 });
    const ghostWhite = new THREE.MeshBasicMaterial({ color: 0xb6c5c6, transparent: true, opacity: 0.65 });
    const lampMetal = new THREE.MeshStandardMaterial({ color: 0x4b413b, metalness: 0.5, roughness: 0.6 });
    const warmGlass = new THREE.MeshBasicMaterial({ color: 0xffb46b });
    const cobweb = new THREE.LineBasicMaterial({ color: 0xa6a4b3, transparent: true, opacity: 0.33 });

    // Flache Gemälde an Wänden parallel zur X-Achse.
    const addPainting = (x: number, y: number, z: number, width = 1.25): void => {
      createFurniturePart(width + 0.16, 1.15, 0.09, x, y, z, goldFrame);
      createFurniturePart(width, 0.99, 0.105, x, y, z + 0.012, painting);
      // Silhouette im Gemälde: Kopf und Körper, ohne externe Bilddatei.
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), ghostWhite);
      head.position.set(x, y + 0.13, z + 0.075);
      this.room.add(head);
      createFurniturePart(0.25, 0.34, 0.015, x, y - 0.2, z + 0.075, ghostWhite);
    };
    // Hintere Wände: Wohnzimmer und Schlafzimmer.
    addPainting(-7.8, 2.05, -9.79);
    addPainting(7.5, 2.05, -9.79, 0.95);
    // Vorderwand: Küche und Abstellraum (Bilder zeigen in den Raum).
    addPainting(-7.4, 2.0, 9.79, 1.0);
    addPainting(7.0, 2.0, 9.79, 1.0);

    // Wandlampen mit warmem Schimmer, an den Außenwänden befestigt.
    const addSconce = (x: number, z: number, facing: 1 | -1): void => {
      createFurniturePart(0.32, 0.4, 0.12, x, 2.2, z, lampMetal);
      createFurniturePart(0.1, 0.12, 0.32, x, 2.05, z + facing * 0.17, lampMetal);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), warmGlass);
      bulb.position.set(x, 2.12, z + facing * 0.35);
      this.room.add(bulb);
      const glow = new THREE.PointLight(0xffa663, 3, 3.5, 2);
      glow.position.copy(bulb.position);
      this.room.add(glow);
    };
    addSconce(-3.8, -9.78, 1);
    addSconce(3.8, -9.78, 1);
    addSconce(-3.8, 9.78, -1);
    addSconce(3.8, 9.78, -1);

    // Kleine Kerzen auf dem Couchtisch und Nachttisch.
    const wax = new THREE.MeshStandardMaterial({ color: 0xd7c9b4, roughness: 1 });
    const flame = new THREE.MeshBasicMaterial({ color: 0xffc56a });
    const addCandle = (x: number, y: number, z: number): void => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.19, 9), wax);
      body.position.set(x, y + 0.095, z);
      this.room.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 8), flame);
      tip.position.set(x, y + 0.24, z);
      this.room.add(tip);
    };
    addCandle(-6.4, 0.64, -5);
    addCandle(-6.15, 0.64, -5.1);
    addCandle(7.5, 0.7, -8.5);

    // Spinnweben: Linienfächer in oberen Zimmerecken.
    const addCobweb = (cornerX: number, cornerZ: number, signX: number, signZ: number): void => {
      const pts: THREE.Vector3[] = [];
      const anchor = new THREE.Vector3(cornerX, 3.25, cornerZ);
      for (let i = 0; i <= 5; i++) {
        const a = (i / 5) * Math.PI / 2;
        pts.push(anchor, new THREE.Vector3(
          cornerX + signX * Math.cos(a) * 1.1,
          3.25 - 0.28 * Math.sin(a * 2),
          cornerZ + signZ * Math.sin(a) * 1.1,
        ));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(pts);
      this.room.add(new THREE.LineSegments(geometry, cobweb));
    };
    addCobweb(-9.65, -9.65, 1, 1);
    addCobweb(9.65, -9.65, -1, 1);
    addCobweb(-9.65, 9.65, 1, -1);
    addCobweb(9.65, 9.65, -1, -1);

    // Stimmungslicht in jedem Zimmer; unabhängig vom UV-Licht.
    const addRoomLight = (x: number, z: number, color: number, intensity: number): void => {
      const light = new THREE.PointLight(color, intensity, 8, 2);
      light.position.set(x, 2.8, z);
      this.room.add(light);
    };
    addRoomLight(-6, -5, 0xffb26d, 16);
    addRoomLight(6, -5, 0x9b83ff, 14);
    addRoomLight(-6, 5, 0xffa36c, 15);
    addRoomLight(6, 5, 0x7bb7a1, 12);
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

  /** Joystick nur während des aktiven Spiels anzeigen. */
  setJoystickVisible(visible: boolean): void {
    if (!this.joystickBase) return;

    this.joystickBase.style.display = visible ? 'block' : 'none';

    if (!visible) {
      this.joystickX = 0;
      this.joystickY = 0;

      if (this.joystickKnob) {
        this.joystickKnob.style.transform = 'translate(-50%, -50%)';
      }
    }
  }


  enable(): void {
    this.scene.add(this.room);
    // Kamera zur Szene hinzufügen, damit das UV-Licht funktioniert
    this.scene.add(this.camera);
    this.scene.background = new THREE.Color(0x11141b);
    this.camera.position.copy(this.playerPosition);
    // First-Person-Kamera: erst horizontal, dann vertikal drehen
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(0, 0, 0);

    document.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);

    this.createJoystick();
    this.setupJoystick();
    this.joystickBase?.style.setProperty('display', 'none');

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


  /** Prüft, ob eine Position im Haunted House frei ist. */
  isGhostPositionFree(position: THREE.Vector3): boolean {
    const ghostRadius = 0.3;

    // Nicht außerhalb des Hauses spawnen
    if (
      Math.abs(position.x) > 9.5 ||
      Math.abs(position.z) > 9.5
    ) {
      return false;
    }

    const ghostBox = new THREE.Box3(
      new THREE.Vector3(
        position.x - ghostRadius,
        0.3,
        position.z - ghostRadius,
      ),
      new THREE.Vector3(
        position.x + ghostRadius,
        2,
        position.z + ghostRadius,
      ),
    );

    return !this.wallColliders.some((collider) =>
      collider.intersectsBox(ghostBox),
    );
  }



  // Prüft, ob der Spieler mit einer Wand kollidiert
  private collidesWithWall(position: THREE.Vector3): boolean {
    const playerRadius = 0.3;

    const playerBox = new THREE.Box3(
      new THREE.Vector3(
        position.x - playerRadius,
        0,
        position.z - playerRadius,
      ),
      new THREE.Vector3(
        position.x + playerRadius,
        DESKTOP_EYE_HEIGHT + 0.2,
        position.z + playerRadius,
      ),
    );

    return this.wallColliders.some((wall) =>
      wall.intersectsBox(playerBox),
    );
  }


  /** Wird jeden Frame aufgerufen. dt = Sekunden seit dem letzten Frame. */
  update(dt: number): void {
    // Desktop benötigt PointerLock, Touch nicht
    if (!this.isTouchDevice && !this.controls.isLocked) return;

    const distance = this.moveSpeed * dt;

    // Position vor der Bewegung merken
    const oldPosition = this.camera.position.clone();

    if (this.isTouchDevice) {
      this.controls.moveForward(-this.joystickY * distance);
      this.controls.moveRight(this.joystickX * distance);
    } else {
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

    // Neue Position prüfen
    const newPosition = this.camera.position.clone();

    // Erst X-Bewegung prüfen
    const testX = new THREE.Vector3(
      newPosition.x,
      oldPosition.y,
      oldPosition.z,
    );

    if (this.collidesWithWall(testX)) {
      this.camera.position.x = oldPosition.x;
    }

    // Danach Z-Bewegung prüfen
    const testZ = new THREE.Vector3(
      this.camera.position.x,
      oldPosition.y,
      newPosition.z,
    );

    if (this.collidesWithWall(testZ)) {
      this.camera.position.z = oldPosition.z;
    }

    // Spieler bleibt auf Augenhöhe
    this.camera.position.y = DESKTOP_EYE_HEIGHT;
  }

}
