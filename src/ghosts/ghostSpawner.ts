// ─────────────────────────────────────────────
// BEREICH: Geister spawnen & Modelle   →  Sümi
// ─────────────────────────────────────────────
// Erzeugt die Geister zufällig im Umkreis um einen Mittelpunkt.
// Die Geister kommen NACHEINANDER: am Anfang sind ein paar da, der Rest erscheint nach und nach
// (siehe START_GHOSTS, SPAWN_INTERVAL, MAX_VISIBLE). Böser & Time-Geist kommen nie gleich am Anfang.
// Jeder Geist hat einen Typ (normal, fast, evil, timeadd) mit eigenem Modell.
// Solange ein Modell noch lädt (oder fehlt), wird eine Kugel als Platzhalter angezeigt.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { Ghost, GhostType } from '../types';

// ---------- Einstellungen ----------

export interface SpawnOptions {
  /** Wie viele Geister von welchem Typ */
  mix: Record<GhostType, number>;
  /** Mindestabstand zum Spieler in Metern */
  minRadius: number;
  /** Maximaler Abstand zum Spieler in Metern */
  maxRadius: number;
  /** Mindestabstand der Geister untereinander in Metern */
  minSpacing: number;
}

export const DEFAULT_SPAWN: SpawnOptions = {
  mix: { normal: 3, fast: 1, evil: 1, timeadd: 1 },
  minRadius: 1,
  maxRadius: 2.5,
  minSpacing: 0.6,
};

/** Welche Modelldateien (in public/models/) zu welchem Typ gehören. Bei mehreren wird zufällig gewählt. */
const MODELS: Record<GhostType, string[]> = {
  normal: ['ghost1', 'ghost2'],
  fast: ['flink'],
  evil: ['boese'],
  timeadd: ['timeadd'],
};

/** Höhe der Geister in Metern – die Modelle werden automatisch darauf skaliert */
const HEIGHT: Record<GhostType, number> = {
  normal: 0.45,
  fast: 0.4,
  evil: 0.5,
  timeadd: 0.4,
};

/** Durchsichtigkeit (1 = undurchsichtig) */
const GHOST_OPACITY = 0.85;
/** Wie stark die Geister auf und ab schweben (Meter) */
const FLOAT_AMOUNT = 0.05;
/** Farbe der Aura um den bösen Geist */
const EVIL_AURA_COLOR = '255, 30, 20';
/** Farbe der Aura + Funken beim Time-Geist (Gold) */
const TIME_AURA_COLOR = '255, 200, 60';
/** Anzahl der Funken, die um den Time-Geist kreisen */
const TIME_SPARKS = 3;

/** Wie viele (normale) Geister gleich zu Beginn der Runde da sind */
const START_GHOSTS = 2;
/** Zeitabstand, in dem der nächste Geist erscheint (Sekunden, min–max) */
const SPAWN_INTERVAL: [number, number] = [5, 8];
/** Höchstens so viele Geister gleichzeitig sichtbar – sonst wartet der nächste */
const MAX_VISIBLE = 4;
/** Dauer, in der ein neuer Geist „aufwächst" (Sekunden) */
const APPEAR_DURATION = 0.6;

/** Animation, die abgespielt wird, falls ein Modell Animationen hat (sonst die erste) */
const PREFERRED_ANIMATION = 'Idle';

// ---------- Modelle laden ----------

interface LoadedModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

const loadedModels = new Map<string, LoadedModel>();
/** Alle aktuell existierenden Geister – bekommen ihr Modell, sobald es geladen ist */
const activeGhosts: Ghost[] = [];
/** Animations-Mixer pro Geist (nur für Modelle mit Animationen) */
const mixers = new Map<THREE.Object3D, THREE.AnimationMixer>();

/** Geister, die in dieser Runde noch erscheinen werden (in Reihenfolge) */
let spawnQueue: Ghost[] = [];
let nextSpawnIn = 0;
let spawnCenter = new THREE.Vector3();
let spawnOptions: SpawnOptions = DEFAULT_SPAWN;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder); // die Modelle sind komprimiert (meshopt)

