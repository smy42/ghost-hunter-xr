// ─────────────────────────────────────────────
// BEREICH: Geister spawnen & Modelle   →  Sümi
// ─────────────────────────────────────────────
// Erzeugt die Geister zufällig im Umkreis um einen Mittelpunkt.
// Aktuell: halbtransparente Kugeln als Platzhalter.

import * as THREE from 'three';
import type { Ghost } from '../types';

export interface SpawnOptions {
  count: number;
  /** Mindestabstand zum Spieler in Metern */
  minRadius: number;
  /** Maximaler Abstand zum Spieler in Metern */
  maxRadius: number;
}

export const DEFAULT_SPAWN: SpawnOptions = { count: 3, minRadius: 1, maxRadius: 2.5 };

/**
 * @param center Startpunkt des Spielers (AR: 0,0,0 = Augenhöhe beim Start; Desktop: Kameraposition)
 */
export function spawnGhosts(
  scene: THREE.Scene,
  center: THREE.Vector3,
  options: SpawnOptions = DEFAULT_SPAWN,
): Ghost[] {
  const ghosts: Ghost[] = [];

  for (let i = 0; i < options.count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = options.minRadius + Math.random() * (options.maxRadius - options.minRadius);
    const heightOffset = -0.3 + Math.random() * 0.6; // etwa Augenhöhe ± 30 cm

    const object = createPlaceholderGhost();
    object.position.set(
      center.x + Math.cos(angle) * distance,
      center.y + heightOffset,
      center.z + Math.sin(angle) * distance,
    );
    scene.add(object);

    ghosts.push({ id: i, object, caught: false });
  }

  return ghosts;
}

export function removeGhosts(scene: THREE.Scene, ghosts: Ghost[]): void {
  for (const ghost of ghosts) scene.remove(ghost.object);
}

function createPlaceholderGhost(): THREE.Object3D {
  // TODO (Sümi): durch GLB-Modell ersetzen (GLTFLoader, Datei in public/models/)
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.8 }),
  );
}
