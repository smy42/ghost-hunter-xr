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
import type { GameMode, Ghost, GhostBehavior, GhostType, SpawnOptions } from '../types';

// ---------- Einstellungen ----------

// SpawnOptions liegt jetzt in types.ts (das Level-System braucht sie auch).
export type { SpawnOptions };

/** AR: Abstand, den die Geister zur Wand halten (Meter) */
const WALL_MARGIN = 0.5;
/** AR: kleinster erlaubter Radius (Meter) – auch in sehr kleinen Räumen */
const MIN_AR_RADIUS = 1;

/**
 * AR: Spawn-Radius aus der Raumgröße (kürzere Seite in Metern).
 * Spieler steht in der Mitte → halbe Raumgröße minus Abstand zur Wand.
 * z. B. 4 m → 1,5 m · 6 m → 2,5 m · 10 m → 4,5 m
 */
export function arRadius(roomSize: number): number {
  return Math.max(MIN_AR_RADIUS, roomSize / 2 - WALL_MARGIN);
}

/**
 * 3D-Modus: fester Grund-Radius (Meter) – man läuft mit WASD/Joystick, daher weiter weg.
 * Boden ist 20 × 20 m → auch mit radiusScale 1.4 (≈ 8,4 m) bleiben die Geister auf dem Boden.
 */
export const DESKTOP_RADIUS = 6;

export const DEFAULT_SPAWN: SpawnOptions = {
  mix: { normal: 3, fast: 1, evil: 1, timeadd: 1 },
  minRadius: 1,
  maxRadius: 2.5,
  minSpacing: 0.6,
  behaviors: ['idle'], // Level 1: Geister bleiben stehen
  speed: 0.6,
  fleeDistance: 3,
};

/**
 * Baut die Spawn-Einstellungen für eine Runde.
 * AR:  Radius aus der Raumgröße (bleibt in jedem Level gleich – der Raum wird nicht größer).
 * 3D:  Radius = DESKTOP_RADIUS × radiusScale des Levels (höheres Level = weiter weg).
 * @param roomSize nur AR: kürzere Seite des Raums in Metern
 * @param overrides weitere Werte vom Level-System (mix, behaviors, speed …)
 */
export function createSpawnOptions(
  mode: GameMode,
  roomSize: number,
  radiusScale = 1,
  overrides: Partial<SpawnOptions> = {},
): SpawnOptions {
  const maxRadius = mode === 'ar' ? arRadius(roomSize) : DESKTOP_RADIUS * radiusScale;
  return {
    ...DEFAULT_SPAWN,
    ...overrides,
    maxRadius,
    minRadius: Math.min(DEFAULT_SPAWN.minRadius, maxRadius), // in kleinen Räumen nicht größer als max
  };
}

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

// ---------- Bewegung (ab Level 2) ----------

/** Wandern: so viel langsamer als speed (Geister schleichen eher) */
const WANDER_SPEED_FACTOR = 0.6;
/** Wandern: Pause am Zielpunkt, bevor der nächste gewählt wird (Sekunden, min–max) */
const WANDER_PAUSE: [number, number] = [0.5, 2];
/** Flüchten: wie stark der Geist seitlich ausweicht (0 = gerade weg, 1 = stark im Bogen) */
const FLEE_SIDEWAYS = 0.7;
/** Teleport: so nah (Anteil von fleeDistance) muss der Spieler kommen, damit der Geist verschwindet */
const TELEPORT_TRIGGER = 0.6;
/** Teleport: so lange flackert der Geist vorher (Sekunden) */
const TELEPORT_FLICKER = 0.5;
/** Teleport: Mindestzeit zwischen zwei Teleports (Sekunden) */
const TELEPORT_COOLDOWN = 4;

// ---------- Entkommen „durch die Wand" ----------

/** So lange fliegt der Geist nach außen und schrumpft, bevor er weg ist (Sekunden) */
const ESCAPE_DURATION = 0.7;
/** So schnell fliegt er dabei nach außen (m/s) */
const ESCAPE_SPEED = 1.5;
/** Nach so vielen Sekunden taucht er wieder auf (min–max) */
const HIDDEN_TIME: [number, number] = [3, 5];

// ---------- UV-Licht ----------

