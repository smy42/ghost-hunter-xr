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

/** Einstellungen – andere Bereiche können sie über hud.settings lesen. */
export interface Settings {
  sound: boolean;
  vibration: boolean;
  /** Jumpscares & rote Augen auf dem Startscreen */
  scary: boolean;
}

const SETTINGS_KEY = 'ghost-hunter-settings';
const DEFAULT_SETTINGS: Settings = { sound: true, vibration: true, scary: true };

const WHISPERS = [
  'they know you are here…',
  "don't look behind you",
  'something is in your room',
  'did you hear that?',
  'it was never empty',
  'you are not alone',
];

/** Eigener Geist als SVG: hohle Augen, rote Pupillen, offener Mund */
const GHOST_SVG = `
  <svg viewBox="0 0 100 120" aria-hidden="true">
    <path class="ghost-body" d="M50 4C24 4 10 26 10 54v58l12-11 12 13 12-13 12 13 12-13 12 13 8-9V54C90 26 76 4 50 4z"/>
    <ellipse class="ghost-hole" cx="35" cy="48" rx="9" ry="13"/>
    <ellipse class="ghost-hole" cx="65" cy="48" rx="9" ry="13"/>
    <circle class="ghost-pupil" cx="35" cy="51" r="3"/>
    <circle class="ghost-pupil" cx="65" cy="51" r="3"/>
    <ellipse class="ghost-hole" cx="50" cy="82" rx="8" ry="14"/>
  </svg>`;

export class Hud {
  private root = document.getElementById('ui')!;
  private callbacks: HudCallbacks;
  private settingsState: Settings = loadSettings();

  // Screens
  private startScreen = document.createElement('div');
  private howToScreen = document.createElement('div');
  private settingsScreen = document.createElement('div');
  private screens: HTMLElement[] = [];
  private howToPage = 0;

  // Anzeigen während der Jagd
  private huntLayer = document.createElement('div');
  private ghostsLeft = document.createElement('div');
  private ghostsLeftNumber = document.createElement('span');
  private captureButton = document.createElement('button');
  private lastGhostsLeft = -1;

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.buildStartScreen();
    this.buildHowToScreen();
    this.buildSettingsScreen();
    this.buildHuntLayer();

    this.screens = [this.startScreen, this.howToScreen, this.settingsScreen, this.huntLayer];
    this.root.append(...this.screens);

    this.startScaryEffects();
    this.showStart();

