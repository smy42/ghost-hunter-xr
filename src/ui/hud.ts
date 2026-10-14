// ─────────────────────────────────────────────
// BEREICH: Interface (Screens & Anzeigen)   →  Person C
// ─────────────────────────────────────────────
// Alles liegt im <div id="ui">. Dieses Element bleibt auch in AR sichtbar (dom-overlay).
// Also: Anzeigen IMMER in #ui einhängen, nicht direkt in <body>.

import type { GameSnapshot } from '../types';

export interface HudCallbacks {
  /** "Start Hunt" wurde gedrückt → Runde starten (main.ts) */
  onStart: () => void;
  /** Tap auf den Fang-Button (game/) */
  onCapture: () => void;
}

export class Hud {
  private root = document.getElementById('ui')!;
  private callbacks: HudCallbacks;

  // Screens
  private startScreen = document.createElement('div');

  // Anzeigen während der Jagd
  private huntLayer = document.createElement('div');
  private ghostsLeft = document.createElement('div');
  private ghostsLeftNumber = document.createElement('span');
  private captureButton = document.createElement('button');
  private lastGhostsLeft = -1;

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.buildStartScreen();
    this.buildHuntLayer();
    this.root.append(this.startScreen, this.huntLayer);
    this.showStart();

    // TODO (Person C): Fadenkreuz, Fangbalken, Pfeil mit Distanz, Radar
    // TODO (Person C): Screens – How to Play, Hunt Complete, Game Over, Pause
  }

  // ---------- Aufbau ----------

  private buildStartScreen(): void {
    this.startScreen.className = 'screen screen-start';
    this.startScreen.innerHTML = `
      <div class="start-title">
        <div class="start-ghost">👻</div>
        <h1>GHOST<br>HUNTER <span>XR</span></h1>
      </div>
      <div class="start-buttons">
        <button class="btn btn-primary" data-action="start">▶&nbsp; Start Hunt</button>
        <button class="btn" data-action="howto">How to Play</button>
        <button class="btn" data-action="settings">Settings</button>
      </div>
    `;

    this.startScreen.querySelector('[data-action="start"]')!
      .addEventListener('click', () => {
        this.showHunt();
        this.callbacks.onStart();
      });
    // How to Play / Settings: kommen als nächste Screens
  }

  private buildHuntLayer(): void {
    this.huntLayer.className = 'hunt-layer';

    this.ghostsLeft.className = 'hud-ghosts-left';
    const label = document.createElement('small');
    label.textContent = 'Ghosts left';
    this.ghostsLeft.append(label, this.ghostsLeftNumber);

    this.captureButton.className = 'hud-capture';
    this.captureButton.textContent = 'Capture';
    // pointerdown statt click → reagiert schneller beim schnellen Tippen
    this.captureButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.callbacks.onCapture();
    });

    this.huntLayer.append(this.ghostsLeft, this.captureButton);
  }

  // ---------- Screens wechseln ----------

  showStart(): void {
    this.startScreen.hidden = false;
    this.huntLayer.hidden = true;
  }

  /** Öffentlich, damit z. B. beim AR-Start direkt die Jagd-Anzeige kommt. */
  showHunt(): void {
    this.startScreen.hidden = true;
    this.huntLayer.hidden = false;
  }

  // ---------- jeden Frame ----------

  update(state: GameSnapshot): void {
    // Nur ändern, wenn sich die Zahl wirklich geändert hat
    if (state.ghostsLeft !== this.lastGhostsLeft) {
      this.ghostsLeftNumber.textContent = String(state.ghostsLeft);
      this.lastGhostsLeft = state.ghostsLeft;
    }
    // TODO (Person C): Hunt Complete / Game Over anzeigen, wenn state.status !== 'playing'
  }
}