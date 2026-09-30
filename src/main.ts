import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import './style.css';

// --- Grundgerüst: Szene, Kamera, Renderer ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  20,
);
camera.position.z = 3;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// --- WebXR: Feature Detection + AR-Button ---
if ('xr' in navigator) {
  console.log('WebXR API available');
  document.body.appendChild(ARButton.createButton(renderer));
} else {
  console.log('WebXR API not available');
}

// --- Platzhalter-Objekt (wird später durch Geister ersetzt) ---
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 0.3, 0.3),
  new THREE.MeshNormalMaterial(),
);
cube.position.set(0, 0, -1);
scene.add(cube);

// --- Fenstergröße ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render-Loop ---
renderer.setAnimationLoop(() => {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});
