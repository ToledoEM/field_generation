# Flow Field Art Creator

Generative flow field lab for pen plotter–ready art. Features 9 vector field algorithms, a three-step pipeline (generate → color → perturb), multi-source radial & spiral flows, path repulsion, and export to SVG / CSV / JSON.

![GUI Screenshot](img/gui.png)

## Highlights

* 9 field methods with tunable parameters, including Reaction-Diffusion and LIC
* Multi-core path tracing using Web Workers (hybrid parallelization)
* Multi-source radial & spiral patterns (random / grid / circle / ring layouts)
* Magnetic-style path repulsion — classic spatial hash or fast Barnes-Hut quadtree
* Procedural color assignment with 5 methods, alpha, and background control
* Field perturbations: Radial Impulse, Gravity Well, Rolling Ball
* Auto-regenerate mode + R keyboard shortcut + deterministic seed display
* Progress overlay with cancel button keeps the UI responsive
* Export to SVG / CSV / JSON with full metadata (color and perturbation params included)

---

## Three-Step Pipeline

The sidebar tabs guide you through three sequential stages. Controls for inactive steps are hidden.

### Step 1 · Field

Generate the flow field and traces. All core controls live here.

### Step 2 · Color

Apply a procedural color palette to the generated paths — without regenerating the field. Hit **Apply Color** to see the result instantly. Changing any color setting and pressing Apply rerenders in place.

### Step 3 · Perturb

Deform the field before path tracing by enabling one or more perturbation types. Press **Apply Perturbations** to regenerate with the deformation applied.

Multiple perturbations can be active simultaneously and compose additively.

---

## Field Methods & Parameters

| Method | Purpose | Key Parameters |
|--------|---------|----------------|
| Quantized Perlin | Perlin angle snapped to equal divisions | Divisions, Angle Noise Mult, Jitter |
| Smooth Perlin | Classic smooth Perlin directional field | Angle Scale, Rotation Offset |
| Pseudo Curl | Curl-like rotational flow from noise derivatives | Derivative ε, Vector Strength |
| Radial (Inward) | Attraction/repulsion toward multiple centers | Inward vs Outward, Falloff, Sources Count, Distribution, Blend Mode |
| Spiral | Multi-arm spiral blends around sources | Inwardness, Twist, Spiral Arms, Arm Sharpness, Sources Count, Distribution, Rotation Dir |
| Sine Waves | Angular interference from sine/cosine waves | Frequency X, Frequency Y, Direction Mode, Amplitude |
| Reaction-Diffusion | Gray-Scott simulation gradients steer flow | Feed Rate, Kill Rate, Diffusion A/B, Iterations, Gradient Mode, Pattern Seed |
| Line Integral Convolution | Texture-driven flow built from LIC over a base field | Base Field, Streamline Length, Kernel, Texture Resolution, Contrast Boost, Flow Direction |

### Multi-Source Controls

For Radial / Spiral:

* **Sources Count** — number of attractor/repeller centers
* **Distribution** — random, grid, circle, or ring layout
* **Randomize Sources** — resamples source positions instantly
* **Blend Mode** (Radial) — closest, average, or weighted mix of sources
* **Rotation Dir** (Spiral) — auto (alternating arms), cw, or ccw

### Path Interaction (Repulsion)

Toggle **Enable Repulsion** to push nearby path points apart during post-processing.

| Parameter | Effect |
|-----------|--------|
| Mode | `Classic` uses a spatial hash (exact, original behavior). `Fast (Barnes-Hut)` uses an O(n log n) quadtree approximation — noticeably faster at high path counts. |
| Repel Radius | Search radius in pixels for neighbor detection |
| Repel Strength | Base coefficient k in the inverse-square force F = k / r² |
| Max Neighbors | Performance cap on how many neighbors are considered (Classic mode only) |
| Angle Dampen | Blend between the original flow direction (0) and repulsion-influenced direction (1) |

Repulsion runs as a post-processing pass after path tracing; workers are unaffected.

### Reaction-Diffusion Notes

* Simulations are expensive: anything above ~2000 iterations will log a warning and can take multiple seconds on large canvases.
* `Gradient Mode` changes how flow vectors are derived — try `difference` for maze-like negative space and `laplacian` for edge-following paths.
* `Pattern Seed` controls how many initial B-chemical patches spawn; lower values yield isolated blobs, higher values form labyrinths.
* Results are cached by seed and parameters; tweak sliders gradually to reuse the cache, or hit **Random Seed** to spin up a fresh simulation.

### LIC Notes

* `Base Field` reuses any existing method; its own parameters (e.g., Spiral arms) are respected, so adjust those first if you want a different underlying flow.
* `Streamline Length` and `Kernel` control streak sharpness — longer streaks blur more but emphasize directionality.
* For fast iteration, temporarily lower `Texture Resolution` (0.6–0.8) and `Streamline Length`; restore higher values for final renders.
* `Flow Direction` lets you switch between following the base field, moving perpendicular, or following the texture gradients for painterly crosshatching.

