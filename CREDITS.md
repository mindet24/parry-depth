# CREDITS & ATTRIBUTION

## Game: Parry Roguelike (2.5D Psychological Horror)

### 1. Audio Architecture & Sound Effects
- **Procedural Web Audio Synthesizer**: Original algorithmic audio synthesis engine implemented in `src/core/Audio.js` utilizing the Web Audio API (`AudioContext`, `BiquadFilterNode`, `OscillatorNode`, and custom white-noise buffers).
- **Sound Design**:
  - *Parry Deflect*: Dual-layer harmonic high-frequency sine/triangle metallic impact (inspired by retro arcade parry chimes).
  - *Visceral Backstab*: Triple-layer impact consisting of low-pass noise punch, sub-bass 35Hz drop, and high-frequency piercing saw snap.
  - *Enemy Attack Glint*: Crystal sparkle sine sweep (2489Hz -> 3135Hz) indicating active parry opportunity.
  - *Sword Block / Guard*: Low-pass filtered sawtooth guard impact (80% absorption clank).
  - *Dash Pneumatic Burst*: Bandpass filtered white-noise kinetic displacement whoosh.
  - *Ambient Facility Drone*: Dual detuned sub-bass oscillators (55Hz / 57.5Hz) producing binaural psychoacoustic tension and clinical dread.
  - *Boss Alert / Phase Shift*: Low-frequency resonant sawtooth horn swell.
- **Reference Inspirations**: Classic PS1 psychological horror titles (Silent Hill, Resident Evil 1/2) and OpenGameArt public domain modular SFX synthesis techniques.

### 2. Typography & Fonts
- **VT323 (PS1 Bitmap / Terminal Font)**:
  - Author: Peter Hull
  - License: SIL Open Font License (OFL), Version 1.1
  - Source: Google Fonts
- **Share Tech Mono (Clinical Sci-Fi HUD Font)**:
  - Author: Carrois Apostrophe
  - License: SIL Open Font License (OFL), Version 1.1
  - Source: Google Fonts

### 3. Visuals & 3D Shading
- **Engine**: Three.js (r128+) under the MIT License.
- **PS1 Aesthetics**:
  - Uncapped pixel-art upscaling using nearest-neighbor canvas styling (`image-rendering: pixelated; crisp-edges;`).
  - Low-resolution internal render target (480x270 aspect baseline) for authentic 90s console rasterization.
  - Hard pixelated shadow mapping (`THREE.BasicShadowMap`).
  - CRT scanline grid and animated fractal noise overlay for retro CRT monitor simulation.
