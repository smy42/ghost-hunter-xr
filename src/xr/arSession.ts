// ─────────────────────────────────────────────
// BEREICH: AR-Session & Tracking   →  Sümi
// ─────────────────────────────────────────────
// Prüft, ob WebXR-AR verfügbar ist, und zeigt dann den "Start AR"-Button.
// Beim Start/Ende der AR-Session werden die Callbacks aus main.ts aufgerufen.

import type * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

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
  document.body.appendChild(button);

  renderer.xr.addEventListener('sessionstart', onStart);
  renderer.xr.addEventListener('sessionend', onEnd);

  // TODO (Sümi): AR am Handy testen – bleiben die Geister beim Herumlaufen an ihrem Platz?
  // TODO (später): Hit-Test für den Boden, Tracking-Verlust erkennen ("Look around slowly")
}