/** Ohne UV-Licht: so sichtbar sind die Geister noch (Anteil der normalen Deckkraft) */
const UV_OFF_OPACITY = 0.15;
/** Auren (rot/gold) werden ohne Licht nur so weit gedimmt → im Dunkeln sieht man nur das Glühen */
const UV_OFF_AURA = 0.5;
/** So schnell blenden die Geister beim Ein-/Ausschalten über (pro Sekunde) */
const UV_FADE_SPEED = 4;

// ---------- Geist wehrt sich beim Fangen ----------

/** Wie stark der Geist beim Fangen zittert (Drehung in Radiant bei vollem Fangbalken) */
const STRUGGLE_WOBBLE = 0.25;
/** Losreißen: so lange flieht der Geist (Sekunden) … */
const BREAK_FREE_DURATION = 1.5;
/** … und so viel schneller als normal */
const BREAK_FREE_SPEED_FACTOR = 2.5;

// ---------- Letzte Sekunden: Geister kommen zu dir ----------

/** Nur Geister, die weiter weg sind, werden geholt (Meter) */
const SUMMON_MIN_DISTANCE = 3;
/** So nah kommen sie (Meter, min–max) */
const SUMMON_RANGE: [number, number] = [1.5, 2.5];
/** Tempo beim Heranschweben (m/s) */
const SUMMON_FLOAT_SPEED = 1.2;

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
/** UV-Licht: Ziel (an/aus) und aktueller, sanft übergeblendeter Wert (0 = aus, 1 = an) */
let uvTarget = 1;
let uvLevel = 1;

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
  container.userData.appliedUv = -1; // neue Materialien → UV-Helligkeit neu setzen

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
        withBaseOpacity(new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.8 })),
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
          return withBaseOpacity(clone);
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

    const ghost: Ghost = { id, type, object: container, caught: false, behavior: pickBehavior(type, options), hidden: false };
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
 * Welches Verhalten bekommt ein Geist? Nur was im Level erlaubt ist (options.behaviors):
 * böser Geist → teleportiert · flinker Geist → flüchtet · alle anderen → wandern · sonst: stehen.
 */
