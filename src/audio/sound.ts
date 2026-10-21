// ─────────────────────────────────────────────
// BEREICH: Sound   →  Sümi
// ─────────────────────────────────────────────
// - Hintergrundmusik: ambient.mp3 in den Menüs, ambient2.mp3 im Spiel (Loop, mit Überblenden)
// - Zufällige Gruselgeräusche (random1–4.mp3), die RÄUMLICH aus einer zufälligen Richtung kommen
// - Tiefes Brummen beim bösen Geist (räumlich – wird lauter, wenn man näher kommt)
// - Saug-, Erfolgs- und Game-Over-Sound
//   (Saugen & Erfolg werden im Code erzeugt, weil es dafür noch keine Dateien gibt)
//
// Alle Dateien liegen in public/sounds/ (Pixabay, lizenzfrei).
// Räumlicher Sound wirkt am besten mit Kopfhörern.

import * as THREE from 'three';
import type { Ghost } from '../types';

// ---------- Einstellungen ----------

/** Hintergrundmusik: eine für die Menüs (Start, How to Play, Settings), eine fürs Spiel */
const MENU_MUSIC = 'ambient';
const GAME_MUSIC = 'ambient2';
const RANDOM_FILES = ['random1', 'random2', 'random3', 'random4'];
const GAMEOVER_FILE = 'gameover';

const MUSIC_VOLUME = 0.3;
/** Dauer zum Ein-/Ausblenden der Musik beim Wechsel (Sekunden) */
const MUSIC_FADE = 1.2;
const RANDOM_VOLUME = 0.9;
/** Zeitabstand zwischen zufälligen Geräuschen in Sekunden (min, max) */
const RANDOM_INTERVAL: [number, number] = [10, 25];
/** Entfernung, aus der die zufälligen Geräusche kommen (Meter) */
const RANDOM_DISTANCE: [number, number] = [2, 4];

// ---------- Grundgerüst ----------

/** Was gerade läuft: Menü, Spiel oder nichts (z. B. nach Game Over) */
type AudioMode = 'menu' | 'game' | 'none';

let listener: THREE.AudioListener;
let scene: THREE.Scene;
let isEnabled: () => boolean = () => true;
/** Erst nach dem ersten Tippen / Tastendruck (= „Tap to enter") Ton abspielen –
 *  manche Browser erlauben Ton sonst schon vorher (z. B. Chrome auf oft besuchten Seiten). */
let userStarted = false;

const buffers = new Map<string, AudioBuffer>();
let mode: AudioMode = 'menu';
let music: { name: string; audio: THREE.Audio } | null = null;
let nextRandomIn = randomBetween(...RANDOM_INTERVAL);
const ghostSounds: THREE.PositionalAudio[] = [];
/** Anspannung 0–1 (gegen Ende der Zeit) → Herzschlag wird lauter & schneller */
let tension = 0;
let nextHeartbeatIn = 0;

/**
 * Einmal beim Start aufrufen (main.ts). Startet mit der Menü-Musik
 * (sie beginnt, sobald man das erste Mal irgendwo tippt – vorher erlaubt der Browser keinen Ton).
 * @param enabled Funktion, die sagt, ob Sound in den Settings an ist (hud.settings.sound)
 */
export function initAudio(camera: THREE.Camera, targetScene: THREE.Scene, enabled: () => boolean): void {
  scene = targetScene;
  isEnabled = enabled;
  listener = new THREE.AudioListener();
  camera.add(listener);

  // Browser erlauben Sound erst nach einer Berührung / Taste → beim ersten Tippen oder Tastendruck freischalten
  // (der Eingangsbildschirm „Tippen zum Betreten" in hud.ts sorgt dafür, dass das gleich am Anfang passiert)
  const unlockEvents = ['pointerdown', 'keydown', 'touchend'] as const;
  const unlock = () => {
    userStarted = true;
    void listener.context.resume().then(() => {
      if (listener.context.state !== 'running') return;
      for (const type of unlockEvents) document.removeEventListener(type, unlock);
    });
  };
  for (const type of unlockEvents) document.addEventListener(type, unlock);

  const loader = new THREE.AudioLoader();
  for (const name of [MENU_MUSIC, GAME_MUSIC, ...RANDOM_FILES, GAMEOVER_FILE]) {
    loader.load(
      `${import.meta.env.BASE_URL}sounds/${name}.mp3`,
      (buffer) => buffers.set(name, buffer),
      undefined,
      () => console.warn(`Sound sounds/${name}.mp3 nicht gefunden`),
    );
  }
}

