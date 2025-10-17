# Flow Field Art Creator

Generative flow field lab for pen plotter–ready art featuring multiple vector field algorithms, multi-source radial & spiral flows, dynamic method parameters, and optional path repulsion to reduce line crossings. Added functionality to export the results as cordinates in a csv for your own further experimentation.

![GUI Screenshot](img/gui.png)

## Highlights

* 7 field methods with tunable parameters
* Multi-source radial & spiral patterns (random / grid / circle / ring layouts)
* Magnetic-style path repulsion (inverse-square) to space lines
* Auto-regenerate mode + R keyboard shortcut
* Export to SVG / CSV / JSON with full metadata

## Field Methods & Parameters

| Method | Purpose | Key Parameters |
|--------|---------|----------------|
| Quantized Perlin | Perlin angle snapped to equal divisions | Divisions, Angle Noise Mult, Jitter |
| Smooth Perlin | Classic smooth Perlin directional field | Angle Scale, Rotation Offset |
| Pseudo Curl | Curl-like rotational flow from noise derivatives | Derivative ε, Vector Strength |
| Radial (Inward) | Attraction/repulsion toward multiple centers | Inward vs Outward, Falloff, Sources Count, Distribution, Blend Mode |
| Spiral | Multi-arm spiral blends around sources | Inwardness, Twist, Spiral Arms, Arm Sharpness, Sources Count, Distribution, Rotation Dir |
| Sine Waves | Angular interference from sine/cosine waves | Frequency X, Frequency Y, Direction Mode, Amplitude |
| (Future-ready) Extensions | Add your own by extending FIELD_METHODS | Custom params |

### Multi-Source Controls

For Radial / Spiral:

* Sources Count: number of centers
* Distribution: random, grid, circle/ring
* Randomize Sources: regenerate positions instantly
* Blend Mode (Radial): closest, average, weighted
* Rotation Dir (Spiral): auto (alternating), cw, ccw

### Path Interaction (Repulsion)

Toggle Enable Repulsion to apply inverse-square separation between nearby path points.

Parameters:

* Repel Radius: search radius for neighbor points
* Repel Strength: base coefficient k in F = k / r^2
* Max Neighbors: performance cap
* Angle Dampen: blend factor between original flow direction and repulsion-influenced direction

Repulsion is disabled by default; spatial hashing only activates when enabled.

## Core Global Parameters

| Parameter | Effect |
|-----------|--------|
| Field Scale | Noise sampling increment (smaller = smoother) |
| Resolution | Steps per path (path length) |
| Number of Paths | How many particle traces to draw |
| Step Size | Grid spacing and movement magnitude |
| Stroke Weight | Line thickness |
| Seed | Deterministic noise seeding (blank = random) |
| Field Method | Select algorithm from dropdown |
| Auto Regenerate | Recompute after every change |

## Shortcuts & UI Actions

| Action | Description |
|--------|-------------|
| R key | Force regenerate current field |
| Random Seed button | Clears seed and picks new random noise seed |
| Randomize Sources button | Resamples source positions for radial/spiral |
| Enable Repulsion checkbox | Toggles path separation |
| Auto Regenerate checkbox | Live update while adjusting sliders |

## Data Export

| Format | Contents |
|--------|----------|
| SVG | Polylines for each path (plotter-ready) |
| CSV | path_id, point_index, x, y for all points |
| JSON | Metadata (canvas, parameters, interaction, methods), paths array |

JSON parameters include interaction settings when repulsion is active.

## Internal Algorithm Notes

1. Field Generation: Pre-compute p5.Vector directions for each grid cell based on selected method.
2. Path Construction: For each path, iteratively sample field → move → record point. Stops on boundary.
3. Repulsion (optional): Spatial bucket hash (size ≈ Repel Radius) collects prior points. For each step, neighbor vectors aggregated with inverse-square attenuation, blended into step direction.
4. Multi-Source Methods: Source list generated on method change or parameter update; each cell’s vector mixes contributions.

## Performance Tips

| Scenario | Tip |
|----------|-----|
| High path count | Lower Resolution or disable Repulsion |
| Dense repulsion | Reduce Repel Radius / Max Neighbors |
| Detailed spirals | Moderate arms (3–6) & adjust Twist slowly |
| Smooth gradients | Lower Field Scale (0.002–0.006) |

## Extending FIELD_METHODS

Add a new method object:
```javascript
FIELD_METHODS.myMethod = {
  name: 'My Method',
  description: 'Custom behavior',
  params: {
    myParam: {label:'My Param', type:'range', min:0, max:1, step:0.01, default:0.5}
  },
  generate: ({i,j,xoff,yoff}) => {
    // Return a p5.Vector direction
    return p5.Vector.fromAngle(noise(xoff,yoff)*TWO_PI);
  }
};
```

The UI auto-populates controls and stores values in `METHOD_PARAMS.myMethod.myParam`.

## Usage

1. Open `index.html` in a browser.
2. Pick a Field Method and adjust its parameters on the right panel.
3. (Optional) Enable Auto Regenerate for live tweaking.
4. Use R key or Regenerate button to redraw.
5. Export via SVG / CSV / JSON buttons.

## File Structure

```text
├── index.html        # UI layout & script includes
├── flowfields.js     # Field algorithms, parameters, repulsion, exports
├── img/gui.png       # Interface screenshot
└── README.md         # Documentation
```


## License

MIT

## Acknowledgments

Built with p5.js. Inspired by classic flow field, curl noise, and generative plotting techniques.
