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
import { spawnGhosts, removeGhosts } from './ghosts/ghostSpawner';
import { DesktopMode } from './desktop/desktopMode';
import { Game } from './game/game';
import { Hud } from './ui/hud';
import type { Ghost, GameMode } from './types';

const { scene, camera, renderer } = createSceneContext();
const desktop = new DesktopMode(scene, camera);
const game = new Game(camera);
const hud = new Hud({
  onStart: () => startRound(desktop.playerPosition),
  onCapture: () => game.capture(),
});

let mode: GameMode = 'desktop';
let ghosts: Ghost[] = [];

/** Neue Runde starten: alte Geister weg, neue um den Spieler spawnen. */
function startRound(center: THREE.Vector3): void {
  removeGhosts(scene, ghosts);
  ghosts = spawnGhosts(scene, center);
  game.start(ghosts);
}

// Standard: 3D-Modus
desktop.enable();

// Falls verfügbar: AR-Button. Beim Wechsel wird der Modus umgeschaltet.
setupAR(
  renderer,
  () => {
    mode = 'ar';
    desktop.disable();
    startRound(new THREE.Vector3(0, 0, 0)); // AR: Startposition des Handys = Nullpunkt
  },
  () => {
    mode = 'desktop';
    desktop.enable();
    startRound(desktop.playerPosition);
  },
);

// Render-Loop
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mode === 'desktop') desktop.update(dt);
  game.update(dt);
  hud.update(game.snapshot);
  renderer.render(scene, camera);
});
