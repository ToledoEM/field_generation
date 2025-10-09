# Project Roadmap (Tailored)

This roadmap translates the earlier broad recommendation set into concrete, staged tasks for THIS repository as it stands today (single `flowfields.js` + UI in `index.html`). Each phase is intentionally incremental so you can stop at any plateau and still have a coherent, functional project.

---
## Phase 0 (Done / Quick Wins)
Already implemented in this iteration:
- Color palette selector (`paletteSelect`) with multiple curated palettes
- Seed is always surfaced (random + fixed) and embedded into SVG metadata
- SVG `<metadata>` tag with full parameter JSON (reproducibility)
- Keyboard shortcuts (R, A, S, C, J, H)
- Parameters panel now shows active palette
- README updated with shortcuts, palettes, and metadata information

Impact: Improves creative iteration speed + reproducibility with minimal structural change.

---
## Phase 1 – Core Modularization
Goal: Separate concerns so performance optimizations & features don’t tangle.

Tasks:
1. Create `/src/` and split logic:
   - `src/field/NoiseField.js` – class handling (re)seeding & sampling (Perlin, Simplex, future variants)
   - `src/sim/ParticleSimulator.js` – steps particles through a field (pure logic, no p5 drawing)
   - `src/render/CanvasRenderer.js` – draws to p5 canvas from path data
   - `src/export/SVGExporter.js` – builds string from path arrays + metadata
   - `src/palette/palettes.js` – central palette definitions
   - `src/config/defaultConfig.js` – object with defaults & ranges
   - `src/index.js` – orchestration + UI wiring
2. Replace global mutable variables with a single `config` object.
3. Add a factory function: `generateArtwork(config) -> { paths, metadata }` (deterministic). Used by both UI and tests.
4. Wrap p5-specific calls so that simulation can run in Node for tests (e.g., substitute minimal RNG + noise libs).

Acceptance: UI continues to work; tests can import `generateArtwork` headlessly (no DOM canvas required).

---
## Phase 2 – Determinism & Testing
Goal: Guarantee reproducibility for given seeds.

Tasks:
1. Introduce a seedable PRNG (e.g. mulberry32 or Alea) instead of `p5.random` internally.
2. Abstract RNG via `rng.next()`; UI still uses `Math.random` only for *choosing* a seed.
3. Write tests:
   - Same seed & config → identical first N path points / hash
   - Different seeds → different hash (probabilistic)
4. Add a content hash (SHA256 of sorted param JSON) to metadata & filename suffix (`flowfield_<hash>.svg`).

---
## Phase 3 – Performance Foundations
Goal: Scale to high particle counts with smooth UI.

Tasks:
1. Move particle state to typed arrays:
   - `positionsX`, `positionsY`, `alive` flag, `hueIndex` (Uint16/Uint8).
2. Precompute flow vector grid once per generation into two Float32Arrays (angles or dx/dy) – quicker lookup than storing `p5.Vector` objects.
3. Optional: Add bilinear interpolation for smoother transitions when `STEP_SIZE` decouples from field grid density.
4. Track timing (simulation ms, export ms) and show compact stats overlay (update every ~20 frames).

---
## Phase 4 – Field & Visual Richness
Goal: Artistic depth without huge structural shifts.

Tasks:
1. Multi-layer field blending (e.g. base Perlin + higher-frequency Simplex) with weight slider.
2. Variable stroke weight: map to local curvature (estimate via last 2 direction changes) or step index (tapered lines).
3. Add per-path color drift: start from palette base, apply slight HSL perturbation over lifetime (for RGB fallback just lighten/darken).
4. Negative space masks: simple shape list (circles, rectangles) where particles terminate or skip.

---
## Phase 5 – Export Enhancements
Goal: Cleaner, smaller, print-ready outputs.

Tasks:
1. Implement lightweight Ramer–Douglas–Peucker (RDP) polyline simplification with tolerance tied to target DPI.
2. Merge collinear segments (optional pass).
3. Coordinate rounding granularity option (2 vs 3 decimals).
4. Add color exporting modes:
   - Monochrome (force stroke=black)
   - Per-layer groups (already partial)
   - HPGL export plugin stub.