---

## Procedural Color (Step 2)

Color is assigned per path based on a selected method. The field does not regenerate — **Apply Color** rerenders using the existing paths.

| Parameter | Effect |
|-----------|--------|
| Enable Color | Master toggle. When off, all paths render black on white. |
| Method | Which algorithm assigns colors (see methods below) |
| Background | `White` or `Black` canvas background |
| Alpha | Global opacity for all paths (0.05–1.0). Values below 1 enable transparency overlap effects. |

### Color Methods

| Method | How color is assigned |
|--------|----------------------|
| **HSL Gradient** | Hue sweeps linearly from 0° to 360° across all paths in draw order. Produces a full rainbow distribution. |
| **Solid Palette** | Cycles through a fixed set of 5 colors by path index. Default palette: red, steel blue, teal, yellow, orange. |
| **Field Angle** | Color is determined by the flow field vector direction at the path's start point. Paths aligned with the same field angle share the same hue — reveals field structure directly in color. |
| **Density Map** | Hue transitions from cool blue (first paths) to warm red (last paths). Paths drawn later appear warmer; useful when paths are ordered by spatial density. |
| **Position (X→Y)** | Hue is driven by horizontal start position (left = 0°, right = 360°); lightness varies with vertical position (top = darker, bottom = lighter). |

When color is enabled, SVG exports emit per-polyline `stroke` attributes. CSV exports add a `color` column. JSON exports include the full color parameter block.

---

## Field Perturbations (Step 3)

Perturbations modify the field vectors after generation and before path tracing. Workers automatically receive the perturbed field. Multiple types can be active at once.

Each perturbation has a checkbox to include it and sliders for its parameters. **cx / cy** are always fractional canvas coordinates (0 = left/top, 1 = right/bottom).

### Radial Impulse

Injects a Gaussian radial push or pull radiating outward from a point. Paths near the center are deflected strongly; the effect fades with a Gaussian envelope.

| Parameter | Effect |
|-----------|--------|
| strength | How strongly the impulse deflects existing field vectors. Higher values override the base field more completely near the center. |
| radius | Gaussian falloff width as a fraction of the smaller canvas dimension. Larger values spread the impulse across a wider area. |
| cx / cy | Impact point as canvas fractions. Default center (0.5, 0.5). |

### Gravity Well

Applies inverse-square attraction toward a point. Every field cell is pulled toward the well; cells far from the well are pulled gently, cells close are pulled hard — creating spiral-arm or funnel-like convergence.

| Parameter | Effect |
|-----------|--------|
| strength | Overall force magnitude. Increase to draw paths into tight spirals; decrease for a gentle bend. |
| cx / cy | Well position as canvas fractions. |
| minDist | Minimum distance (as a fraction of canvas) used to clamp the singularity at the center. Higher values prevent chaotic bursting directly at the well. |

### Rolling Ball

Simulates a ball pressing through the field. Within the ball's radius, vectors are rotated toward the tangential direction (clockwise around the ball center), as if the field were grass being flattened by a rolling object. The effect fades toward the edge of the ball.

| Parameter | Effect |
|-----------|--------|
| radius | Ball radius as a fraction of the smaller canvas dimension. |
| springK | Blend strength between the original vector (0) and the tangential direction (1). Lower values leave a subtle swirl; higher values fully redirect vectors within the ball. |
| cx / cy | Ball center as canvas fractions. |

---

## Core Global Parameters (Step 1)

| Parameter | Effect |
|-----------|--------|
| Canvas Aspect Ratio | Sets canvas dimensions from a list of presets |
| Field Method | Select the vector field algorithm |
| Field Scale | Noise sampling increment (smaller = smoother, larger = more turbulent) |
| Resolution | Steps per path — controls path length |
| Number of Paths | How many particle traces to draw |
| Step Size | Grid cell size and movement magnitude per step |
| Stroke Weight | Line thickness in pixels |
| Seed | Deterministic noise seed (blank = random; **Random Seed** button shows the active value) |
| Auto Regenerate | Recompute automatically after every parameter change |

---

## Shortcuts & UI Actions

| Action | Description |
|--------|-------------|
| R key | Force regenerate current field (Step 1) |
| Random Seed button | Generates and displays a new deterministic seed |
| Randomize Sources button | Resamples source positions for radial/spiral |
| Enable Repulsion checkbox | Toggles path separation post-processing |
| Auto Regenerate checkbox | Live update while adjusting sliders |
| Apply Color button | Reapplies color to existing paths without regenerating the field |
| Apply Perturbations button | Regenerates with current perturbation settings |

---

## Data Export

