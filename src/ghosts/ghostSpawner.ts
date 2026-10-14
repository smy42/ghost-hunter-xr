// ─────────────────────────────────────────────
// BEREICH: Geister spawnen & Modelle   →  Sümi
// ─────────────────────────────────────────────
// Erzeugt die Geister zufällig im Umkreis um einen Mittelpunkt.
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
  timeadd: 0.45,
};

/** Durchsichtigkeit (1 = undurchsichtig) */
const GHOST_OPACITY = 0.85;
/** Wie stark die Geister auf und ab schweben (Meter) */
const FLOAT_AMOUNT = 0.05;
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
  container.add(fitToHeight(instance, HEIGHT[ghost.type]));

  if (model.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(instance);
    const clip =
      model.animations.find((a) => a.name.includes(PREFERRED_ANIMATION)) ?? model.animations[0];
    mixer.clipAction(clip).play();
    mixers.set(container, mixer);
  }
}

/** Skaliert das Modell auf die gewünschte Höhe, zentriert es und macht es leicht durchsichtig. */
function fitToHeight(model: THREE.Object3D, height: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(model);
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
  const ghosts: Ghost[] = [];
  const types = (Object.keys(options.mix) as GhostType[]).flatMap((type) =>
    Array<GhostType>(options.mix[type]).fill(type),
  );

  types.forEach((type, id) => {
    const container = new THREE.Group();
    const variants = MODELS[type];
    container.userData.modelName = variants[Math.floor(Math.random() * variants.length)];

    const position = findFreePosition(center, ghosts, options);
    container.position.copy(position);
    container.userData.baseY = position.y;
    container.userData.floatOffset = Math.random() * Math.PI * 2; // nicht alle schweben gleich
    // Geist schaut zum Spieler (nur um die Hochachse drehen)
    container.lookAt(center.x, position.y, center.z);
    scene.add(container);

    const ghost: Ghost = { id, type, object: container, caught: false };
    setModel(ghost);
    ghosts.push(ghost);
    activeGhosts.push(ghost);
  });

  return ghosts;
}

/** Sucht eine zufällige Position im Radius, die nicht zu nah an anderen Geistern liegt. */
function findFreePosition(center: THREE.Vector3, others: Ghost[], options: SpawnOptions): THREE.Vector3 {
  let position = new THREE.Vector3();
  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = options.minRadius + Math.random() * (options.maxRadius - options.minRadius);
    const heightOffset = -0.3 + Math.random() * 0.6; // etwa Augenhöhe ± 30 cm
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
  for (const ghost of ghosts) {
    scene.remove(ghost.object);
    mixers.delete(ghost.object);
    const index = activeGhosts.indexOf(ghost);
    if (index !== -1) activeGhosts.splice(index, 1);
  }
}

/** Jeden Frame aufrufen (aus main.ts): Schweben + Animationen. dt = Sekunden seit letztem Frame. */
export function updateGhosts(dt: number): void {
  const t = performance.now() / 1000;
  for (const ghost of activeGhosts) {
    const obj = ghost.object;
    obj.position.y = obj.userData.baseY + Math.sin(t * 1.5 + obj.userData.floatOffset) * FLOAT_AMOUNT;
    mixers.get(obj)?.update(dt);
  }
  // TODO (später): flinke Geister / Bewegung durch den Raum (für Levels)
}