// ---------- Menü / Runde ----------

/** Zurück ins Menü (z. B. „Main Menu" nach Hunt Complete / Game Over): Menü-Musik, Spiel-Sounds aus. */
// TODO (Person C): beim Button „Main Menu" von Game Over / Pause auch playMenuAudio() aufrufen (Hunt Complete macht es schon)
export function playMenuAudio(): void {
  stopGhostSounds();
  mode = 'menu';
}

/** Beim Start einer Runde: Spiel-Musik und Brummen beim bösen Geist. */
export function startRoundAudio(ghosts: Ghost[]): void {
  stopGhostSounds();
  void listener.context.resume();
  mode = 'game';
  for (const ghost of ghosts) {
    if (ghost.type === 'evil') attachEvilDrone(ghost.object);
  }
  nextRandomIn = randomBetween(...RANDOM_INTERVAL);
}

/** Runde vorbei: Musik und Geister-Sounds aus. */
export function stopRoundAudio(): void {
  stopGhostSounds();
  mode = 'none';
}

function stopGhostSounds(): void {
  for (const sound of ghostSounds) {
    // Brummen ist ein erzeugter Ton (kein Datei-Sound) → Oszillatoren stoppen und abklemmen
    for (const osc of sound.userData.oscillators as OscillatorNode[]) osc.stop();
    sound.disconnect();
    sound.removeFromParent();
  }
  ghostSounds.length = 0;
}

/** Jeden Frame aufrufen (main.ts). dt = Sekunden seit letztem Frame. */
export function updateAudio(dt: number, camera: THREE.Camera): void {
  if (!listener) return;
  // In AR wird die Kamera direkt von WebXR bewegt → Hörposition selbst nachziehen
  listener.updateMatrixWorld(true);

  const enabled = isEnabled() && userStarted && listener.context.state === 'running';
  updateMusic(enabled);

  // Brummen: nur hörbar, wenn Sound an ist und der böse Geist sichtbar ist
  for (const sound of ghostSounds) {
    const visible = sound.parent?.visible ?? false;
    sound.setVolume(enabled && visible ? 1 : 0);
  }

  if (!enabled || mode !== 'game') return;

  // Herzschlag, wenn die Zeit knapp wird
  if (tension > 0) {
    nextHeartbeatIn -= dt;
    if (nextHeartbeatIn <= 0) {
      playHeartbeat(0.35 + 0.65 * tension);
      nextHeartbeatIn = 1.1 - 0.65 * tension; // von ~55 bis ~130 Schläge pro Minute
    }
  }

  nextRandomIn -= dt;
  if (nextRandomIn <= 0) {
    playRandomSpooky(camera);
    nextRandomIn = randomBetween(...RANDOM_INTERVAL);
  }
}

/** Sorgt dafür, dass die passende Musik läuft – mit sanftem Überblenden beim Wechsel. */
function updateMusic(enabled: boolean): void {
  const wanted = !enabled ? null : mode === 'menu' ? MENU_MUSIC : mode === 'game' ? GAME_MUSIC : null;
  if (music?.name === wanted) return;

  // alte Musik ausblenden
  if (music) {
    const old = music.audio;
    const gain = old.gain.gain;
    const now = listener.context.currentTime;
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + MUSIC_FADE);
    setTimeout(() => old.stop(), MUSIC_FADE * 1000);
    music = null;
  }

  // neue Musik einblenden (falls die Datei schon geladen ist – sonst im nächsten Frame nochmal)
  const buffer = wanted ? buffers.get(wanted) : undefined;
  if (!wanted || !buffer) return;
  const audio = new THREE.Audio(listener);
  audio.setBuffer(buffer);
  audio.setLoop(true);
  const now = listener.context.currentTime;
  audio.gain.gain.setValueAtTime(0, now);
  audio.gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, now + MUSIC_FADE);
  audio.play();
  music = { name: wanted, audio };
}

