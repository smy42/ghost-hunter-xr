// ─────────────────────────────────────────────
// BEREICH: Interface (Screens & Anzeigen)   →  Person C
// ─────────────────────────────────────────────
// Alles liegt im <div id="ui">. Dieses Element bleibt auch in AR sichtbar (dom-overlay).
// Also: Anzeigen IMMER in #ui einhängen, nicht direkt in <body>.

import type { GameSnapshot } from '../types';

export class Hud {
  private root = document.getElementById('ui')!;
  private ghostsLeft = document.createElement('div');
  private captureButton = document.createElement('button');

  constructor(onCapture: () => void) {
    this.ghostsLeft.className = 'hud-ghosts-left';
    this.captureButton.className = 'hud-capture';
    this.captureButton.textContent = 'Capture';

    // pointerdown statt click → reagiert schneller beim schnellen Tippen
    this.captureButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onCapture();
    });

    this.root.append(this.ghostsLeft, this.captureButton);

    // TODO (Person C): Fadenkreuz, Fangbalken, Pfeil mit Distanz, Radar
    // TODO (Person C): Screens – Start, How to Play, Hunt Complete, Game Over, Pause
  }

  update(state: GameSnapshot): void {
    this.ghostsLeft.textContent = `Ghosts left: ${state.ghostsLeft}`;
    // TODO (Person C): Hunt Complete / Game Over anzeigen, wenn state.status !== 'playing'
  }
}
