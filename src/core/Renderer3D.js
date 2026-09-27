/**
 * Renderer3D.js — Three.js WebGL 2.5D PS1 Retro Engine.
 *
 * Provides:
 *   - Low-res render target with nearest-neighbor scaling for true PS1 pixelation
 *   - 3/4 Isometric camera with smooth follow
 *   - Moody retro horror lighting (flickering industrial pointlights, player headlamp)
 *   - Faceted low-poly material generator
 */
import * as THREE from 'three';

// Removed PS1 Vertex Jitter patch due to visual artifacts

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;

    // Internal low-res PS1 resolution
    this.renderW = 480;
    this.renderH = 270;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x08060f, 0.045);

    // 2. Camera: Fixed 3/4 Isometric Perspective (38° FOV)
    this.camera = new THREE.PerspectiveCamera(
      38,
      this.renderW / this.renderH,
      0.1,
      100
    );
    this.camOffset = new THREE.Vector3(8.5, 13.0, 8.5);
    this.camTarget = new THREE.Vector3(6, 0.5, 4);
    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.camera.lookAt(this.camTarget);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(0x050308, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // Hard PS1 shadows!

    // 4. Lighting Rig
    this._setupLighting();

    // 5. Handle resize
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupLighting() {
    // Ambient — oppressive dark blue/purple
    this.ambient = new THREE.AmbientLight(0x221c38, 1.2);
    this.scene.add(this.ambient);

    // Key directional light (cool industrial overhead)
    this.dirLight = new THREE.DirectionalLight(0x7e8ce0, 1.6);
    this.dirLight.position.set(15, 20, 10);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 512;
    this.dirLight.shadow.mapSize.height = 512;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 50;
    this.dirLight.shadow.camera.left = -16;
    this.dirLight.shadow.camera.right = 16;
    this.dirLight.shadow.camera.top = 16;
    this.dirLight.shadow.camera.bottom = -16;
    this.dirLight.shadow.bias = -0.002;
    this.scene.add(this.dirLight);

    // Practical Room Center Lamp (amber industrial bulb)
    this.roomLamp = new THREE.PointLight(0xffa347, 2.5, 22, 1.2);
    this.roomLamp.position.set(9, 4.5, 6.5);
    this.roomLamp.castShadow = true;
    this.scene.add(this.roomLamp);

    // Player Follower Light (chest lamp)
    this.playerLight = new THREE.PointLight(0xa5d8ff, 3.2, 8.5, 1.5);
    this.playerLight.position.set(6, 1.2, 6);
    this.scene.add(this.playerLight);

    // Door Exit Glow (neon green)
    this.exitLight = new THREE.PointLight(0x39ff14, 0, 10, 1.5);
    this.exitLight.position.set(6, 1.5, 0.6);
    this.scene.add(this.exitLight);
  }

  setExitLight(active) {
    this.exitLight.intensity = active ? 4.5 : 0.4;
    this.exitLight.color.setHex(active ? 0x39ff14 : 0xff2222);
  }

  updateCamera(targetX, targetZ, dt) {
    // Smooth lerp to player
    const lerpSpeed = Math.min(dt * 8, 1);
    this.camTarget.x += (targetX - this.camTarget.x) * lerpSpeed;
    this.camTarget.z += (targetZ - this.camTarget.z) * lerpSpeed;

    // Room boundaries clamping for camera target (room is 18 x 13)
    this.camTarget.x = Math.max(4.0, Math.min(this.camTarget.x, 14.0));
    this.camTarget.z = Math.max(3.0, Math.min(this.camTarget.z, 9.5));

    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.camera.lookAt(this.camTarget);

    // Player chest lamp tracks player position
    this.playerLight.position.set(targetX, 1.3, targetZ);

    // Light flicker
    const t = performance.now() * 0.003;
    this.roomLamp.intensity = 2.4 + Math.sin(t * 7) * 0.2 + (Math.random() < 0.02 ? -0.8 : 0);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Internal low-res buffer with CSS pixelated upscaling for true PS1 crunchy aesthetic
    const rw = Math.max(480, Math.round(w / 1.6));
    const rh = Math.max(270, Math.round(h / 1.6));
    this.renderer.setSize(rw, rh, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  toScreenXY(x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    v.project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