// ---------- Einzelne Sounds ----------

/** Zufälliges Gruselgeräusch aus einer zufälligen Richtung um den Spieler. */
function playRandomSpooky(camera: THREE.Camera): void {
  const buffer = buffers.get(pick(RANDOM_FILES));
  if (!buffer) return;

  const playerPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const angle = Math.random() * Math.PI * 2;
  const distance = randomBetween(...RANDOM_DISTANCE);

  const source = new THREE.Object3D();
  source.position.set(
    playerPos.x + Math.cos(angle) * distance,
    playerPos.y + randomBetween(-0.5, 0.5),
    playerPos.z + Math.sin(angle) * distance,
  );
  scene.add(source);

  const sound = new THREE.PositionalAudio(listener);
  sound.setBuffer(buffer).setRefDistance(1.5).setVolume(RANDOM_VOLUME);
  // nach dem Abspielen wieder aufräumen
  setTimeout(() => source.removeFromParent(), (buffer.duration + 0.5) * 1000);
  source.add(sound);
  source.updateMatrixWorld(true);
  sound.play();
}

/** Tiefes, unruhiges Brummen am bösen Geist – nur in der Nähe gut hörbar. */
function attachEvilDrone(ghostObject: THREE.Object3D): void {
  const ctx = listener.context;

  // Zwei leicht verstimmte tiefe Töne → unheimliches „Wabern"
  const low = ctx.createOscillator();
  low.type = 'sawtooth';
  low.frequency.value = 82;
  const detuned = ctx.createOscillator();
  detuned.type = 'sawtooth';
  detuned.frequency.value = 87;

  const filter = ctx.createBiquadFilter(); // nimmt das Schrille raus
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  const level = ctx.createGain(); // pulsierende Lautstärke
  level.gain.value = 0.25;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.7;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.15;
  lfo.connect(lfoDepth).connect(level.gain);

  low.connect(filter);
  detuned.connect(filter);
  filter.connect(level);
  [low, detuned, lfo].forEach((osc) => osc.start());

  const sound = new THREE.PositionalAudio(listener);
  sound.setNodeSource(level as unknown as AudioBufferSourceNode);
  sound.setRefDistance(0.6).setRolloffFactor(2).setMaxDistance(6);
  sound.userData.oscillators = [low, detuned, lfo];
  ghostObject.add(sound);
  ghostSounds.push(sound);
}

/** Saug-Geräusch bei jedem Tap auf den Fang-Button (im Code erzeugt). */
export function playCapture(): void {
  if (!isEnabled() || !listener) return;
  const ctx = listener.context;
  const duration = 0.25;
  const now = ctx.currentTime;

  // Rauschen …
  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;

  // … dessen Tonhöhe ansteigt → „Schhhwupp"
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(2500, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter).connect(gain).connect(listener.getInput());
  noise.start(now);
  noise.stop(now + duration);
}

/**
 * Fang-Sound: der Geist wird mit einem absinkenden Heulen in die Falle gesaugt,
 * dann schnappt sie mit einem dumpfen Schlag zu und eine dunkle Glocke klingt nach (im Code erzeugt).
 */
