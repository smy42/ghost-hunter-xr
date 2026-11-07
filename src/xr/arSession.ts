// ─────────────────────────────────────────────
// BEREICH: AR-Session & Tracking   →  Sümi
// ─────────────────────────────────────────────
// Prüft, ob WebXR-AR verfügbar ist, und zeigt dann den "Start AR"-Button.
// Beim Start/Ende der AR-Session werden die Callbacks aus main.ts aufgerufen.

import type * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { showTrackingOverlay } from './trackingOverlay';

export async function setupAR(
  renderer: THREE.WebGLRenderer,
  onStart: () => void,
  onEnd: () => void,
): Promise<void> {
  // Feature Detection: gibt es WebXR-AR überhaupt? (iPhone/Desktop: nein)
  const supported = 'xr' in navigator && (await navigator.xr!.isSessionSupported('immersive-ar'));
  if (!supported) {
    console.log('AR nicht verfügbar → 3D-Modus');
    return;
  }

  // 'local': Startposition des Handys = Nullpunkt (0,0,0), auf Augenhöhe
  renderer.xr.setReferenceSpaceType('local');

  const uiRoot = document.getElementById('ui')!;
  const button = ARButton.createButton(renderer, {
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: uiRoot }, // HTML-Anzeigen aus ui/ bleiben in AR sichtbar
  });
  // Button nach oben verschieben, damit er nicht den Capture-Button verdeckt
  button.style.bottom = 'auto';
  button.style.top = '16px';
  document.body.appendChild(button);

  renderer.xr.addEventListener('sessionstart', onStart);
  renderer.xr.addEventListener('sessionend', onEnd);

  // TODO (Sümi): AR am Handy testen – bleiben die Geister beim Herumlaufen an ihrem Platz?
}

// ---------- Tracking-Verlust ----------
// ARCore verliert das Tracking z. B. bei schnellen Bewegungen, Dunkelheit oder einer weißen Wand.
// Dann gibt es keine Position mehr (pose = null) oder sie ist nur geschätzt (emulatedPosition).

/** Erst nach so vielen Sekunden ohne Tracking gilt es als verloren (kurze Aussetzer ignorieren) */
const LOST_DELAY = 0.5;

let trackingLost = false;
let badFor = 0;

/**
 * Jeden Frame im AR-Modus aufrufen (aus main.ts).
 * Zeigt/versteckt das „Look around slowly"-Overlay.
 * @returns true, solange das Tracking verloren ist → Spiel einfrieren
 */
export function updateTracking(renderer: THREE.WebGLRenderer, dt: number): boolean {
  const frame = renderer.xr.getFrame();
  const space = renderer.xr.getReferenceSpace();
  if (!frame || !space) return trackingLost;

  const pose = frame.getViewerPose(space);
  const bad = !pose || pose.emulatedPosition;
  badFor = bad ? badFor + dt : 0;

  const lost = badFor >= LOST_DELAY;
  if (lost !== trackingLost) {
    trackingLost = lost;
    showTrackingOverlay(lost);
  }
  return trackingLost;
}

/** Beim Ende der AR-Session zurücksetzen. */
export function resetTracking(): void {
  trackingLost = false;
  badFor = 0;
  showTrackingOverlay(false);
}