function pickBehavior(type: GhostType, options: SpawnOptions): GhostBehavior {
  const allowed = options.behaviors;
  const wish: GhostBehavior[] =
    type === 'evil' ? ['teleport', 'wander'] : type === 'fast' ? ['flee', 'wander'] : ['wander'];
  return wish.find((b) => allowed.includes(b)) ?? 'idle';
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
  container.userData.wanderTarget = null;
  container.userData.wanderPause = randomBetween(...WANDER_PAUSE);
  container.userData.teleportCooldown = TELEPORT_COOLDOWN;
  container.userData.flickerTime = 0;
  container.userData.escapeTime = 0;
  container.userData.hiddenFor = 0;
  container.userData.struggle = 0;
  container.userData.breakFreeTime = 0;
  container.userData.summoned = false;
  container.userData.summonTarget = null;
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

/** Was in diesem Frame passiert ist (für Sounds, Radar …) */
export interface GhostUpdate {
  /** neu erschienen, teleportiert oder nach dem Entkommen zurück → „Whoosh" von dort */
  appeared: Ghost[];
  /** gerade „durch die Wand" entkommen → Geräusch aus dieser Richtung */
  escaped: Ghost[];
}

/**
 * Jeden Frame aufrufen (aus main.ts): neue Geister erscheinen lassen, Bewegung, Schweben + Animationen.
 * dt = Sekunden seit letztem Frame.
 * @param player Position des Spielers (Kamera) – Geister schauen ihn an und reagieren auf ihn
 * @returns welche Geister in diesem Frame erschienen bzw. entkommen sind
 */
export function updateGhosts(dt: number, player?: THREE.Vector3): GhostUpdate {
  const appeared: Ghost[] = [];
  const escaped: Ghost[] = [];

  // Nächsten Geist erscheinen lassen (nur wenn nicht schon zu viele da sind)
  if (spawnQueue.length > 0) {
    nextSpawnIn -= dt;
    // versteckte (entkommene) Geister zählen mit – sie kommen ja zurück
    const visibleCount = activeGhosts.filter((g) => (g.object.visible || g.hidden) && !g.caught).length;
    if (nextSpawnIn <= 0 && visibleCount < MAX_VISIBLE) {
      const ghost = spawnQueue.shift()!;
      appear(ghost, true);
      appeared.push(ghost);
      nextSpawnIn = randomBetween(...SPAWN_INTERVAL);
    }
  }

  // UV-Licht sanft überblenden
  uvLevel += Math.sign(uvTarget - uvLevel) * Math.min(Math.abs(uvTarget - uvLevel), UV_FADE_SPEED * dt);

  const t = performance.now() / 1000;
  for (const ghost of activeGhosts) {
    const obj = ghost.object;

    // Entkommener Geist: nach ein paar Sekunden weit weg vom Spieler wieder auftauchen
    if (ghost.hidden) {
      obj.userData.hiddenFor -= dt;
      if (obj.userData.hiddenFor <= 0 && player) {
        returnGhost(ghost, player);
        appeared.push(ghost);
      }
      continue;
    }
    if (!obj.visible) continue;

    // Aufwachsen nach dem Erscheinen (mit leichtem Überschwingen)
    if (obj.userData.appearTime < APPEAR_DURATION) {
      obj.userData.appearTime = Math.min(APPEAR_DURATION, obj.userData.appearTime + dt);
      const p = obj.userData.appearTime / APPEAR_DURATION;
      const s = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); // easeOutBack
      obj.scale.setScalar(Math.max(0.01, s));
    }

    if (player && !ghost.caught) {
      const result = moveGhost(ghost, dt, player);
      if (result === 'teleported') appeared.push(ghost); // Whoosh von der neuen Stelle
      if (result === 'escaped') escaped.push(ghost);
      // Geist schaut den Spieler an (nur um die Hochachse) – auch wenn er steht
      obj.lookAt(player.x, obj.position.y, player.z);
      // Wehrt sich beim Fangen: zittert, je voller der Fangbalken, desto stärker
      const struggle = obj.userData.struggle as number;
      if (struggle > 0) obj.rotateZ(Math.sin(t * 45) * STRUGGLE_WOBBLE * struggle);
    }

    if (obj.userData.appliedUv !== uvLevel) applyUv(obj);

    obj.position.y = obj.userData.baseY + Math.sin(t * 1.5 + obj.userData.floatOffset) * FLOAT_AMOUNT;
    mixers.get(obj)?.update(dt);

    // Aura des bösen Geists pulsiert unruhig
    if (ghost.type === 'evil') {
      const aura = obj.children.find((c) => c.userData.isAura) as THREE.Sprite | undefined;
      if (aura) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + obj.userData.floatOffset);
        const flicker = Math.random() < 0.05 ? 0.3 : 0; // ab und zu kurz flackern
        aura.material.opacity = (0.55 + 0.35 * pulse - flicker) * (aura.userData.uvFactor ?? 1);
        aura.scale.setScalar(HEIGHT.evil * (1.6 + 0.3 * pulse));
      }
    }

    // Time-Geist: Aura „tickt" ruhig im Sekundentakt, Funken kreisen
    if (ghost.type === 'timeadd') {
      const aura = obj.children.find((c) => c.userData.isAura) as THREE.Sprite | undefined;
      if (aura) {
        const tick = Math.pow(1 - (t % 1), 3); // kurzer Puls jede Sekunde
        aura.material.opacity = (0.45 + 0.4 * tick) * (aura.userData.uvFactor ?? 1);
        aura.scale.setScalar(HEIGHT.timeadd * (1.5 + 0.25 * tick));
      }
      const sparks = obj.children.find((c) => c.userData.isSparks);
      if (sparks) sparks.rotation.y = t * 2.5;
    }
  }
  return { appeared, escaped };
}

// ---------- Bewegung ----------

const tmp = new THREE.Vector3();

/**
 * Bewegt einen Geist je nach Verhalten (nur waagrecht – die Höhe macht das Schweben).
 * @returns 'teleported' / 'escaped', wenn das gerade passiert ist, sonst null
 */