export function playSuccess(): void {
  if (!isEnabled() || !listener) return;
  const ctx = listener.context;
  const now = ctx.currentTime;
  const out = listener.getInput();

  // 1) Geisterheulen: Ton mit Vibrato, der nach unten wegrutscht
  const wail = ctx.createOscillator();
  wail.type = 'sine';
  wail.frequency.setValueAtTime(760, now);
  wail.frequency.exponentialRampToValueAtTime(140, now + 0.55);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 9;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = 25;
  vibrato.connect(vibratoDepth).connect(wail.frequency);
  const wailGain = ctx.createGain();
  wailGain.gain.setValueAtTime(0.0001, now);
  wailGain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
  wailGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  wail.connect(wailGain).connect(out);
  [wail, vibrato].forEach((o) => {
    o.start(now);
    o.stop(now + 0.65);
  });

  // 2) Falle schnappt zu: tiefer Schlag
  const hit = now + 0.5;
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(120, hit);
  thud.frequency.exponentialRampToValueAtTime(40, hit + 0.25);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.0001, hit);
  thudGain.gain.exponentialRampToValueAtTime(0.5, hit + 0.01);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, hit + 0.3);
  thud.connect(thudGain).connect(out);
  thud.start(hit);
  thud.stop(hit + 0.35);

  // 3) Dunkle, leicht schiefe Glocke (kleine Sekunde → unheimlich)
  for (const [frequency, volume] of [[392, 0.12], [415.3, 0.07], [784, 0.04]]) {
    const bell = ctx.createOscillator();
    bell.type = 'triangle';
    bell.frequency.value = frequency;
    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(0.0001, hit);
    bellGain.gain.exponentialRampToValueAtTime(volume, hit + 0.01);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, hit + 1.4);
    bell.connect(bellGain).connect(out);
    bell.start(hit);
    bell.stop(hit + 1.5);
  }
}

/** Sieg-Sound: kein fröhliches Gedudel, sondern ein dunkler Moll-Akkord, der langsam anschwillt und verhallt. */
function playVictory(): void {
  if (!isEnabled() || !listener) return;
  const ctx = listener.context;
  const now = ctx.currentTime;
  // a-Moll mit tiefem Grundton + hohe Glocke
  for (const [frequency, volume, delay] of [[110, 0.14, 0], [220, 0.1, 0], [261.63, 0.08, 0.15], [329.63, 0.08, 0.3], [880, 0.05, 0.6]]) {
    const start = now + delay;
    const osc = ctx.createOscillator();
    osc.type = frequency < 300 ? 'sawtooth' : 'triangle';
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 3);
    osc.connect(filter).connect(gain).connect(listener.getInput());
    osc.start(start);
    osc.stop(start + 3.1);
  }
}

