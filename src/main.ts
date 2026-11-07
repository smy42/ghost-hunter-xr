// Einstiegspunkt: verbindet alle Bereiche. Hier nur kleine Änderungen, bitte absprechen.
//
//  core/     Szene, Kamera, Renderer (gemeinsam)
//  xr/       AR-Session & Tracking         → Sümi
//  ghosts/   Geister spawnen & Modelle     → Sümi
//  desktop/  3D-Modus & Steuerung          → Person B
//  game/     Zielen, Fangen, Score         → Person B
//  ui/       Screens & Anzeigen            → Person C

import * as THREE from 'three';
import './style.css';
import { createSceneContext } from './core/scene';
import { setupAR, updateTracking, resetTracking } from './xr/arSession';
import { showRitual, hideRitual, getRoomSize } from './xr/ritual';
import { spawnGhosts, removeGhosts, updateGhosts, createSpawnOptions, setUvLight, setStruggle, breakFree, summonNextGhost, resetSummon, setGhostSpawnValidator } from './ghosts/ghostSpawner';
import { DesktopMode } from './desktop/desktopMode';
import { Game } from './game/game';
import { getLevelConfig } from './game/levels';
import { Hud } from './ui/hud';
import { setupAtmosphere } from './effects/atmosphere';
import { initAudio, startRoundAudio, pauseAudio, resumeAudio, updateAudio, playCapture, playSuccess, playWin, playGameOver, playGhostAppear, playEvilCaught, playTimeBonus, playMenuAudio, setTension, playTick, playJumpscare, startRitualAudio, playRitualConfirm, playEscape, playBreakFree, playApproach } from './audio/sound';
import type { Ghost, GameMode, GameSnapshot, GhostBehavior, RoundStatus, SpawnOptions } from './types';

const { scene, camera, renderer } = createSceneContext();
const desktop = new DesktopMode(scene, camera);
const game = new Game(camera);
setupAtmosphere(); // vor dem HUD, damit es darunter liegt
const hud = new Hud({
  onStart: () => {
    // Start Hunt / Try Again / Next Level
    if (mode === 'ar') {
      startARRound(); // AR: jede Runde wieder übers Ritual → Geister spawnen dort, wo man jetzt steht
      return;
    }
    startRound(desktop.playerPosition);
    desktop.lock(); // Cursor weg, mit der Maus umschauen
  },
  onCapture: () => capture(),
  onNextLevel: () => {
    game.nextLevel();

    if (mode === 'ar') {
      startARRound();
      return;
    }

    startRound(desktop.playerPosition);
    desktop.lock();
  },
  onMenu: () => playMenuAudio(),
  // Buttons für Touch-Geräte (Desktop: P und F)
  onPause: () => {
    if (game.snapshot.status === 'playing') pauseGame();
  },
  onResume: () => resumeGame(),
  onToggleUv: () => {
    if (game.snapshot.status === 'playing' && !game.snapshot.paused) game.toggleUv();
  },
});

/** Ein Fangversuch – egal ob Capture-Button, Linksklick oder E. */
function capture(): void {
  if (
    game.snapshot.status !== 'playing' ||
    game.snapshot.paused ||
    !game.snapshot.uvOn
  ) return;

  playCapture();
  game.capture();
}

/** Laufende Runde pausieren. */
function pauseGame(): void {
  game.pause();
  pauseAudio();

  if (mode === 'desktop') {
    desktop.unlock();
  }
}

/** Pausierte Runde fortsetzen. */
function resumeGame(): void {
  game.resume();
  resumeAudio();

  if (mode === 'desktop') {
    desktop.lock();
  }
}

