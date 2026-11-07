// ─────────────────────────────────────────────
// BEREICH: Hinweis bei Tracking-Verlust (AR)   →  Sümi
// ─────────────────────────────────────────────
// Wird von arSession.ts ein- und ausgeblendet. Liegt über allem, Klicks gehen durch.

import './trackingOverlay.css';

let overlay: HTMLElement | null = null;

export function showTrackingOverlay(visible: boolean): void {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'tracking-overlay';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `
      <div class="tracking-phone" aria-hidden="true">
        <svg viewBox="0 0 40 64"><rect x="3" y="3" width="34" height="58" rx="6"/><circle cx="20" cy="54" r="2.5"/></svg>
      </div>
      <p class="tracking-text">Look around slowly…</p>
      <p class="tracking-whisper">they hide where you cannot see</p>
    `;
    document.getElementById('ui')!.append(overlay);
  }
  overlay.classList.toggle('visible', visible);
}