5. Integrate SVGO (CLI or WASM) as optional optimization step in `npm run optimize`.

---
## Phase 6 – UI & Workflow
Goal: Streamlined creative iteration & batch production.

Tasks:
1. Switch to Tweakpane (lightweight) for grouped controls and preset saving.
2. Presets gallery (JSON stored in `presets/` + load/save to localStorage).
3. Snapshot strip (canvas thumbnails) storing config + preview.
4. Batch generation dialog: produce N variations (different seeds) → zip (JSZip) with SVG + manifest JSON.

---
## Phase 7 – Animation & Time Dimension
Goal: Temporal evolution for video / GIF.

Tasks:
1. Introduce `time` parameter to field sampling (z or t progression).
2. Allow morphing between two config objects over frames (eased interpolation of field scale, palette, etc.).
3. Export frame sequence (PNG or SVG frames) + WebM assembly (client-side via Whammy or instruct ffmpeg usage offline).

---
## Phase 8 – Worker Offloading
Goal: Keep UI responsive for large simulations.

Tasks:
1. Create `simulationWorker.js` using pure data messages (config in → { paths } out).
2. Transfer typed arrays via `postMessage` with transferable objects to avoid copying.
3. Progressive streaming: worker emits partial path batches so canvas can preview growth.

---
## Phase 9 – Plugin Architecture
Goal: Encourage external contributions.

Tasks:
1. Define interfaces:
   - Field plugin: `{ id, label, init(config), sample(x,y,t) }`
   - Post process plugin: `{ id, label, run(paths, config) -> paths }`
   - Export plugin: `{ id, label, export({ paths, metadata, config }) -> { mime, filename, blob } }`
2. Register core plugins and provide `plugins/README.md` with contribution guide.
3. Dynamic plugin loading (ES modules) with a simple discovery array.

---
## Phase 10 – Documentation & Community
Goal: Make project welcoming & sustainable.

Tasks:
1. Add `CONTRIBUTING.md` (style, commit message pattern, branching model).
2. Add `CODE_OF_CONDUCT.md` (Contributor Covenant).
3. Add `CHANGELOG.md` (Keep a Changelog format) starting with current state as `0.2.0` (assuming pre-modularization was `0.1.x`).
4. README hero GIF: capture screen or use headless export frames → ffmpeg.
5. GitHub Pages deployment (gh-pages or `/docs` + Action workflow).

---
## Stretch Ideas (Later)
- Mask import (drop image → convert brightness to lifetime scalar)
- Edge-based density: Sobel edge detection from dropped image influences spawn probability
- CLI Node wrapper for batch headless generation (`node cli/generate.js --seed 123 --preset warm`)
- WASM noise (OpenSimplex2, Curl noise) for speed when particle counts > 50k
- Live color grading pass (offscreen canvas + blend modes)

---
## Suggested Versioning Path
- 0.2.0 – Modular core + deterministic generateArtwork
- 0.3.0 – Performance (typed arrays) + simplification + stats
- 0.4.0 – Field blending + variable stroke weights + batching
- 0.5.0 – Worker offloading + plugin API (experimental)
- 1.0.0 – Stable plugin API + full documentation + CI release workflow

---
## Risk & Effort Notes
| Item | Risk | Effort | Mitigation |
|------|------|--------|------------|
| Worker offload | Medium (data passing) | Medium | Start with single message full result, then incremental |
| Animation export | Medium | Medium | Begin with fixed frame count + deterministic t increment |
| Plugin API | High (design churn) | High | Draft with 2 real plugins before formalizing |
| Typed arrays refactor | Low | Medium | Wrap in adapter functions to ease transition |

---
## Immediate Next Suggested Step
Begin Phase 1: Create `src/` structure and move noise field + export logic first (lowest coupling), leaving drawing loop in place until stable.

---
Feel free to ask for a concrete implementation of any specific phase next.
