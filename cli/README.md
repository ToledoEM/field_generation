# Flowfield CLI

**This is under heavy testing an development in any free time**

Generate flow field art from the command line. Outputs SVG / JSON / CSV (only CSV is gzip-compressed when compression is enabled) and a raster PNG (pure JS, no native build). Includes all web methods, multi-source radial & spiral, palette gradients, and deterministic seeded noise.

## Install

```bash
npm install
npm run build
npm link   # optional, to use global 'flowfield'
```

## Usage

```bash
flowfield --method quantizedPerlin --num-paths 800 --resolution 60 --step-size 3 \
  --quantum-divisions 16 --angle-multiplier 5 --qp-jitter 0.1 -o out
```

Files produced:

* flowfield.svg (always plain)
* flowfield.json (always plain)
* flowfield.csv OR flowfield.csv.gz (if compression enabled)
* flowfield.png

## Global Options

| Option | Default | Description |
|--------|---------|-------------|
| --width | 800 | Canvas width px |
| --height | 800 | Canvas height px |
| --field-scale | 0.005 | Noise sampling scale |
| --resolution | 30 | Steps per path |
| --num-paths | 500 | Number of paths (particles) |
| --step-size | 4 | Movement step size |
| --stroke-weight | 0.5 | Approximate path thickness for PNG (integer rounding) |
| --method | quantizedPerlin | Field method key |
| --seed | (none) | Deterministic noise seed |
| --line-palette | mono | Color palette key (mono,p0..p9) |
| --bg-color | #FFFFFF | Background color (hex) |
| --repel-enabled | false | Activate repulsion |
| --repel-radius | 40 | Neighbor search radius |
| --repel-strength | 0.8 | Repulsion strength coefficient |
| --max-neighbors | 35 | Limit neighbor checks |
| --angle-dampen | 0.6 | Blend factor for repulsion vs field angle |
| --no-compress | (flag) | Disable gzip compression |

## Method-Specific Options

### quantizedPerlin

* `--quantum-divisions` (int)
* `--angle-multiplier` (float)
* `--qp-jitter` (float)

### perlin

* `--perlin-angle-scale` (float)
* `--perlin-rotation-offset` (float)

### signedQuantized

* `--signed-jitter` (float)
* `--signed-invert`

### curlLike

### radialCenter


* `--radial-inward` (flag, default true when present)
* `--radial-falloff` (float)
* `--radial-sources` (int)
* `--radial-distribution` (random|grid|circle)
* `--radial-blend` (closest|average|weighted)

### spiral

* `--spiral-inwardness` (float 0..1)
* `--spiral-twist` (float)
* `--spiral-arms` (int)
* `--spiral-arm-sharpness` (float 0..1)
* `--spiral-sources` (int)
* `--spiral-distribution` (ring|grid|random)
* `--spiral-rotation-dir` (auto|cw|ccw)

### sineWaves

* `--sine-freq-x` (float)
* `--sine-freq-y` (float)
* `--sine-direction-mode` (both|vertical|horizontal|diagonal)
* `--sine-amplitude` (float)

* `--curl-epsilon` (float)
* `--curl-strength` (float)

## Compression

Only the CSV is compressed when compression is enabled (you get `flowfield.csv.gz`). SVG and JSON remain uncompressed for easy direct inspection. Disable compression with `--no-compress`.

## Color & Gradients


SVG output now assigns a unique linear gradient per path, interpolating through up to five sampled stops of the selected Sanzo Wada palette (`p0..p9`). PNG rendering applies a continuous gradient along each path using the same palette interpolation.

Palettes (examples):

* p0: Deep blue / aqua / light neutrals
* p1: Mauve to soft greys
* p2: Desert teal / gold / orange / red
* p3: Earthy charcoal / warm sands
* p4: Vintage browns / creams
* p5: Dark navy to soft slate
* p6: Violet range with light blue
* p7: Forest teal / mints
* p8: Sepia to parchment
* p9: Monochrome greyscale ramp

Use `--line-palette p2` for a warm multicolor gradient or `--line-palette mono` for classic black.

Background color is applied to both SVG `<rect>` and PNG fill: `--bg-color '#F9F5E7'`.

## Seeded Noise

Noise uses a seeded value-noise + fade interpolation. Provide `--seed 12345` for reproducible outputs across runs (same parameters produce identical paths and colors).

## PNG Rendering Optimization

Pure JS Bresenham line drawing with gradient interpolation each step. Stroke weight approximated by horizontal duplication; values >1 increase thickness. For high-res exports consider generating SVG and rasterizing externally for anti-aliasing.

CSV can be gzip-compressed by omitting `--no-compress`:

```bash
flowfield --method curlLike --curl-epsilon 0.01 --curl-strength 1.2 -o out
```

## Quick Test Examples

Run these to validate color, seeding, and multi-source behavior:

```bash
# 1. Mono palette baseline
flowfield --method quantizedPerlin --num-paths 80 --resolution 40 --line-palette mono -o test_mono

# 2. Palette gradient (p2) with background
flowfield --method quantizedPerlin --num-paths 80 --resolution 40 --line-palette p2 --bg-color '#222244' -o test_palette_p2

# 3. Seed repeatability (hash JSONs should match)
flowfield --method quantizedPerlin --seed 123 --line-palette p3 -o seed_123_run1
flowfield --method quantizedPerlin --seed 123 --line-palette p3 -o seed_123_run2
shasum -a 256 seed_123_run1/flowfield.json seed_123_run2/flowfield.json

# 4. Radial multi-source (ring distribution)
flowfield --method radialCenter --radial-sources 3 --radial-distribution ring --radial-falloff 0.7 --radial-blend weighted --line-palette p4 -o test_radial_ring

# 5. Spiral structure with twist
flowfield --method spiral --spiral-sources 4 --spiral-distribution ring --spiral-twist 0.9 --spiral-arms 3 --spiral-arm-sharpness 2.5 --line-palette p6 -o test_spiral

# 6. Sine waves direction demo
flowfield --method sineWaves --sine-freq-x 0.02 --sine-freq-y 0.015 --sine-direction-mode both --sine-amplitude 1.2 --line-palette p8 -o test_sine
```

## Examples

Palette & seed sweep with GNU Parallel:

```bash
mkdir -p batch_palette
parallel 'flowfield --method curlLike --curl-epsilon 0.008 --curl-strength 1.4 --seed 42 --line-palette {1} --num-paths 700 -o batch_palette/{1}' ::: p0 p2 p4 p7 p9
```

Spiral variants (arms × twist) with different seeds:

```bash
mkdir -p batch_spiral
parallel 'flowfield --method spiral --spiral-arms {1} --spiral-twist {2} --spiral-sources 3 --spiral-distribution ring --seed {3} --line-palette p3 -o batch_spiral/a{1}_t{2}_s{3}' ::: 3 5 7 ::: 0.5 1.0 1.8 ::: 11 22 33
```

Radial blend comparison:

```bash
mkdir -p batch_radial
parallel 'flowfield --method radialCenter --radial-sources 5 --radial-distribution grid --radial-blend {1} --radial-falloff 0.6 --seed 888 --line-palette p6 -o batch_radial/{1}' ::: closest average weighted
```

Signed quantized jitter evolution:

```bash
mkdir -p batch_signed
parallel 'flowfield --method signedQuantized --signed-jitter {1} --seed 555 --line-palette p2 -o batch_signed/j{1}' ::: 0 0.02 0.05 0.1 0.15
```

1. Signed quantized 45° grid aesthetic:

```bash
flowfield --method signedQuantized --signed-jitter 0.05 --num-paths 600 --resolution 50 -o out_signed
```

1. Dense quantized Perlin mosaic:

```bash
flowfield --method quantizedPerlin --quantum-divisions 32 --angle-multiplier 6 --qp-jitter 0.02 --num-paths 1000 --resolution 40 -o out_qp
```

1. Curl-like swirling field with repulsion:

```bash
flowfield --method curlLike --curl-epsilon 0.008 --curl-strength 1.5 --repel-enabled --repel-radius 50 --repel-strength 1.0 --num-paths 700 -o out_curl
```

### Batch Generation with GNU Parallel

Use GNU Parallel (or xargs) to explore parameter grids quickly.

Install parallel (macOS Homebrew):

```bash
brew install parallel
```

Batch vary jitter for signedQuantized:

```bash
parallel 'flowfield --method signedQuantized --signed-jitter {1} --num-paths 600 --resolution 50 -o batch/jitter_{1}' ::: 0 0.02 0.05 0.1 0.15
```

Sweep quantum divisions and angle multiplier for quantizedPerlin:

```bash
parallel 'flowfield --method quantizedPerlin --quantum-divisions {1} --angle-multiplier {2} --num-paths 800 --resolution 40 -o batch/div{1}_mult{2}' ::: 8 16 32 ::: 3 5 7
```

Repulsion strength sweep (curlLike):

```bash
parallel 'flowfield --method curlLike --curl-epsilon 0.008 --curl-strength 1.5 --repel-enabled --repel-strength {1} --num-paths 700 -o batch/repel_{1}' ::: 0.4 0.8 1.2 1.6
```

Width/height variants (ensure output folder unique per size):

```bash
parallel 'flowfield --method perlin --perlin-angle-scale 2.5 --width {1} --height {1} --num-paths 500 -o batch/size_{1}' ::: 600 800 1000
```

Compress only CSV (quantizedPerlin grid):

```bash
parallel 'flowfield --method quantizedPerlin --quantum-divisions {1} --angle-multiplier 4 --compress -o batch/compress_{1}' ::: 8 12 16 24
```

Using brace expansion without parallel (simple loop):

```bash
for d in 8 16 24; do
  flowfield --method quantizedPerlin --quantum-divisions "$d" --angle-multiplier 5 -o batch/simple_$d
done
```

Tip: Run with `--no-compress` when you plan to inspect CSV directly; enable compression for large batches to save disk.

## Notes

* Noise implementation is a deterministic value-noise with seeding; swap in a higher-quality simplex/Perlin if desired.
* Multi-source logic implemented for radialCenter and spiral methods (ring, grid, random distributions). Extend similarly for others if needed.
* Angle units: radians; PNG stroke-weight approximated by repeated Bresenham line offset (no anti-aliasing).
* Repulsion blending uses angle lerp rather than full vector combination for stability.
* No native dependencies: `canvas` removed; PNG generated via `pngjs`.

## Extending

Add new method in `src/methods.js`:

```js
FIELD_METHODS.myNew = {
  params: { scale: 1.0 },
  gen: ({xoff,yoff,p}) => noise(xoff,yoff)*Math.PI*2*p.scale
};
```

Expose CLI flags in `src/index.js` and map to `methodParams`.

## License

MIT