/** Beim Wechsel zu einem anderen Tab automatisch pausieren. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.snapshot.status === 'playing') {
    pauseGame();
  }
});
initAudio(camera, scene, () => hud.settings.sound);

// Kurze Popups, damit man die Sonder-Geister auch ohne „How to Play" versteht
game.onEvilCaught = (freed) => {
  playEvilCaught();
  hud.showPopup(
    'evil',
    'Evil ghost!',
    freed > 0
      ? `${freed} captured ${freed === 1 ? 'ghost' : 'ghosts'} escaped. Leave the red ones alone!`
      : 'Never catch ghosts with a red aura – they free all your captured ghosts!',
  );
};
game.onTimeGhostCaught = () => {
  playTimeBonus();
  hud.showPopup('time', '⏳ +10 seconds!', 'Golden ghosts give you extra time.');
};

let mode: GameMode = 'desktop';
let ghosts: Ghost[] = [];

// Querformat-Hinweis nur für mobile Geräte im 3D-Modus
const rotateOverlay = document.createElement('div');
rotateOverlay.id = 'rotate-overlay';
rotateOverlay.innerHTML = `
  <div class="rotate-content">
    <div class="rotate-icon">📱</div>
    <h2>Rotate your phone</h2>
    <p>Turn your phone sideways to play Ghost Hunter XR!</p>
  </div>
`;
document.body.appendChild(rotateOverlay);

function updateOrientation(): void {
  const isMobile = window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
  const isPortrait = window.innerHeight > window.innerWidth;

  rotateOverlay.style.display =
    mode === 'desktop' && isMobile && isPortrait ? 'flex' : 'none';
}

window.addEventListener('resize', updateOrientation);
window.addEventListener('orientationchange', updateOrientation);
updateOrientation();

// iPhone Camera AR – eigener Modus, unabhängig von Android WebXR


// Desktop: Geist mit linker Maustaste oder E einfangen.
// Funktioniert auch OHNE gesperrten Mauszeiger (z. B. Touch-Laptop, wo der Browser nicht sperrt).
window.addEventListener('mousedown', (event) => {
  if (mode !== 'desktop' || event.button !== 0 || !hud.isHunting) return;
  // Klicks auf Buttons (z. B. Capture-Button) zählen dort selbst – sonst doppelt
  if ((event.target as Element | null)?.closest('button')) return;
  capture();
});

// E-Taste zum Fangen
window.addEventListener('keydown', (event) => {
  if (mode !== 'desktop' || event.code !== 'KeyE' || event.repeat || !hud.isHunting) return;
  capture();
});

// Tastenkürzel für Pause und UV-Lampe
window.addEventListener('keydown', (event) => {
  if (mode !== 'desktop' || event.repeat || !hud.isHunting) return;

  if (event.code === 'KeyP') {
    if (game.snapshot.paused) {
      resumeGame();
    } else if (game.snapshot.status === 'playing') {
      pauseGame();
    }
  }

  if (event.code === 'KeyF') {
    if (game.snapshot.status === 'playing' && !game.snapshot.paused) {
      game.toggleUv();
    }
  }
});

/**
 * AR: Runde übers Ritual starten. Beim ersten Mal das volle Ritual, danach die kurze Version.
 * Bis zum Bestätigen sind keine Geister da (die alten werden gleich entfernt).
 */
let ritualShownThisSession = false;
function startARRound(): void {
  removeGhosts(scene, ghosts);
  ghosts = [];
  startRitualAudio();
  showRitual(() => startRound(camera.position.clone()), {
    vibrate: hud.settings.vibration,
    short: ritualShownThisSession,
    onConfirm: playRitualConfirm,
  });
  ritualShownThisSession = true;
}

/** Neue Runde starten: alte Geister weg, neue um den Spieler spawnen. */
function startRound(center: THREE.Vector3): void {
  // Nur im 3D-Modus die Haunted-House-Kollisionen prüfen.
  // Android-AR verwendet weiterhin seine eigene Spawnlogik.
  setGhostSpawnValidator(
    mode === 'desktop'
      ? (position) => desktop.isGhostPositionFree(position)
      : null
  );
  removeGhosts(scene, ghosts);
  resetSummon();
  summonTimer = 0;
  const level = getLevelConfig(game.currentLevel);

  ghosts = spawnGhosts(
    scene,
    center,
    createSpawnOptions(
      mode,
      currentRoomSize(),
      level.radiusScale,
      {
        ...level.spawn,
        ...testOverrides(),
      }
    )
  );

  game.start(ghosts, game.currentLevel);
  hud.showLevelIntro(game.currentLevel); // „Level 2 – They are moving…"
  startRoundAudio(ghosts);
}

/**
 * Nur zum Testen, bis das Level-System da ist: Verhalten über die URL einschalten, z. B.
 *   https://…:5173/?behaviors=wander,flee,teleport
 * Ohne Parameter: Geister stehen still (Level 1).
 */
function testOverrides(): Partial<SpawnOptions> {
  const param = new URLSearchParams(location.search).get('behaviors');
  if (!param) return {};
  return { behaviors: param.split(',').map((b) => b.trim()) as GhostBehavior[] };
}

/** Nur zum Testen, bis Person B das UV-Licht gebaut hat: ?uv=off → Geister so, als wäre das Licht aus */
const TEST_UV_OFF = new URLSearchParams(location.search).get('uv') === 'off';

/** Nur AR: Raumgröße in Metern (kürzere Seite) – eingegeben beim AR-Start-Ritual. */
function currentRoomSize(): number {
  return getRoomSize();
}

// Standard: 3D-Modus
desktop.enable();

// Falls verfügbar: AR-Button. Beim Wechsel wird der Modus umgeschaltet.
setupAR(
  renderer,
  () => {
    mode = 'ar';
    desktop.disable();
    hud.showHunt(); // Startscreen ausblenden, damit man in AR die Kamera sieht
    // Erst das Ritual: Spieler stellt sich in die Mitte und gibt die Raumgröße ein.
    // Die Geister spawnen um die Stelle, an der er beim Bestätigen steht.
    startARRound();
  },
  () => {
    hideRitual();
    ritualShownThisSession = false; // nächste AR-Session: wieder das volle Ritual
    resetTracking();
    mode = 'desktop';
    desktop.enable();
    startRound(desktop.playerPosition);
  },
);

