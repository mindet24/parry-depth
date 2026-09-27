import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 1. Scene Setup
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();

// Add subtle fog for depth
scene.fog = new THREE.FogExp2('#0b0f19', 0.035);

// 2. Camera Setup
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.5, 4.5);

// 3. Renderer Setup
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// 4. Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 15;

// 5. Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Key Light (Purple / Indigo)
const keyLight = new THREE.DirectionalLight(0x818cf8, 2.5);
keyLight.position.set(5, 5, 4);
scene.add(keyLight);

// Fill Light (Cyan / Teal)
const fillLight = new THREE.DirectionalLight(0x2dd4bf, 2.0);
fillLight.position.set(-5, -2, -3);
scene.add(fillLight);

// Rim Light (Rose)
const rimLight = new THREE.PointLight(0xf43f5e, 3, 10);
rimLight.position.set(0, 3, -2);
scene.add(rimLight);

// 6. 3D Objects
// Central Torus Knot
const geometry = new THREE.TorusKnotGeometry(1, 0.35, 150, 24);
const material = new THREE.MeshPhysicalMaterial({
  color: 0x4f46e5,
  metalness: 0.85,
  roughness: 0.15,
  clearcoat: 0.8,
  clearcoatRoughness: 0.1,
  wireframe: false,
});
const torusKnot = new THREE.Mesh(geometry, material);
scene.add(torusKnot);

// Particles / Stars field
const particleCount = 700;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount * 3; i += 3) {
  particlePositions[i] = (Math.random() - 0.5) * 20;
  particlePositions[i + 1] = (Math.random() - 0.5) * 20;
  particlePositions[i + 2] = (Math.random() - 0.5) * 20;
}

particleGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(particlePositions, 3)
);

const particleMaterial = new THREE.PointsMaterial({
  size: 0.035,
  color: 0x93c5fd,
  transparent: true,
  opacity: 0.8,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// 7. Responsive Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// 8. Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // Smooth rotation
  torusKnot.rotation.x = elapsedTime * 0.3;
  torusKnot.rotation.y = elapsedTime * 0.4;

  // Gentle particle motion
  particles.rotation.y = elapsedTime * 0.03;

  controls.update();
  renderer.render(scene, camera);
}

animate();
