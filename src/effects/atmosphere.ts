// ─────────────────────────────────────────────
// BEREICH: Gruselige Atmosphäre   →  Sümi
// ─────────────────────────────────────────────
// Legt eine Ebene über das Bild (AR-Kamera und 3D-Modus):
// dunkle, leicht rötliche Ränder (Vignette), kalter Farbstich und ab und zu ein Flackern.
// Liegt in #ui, damit es auch in AR sichtbar ist – aber UNTER allen Buttons und Anzeigen.
//
// Hinweis: Das echte Kamerabild selbst kann WebXR nicht verändern,
// deshalb wird nur eine halbtransparente Ebene darübergelegt.

export function setupAtmosphere(): void {
  const root = document.getElementById('ui')!;

  const layer = document.createElement('div');
  layer.className = 'atmosphere';
  layer.innerHTML = '<div class="atmosphere-tint"></div><div class="atmosphere-flicker"></div>';

  // als erstes Element einfügen → liegt unter den HUD-Elementen
  root.prepend(layer);
}
