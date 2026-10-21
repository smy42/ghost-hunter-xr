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
import { setupAR } from './xr/arSession';
import { spawnGhosts, removeGhosts, updateGhosts } from './ghosts/ghostSpawner';
import { DesktopMode } from './desktop/desktopMode';
import { Game } from './game/game';
import { Hud } from './ui/hud';
import { setupAtmosphere } from './effects/atmosphere';
import { initAudio, startRoundAudio, updateAudio, playCapture, playSuccess, playWin, playGameOver, playGhostAppear, playEvilCaught, playTimeBonus, playMenuAudio, setTension, playTick, playJumpscare } from './audio/sound';
import type { Ghost, GameMode, GameSnapshot, RoundStatus } from './types';

const { scene, camera, renderer } = createSceneContext();
const desktop = new DesktopMode(scene, camera);
const game = new Game(camera);
setupAtmosphere(); // vor dem HUD, damit es darunter liegt
const hud = new Hud({
  onStart: () => {
    startRound(desktop.playerPosition);
    if (mode === 'desktop') desktop.lock(); // Cursor weg, mit der Maus umschauen
  },
  onCapture: () => capture(),
  onMenu: () => playMenuAudio(),
});

/** Ein Fangversuch – egal ob Capture-Button, Linksklick oder E. */
function capture(): void {
  playCapture();
  game.capture();
}
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

/** Neue Runde starten: alte Geister weg, neue um den Spieler spawnen. */
function startRound(center: THREE.Vector3): void {
  removeGhosts(scene, ghosts);
  ghosts = spawnGhosts(scene, center);
  game.start(ghosts);
  startRoundAudio(ghosts);
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
    startRound(new THREE.Vector3(0, 0, 0)); // AR: Startposition des Handys = Nullpunkt
  },
  () => {
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
  if (mode === 'desktop') desktop.update(dt);
  game.update(dt);
  const state = game.snapshot;
  const playing = state.status === 'playing' && hud.isHunting;
  for (const ghost of updateGhosts(dt)) if (playing) playGhostAppear(ghost.object);
  playSoundsForChanges(state);
  updateTimerEffects(playing);
  updateAudio(dt, camera);
  if (state.status !== 'playing' && lastStatusForCursor === 'playing' && mode === 'desktop') desktop.unlock(); // Cursor für den Endscreen
  lastStatusForCursor = state.status;
  hud.update(state);
  hud.updateAim(game.aim);
  renderer.render(scene, camera);
});

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
