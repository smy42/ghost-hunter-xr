// Gemeinsame Basis: Szene, Kamera, Renderer, Licht.
// Wird von main.ts einmal erstellt und an alle Bereiche weitergegeben.

import * as THREE from 'three';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createSceneContext(): SceneContext {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);

  // alpha: true → im AR-Modus ist der Hintergrund durchsichtig (Kamerabild sichtbar)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Licht – wichtig, sobald echte Modelle (GLB) geladen werden
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, 4, 1);
  scene.add(sun);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