function moveGhost(ghost: Ghost, dt: number, player: THREE.Vector3): 'teleported' | 'escaped' | null {
  const obj = ghost.object;
  const data = obj.userData;
  const pos = obj.position;
  const { speed, fleeDistance } = spawnOptions;

  // Gerade beim Entkommen: weiter nach außen fliegen und schrumpfen, dann weg
  if (data.escapeTime > 0) {
    data.escapeTime -= dt;
    const outX = pos.x - spawnCenter.x;
    const outZ = pos.z - spawnCenter.z;
    const len = Math.hypot(outX, outZ) || 1;
    pos.x += (outX / len) * ESCAPE_SPEED * dt;
    pos.z += (outZ / len) * ESCAPE_SPEED * dt;
    obj.scale.setScalar(Math.max(0.01, data.escapeTime / ESCAPE_DURATION));
    if (data.escapeTime <= 0) {
      ghost.hidden = true;
      obj.visible = false; // game/ ignoriert unsichtbare Geister → kann nicht gefangen werden
      data.hiddenFor = randomBetween(...HIDDEN_TIME);
    }
    return null;
  }

  // Waagrechter Abstand zum Spieler
  const away = tmp.set(pos.x - player.x, 0, pos.z - player.z);
  const distance = away.length();

  // Hat sich beim Fangen losgerissen: kurz schnell vom Spieler weg (egal welches Verhalten)
  if (data.breakFreeTime > 0) {
    data.breakFreeTime -= dt;
    if (distance > 0.001) {
      away.normalize();
      pos.x += away.x * speed * BREAK_FREE_SPEED_FACTOR * dt;
      pos.z += away.z * speed * BREAK_FREE_SPEED_FACTOR * dt;
    }
    if (clampToRadius(pos)) {
      data.breakFreeTime = 0;
      data.escapeTime = ESCAPE_DURATION; // am Rand angekommen → durch die Wand
      return 'escaped';
    }
    return null;
  }

  // In den letzten Sekunden herbeigerufen: schwebt zu dir bzw. bleibt in deiner Nähe (kein Wandern/Flüchten mehr)
  if (data.summoned) {
    const target = data.summonTarget as THREE.Vector3 | null;
    if (target) {
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const left = Math.hypot(dx, dz);
      const step = SUMMON_FLOAT_SPEED * dt;
      if (left <= step) {
        pos.x = target.x;
        pos.z = target.z;
        data.summonTarget = null;
      } else {
        pos.x += (dx / left) * step;
        pos.z += (dz / left) * step;
      }
    }
    return null; // darf hier auch außerhalb des Radius sein – er kommt ja zu dir
  }

  switch (ghost.behavior) {
    case 'wander': {
      if (!data.wanderTarget) {
        data.wanderPause -= dt;
        if (data.wanderPause <= 0) data.wanderTarget = randomPointInRadius();
        break;
      }
      const target = data.wanderTarget as THREE.Vector3;
      const step = speed * WANDER_SPEED_FACTOR * dt;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const left = Math.hypot(dx, dz);
      if (left <= step) {
        pos.x = target.x;
        pos.z = target.z;
        data.wanderTarget = null;
        data.wanderPause = randomBetween(...WANDER_PAUSE);
      } else {
        pos.x += (dx / left) * step;
        pos.z += (dz / left) * step;
      }
      break;
    }

    case 'flee': {
      if (distance >= fleeDistance || distance < 0.001) break;
      // Weg vom Spieler + seitlich ausweichen (Richtung wechselt langsam) → fliegt eher im Bogen als gerade weg
      away.normalize();
      const side = Math.sin(performance.now() / 700 + data.floatOffset) * FLEE_SIDEWAYS;
      const dirX = away.x - away.z * side;
      const dirZ = away.z + away.x * side;
      const len = Math.hypot(dirX, dirZ);
      // Je näher der Spieler, desto schneller
      const urgency = 1 + (1 - distance / fleeDistance);
      pos.x += (dirX / len) * speed * urgency * dt;
      pos.z += (dirZ / len) * speed * urgency * dt;
      break;
    }

    case 'teleport': {
      data.teleportCooldown -= dt;
      if (data.flickerTime > 0) {
        // Flackern, dann verschwinden und woanders auftauchen
        // (über die Größe flackern, NICHT über visible – unsichtbare Geister werden nicht mehr aktualisiert)
        data.flickerTime -= dt;
        obj.scale.setScalar(Math.random() > 0.5 ? 1 : 0.01);
        if (data.flickerTime <= 0) {
          const target = findTeleportPosition(ghost, player);
          pos.x = target.x;
          pos.z = target.z;
          data.baseY = target.y;
          data.appearTime = 0; // „aufwachsen" an der neuen Stelle
          obj.scale.setScalar(0.01);
          data.teleportCooldown = TELEPORT_COOLDOWN;
          return 'teleported';
        }
      } else if (data.teleportCooldown <= 0 && distance < fleeDistance * TELEPORT_TRIGGER) {
        data.flickerTime = TELEPORT_FLICKER;
      }
      break;
    }
  }

  const atEdge = clampToRadius(pos);
  // Flüchtender Geist an den Rand gedrängt, Spieler noch nah dran → „durch die Wand" entkommen
  if (atEdge && ghost.behavior === 'flee' && distance < fleeDistance) {
    data.escapeTime = ESCAPE_DURATION;
    return 'escaped';
  }
  return null;
}