    // TODO (Person C): Fadenkreuz, Fangbalken, Pfeil mit Distanz, Radar
    // TODO (Person C): Screens – Hunt Complete, Game Over, Pause
  }

  /** Aktuelle Einstellungen (z. B. hud.settings.sound) */
  get settings(): Settings {
    return this.settingsState;
  }

  // ---------- Startscreen ----------

  private buildStartScreen(): void {
    this.startScreen.className = 'screen screen-start';
    this.startScreen.innerHTML = `
      <div class="fog"></div>
      <div class="fog fog-2"></div>
      <div class="eyes-layer"></div>
      <div class="vignette"></div>

      <div class="start-title">
        <div class="start-ghost">${GHOST_SVG}</div>
        <h1>GHOST<br>HUNTER <span>XR</span></h1>
      </div>

      <p class="whisper"></p>

      <div class="start-buttons">
        <button class="btn btn-primary" data-action="start">▶&nbsp; Start Hunt</button>
        <button class="btn" data-action="howto">How to Play</button>
        <button class="btn" data-action="settings">Settings</button>
      </div>

      <div class="glimpse">${GHOST_SVG}</div>
    `;

    this.onAction(this.startScreen, {
      start: () => this.startHunt(),
      howto: () => this.showHowTo(),
      settings: () => this.showSettings(),
    });
  }

  /** Flüstern, rote Augen und Jumpscares – laufen nur, solange der Startscreen sichtbar ist. */
  private startScaryEffects(): void {
    const whisper = this.startScreen.querySelector<HTMLElement>('.whisper')!;
    const eyesLayer = this.startScreen.querySelector<HTMLElement>('.eyes-layer')!;
    const glimpse = this.startScreen.querySelector<HTMLElement>('.glimpse')!;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Flüstertexte
    let w = 0;
    setInterval(() => {
      if (this.startScreen.hidden) return;
      whisper.classList.remove('visible');
      setTimeout(() => {
        whisper.textContent = WHISPERS[w++ % WHISPERS.length];
        whisper.classList.add('visible');
      }, 1200);
    }, 4500);

    // Rote Augen tauchen zufällig im Dunkeln auf
    setInterval(() => {
      if (this.startScreen.hidden || !this.settingsState.scary) return;
      const eyes = document.createElement('div');
      eyes.className = 'eyes';
      eyes.innerHTML = '<i></i><i></i>';
      eyes.style.left = `${5 + Math.random() * 85}%`;
      eyes.style.top = `${5 + Math.random() * 85}%`;
      eyes.style.scale = String(0.6 + Math.random());
      eyes.addEventListener('animationend', () => eyes.remove());
      eyesLayer.append(eyes);
    }, 1800);

    // Jumpscare: Geist springt ins Bild, Screen wackelt
    if (reducedMotion) return;
    const scheduleGlimpse = () => {
      setTimeout(() => {
        if (!this.startScreen.hidden && this.settingsState.scary) {
          glimpse.classList.remove('show');
          void glimpse.offsetWidth; // Animation neu starten
          glimpse.classList.add('show');
          this.startScreen.classList.add('shake');
          setTimeout(() => this.startScreen.classList.remove('shake'), 400);
        }
        scheduleGlimpse();
      }, 9000 + Math.random() * 9000);
    };
    scheduleGlimpse();
  }

  // ---------- How to Play ----------

  private buildHowToScreen(): void {
    this.howToScreen.className = 'screen screen-howto';
    this.howToScreen.innerHTML = `
      <header class="screen-header">
        <button class="icon-btn" data-action="home" aria-label="Back">←</button>
        <h2>How to Play</h2>
      </header>

      <section class="howto-page" data-page="0">
        <p class="howto-goal">Catch all ghosts before time runs out!</p>
        ${card('🚶', 'Move', 'Walk around your room. The ghosts appear around you.')}
        ${card('🔦', 'Light', 'Use your UV light to reveal ghosts. Watch your battery!')}
        ${card('🎯', 'Aim', "Point your phone at a ghost so it's in the middle of the screen.")}
        ${card('👆', 'Capture', 'Tap fast to catch the ghost before it escapes!')}
        <p class="howto-hint">📷 You will be asked for camera access in the next step.</p>
        <div class="howto-nav">
          <button class="btn btn-primary" data-action="next">Next</button>
        </div>
      </section>

      <section class="howto-page" data-page="1">
        ${card('👻', 'Normal ghost', 'Catch it! +100 points.')}
        ${card('💨', 'Fast ghost', 'Needs more taps. Be quick!')}
        ${card('😈', 'Evil ghost (red aura)', "DON'T catch it! All captured ghosts will escape.", 'card-evil')}
        ${card('⏳', 'Time ghost', 'Catch it for +10 seconds.')}
        <div class="howto-nav">
          <button class="btn" data-action="prev">Back</button>
          <button class="btn btn-primary" data-action="next">Next</button>
        </div>
      </section>

      <section class="howto-page" data-page="2">
        ${card('⏱️', 'Countdown', 'You have limited time. Catch the time ghost for +10 seconds.')}
        ${card('🏆', 'Win', 'Catch all ghosts (except the evil one) to complete the hunt.')}
        ${card('💀', 'Lose', "If a ghost escapes or time runs out, it's game over.")}
        ${card('⭐', 'Score', 'Every ghost gives 100 points. Be fast!')}
        <div class="howto-nav">
          <button class="btn" data-action="prev">Back</button>
          <button class="btn btn-primary" data-action="start">▶&nbsp; Start Hunt</button>
        </div>
      </section>

      <div class="dots"><span></span><span></span><span></span></div>
    `;

    this.onAction(this.howToScreen, {
      home: () => this.showStart(),
      next: () => this.showHowToPage(this.howToPage + 1),
      prev: () => this.showHowToPage(this.howToPage - 1),
      start: () => this.startHunt(),
    });
  }

  private showHowToPage(page: number): void {
    this.howToPage = Math.max(0, Math.min(2, page));
    this.howToScreen.querySelectorAll<HTMLElement>('.howto-page').forEach((el) => {
      el.hidden = Number(el.dataset.page) !== this.howToPage;
    });
    this.howToScreen.querySelectorAll('.dots span').forEach((dot, i) => {
      dot.classList.toggle('active', i === this.howToPage);
    });
  }

  // ---------- Settings ----------

  private buildSettingsScreen(): void {
    this.settingsScreen.className = 'screen screen-settings';
    this.settingsScreen.innerHTML = `
      <header class="screen-header">
        <button class="icon-btn" data-action="home" aria-label="Back">←</button>
        <h2>Settings</h2>
      </header>
      <div class="settings-list">
        ${toggle('sound', '🔊 Sound')}
        ${toggle('vibration', '📳 Vibration', 'Android only')}
        ${toggle('scary', '😱 Jumpscares', 'Scary effects on the start screen')}
      </div>
    `;

    this.settingsScreen.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach((input) => {
      const key = input.dataset.setting as keyof Settings;
      input.checked = this.settingsState[key];
      input.addEventListener('change', () => {
        this.settingsState[key] = input.checked;
        saveSettings(this.settingsState);
        if (key === 'vibration' && input.checked) this.vibrate(50);
      });
    });

    this.onAction(this.settingsScreen, { home: () => this.showStart() });
  }

  // ---------- Jagd-Anzeige ----------

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
      this.vibrate(25);
      this.callbacks.onCapture();
    });

    this.huntLayer.append(this.ghostsLeft, this.captureButton);
  }

  // ---------- Screens wechseln (immer nur EIN Screen sichtbar) ----------

  private show(screen: HTMLElement): void {
    for (const s of this.screens) s.hidden = s !== screen;
  }

  showStart(): void {
    this.show(this.startScreen);
  }

  showHowTo(): void {
    this.show(this.howToScreen);
    this.showHowToPage(0);
  }

  showSettings(): void {
    this.show(this.settingsScreen);
  }

  /** Öffentlich, damit z. B. beim AR-Start direkt die Jagd-Anzeige kommt. */
  showHunt(): void {
    this.show(this.huntLayer);
  }

  private startHunt(): void {
    this.showHunt();
    this.callbacks.onStart();
  }

  // ---------- Hilfsfunktionen ----------

  /** Ein Klick-Listener pro Screen, Buttons werden über data-action erkannt. */
  private onAction(el: HTMLElement, handlers: Record<string, () => void>): void {
    el.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) handlers[action]?.();
    });
  }

  private vibrate(pattern: number | number[]): void {
    if (this.settingsState.vibration && 'vibrate' in navigator) navigator.vibrate(pattern);
  }

  // ---------- jeden Frame ----------

  update(state: GameSnapshot): void {
    if (state.ghostsLeft !== this.lastGhostsLeft) {
      this.ghostsLeftNumber.textContent = String(state.ghostsLeft);
      this.lastGhostsLeft = state.ghostsLeft;
    }
    // TODO (Person C): Hunt Complete / Game Over anzeigen, wenn state.status !== 'playing'
  }
}

// ---------- HTML-Bausteine ----------

function card(icon: string, title: string, text: string, extraClass = ''): string {
  return `
    <div class="card ${extraClass}">
      <span class="card-icon">${icon}</span>
      <div><b>${title}</b><small>${text}</small></div>
    </div>`;
}

function toggle(key: keyof Settings, label: string, hint = ''): string {
  return `
    <label class="toggle-row">
      <span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
      <input type="checkbox" data-setting="${key}">
      <span class="switch"></span>
    </label>`;
}

// ---------- Einstellungen speichern ----------

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* z. B. privater Modus – dann eben nicht speichern */
  }
}