for (const name of new Set(Object.values(MODELS).flat())) {
  loader.load(
    `${import.meta.env.BASE_URL}models/${name}.glb`,
    (gltf) => {
      loadedModels.set(name, { scene: gltf.scene, animations: gltf.animations });
      // Bereits gespawnte Geister mit diesem Modell: Platzhalter ersetzen
      for (const ghost of activeGhosts) {
        if (ghost.object.userData.modelName === name) setModel(ghost);
      }
    },
    undefined,
    () => console.warn(`Modell models/${name}.glb nicht gefunden → Platzhalter-Kugel`),
  );
}

/** Inhalt eines Geists setzen: Modell (falls geladen) oder Platzhalter-Kugel. */
function setModel(ghost: Ghost): void {
  const container = ghost.object;
  container.clear();
  mixers.delete(container);

  if (ghost.type === 'evil') container.add(createAura(HEIGHT.evil, EVIL_AURA_COLOR));
  if (ghost.type === 'timeadd') {
    container.add(createAura(HEIGHT.timeadd, TIME_AURA_COLOR));
    container.add(createSparks(HEIGHT.timeadd));
  }

  const model = loadedModels.get(container.userData.modelName);
  if (!model) {
    container.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(HEIGHT[ghost.type] / 3, 24, 16),
        new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.8 }),
      ),
    );
    return;
  }

  // SkeletonUtils.clone statt .clone(): nötig für animierte Modelle (mit Skelett)
  const instance = SkeletonUtils.clone(model.scene);

  // Animation ZUERST starten → Größe wird aus der animierten Pose berechnet (nicht aus der Ruhepose)
  if (model.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(instance);
    const clip =
      model.animations.find((a) => a.name.includes(PREFERRED_ANIMATION)) ?? model.animations[0];
    mixer.clipAction(clip).play();
    mixer.update(0);
    mixers.set(container, mixer);
  }

  container.add(fitToHeight(instance, HEIGHT[ghost.type]));
}

// ---------- Aura (böser Geist: rot, Time-Geist: gold) ----------

const auraTextures = new Map<string, THREE.Texture>();