/** Entkommener Geist taucht wieder auf – weit weg vom Spieler, mit „Aufwachsen". */
function returnGhost(ghost: Ghost, player: THREE.Vector3): void {
  const obj = ghost.object;
  const target = findTeleportPosition(ghost, player);
  obj.position.copy(target);
  obj.userData.baseY = target.y;
  obj.userData.appearTime = 0;
  obj.scale.setScalar(0.01);
  obj.visible = true;
  ghost.hidden = false;
}

/** Freie Stelle für den Teleport – möglichst weit weg vom Spieler (mind. fleeDistance, sonst die weiteste gefundene). */
function findTeleportPosition(ghost: Ghost, player: THREE.Vector3): THREE.Vector3 {
  const others = activeGhosts.filter((g) => g !== ghost && g.object.visible);
  let best = findFreePosition(spawnCenter, others, spawnOptions);
  for (let attempt = 0; attempt < 15; attempt++) {
    if (Math.hypot(best.x - player.x, best.z - player.z) >= spawnOptions.fleeDistance) break;
    const candidate = findFreePosition(spawnCenter, others, spawnOptions);
    if (Math.hypot(candidate.x - player.x, candidate.z - player.z) > Math.hypot(best.x - player.x, best.z - player.z)) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Hält den Geist im erlaubten Radius um den Startpunkt (am Rand gleitet er entlang).
 * @returns true, wenn er am Rand angestoßen ist
 */
function clampToRadius(pos: THREE.Vector3): boolean {
  const dx = pos.x - spawnCenter.x;
  const dz = pos.z - spawnCenter.z;
  const d = Math.hypot(dx, dz);
  if (d <= spawnOptions.maxRadius) return false;
  pos.x = spawnCenter.x + (dx / d) * spawnOptions.maxRadius;
  pos.z = spawnCenter.z + (dz / d) * spawnOptions.maxRadius;
  return true;
}

/** Zufälliger Punkt im Radius (für das Wandern). */
function randomPointInRadius(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const r = spawnOptions.minRadius + Math.random() * (spawnOptions.maxRadius - spawnOptions.minRadius);
  return new THREE.Vector3(spawnCenter.x + Math.cos(angle) * r, 0, spawnCenter.z + Math.sin(angle) * r);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ---------- UV-Licht ----------

/** UV-Licht an/aus (jeden Frame aus main.ts mit dem Spielzustand aufrufen). Geister blenden sanft über. */
export function setUvLight(on: boolean): void {
  uvTarget = on ? 1 : 0;
}

/** Merkt sich die normale Deckkraft eines Materials, damit das UV-Licht darauf aufbauen kann. */
function withBaseOpacity<T extends THREE.Material>(material: T): T {
  material.userData.baseOpacity = material.opacity;
  return material;
}

/** Setzt die Deckkraft aller Teile eines Geists passend zum UV-Licht. */
function applyUv(obj: THREE.Object3D): void {
  const meshFactor = UV_OFF_OPACITY + (1 - UV_OFF_OPACITY) * uvLevel;
  const auraFactor = UV_OFF_AURA + (1 - UV_OFF_AURA) * uvLevel;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) {
        if (m.userData.baseOpacity !== undefined) m.opacity = m.userData.baseOpacity * meshFactor;
      }
    } else if (child instanceof THREE.Sprite) {
      if (child.userData.isAura) {
        // Auren pulsieren selbst (updateGhosts) → hier nur den Dimm-Faktor merken
        child.userData.uvFactor = auraFactor;
      } else {
        child.material.opacity = auraFactor; // Funken des Time-Geists
      }
    }
  });
  obj.userData.appliedUv = uvLevel;
}