// Render-Loop
let lastStatusForCursor: RoundStatus = 'playing';
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();

  if (
    mode === 'desktop' &&
    hud.isHunting &&
    game.snapshot.status === 'playing' &&
    !game.snapshot.paused
  ) {
    desktop.update(dt);
  }
  // AR: Tracking weg → Spiel einfrieren (Timer, Spawnen, Geister), bis es wieder da ist
  const trackingLost = mode === 'ar' && updateTracking(renderer, dt);
  if (!trackingLost && !game.snapshot.paused) {
    game.update(dt);
  }
  const state: GameSnapshot = { ...game.snapshot, trackingLost };
  const playing =
    state.status === 'playing' &&
    hud.isHunting &&
    !trackingLost &&
    !state.paused;

  desktop.setJoystickVisible(mode === 'desktop' && playing);

  setUvLight(state.uvOn && !TEST_UV_OFF);
  if (mode === 'desktop') {
    desktop.setUvLight(
      state.status === 'playing' &&
      state.uvOn &&
      !TEST_UV_OFF
    );
  }
  if (!trackingLost && !state.paused) {
    updateStruggle(playing);
    updateSummon(dt, playing);
    const { appeared, escaped } = updateGhosts(dt, camera.position);
    if (playing) {
      for (const ghost of appeared) playGhostAppear(ghost.object);
      for (const ghost of escaped) playEscape(ghost.object); // Lachen hinter der Wand
    }
  }
  playSoundsForChanges(state);
  updateTimerEffects(playing);
  updateAudio(dt, camera);
  if (
    mode === 'desktop' &&
    (state.status === 'won' || state.status === 'lost')
  ) {
    desktop.unlock();
  } // Cursor für den Endscreen
  lastStatusForCursor = state.status;
  hud.update(state);
  hud.updateAim(game.aim);
  if (hud.isHunting) hud.updateRadar(ghosts, camera); // Radar & Pfeil zum nächsten Geist
  renderer.render(scene, camera);
});

/**
 * Geist wehrt sich beim Fangen: zittert, solange man tippt.
 * Fällt der Fangbalken wieder auf 0 (Spieler zu langsam), reißt er sich los und flieht.
 */
/** Ab so viel Fortschritt (0–100) zählt ein abgebrochener Fangversuch als „losgerissen" */
const BREAK_FREE_MIN_PROGRESS = 25;
let struggleGhost: Ghost | null = null;
let struggleMax = 0;
function updateStruggle(playing: boolean): void {
  const target = playing ? game.targetGhost : null;
  const progress = target ? game.aim.progress : 0;
  if (target !== struggleGhost) {
    struggleGhost = target; // anderer Geist / weggeschaut → kein Losreißen
    struggleMax = 0;
  }
  struggleMax = Math.max(struggleMax, progress);
  if (
    game.currentLevel >= 3 &&
    target &&
    progress <= 0 &&
    struggleMax >= BREAK_FREE_MIN_PROGRESS
  ) {
    struggleMax = 0;
    if (breakFree(target)) playBreakFree(target.object); // Kreischen
  }
  setStruggle(target, progress / 100);
}

/**
 * Letzte Sekunden: weit entfernte Geister kommen nacheinander zu dir
 * (abwechselnd flackernd auftauchen / heranschweben) – damit keiner unerreichbar hinter einer Wand bleibt.
 */
const SUMMON_FROM = 10; // ab so vielen Sekunden Restzeit
const SUMMON_INTERVAL = 2; // alle so vielen Sekunden einer
let summonTimer = 0;
function updateSummon(dt: number, playing: boolean): void {
  if (!playing || game.timeLeft > SUMMON_FROM) return;
  summonTimer -= dt;
  if (summonTimer > 0) return;
  summonTimer = SUMMON_INTERVAL;
  const summoned = summonNextGhost(camera.position);
  if (!summoned) return;
  // Auftauchen → Whoosh · Heranschweben → Stöhnen, das mit dem Geist näher kommt
  if (summoned.kind === 'appear') playGhostAppear(summoned.ghost.object);
  else playApproach(summoned.ghost.object);
}

/** Herzschlag & Ticken, wenn die Zeit knapp wird. */
let lastSecond = -1;
function updateTimerEffects(playing: boolean): void {
  const timeLeft = game.timeLeft;
  if (playing) hud.updateTimer(timeLeft);
  setTension(playing && timeLeft <= 20 ? 1 - timeLeft / 20 : 0);
  const second = Math.ceil(timeLeft);
  if (playing && second !== lastSecond && second <= 10 && second > 0) playTick();
  lastSecond = second;
}

/** Spielt Sounds, wenn sich der Spielstand ändert (Geist gefangen, gewonnen, verloren). */
let lastGhostsLeft = -1;
let lastStatus: RoundStatus = 'playing';
function playSoundsForChanges(state: GameSnapshot): void {
  if (state.status !== lastStatus) {
    if (state.status === 'won') playWin();
    if (state.status === 'lost') {
      setTension(0);
      if (hud.settings.scary) playJumpscare();
      setTimeout(playGameOver, hud.settings.scary ? 1000 : 0); // nach dem Schrei
    }
  } else if (state.ghostsLeft < lastGhostsLeft) {
    playSuccess();
  }
  lastGhostsLeft = state.ghostsLeft;
  lastStatus = state.status;
}
