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

const buffers = new Map<string, AudioBuffer>();
let mode: AudioMode = 'menu';
let music: { name: string; audio: THREE.Audio } | null = null;
let nextRandomIn = randomBetween(...RANDOM_INTERVAL);
const ghostSounds: THREE.PositionalAudio[] = [];

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

  // Browser erlauben Sound erst nach einer Berührung → beim ersten Tippen freischalten
  const unlock = () => void listener.context.resume();
  document.addEventListener('pointerdown', unlock);

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
// TODO (Person C): beim Button „Main Menu" (Hunt Complete / Game Over / Pause) playMenuAudio() aufrufen
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

  const enabled = isEnabled() && listener.context.state === 'running';
  updateMusic(enabled);

  // Brummen: nur hörbar, wenn Sound an ist und der böse Geist sichtbar ist
  for (const sound of ghostSounds) {
    const visible = sound.parent?.visible ?? false;
    sound.setVolume(enabled && visible ? 1 : 0);
  }

  if (!enabled || mode !== 'game') return;
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

/** Erfolgs-Sound: kurzer, aufsteigender Glocken-Akkord (im Code erzeugt). */
export function playSuccess(): void {
  if (!isEnabled() || !listener) return;
  const ctx = listener.context;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

  notes.forEach((frequency, i) => {
    const start = now + i * 0.08;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(listener.getInput());
    osc.start(start);
    osc.stop(start + 0.65);
  });
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
  playSuccess();
}

// ---------- Hilfsfunktionen ----------

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