// ---------- Geist wehrt sich beim Fangen ----------

/**
 * Wie voll der Fangbalken bei diesem Geist ist (0–1) → er zittert entsprechend.
 * Mit null aufrufen, wenn gerade kein Geist gefangen wird.
 */
export function setStruggle(target: Ghost | null, progress: number): void {
  for (const ghost of activeGhosts) {
    ghost.object.userData.struggle = ghost === target ? Math.min(1, Math.max(0, progress)) : 0;
  }
}

/**
 * Fangen ist fehlgeschlagen → der Geist reißt sich los und flieht kurz schnell.
 * Nur in Leveln, in denen Flüchten erlaubt ist (spawnOptions.behaviors enthält 'flee') – sonst passiert nichts.
 * @returns true, wenn er sich losgerissen hat (z. B. für einen Sound)
 */
export function breakFree(ghost: Ghost): boolean {
  if (!spawnOptions.behaviors.includes('flee') || ghost.caught || ghost.hidden) return false;
  ghost.object.userData.breakFreeTime = BREAK_FREE_DURATION;
  ghost.object.userData.struggle = 0;
  return true;
}

// ---------- Letzte Sekunden: Geister kommen zu dir ----------

/** Wie der Geist zu dir kommt: taucht flackernd auf ('appear') oder schwebt heran ('float') */
export type SummonKind = 'appear' | 'float';
let nextSummonKind: SummonKind = 'appear';

/** Für eine neue Runde zurücksetzen (beginnt wieder mit „auftauchen"). */
export function resetSummon(): void {
  nextSummonKind = 'appear';
}

/**
 * Holt den am weitesten entfernten Geist zu dir (abwechselnd auftauchen / heranschweben).
 * Geholt werden nur Geister, die weiter als SUMMON_MIN_DISTANCE weg oder hinter der Wand versteckt sind –
 * nicht der böse Geist (der soll verwirren, nicht helfen). In main.ts alle ~2 s aufrufen.
 * @returns den geholten Geist + wie er kommt, oder null, wenn keiner mehr weit weg ist
 */
export function summonNextGhost(player: THREE.Vector3): { ghost: Ghost; kind: SummonKind } | null {
  const distanceTo = (g: Ghost) => Math.hypot(g.object.position.x - player.x, g.object.position.z - player.z);
  const candidates = activeGhosts.filter(
    (g) =>
      !g.caught &&
      g.type !== 'evil' &&
      !g.object.userData.summoned &&
      (g.hidden || (g.object.visible && distanceTo(g) > SUMMON_MIN_DISTANCE)),
  );
  if (candidates.length === 0) return null;
  const ghost = candidates.reduce((a, b) => (b.hidden || distanceTo(b) > distanceTo(a) ? b : a));

  const obj = ghost.object;
  const data = obj.userData;
  // Laufende Flucht / Entkommen abbrechen
  data.escapeTime = 0;
  data.breakFreeTime = 0;
  data.flickerTime = 0;
  data.summoned = true;

  // Zielpunkt in deiner Nähe
  const angle = Math.random() * Math.PI * 2;
  const r = randomBetween(...SUMMON_RANGE);
  const target = new THREE.Vector3(player.x + Math.cos(angle) * r, 0, player.z + Math.sin(angle) * r);

  // Versteckte Geister können nicht heranschweben → tauchen immer auf
  const kind: SummonKind = ghost.hidden ? 'appear' : nextSummonKind;
  if (kind === 'appear') {
    obj.position.set(target.x, player.y - 0.7 + Math.random() * 0.9, target.z);
    data.baseY = obj.position.y;
    data.appearTime = 0; // „aufwachsen"
    obj.scale.setScalar(0.01);
    obj.visible = true;
    ghost.hidden = false;
  } else {
    data.summonTarget = target; // schwebt in moveGhost heran
  }
  nextSummonKind = nextSummonKind === 'appear' ? 'float' : 'appear';
  return { ghost, kind };
}
