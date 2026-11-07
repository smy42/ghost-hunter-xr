// ─────────────────────────────────────────────
// BEREICH: Interface (Screens & Anzeigen)   →  Person C
// ─────────────────────────────────────────────
// Alles liegt im <div id="ui">. Dieses Element bleibt auch in AR sichtbar (dom-overlay).
// Also: Anzeigen IMMER in #ui einhängen, nicht direkt in <body>.

import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { Ghost, GameSnapshot, Settings } from '../types';

/** Reichweite des Radars in Metern – weiter entfernte Geister kleben am Rand */
const RADAR_RANGE = 8;
/** Abstand des Pfeils zum Bildschirmrand (px): seitlich, oben (unter Timer & Co.), unten (über den Buttons) */
const ARROW_MARGIN = { side: 44, top: 110, bottom: 150 };

export interface HudCallbacks {
  /** "Start Hunt" wurde gedrückt → Runde starten (main.ts) */
  onStart: () => void;
  onNextLevel?: () => void;
  /** Tap auf den Fang-Button (game/) */
  onCapture: () => void;
  /** Zurück ins Hauptmenü (z. B. vom „Hunt Complete"-Screen) → Menü-Musik */
  onMenu?: () => void;
  /** Pause-Button gedrückt → game.pause() (main.ts) */
  onPause?: () => void;
  /** „Resume" im Pause-Menü → game.resume() (main.ts) */
  onResume?: () => void;
  /** UV-Button gedrückt → game.toggleUv() (main.ts) */
  onToggleUv?: () => void;
}