/** „Whoosh" aus der Richtung, in der ein neuer Geist erscheint (im Code erzeugt, räumlich). */
export function playGhostAppear(ghostObject: THREE.Object3D): void {
  if (!isEnabled() || !listener || listener.context.state !== 'running') return;
  const ctx = listener.context;
  const duration = 0.9;
  const now = ctx.currentTime;

  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;

  // Rauschen, dessen Tonhöhe absinkt → geisterhaftes „Wuuusch"
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(1800, now);
  filter.frequency.exponentialRampToValueAtTime(250, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.9, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(filter).connect(gain);

  const sound = new THREE.PositionalAudio(listener);
  sound.setNodeSource(gain as unknown as AudioBufferSourceNode);
  sound.setRefDistance(1.5);
  ghostObject.add(sound);
  noise.start(now);
  noise.stop(now + duration);
  setTimeout(() => {
    sound.disconnect();
    sound.removeFromParent();
  }, (duration + 0.2) * 1000);
}

/** Schreck-Sound, wenn man den bösen Geist fängt: tiefer, schiefer Absturz-Ton (im Code erzeugt). */
export function playEvilCaught(): void {
  if (!isEnabled() || !listener) return;
  const ctx = listener.context;
  const now = ctx.currentTime;
  for (const [from, to] of [[220, 55], [233, 58]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1);
    osc.connect(gain).connect(listener.getInput());
    osc.start(now);
    osc.stop(now + 1.05);
  }
}

/** Bonus-Sound beim Time-Geist: zwei helle „Tick-Tack"-Klänge + Glitzern (im Code erzeugt). */
export function playTimeBonus(): void {
  if (!isEnabled() || !listener) return;
  const ctx = listener.context;
  const now = ctx.currentTime;
  [1318.5, 987.77, 1568, 2093].forEach((frequency, i) => {
    const start = now + i * 0.11;
    const osc = ctx.createOscillator();
    osc.type = i < 2 ? 'square' : 'sine';
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(i < 2 ? 0.08 : 0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (i < 2 ? 0.08 : 0.5));
    osc.connect(gain).connect(listener.getInput());
    osc.start(start);
    osc.stop(start + 0.55);
  });
}

/** Wie angespannt es gerade ist (0 = ruhig, 1 = Zeit fast abgelaufen). Jeden Frame aus main.ts. */
export function setTension(value: number): void {
  if (value > 0 && tension === 0) nextHeartbeatIn = 0; // sofort mit dem ersten Schlag beginnen
  tension = Math.min(1, Math.max(0, value));
}

/** Herzschlag „ba-BUMM": zwei tiefe, dumpfe Schläge (im Code erzeugt). */
function playHeartbeat(volume: number): void {
  const ctx = listener.context;
  const now = ctx.currentTime;
  for (const [delay, strength] of [[0, 0.7], [0.16, 1]]) {
    const start = now + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, start);
    osc.frequency.exponentialRampToValueAtTime(38, start + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.9 * volume * strength, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain).connect(listener.getInput());
    osc.start(start);
    osc.stop(start + 0.25);
  }
}

/** Uhr-Ticken in den letzten Sekunden – abwechselnd „Tick" und „Tack" (im Code erzeugt). */
let tickToggle = false;
export function playTick(): void {
  if (!isEnabled() || !listener || !userStarted) return;
  const ctx = listener.context;
  const now = ctx.currentTime;
  tickToggle = !tickToggle;

  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = tickToggle ? 3200 : 2400;
  filter.Q.value = 8;
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  noise.connect(filter).connect(gain).connect(listener.getInput());
  noise.start(now);
}

/** Jumpscare-Schrei: schrilles, verzerrtes Kreischen + Rauschen (im Code erzeugt). */
export function playJumpscare(): void {
  if (!isEnabled() || !listener) return;
  const ctx = listener.context;
  const now = ctx.currentTime;
  const duration = 1.1;

  const shaper = ctx.createWaveShaper(); // Verzerrung
  const curve = new Float32Array(256);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 128) - 1;
    curve[i] = Math.tanh(x * 6);
  }
  shaper.curve = curve;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.45, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  shaper.connect(master).connect(listener.getInput());

  // Drei schiefe, kreischende Töne, die nach unten kippen
  for (const frequency of [1240, 1310, 870]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, now + duration);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 14;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 60;
    wobble.connect(wobbleDepth).connect(osc.frequency);
    osc.connect(shaper);
    [osc, wobble].forEach((o) => {
      o.start(now);
      o.stop(now + duration);
    });
  }

  // Rauschen für das „Fauchen"
  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.5;
  noise.connect(noiseGain).connect(shaper);
  noise.start(now);
}

/** Game-Over-Sound (Datei gameover.mp3). Stoppt auch die Hintergrund-Sounds. */
export function playGameOver(): void {
  stopRoundAudio();
  const buffer = buffers.get(GAMEOVER_FILE);
  if (!isEnabled() || !buffer) return;
  const sound = new THREE.Audio(listener);
  sound.setBuffer(buffer).setVolume(0.8);
  sound.play();
}

/** Runde gewonnen: Erfolgs-Sound, Hintergrund aus. */
export function playWin(): void {
  stopRoundAudio();
  playSuccess(); // letzter Geist wird noch gefangen …
  setTimeout(playVictory, 900); // … dann der Sieg-Akkord
}

// ---------- Hilfsfunktionen ----------

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
