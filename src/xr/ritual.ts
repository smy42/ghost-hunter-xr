// ─────────────────────────────────────────────
// BEREICH: AR-Start-Ritual   →  Sümi
// ─────────────────────────────────────────────
// Erscheint beim Start von AR, bevor die Geister kommen:
// Der Spieler stellt sich in die Mitte des Raums und gibt an, wie groß der Raum ist.
// Daraus wird der Spawn-Radius berechnet (ghosts/ghostSpawner.ts → arRadius).
// Die Mitte = da, wo der Spieler beim Bestätigen steht → dort spawnen die Geister.
//
// Sounds: Ambience läuft über audio/sound.ts (startRitualAudio), Gong beim Bestätigen über options.onConfirm.

import './ritual.css';

const ROOM_SIZE_KEY = 'ghost-hunter-room-size';
const MIN_SIZE = 2;
const MAX_SIZE = 10;
const DEFAULT_SIZE = 6; // → 2,5 m Radius
/** Wie lange der „Ritual schließt sich"-Effekt dauert (ms), bevor die Geister kommen */
const CLOSE_DURATION = 1800;

let current: HTMLElement | null = null;

/** Zuletzt eingegebene Raumgröße in Metern (kürzere Seite). */
export function getRoomSize(): number {
  try {
    const saved = Number(localStorage.getItem(ROOM_SIZE_KEY));
    if (saved >= MIN_SIZE && saved <= MAX_SIZE) return saved;
  } catch {
    /* z. B. privater Modus */
  }
  return DEFAULT_SIZE;
}

function saveRoomSize(size: number): void {
  try {
    localStorage.setItem(ROOM_SIZE_KEY, String(size));
  } catch {
    /* dann eben nicht speichern */
  }
}

/**
 * Zeigt das Ritual. onDone wird aufgerufen, sobald der Spieler bestätigt hat
 * und der Effekt vorbei ist – mit der gewählten Raumgröße in Metern.
 */
export function showRitual(
  onDone: (roomSize: number) => void,
  options: { vibrate?: boolean; short?: boolean; onConfirm?: () => void } = {},
): void {
  hideRitual();
  const size = getRoomSize();

  // Kurze Version ab der 2. Runde: weniger Text, Regler steht schon, Button kommt schneller
  const lines = options.short
    ? `
      <p class="ritual-line">Return to the center…</p>
      <p class="ritual-line ritual-warning">They are waiting for you.</p>`
    : `
      <p class="ritual-line">Stand in the center of the room.</p>
      <p class="ritual-line">This is where they will gather.</p>
      <p class="ritual-line ritual-warning">They are drawn to whoever stands at the center… do not move.</p>`;

  const el = document.createElement('div');
  el.className = options.short ? 'screen ritual ritual-short' : 'screen ritual';
  el.innerHTML = `
    <div class="fog"></div>
    <div class="fog fog-2"></div>
    <div class="vignette"></div>

    <div class="ritual-circle" aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <circle class="ritual-ring" cx="100" cy="100" r="88" pathLength="100"/>
        <circle class="ritual-ring ritual-ring-inner" cx="100" cy="100" r="70" pathLength="100"/>
      </svg>
    </div>

    <div class="ritual-content">
      <h2 class="ritual-title">The Ritual</h2>
      ${lines}

      <label class="ritual-size">
        <span>How wide is the space around you?</span>
        <output class="ritual-value">${formatSize(size)}</output>
        <input type="range" min="${MIN_SIZE}" max="${MAX_SIZE}" step="0.5" value="${size}" />
        <small>shortest side of the room</small>
      </label>

      <button class="btn btn-primary ritual-begin">Begin the ritual</button>
    </div>
  `;

  const input = el.querySelector<HTMLInputElement>('input')!;
  const output = el.querySelector<HTMLOutputElement>('output')!;
  input.addEventListener('input', () => {
    output.textContent = formatSize(Number(input.value));
  });

  el.querySelector('.ritual-begin')!.addEventListener('click', () => {
    const chosen = Number(input.value);
    saveRoomSize(chosen);
    if (options.vibrate && 'vibrate' in navigator) navigator.vibrate([80, 120, 80, 120, 300]);
    options.onConfirm?.(); // z. B. Gong
    el.classList.add('closing'); // Text verschwindet, Kreis schließt sich, Bildschirm pulsiert rot
    setTimeout(() => {
      if (current !== el) return; // AR wurde in der Zwischenzeit beendet
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 600);
      current = null;
      onDone(chosen);
    }, CLOSE_DURATION);
  });

  document.getElementById('ui')!.append(el);
  current = el;
}

/** Ritual sofort entfernen (z. B. wenn die AR-Session vorher beendet wird). */
export function hideRitual(): void {
  current?.remove();
  current = null;
}

function formatSize(size: number): string {
  return `${size.toLocaleString('en', { maximumFractionDigits: 1 })} m`;
}