/** Kurzer Text zu Rundenbeginn, je nach Level */
const LEVEL_TAGLINES = [
  'They are waiting…', // Level 1
  'They are moving…', // Level 2
  'They run from you…', // Level 3
  'They can vanish…', // Level 4+
];

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
  private completeScreen = document.createElement('div');
  private lostScreen = document.createElement('div');
  private jumpscare = document.createElement('div');
  private completeTimer = 0;
  private lastStatus: GameSnapshot['status'] = 'playing';
  private screens: HTMLElement[] = [];
  private howToPage = 0;

  // Anzeigen während der Jagd
  private huntLayer = document.createElement('div');
  private ghostsLeft = document.createElement('div');
  private ghostsLeftNumber = document.createElement('span');
  private captureButton = document.createElement('button');
  private lastGhostsLeft = -1;
  private crosshair = document.createElement('div');
  private timer = document.createElement('div');
  private timerValue = document.createElement('span');
  private timerWhisper = document.createElement('small');
  private danger = document.createElement('div');
  private lastTimerText = '';
  private lastTimeLeft = Infinity;
  private lastAimKey = '';
  private popup = document.createElement('div');
  private popupTimer = 0;

  // Pause, UV-Licht, Level
  private pauseButton = document.createElement('button');
  private pauseOverlay = document.createElement('div');
  private uvButton = document.createElement('button');
  private batteryFill = document.createElement('i');
  private uvLabel = document.createElement('b');
  private batteryText = document.createElement('small');
  private lastUvKey = '';
  private levelBadge = document.createElement('div');
  private lastLevel = -1;
  private scoreBadge = document.createElement('div');
  private scoreValue = document.createElement('b');
  private lastScore = -1;
  private levelIntro = document.createElement('div');
  private levelIntroTimer = 0;
  /** Wohin der ←-Button in den Settings führt */
  private settingsReturn: 'start' | 'pause' = 'start';

  // Radar & Pfeil zum nächsten Geist
  private radar = document.createElement('div');
  private radarDots = new Map<number, HTMLElement>();
  private arrow = document.createElement('div');
  private arrowIcon!: SVGElement;
  private arrowDist!: HTMLElement;
  private lastArrowText = '';
  private camPos = new Vector3();
  private camDir = new Vector3();
  private ghostPos = new Vector3();
  private projected = new Vector3();

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.buildStartScreen();
    this.buildHowToScreen();
    this.buildSettingsScreen();
    this.buildHuntLayer();
    this.buildCompleteScreen();
    this.buildLostScreen();

    this.screens = [
      this.startScreen,
      this.howToScreen,
      this.settingsScreen,
      this.huntLayer,
      this.completeScreen,
      this.lostScreen,
    ];
    this.root.append(...this.screens);

    // Jumpscare liegt über allem
    this.jumpscare.className = 'jumpscare';
    this.jumpscare.hidden = true;
    this.jumpscare.innerHTML = `<div class="jumpscare-ghost">${GHOST_SVG}</div>`;
    this.root.append(this.jumpscare);

    this.startScaryEffects();
    this.showStart();
    this.buildEnterGate();

  }

  /** Aktuelle Einstellungen (z. B. hud.settings.sound) */
  get settings(): Settings {
    return this.settingsState;
  }

  // ---------- Eingangsbildschirm ----------

  /**
   * „Tippen zum Betreten" – liegt über dem Startscreen.
   * Browser spielen erst nach einem Tippen / Tastendruck Ton ab; dieser eine Tipp
   * schaltet die Musik frei (audio/sound.ts), danach erscheint der Startscreen mit Musik.
   */
  private buildEnterGate(): void {
    const gate = document.createElement('div');
    gate.className = 'screen screen-enter';
    gate.innerHTML = `
      <div class="fog"></div>
      <div class="vignette"></div>
      <div class="enter-content">
        <div class="enter-ghost">${GHOST_SVG}</div>
        <p class="enter-text">Tap to enter</p>
        <p class="enter-hint">🎧 Headphones recommended</p>
      </div>
    `;
    this.root.append(gate);

    const enter = () => {
      document.removeEventListener('click', enter);
      document.removeEventListener('keydown', enter);
      gate.classList.add('leaving');
      setTimeout(() => gate.remove(), 900);
    };
    document.addEventListener('click', enter);
    document.addEventListener('keydown', enter);
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
      settings: () => this.showSettings('start'),
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

    this.onAction(this.settingsScreen, {
      home: () => (this.settingsReturn === 'pause' ? this.showHunt() : this.showStart()),
    });
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

    this.popup.className = 'hud-popup';
    this.popup.setAttribute('role', 'status');
    this.popup.hidden = true;

    // Fadenkreuz mit Fangbalken (Ring füllt sich beim Fangen)
    this.crosshair.className = 'crosshair';
    this.crosshair.innerHTML = `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ch-track" cx="50" cy="50" r="40"/>
        <circle class="ch-progress" cx="50" cy="50" r="40" pathLength="100"/>
        <g class="ch-ticks">
          <path d="M50 4v12M50 84v12M4 50h12M84 50h12"/>
        </g>
        <circle class="ch-dot" cx="50" cy="50" r="2.5"/>
      </svg>
      <span class="ch-label"></span>
    `;

    // Timer oben in der Mitte + roter Rand, der bei wenig Zeit pulsiert
    this.timer.className = 'hud-timer';
    this.timerWhisper.className = 'timer-whisper';
    this.timer.append(this.timerValue, this.timerWhisper);
    this.danger.className = 'hud-danger';

    this.buildPauseUvLevel();
    this.buildRadar();

    this.huntLayer.append(
      this.danger,
      this.crosshair,
      this.timer,
      this.ghostsLeft,
      this.levelBadge,
      this.scoreBadge,
      this.radar,
      this.arrow,
      this.pauseButton,
      this.uvButton,
      this.captureButton,
      this.popup,
      this.levelIntro,
      this.pauseOverlay,
    );
  }

  // ---------- Pause-Button, Pause-Menü, UV-Button, Level-Anzeige ----------

  private buildPauseUvLevel(): void {
    // Pause-Button oben links (Desktop: Taste P)
    this.pauseButton.className = 'hud-pause';
    this.pauseButton.setAttribute('aria-label', 'Pause');
    this.pauseButton.innerHTML = '<span class="pause-icon"></span><kbd>P</kbd>';
    this.pauseButton.addEventListener('click', () => this.callbacks.onPause?.());

    // Level-Anzeige neben dem Pause-Button
    this.levelBadge.className = 'hud-level';

    // Punktestand unter Pause & Level
    this.scoreBadge.className = 'hud-score';
    const scoreLabel = document.createElement('small');
    scoreLabel.textContent = 'Score';
    this.scoreBadge.append(scoreLabel, this.scoreValue);

    // Level-Einblendung zu Rundenbeginn
    this.levelIntro.className = 'level-intro';
    this.levelIntro.hidden = true;

    // UV-Button unten rechts (gut mit dem Daumen erreichbar, Desktop: Taste F)
    this.uvButton.className = 'hud-uv';
    this.uvButton.setAttribute('aria-label', 'UV light on/off');
    const icon = document.createElement('span');
    icon.className = 'uv-icon';
    icon.textContent = '🔦';
    const bar = document.createElement('span');
    bar.className = 'uv-battery';
    bar.append(this.batteryFill);
    const key = document.createElement('kbd');
    key.textContent = 'F';
    this.uvButton.append(icon, this.uvLabel, bar, this.batteryText, key);
    // pointerdown → reagiert sofort, auch mitten im Fangen
    this.uvButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.vibrate(15);
      this.callbacks.onToggleUv?.();
    });

    // Pause-Menü (liegt über allem im HUD, z-index 12)
    this.pauseOverlay.className = 'screen screen-pause';
    this.pauseOverlay.hidden = true;
    this.pauseOverlay.innerHTML = `
      <div class="fog"></div>
      <div class="vignette"></div>
      <div class="pause-title">
        <h1>PAUSED</h1>
        <p class="pause-sub">They are still here… waiting for you.</p>
      </div>
      <div class="start-buttons">
        <button class="btn btn-primary" data-action="resume">▶&nbsp; Resume</button>
        <button class="btn" data-action="settings">Settings</button>
        <button class="btn" data-action="menu">Main Menu</button>
      </div>
    `;
    this.onAction(this.pauseOverlay, {
      resume: () => this.callbacks.onResume?.(),
      settings: () => this.showSettings('pause'),
      menu: () => {
        this.callbacks.onMenu?.(); // Menü-Musik (playMenuAudio)
        this.showStart();
      },
    });
  }

  /** Zu Rundenbeginn kurz „Level 2 – They are moving…" einblenden (aus main.ts → startRound). */
  showLevelIntro(level: number): void {
    const tagline = LEVEL_TAGLINES[Math.min(level, LEVEL_TAGLINES.length) - 1];
    this.levelIntro.innerHTML = `<small>LEVEL ${level}</small><b>${tagline}</b>`;
    this.levelIntro.hidden = false;
    this.levelIntro.classList.remove('show');
    void this.levelIntro.offsetWidth; // Animation neu starten
    this.levelIntro.classList.add('show');
    window.clearTimeout(this.levelIntroTimer);
    this.levelIntroTimer = window.setTimeout(() => (this.levelIntro.hidden = true), 3000);
  }

  // ---------- Radar & Pfeil zum nächsten Geist ----------

  private buildRadar(): void {
    // Mini-Radar oben rechts: Mitte = du, oben = Blickrichtung
    this.radar.className = 'hud-radar';
    this.radar.setAttribute('aria-hidden', 'true');
    this.radar.innerHTML = `
      <div class="radar-sweep"></div>
      <div class="radar-ring"></div>
      <div class="radar-cone"></div>
      <div class="radar-me"></div>
    `;

    // Pfeil am Bildschirmrand, wenn der nächste Geist nicht im Bild ist
    this.arrow.className = 'hud-arrow';
    this.arrow.hidden = true;
    this.arrow.innerHTML = `
      <svg class="arrow-icon" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M6 7 L36 20 L6 33 L14 20 Z"/>
      </svg>
      <span class="arrow-dist"></span>
    `;
    this.arrowIcon = this.arrow.querySelector('svg')!;
    this.arrowDist = this.arrow.querySelector('.arrow-dist')!;
  }

  /**
   * Radar & Pfeil aktualisieren (jeden Frame aus main.ts, solange gejagt wird).
   * Zeigt alle nicht gefangenen Geister (versteckte blass, böser rot, Time-Geist gold).
   * Der Pfeil zeigt zum nächsten Geist, den man fangen soll (nie zum bösen).
   */
  updateRadar(ghosts: Ghost[], camera: Camera): void {
    camera.getWorldPosition(this.camPos);
    camera.getWorldDirection(this.camDir);
    // Blickrichtung nur waagrecht (Radar ist eine Draufsicht)
    const flat = Math.hypot(this.camDir.x, this.camDir.z) || 1;
    const fx = this.camDir.x / flat;
    const fz = this.camDir.z / flat;
    const radius = (this.radar.clientWidth || 96) / 2 - 6;

    const seen = new Set<number>();
    let target: Ghost | null = null;
    let targetDist = Infinity;

    for (const ghost of ghosts) {
      // gefangen oder noch nicht erschienen → nicht anzeigen
      if (ghost.caught || !(ghost.object.visible || ghost.hidden)) continue;
      seen.add(ghost.id);

      ghost.object.getWorldPosition(this.ghostPos);
      const dx = this.ghostPos.x - this.camPos.x;
      const dz = this.ghostPos.z - this.camPos.z;
      const dist = Math.hypot(dx, dz);

      // In die Sicht des Spielers drehen: rechts = +x, vorne = oben
      const right = -dx * fz + dz * fx;
      const ahead = dx * fx + dz * fz;
      const scale = (Math.min(dist, RADAR_RANGE) / RADAR_RANGE) * radius / (dist || 1);

      let dot = this.radarDots.get(ghost.id);
      if (!dot) {
        dot = document.createElement('i');
        this.radar.append(dot);
        this.radarDots.set(ghost.id, dot);
      }
      const cls = `radar-dot type-${ghost.type}${ghost.hidden ? ' is-hidden' : ''}${dist > RADAR_RANGE ? ' is-edge' : ''}`;
      if (dot.className !== cls) dot.className = cls;
      dot.style.transform = `translate(${(right * scale).toFixed(1)}px, ${(-ahead * scale).toFixed(1)}px)`;

      // Ziel für den Pfeil: sichtbare Geister vor versteckten, dann der nächste
      if (ghost.type === 'evil') continue;
      const better =
        !target ||
        (target.hidden && !ghost.hidden) ||
        (target.hidden === ghost.hidden && dist < targetDist);
      if (better) {
        target = ghost;
        targetDist = dist;
      }
    }

    // Punkte von gefangenen / entfernten Geistern wegräumen
    for (const [id, dot] of this.radarDots) {
      if (!seen.has(id)) {
        dot.remove();
        this.radarDots.delete(id);
      }
    }

    this.updateArrow(target, targetDist, camera);
  }

  private updateArrow(target: Ghost | null, dist: number, camera: Camera): void {
    if (!target) {
      this.arrow.hidden = true;
      return;
    }
    target.object.getWorldPosition(this.ghostPos);
    this.projected.copy(this.ghostPos).project(camera);
    const local = camera.worldToLocal(this.ghostPos); // Kamera-Sicht: x rechts, y oben, z nach hinten
    const inFront = local.z < 0;

    // Geist ist gut im Bild → kein Pfeil nötig
    if (inFront && Math.abs(this.projected.x) < 0.85 && Math.abs(this.projected.y) < 0.85) {
      this.arrow.hidden = true;
      return;
    }

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    let sx: number;
    let sy: number;
    let behind = false;
    if (inFront) {
      // Richtung auf dem Bildschirm (Bildschirm-y zeigt nach unten)
      sx = this.projected.x * halfW;
      sy = -this.projected.y * halfH;
    } else {
      sx = local.x;
      sy = -local.y * 0.3; // hinter dir zählt vor allem links/rechts
      // fast genau hinter dir → Pfeil nach unten: „umdrehen"
      if (Math.abs(local.x) < Math.abs(local.z) * 0.35) {
        sx = 0;
        sy = 1;
        behind = true;
      }
    }

    // An den Bildschirmrand schieben (mit Abstand zu Timer & Buttons)
    const limits = [
      sx !== 0 ? (halfW - ARROW_MARGIN.side) / Math.abs(sx) : Infinity,
      sy < 0 ? (halfH - ARROW_MARGIN.top) / -sy : sy > 0 ? (halfH - ARROW_MARGIN.bottom) / sy : Infinity,
    ];
    const k = Math.min(...limits);
    this.arrow.style.left = `${(halfW + sx * k).toFixed(0)}px`;
    this.arrow.style.top = `${(halfH + sy * k).toFixed(0)}px`;
    this.arrowIcon.style.transform = `rotate(${((Math.atan2(sy, sx) * 180) / Math.PI).toFixed(1)}deg)`;

    const text = `${dist.toFixed(1)} m${behind ? ' · behind you' : ''}`;
    if (text !== this.lastArrowText) {
      this.arrowDist.textContent = text;
      this.lastArrowText = text;
    }
    const cls = `hud-arrow type-${target.type}${target.hidden ? ' is-hidden' : ''}${behind ? ' is-behind' : ''}`;
    if (this.arrow.className !== cls) this.arrow.className = cls;
    this.arrow.hidden = false;
  }

  /** UV-Button & Akkubalken. Unter 20 % rot und blinkend. */
  private updateUv(uvOn: boolean, battery: number): void {
    const percent = Math.round(battery);
    const key = `${uvOn}|${percent}`;
    if (key === this.lastUvKey) return;
    this.lastUvKey = key;

    const empty = !uvOn && battery < 1;
    this.uvButton.classList.toggle('is-on', uvOn);
    this.uvButton.classList.toggle('is-low', percent < 20);
    this.uvButton.classList.toggle('is-empty', empty);
    this.uvLabel.textContent = empty ? 'EMPTY' : uvOn ? 'UV ON' : 'UV OFF';
    this.batteryText.textContent = `${percent} %`;
    this.batteryFill.style.width = `${percent}%`;
  }

  /**
   * Timer aktualisieren (jeden Frame aus main.ts).
   * Ab 20 s rot + Herzschlag-Puls, ab 10 s zittert er und flüstert.
   */
  updateTimer(timeLeft: number): void {
    // Zeit ist gestiegen → Time-Geist gefangen → goldenes Aufblitzen
    if (timeLeft > this.lastTimeLeft + 1) {
      this.timer.classList.remove('bonus');
      void this.timer.offsetWidth;
      this.timer.classList.add('bonus');
    }
    this.lastTimeLeft = timeLeft;

    const seconds = Math.ceil(timeLeft);
    const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (text !== this.lastTimerText) {
      this.timerValue.textContent = text;
      this.lastTimerText = text;
      this.timer.classList.toggle('is-low', seconds <= 20);
      this.timer.classList.toggle('is-critical', seconds <= 10);
      this.timerWhisper.textContent =
        seconds <= 10 && this.settingsState.scary ? WHISPERS_LOW[seconds % WHISPERS_LOW.length] : '';
    }
    // Roter Rand wird stärker, je weniger Zeit bleibt
    const danger = timeLeft <= 20 ? 1 - timeLeft / 20 : 0;
    this.danger.style.setProperty('--danger', danger.toFixed(2));
  }

  /**
   * Fadenkreuz & Fangbalken aktualisieren (jeden Frame aus main.ts).
   * @param aim worauf gezielt wird (null = nichts) und Fortschritt 0–100
   */
  updateAim(aim: { type: string | null; progress: number; tooFar: boolean }): void {
    const progress = Math.round(aim.progress);
    const key = `${aim.type}|${progress}|${aim.tooFar}`;
    if (key === this.lastAimKey) return;
    this.lastAimKey = key;

    const inRange = aim.type !== null && !aim.tooFar;
    this.crosshair.classList.toggle('is-far', aim.tooFar);
    this.crosshair.classList.toggle('is-target', inRange);
    this.crosshair.classList.toggle('is-evil', inRange && aim.type === 'evil');
    this.crosshair.classList.toggle('is-time', inRange && aim.type === 'timeadd');
    this.crosshair.classList.toggle('is-fast', inRange && aim.type === 'fast');
    this.crosshair.style.setProperty('--progress', String(progress));
    const label = this.crosshair.querySelector<HTMLElement>('.ch-label')!;
    label.textContent = aim.tooFar
      ? 'GET CLOSER…'
      : aim.type === 'timeadd' ? '+10 s'
        : aim.type === 'fast' ? 'TAP FAST!'
          : ''; // beim bösen Geist bewusst KEIN Text – nur rotes Fadenkreuz
  }

  /** true, solange die Jagd-Anzeige sichtbar ist (nicht im Menü / Endscreen) */
  get isHunting(): boolean {
    return !this.huntLayer.hidden;
  }

  /**
   * Kurzes Popup während der Jagd, das von selbst wieder verschwindet.
   * @param kind 'evil' (rot) oder 'time' (gold) – bestimmt Farbe & Vibration
   */
  showPopup(kind: 'evil' | 'time', title: string, text: string): void {
    this.popup.className = `hud-popup hud-popup-${kind}`;
    this.popup.innerHTML = `<b>${title}</b><small>${text}</small>`;
    this.popup.hidden = false;
    void this.popup.offsetWidth; // Animation neu starten
    this.popup.classList.add('visible');
    this.vibrate(kind === 'evil' ? [80, 60, 160] : 40);

    window.clearTimeout(this.popupTimer);
    this.popupTimer = window.setTimeout(() => {
      this.popup.classList.remove('visible');
      this.popupTimer = window.setTimeout(() => (this.popup.hidden = true), 400);
    }, kind === 'evil' ? 3200 : 2200);
  }

  // ---------- Hunt Complete (Runde gewonnen) ----------

  private buildCompleteScreen(): void {
    this.completeScreen.className = 'screen screen-complete';
    this.completeScreen.innerHTML = `
      <div class="fog"></div>
      <div class="vignette"></div>

      <div class="complete-title">
        <div class="complete-ghost">${GHOST_SVG}</div>
        <h1>HUNT<br>COMPLETE</h1>
        <p class="complete-sub">The house is quiet… for now.</p>
      </div>

      <div class="complete-stats">
        <div><small>Ghosts caught</small><b data-stat="ghosts">0</b></div>
        <div><small>Score</small><b data-stat="score">0</b></div>
        <div><small>Time</small><b data-stat="time">0:00</b></div>
      </div>

      <div class="start-buttons">
        <button class="btn btn-primary" data-action="next">Next Level ▶</button>
        <button class="btn" data-action="menu">Main Menu</button>
      </div>
    `;

    this.onAction(this.completeScreen, {
      next: () => {
        this.showHunt();
        this.callbacks.onNextLevel?.();
      },
      menu: () => {
        this.callbacks.onMenu?.();
        this.showStart();
      },
    });
  }

  // ---------- Game Over (Zeit abgelaufen) ----------

  private buildLostScreen(): void {
    this.lostScreen.className = 'screen screen-lost';
    this.lostScreen.innerHTML = `
      <div class="fog"></div>
      <div class="fog fog-2"></div>
      <div class="vignette"></div>

      <div class="lost-title">
        <h1>THEY<br>GOT YOU</h1>
        <p class="lost-sub">Time ran out… and they found you first.</p>
      </div>

      <div class="complete-stats">
        <div><small>Ghosts caught</small><b data-stat="ghosts">0</b></div>
        <div><small>Score</small><b data-stat="score">0</b></div>
      </div>

      <div class="start-buttons">
        <button class="btn btn-blood" data-action="retry">↻&nbsp; Try Again</button>
        <button class="btn" data-action="menu">Main Menu</button>
      </div>
    `;

    this.onAction(this.lostScreen, {
      retry: () => this.startHunt(),
      menu: () => {
        this.callbacks.onMenu?.();
        this.showStart();
      },
    });
  }

  private showLost(state: GameSnapshot): void {
    const set = (stat: string, value: string) =>
      (this.lostScreen.querySelector<HTMLElement>(`[data-stat="${stat}"]`)!.textContent = value);
    set('ghosts', `${state.ghostsTotal - state.ghostsLeft}/${state.ghostsTotal}`);
    set('score', String(state.score));
    this.lostScreen.querySelector<HTMLElement>('[data-action="retry"]')!.innerHTML =
      `↻&nbsp; Try Again – Level ${state.level}`;
    console.log('GAME OVER SCREEN WIRD ANGEZEIGT');
    this.show(this.lostScreen);
  }

  /** Geist springt ins Bild (nur wenn „scary" an ist), danach der Game-Over-Screen. */
  private playJumpscare(then: () => void): void {
    if (!this.settingsState.scary) {
      window.setTimeout(then, 600);
      return;
    }
    this.huntLayer.hidden = true; // Timer & Fadenkreuz weg – nur noch der Geist
    this.jumpscare.hidden = false;
    this.jumpscare.classList.remove('go');
    void this.jumpscare.offsetWidth;
    this.jumpscare.classList.add('go');
    this.vibrate([300, 80, 400]);
    window.setTimeout(() => {
      then();
      this.jumpscare.hidden = true;
      this.jumpscare.classList.remove('go');
    }, 1100);
  }

  private showComplete(state: GameSnapshot): void {
    const set = (stat: string, value: string) =>
      (this.completeScreen.querySelector<HTMLElement>(`[data-stat="${stat}"]`)!.textContent = value);
    set('ghosts', `${state.ghostsTotal - state.ghostsLeft}/${state.ghostsTotal}`);
    set('score', String(state.score));
    const seconds = Math.floor(state.time);
    set('time', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    this.completeScreen.querySelector<HTMLElement>('.complete-sub')!.textContent =
      `Level ${state.level} cleared. The house is quiet… for now.`;
    this.completeScreen.querySelector<HTMLElement>('[data-action="next"]')!.textContent =
      `Level ${state.level + 1} ▶`;
    this.show(this.completeScreen);
  }

  // ---------- Screens wechseln (immer nur EIN Screen sichtbar) ----------


  private show(screen: HTMLElement): void {
    for (const s of this.screens) {
      s.hidden = s !== screen;
    }

    // Sicherstellen, dass der Endscreen auf mobilen Geräten
    // nicht hinter dem HUD oder der 3D-Szene liegt.
    if (screen === this.lostScreen || screen === this.completeScreen) {
      this.huntLayer.hidden = true;

      screen.style.position = 'fixed';
      screen.style.inset = '0';
      screen.style.zIndex = '99999';
      screen.style.display = 'flex';
    }
  }


  showStart(): void {
    this.show(this.startScreen);
  }

  showHowTo(): void {
    this.show(this.howToScreen);
    this.showHowToPage(0);
  }

  /** @param from Von wo aus geöffnet → dorthin führt der ←-Button zurück */
  showSettings(from: 'start' | 'pause' = 'start'): void {
    this.settingsReturn = from;
    this.show(this.settingsScreen);
  }

  /** Öffentlich, damit z. B. beim AR-Start direkt die Jagd-Anzeige kommt. */
  showHunt(): void {
    this.lastTimeLeft = Infinity; // neue Runde → kein „Bonus"-Aufblitzen beim Start
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
    if (state.level !== this.lastLevel) {
      this.levelBadge.innerHTML = `<small>Level</small><b>${state.level}</b>`;
      this.lastLevel = state.level;
    }
    if (state.score !== this.lastScore) {
      // Punkte dazu → kurz aufleuchten
      if (state.score > this.lastScore && this.lastScore >= 0) {
        this.scoreBadge.classList.remove('bump');
        void this.scoreBadge.offsetWidth;
        this.scoreBadge.classList.add('bump');
      }
      this.scoreValue.textContent = String(state.score);
      this.lastScore = state.score;
    }
    this.updateUv(state.uvOn, state.battery);
    // Pause-Menü zeigen, solange pausiert (auch bei Auto-Pause durch Tab-Wechsel)
    const showPause = state.paused && state.status === 'playing';
    if (this.pauseOverlay.hidden === showPause) this.pauseOverlay.hidden = !showPause;

    if (state.ghostsLeft !== this.lastGhostsLeft) {
      this.ghostsLeftNumber.textContent = String(state.ghostsLeft);
      this.lastGhostsLeft = state.ghostsLeft;
    }
    // Runde gewonnen → kurz warten (letzter Fang soll noch wirken), dann „Hunt Complete"
    if (state.status !== this.lastStatus) {
      window.clearTimeout(this.completeTimer);
      if (state.status === 'won') this.completeTimer = window.setTimeout(() => this.showComplete(state), 1300);
      if (state.status === 'lost') {
        console.log('LOST erkannt – zeige Endscreen sofort');
        this.showLost(state);
      }
      this.lastStatus = state.status;
    }
  }
}

/** Flüstern unter dem Timer in den letzten 10 Sekunden */
const WHISPERS_LOW = [
  "they're coming…",
  'behind you',
  'too late',
  'run',
  'can you hear them?',
];

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