| Format | Contents |
|--------|----------|
| SVG | Polylines for each path (plotter-ready). Per-path `stroke` color attributes included when color is enabled. |
| CSV | `path_id, point_index, x, y` — plus a `color` column when color is enabled |
| JSON | Metadata only: timestamp, canvas size, seed, and all parameter blocks (field, interaction, color, perturbation) |

---

## Internal Algorithm Notes

1. **Field Generation** — Pre-compute unit vectors for each grid cell based on the selected method.
2. **Field Perturbation** (optional) — Post-process the field buffer in place before dispatching workers.
3. **Path Tracing** — Workers sample the field and trace particle paths in parallel. Serial fallback when Workers are unavailable.
4. **Repulsion** (optional) — Post-processing pass on the main thread using spatial hash (classic) or Barnes-Hut quadtree (fast).
5. **Color Assignment** (optional) — Post-processing pass that assigns a hex color to each path based on the selected method.
6. **Render / Export** — Canvas render uses per-path stroke color; SVG and CSV exports carry color metadata when enabled.
7. **Caching** — Reaction-Diffusion and LIC computations are cached per parameter set to avoid re-running expensive simulations on every slider change.

---

## Performance Tips

| Scenario | Tip |
|----------|-----|
| High path count | Lower Resolution or disable Repulsion |
| Dense repulsion slow | Switch repulsion Mode to Fast (Barnes-Hut) |
| Dense repulsion, classic | Reduce Repel Radius / Max Neighbors |
| Detailed spirals | Moderate arms (3–6) and adjust Twist slowly |
| Smooth gradients | Lower Field Scale (0.002–0.006) |
| Reaction-Diffusion taking seconds | Lower Simulation Steps or Pattern Seed; consider smaller canvas |
| LIC preview sluggish | Reduce Streamline Length or Texture Resolution while tuning |
| Perturbation not visible | Increase strength; check cx/cy is within canvas bounds |

---

## Hybrid Parallelization & Workers

* Workers require the app to be served over HTTP/HTTPS; opening `index.html` with `file://` falls back to single-threaded mode.
* `path-worker.js` receives transferable `Float32Array` field data — field perturbations are baked in before dispatch, so workers need no changes.
* Repulsion runs as a sequential post-processing pass on the main thread after all workers complete.
* The progress overlay reflects total paths completed; **Cancel** safely terminates all workers.

---

## Extending the Registries

### Adding a field method

```javascript
FIELD_METHODS.myMethod = {
  name: 'My Method',
  params: {
    myParam: { label: 'My Param', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 }
  },
  generate: ({ i, j, xoff, yoff }) => p5.Vector.fromAngle(noise(xoff, yoff) * TWO_PI)
};
```

### Adding a color method

```javascript
COLOR_METHODS.myColor = {
  name: 'My Color',
  assignPath(pathIndex, pathCount, ctx) {
    // ctx: { startX, startY, field, columns, rows, STEP_SIZE, params }
    return '#ff6600'; // return a hex color string
  }
};
```

### Adding a perturbation

```javascript
PERTURBATION_METHODS.myPerturb = {
  name: 'My Perturbation',
  timing: 'postField',
  apply(typedField, cols, rows, cfg) {
    // typedField: Float32Array, index = (col * rows + row) * 2
    // modify vx/vy pairs in place
  }
};
```

---

## Usage

1. From the project root, start a web server so Workers can load: `python3 -m http.server 8000`
2. Open `http://localhost:8000/index.html` in Chrome, Edge, or Safari.
3. **Step 1** — Pick a field method, adjust parameters, regenerate.
4. **Step 2** — Switch to Color, pick a method, hit Apply Color.
5. **Step 3** — Switch to Perturb, enable types, hit Apply Perturbations.
6. Export via SVG / CSV / JSON.

---

## Regression Checks

```bash
node scripts/regression-check.cjs
```

Validates field method registry, export serializer stability, seed reproducibility, and worker/serial tracing parity.

---

## File Structure

```text
├── index.html               # UI layout, step nav, script includes
├── field-methods.js         # Registry of field algorithms + parameter metadata
├── color-methods.js         # Registry of procedural color assignment methods
├── perturbation-methods.js  # Registry of field perturbation methods
├── flowfields.js            # Core controller: pipeline, workers, repulsion, color, export
├── path-worker.js           # Web Worker for parallel path tracing
├── export-utils.js          # CSV / SVG / JSON serializers
├── path-trace-core.js       # Shared path tracing logic (workers + CLI)
├── scripts/
│   └── regression-check.cjs # Automated regression harness
└── img/gui.png              # Interface screenshot

# CLI lives in a separate repository:
../field_generation_cli/     # Node.js CLI generator
```

---

## License

MIT

## Acknowledgments

Built with p5.js. Inspired by classic flow field, curl noise, and generative plotting techniques.