/** Weicher Leuchtkreis in einer Farbe als Textur (pro Farbe einmal erzeugt und wiederverwendet). */
function getAuraTexture(color: string): THREE.Texture {
  const cached = auraTextures.get(color);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${color}, 0.9)`);
  gradient.addColorStop(0.4, `rgba(${color}, 0.45)`);
  gradient.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  auraTextures.set(color, texture);
  return texture;
}

/** Aura hinter dem Geist – ein Sprite schaut immer zur Kamera. */
function createAura(height: number, color: string): THREE.Sprite {
  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getAuraTexture(color),
      transparent: true,
      depthWrite: false,
    }),
  );
  aura.scale.setScalar(height * 1.8);
  aura.renderOrder = -1; // hinter dem Geist zeichnen
  aura.userData.isAura = true;
  return aura;
}

/** Goldene Funken, die um den Time-Geist kreisen (wie ein Uhrzeiger). */
function createSparks(height: number): THREE.Group {
  const sparks = new THREE.Group();
  for (let i = 0; i < TIME_SPARKS; i++) {
    const spark = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getAuraTexture(TIME_AURA_COLOR),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // leuchtet heller
      }),
    );
    spark.scale.setScalar(height * 0.25);
    const angle = (i / TIME_SPARKS) * Math.PI * 2;
    spark.position.set(Math.cos(angle) * height * 0.75, 0, Math.sin(angle) * height * 0.75);
    sparks.add(spark);
  }
  sparks.rotation.x = 0.35; // leicht schräge Umlaufbahn
  sparks.userData.isSparks = true;
  return sparks;
}

/** Skaliert das Modell auf die gewünschte Höhe, zentriert es und macht es leicht durchsichtig. */
function fitToHeight(model: THREE.Object3D, height: number): THREE.Object3D {
  // Bei animierten Modellen (SkinnedMesh) hängt die Größe von den Knochen ab:
  // erst alle Positionen aktualisieren, dann die Größe neu berechnen – sonst wird
  // das Modell falsch skaliert und verschoben (war beim Timeadd-Geist so).
  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) {
      child.computeBoundingBox();
      child.computeBoundingSphere();
      child.frustumCulled = false; // animierte Modelle sonst evtl. fälschlich ausgeblendet
    }
  });
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const scale = height / (size.y || 1);
  model.scale.setScalar(scale);
  model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));

  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Material pro Geist klonen → später kann z. B. ein einzelner Geist bei UV-Licht leuchten
      const materials = (Array.isArray(child.material) ? child.material : [child.material]).map(
        (m: THREE.Material) => {
          const clone = m.clone();
          clone.transparent = true;
          clone.opacity *= GHOST_OPACITY;
          clone.depthWrite = false; // verhindert Darstellungsfehler bei Durchsichtigkeit
          return clone;
        },
      );
      child.material = Array.isArray(child.material) ? materials : materials[0];
    }
  });

  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

// ---------- Spawnen ----------

/**
 * @param center Startpunkt des Spielers (AR: 0,0,0 = Augenhöhe beim Start; Desktop: Kameraposition)
 */
export function spawnGhosts(
  scene: THREE.Scene,
  center: THREE.Vector3,
  options: SpawnOptions = DEFAULT_SPAWN,
): Ghost[] {
  spawnCenter = center.clone();
  spawnOptions = options;

  const ghosts: Ghost[] = spawnOrder(options.mix).map((type, id) => {
    const container = new THREE.Group();
    const variants = MODELS[type];
    container.userData.modelName = variants[Math.floor(Math.random() * variants.length)];
    container.userData.floatOffset = Math.random() * Math.PI * 2; // nicht alle schweben gleich
    // Noch nicht erschienen → unsichtbar (game/ ignoriert unsichtbare Geister)
    container.visible = false;
    scene.add(container);

    const ghost: Ghost = { id, type, object: container, caught: false };
    setModel(ghost);
    activeGhosts.push(ghost);
    return ghost;
  });

  // Die ersten sind sofort da, der Rest kommt nach und nach
  const startCount = Math.min(START_GHOSTS, ghosts.length);
  for (const ghost of ghosts.slice(0, startCount)) appear(ghost, false);
  spawnQueue = ghosts.slice(startCount);
  nextSpawnIn = randomBetween(...SPAWN_INTERVAL);

  return ghosts;
}

/**
 * Reihenfolge, in der die Geister erscheinen:
 * zuerst normale, dann ein normaler/flinker, danach der Rest (inkl. böse & Time) gemischt.
 */
function spawnOrder(mix: Record<GhostType, number>): GhostType[] {
  const all = (Object.keys(mix) as GhostType[]).flatMap((type) => Array<GhostType>(mix[type]).fill(type));
  const order: GhostType[] = [];
  const takeFirst = (allowed: GhostType[]) => {
    const candidates = all.filter((t) => allowed.includes(t));
    if (candidates.length === 0) return;
    const type = candidates[Math.floor(Math.random() * candidates.length)];
    all.splice(all.indexOf(type), 1);
    order.push(type);
  };
  for (let i = 0; i < START_GHOSTS; i++) takeFirst(['normal']);
  takeFirst(['normal', 'fast']); // der erste Nachzügler ist auch noch „harmlos"
  // Rest mischen
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return [...order, ...all];
}

/** Lässt einen Geist erscheinen: freie Position suchen, sichtbar machen, (optional) aufwachsen. */
function appear(ghost: Ghost, animate: boolean): void {
  const container = ghost.object;
  const others = activeGhosts.filter((g) => g !== ghost && g.object.visible);
  const position = findFreePosition(spawnCenter, others, spawnOptions);
  container.position.copy(position);
  container.userData.baseY = position.y;
  // Geist schaut zum Spieler (nur um die Hochachse drehen)
  container.lookAt(spawnCenter.x, position.y, spawnCenter.z);
  container.userData.appearTime = animate ? 0 : APPEAR_DURATION;
  container.scale.setScalar(animate ? 0.01 : 1);
  container.visible = true;
}

/** Sucht eine zufällige Position im Radius, die nicht zu nah an anderen Geistern liegt. */
function findFreePosition(center: THREE.Vector3, others: Ghost[], options: SpawnOptions): THREE.Vector3 {
  let position = new THREE.Vector3();
  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = options.minRadius + Math.random() * (options.maxRadius - options.minRadius);
    const heightOffset = -0.7 + Math.random() * 0.9; // von ca. 70 cm unter bis 20 cm über Augenhöhe
    position = new THREE.Vector3(
      center.x + Math.cos(angle) * distance,
      center.y + heightOffset,
      center.z + Math.sin(angle) * distance,
    );
    if (others.every((g) => g.object.position.distanceTo(position) >= options.minSpacing)) break;
  }
  return position;
}

export function removeGhosts(scene: THREE.Scene, ghosts: Ghost[]): void {
  spawnQueue = spawnQueue.filter((g) => !ghosts.includes(g));
  for (const ghost of ghosts) {
    scene.remove(ghost.object);
    mixers.delete(ghost.object);
    const index = activeGhosts.indexOf(ghost);
    if (index !== -1) activeGhosts.splice(index, 1);
  }
}

/**
 * Jeden Frame aufrufen (aus main.ts): neue Geister erscheinen lassen, Schweben + Animationen.
 * dt = Sekunden seit letztem Frame.
 * @returns die Geister, die in diesem Frame neu erschienen sind (z. B. für einen Sound)
 */
export function updateGhosts(dt: number): Ghost[] {
  const appeared: Ghost[] = [];

  // Nächsten Geist erscheinen lassen (nur wenn nicht schon zu viele da sind)
  if (spawnQueue.length > 0) {
    nextSpawnIn -= dt;
    const visibleCount = activeGhosts.filter((g) => g.object.visible && !g.caught).length;
    if (nextSpawnIn <= 0 && visibleCount < MAX_VISIBLE) {
      const ghost = spawnQueue.shift()!;
      appear(ghost, true);
      appeared.push(ghost);
      nextSpawnIn = randomBetween(...SPAWN_INTERVAL);
    }
  }

  const t = performance.now() / 1000;
  for (const ghost of activeGhosts) {
    const obj = ghost.object;
    if (!obj.visible) continue;

    // Aufwachsen nach dem Erscheinen (mit leichtem Überschwingen)
    if (obj.userData.appearTime < APPEAR_DURATION) {
      obj.userData.appearTime = Math.min(APPEAR_DURATION, obj.userData.appearTime + dt);
      const p = obj.userData.appearTime / APPEAR_DURATION;
      const s = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); // easeOutBack
      obj.scale.setScalar(Math.max(0.01, s));
    }

    obj.position.y = obj.userData.baseY + Math.sin(t * 1.5 + obj.userData.floatOffset) * FLOAT_AMOUNT;
    mixers.get(obj)?.update(dt);

    // Aura des bösen Geists pulsiert unruhig
    if (ghost.type === 'evil') {
      const aura = obj.children.find((c) => c.userData.isAura) as THREE.Sprite | undefined;
      if (aura) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + obj.userData.floatOffset);
        const flicker = Math.random() < 0.05 ? 0.3 : 0; // ab und zu kurz flackern
        aura.material.opacity = 0.55 + 0.35 * pulse - flicker;
        aura.scale.setScalar(HEIGHT.evil * (1.6 + 0.3 * pulse));
      }
    }

    // Time-Geist: Aura „tickt" ruhig im Sekundentakt, Funken kreisen
    if (ghost.type === 'timeadd') {
      const aura = obj.children.find((c) => c.userData.isAura) as THREE.Sprite | undefined;
      if (aura) {
        const tick = Math.pow(1 - (t % 1), 3); // kurzer Puls jede Sekunde
        aura.material.opacity = 0.45 + 0.4 * tick;
        aura.scale.setScalar(HEIGHT.timeadd * (1.5 + 0.25 * tick));
      }
      const sparks = obj.children.find((c) => c.userData.isSparks);
      if (sparks) sparks.rotation.y = t * 2.5;
    }
  }
  // TODO (später): flinke Geister / Bewegung durch den Raum (für Levels)
  return appeared;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
