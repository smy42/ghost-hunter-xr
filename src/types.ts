// Gemeinsame Typen für alle Bereiche.
// ⚠️ Änderungen hier bitte im Team absprechen – alle Bereiche hängen davon ab.
// Stand: Team-Absprache 28.10.2026 (siehe TODO-Liste „types.ts zuerst absprechen")

import type * as THREE from 'three';

// ---------- Geister ----------

/**
 * Geistertypen:
 * - normal:  normal fangen
 * - fast:    "flink" – braucht mehr Taps, Fangbalken sinkt schneller
 * - evil:    "böse" – NICHT fangen! Sonst kommen alle gefangenen Geister wieder frei
 * - timeadd: Bonus – fangen gibt +10 Sekunden
 */
export type GhostType = 'normal' | 'fast' | 'evil' | 'timeadd';

/**
 * Wie sich ein Geist bewegt (ab Level 2):
 * - idle:     bleibt an seinem Platz (Level 1)
 * - wander:   gleitet langsam zu zufälligen Punkten im Radius
 * - flee:     flüchtet, wenn der Spieler näher als fleeDistance kommt
 * - teleport: verschwindet bei Bedrängnis und taucht woanders wieder auf
 */
export type GhostBehavior = 'idle' | 'wander' | 'flee' | 'teleport';

/** Ein Geist in der Szene. Wird von ghosts/ erzeugt, von game/ gefangen, von ui/ gezählt. */
export interface Ghost {
  id: number;
  type: GhostType;
  /** Das 3D-Objekt in der Szene (Position, Rotation, Modell). */
  object: THREE.Object3D;
  /** true, sobald der Geist gefangen wurde. */
  caught: boolean;
  /** Aktuelles Bewegungsverhalten (gesetzt von ghosts/ anhand der Level-Werte). */
  behavior: GhostBehavior;
  /**
   * true = gerade „hinter der Wand" verschwunden (außerhalb des Radius).
   * Kommt nach ein paar Sekunden an einer erreichbaren Stelle zurück.
   * Kann in der Zeit nicht gefangen werden; das Radar zeigt ihn trotzdem (blass) an.
   */
  hidden: boolean;
}

// ---------- Spawnen & Levels ----------

/** Wie viel Platz der Spieler hat (Einstellung). Bestimmt den Grund-Radius. */
export type RoomSize = 'small' | 'medium' | 'large';

/** Einstellungen zum Spawnen. Werden pro Level vom Level-System (game/) an ghosts/ übergeben. */
export interface SpawnOptions {
  /** Wie viele Geister von welchem Typ */
  mix: Record<GhostType, number>;
  /** Mindestabstand zum Spieler in Metern */
  minRadius: number;
  /** Maximaler Abstand zum Spieler in Metern (= Grund-Radius der Raumgröße × radiusScale des Levels) */
  maxRadius: number;
  /** Mindestabstand der Geister untereinander in Metern */
  minSpacing: number;
  /** Welche Bewegungsarten in diesem Level vorkommen dürfen */
  behaviors: GhostBehavior[];
  /** Bewegungstempo der Geister in m/s (in AR langsam halten: ca. 0.5–1) */
  speed: number;
  /** Ab welchem Abstand zum Spieler (Meter) ein Geist flüchtet */
  fleeDistance: number;
  /** Optional: feste Spawn-Punkte (z. B. Räume im Spukhaus, 3D-Modus) */
  spawnPoints?: THREE.Vector3[];
}

/** Werte für ein Level. Liegen in einer Level-Tabelle in game/ (Person B). */
export interface LevelConfig {
  level: number;
  /** Länge der Runde in Sekunden */
  roundTime: number;
  /**
   * Faktor auf den Grund-Radius der Raumgröße → höhere Level = größerer Radius = schwieriger.
   * z. B. Level 1: 1.0, Level 2: 1.2, Level 3: 1.4 …
   */
  radiusScale: number;
  /** Spawn-Werte ohne Radius (der kommt aus Raumgröße × radiusScale) */
  spawn: Omit<SpawnOptions, 'minRadius' | 'maxRadius'>;
}

// ---------- Einstellungen ----------

/**
 * Einstellungen des Spielers (gespeichert in localStorage, gebaut in ui/).
 * TODO (Person C): hud.ts soll diesen Typ statt seines eigenen verwenden und roomSize ergänzen.
 */
export interface Settings {
  sound: boolean;
  vibration: boolean;
  scary: boolean;
  roomSize: RoomSize;
}

// ---------- Spielzustand ----------

/** In welchem Modus läuft das Spiel gerade? */
export type GameMode = 'desktop' | 'ar';

/** Zustand einer Runde – das, was die Anzeige (ui/) darstellen muss. */
export type RoundStatus = 'playing' | 'won' | 'lost';

/**
 * Laufender Zustand, wird jeden Frame von game/ erzeugt und von allen gelesen.
 * Regel: Dinge, die sich laufend ändern → hier. Einmalige Ereignisse → GameEvent.
 */
export interface GameSnapshot {
  ghostsLeft: number;
  ghostsTotal: number;
  score: number;
  /** Vergangene Zeit in Sekunden. */
  time: number;
  status: RoundStatus;
  /** Aktuelles Level (ab 1). Schreibt: game/ */
  level: number;
  /** UV-Licht an/aus. Schreibt: game/ · Liest: ghosts/ (Sichtbarkeit), ui/ (Button) */
  uvOn: boolean;
  /** Akku des UV-Lichts, 0–100. Schreibt: game/ · Liest: ui/ (Akkubalken) */
  battery: number;
  /**
   * Spiel pausiert. Schreibt: game/
   * Pause stoppt ALLES: Timer, Spawnen, Geisterbewegung, Animationen UND Sounds.
   */
  paused: boolean;
  /** AR-Tracking verloren. Schreibt: xr/ · Liest: ui/ (Overlay), game/ (pausiert Timer) */
  trackingLost: boolean;
}

/** Einmalige Ereignisse zwischen den Bereichen (Weiterleitung in main.ts). */
export type GameEvent =
  | { kind: 'trackingLost' }
  | { kind: 'trackingRestored' }
  | { kind: 'ghostCaught'; ghost: Ghost }
  | { kind: 'ghostEscaped'; ghost: Ghost } // durch die Wand verschwunden
  | { kind: 'ghostReturned'; ghost: Ghost }; // wieder aufgetaucht
