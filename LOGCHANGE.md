# Log Change

## v0.10 - 2026-03-09
- Implemented step-based UX pipeline (Step 1 → Field, Step 2 → Color, Step 3 → Perturb):
  - sidebar tabs show only the active step's controls
  - each step has its own Apply/Regenerate button
- Implemented `IMP-04` Barnes-Hut quadtree repulsion mode (`fast` vs `classic` selector in Path Interactions)
- Added procedural color system (`color-methods.js`):
  - 5 color methods: HSL Gradient, Solid Palette, Field Angle, Density Map, Position
  - per-path color, alpha, background (white/black) controls
  - SVG export now emits per-polyline stroke colors when color is enabled
  - CSV export adds optional `color` column
  - JSON export includes `color` params block
- Added field perturbation system (`perturbation-methods.js`):
  - 3 post-generation perturbation types: Radial Impulse, Gravity Well, Rolling Ball
  - perturbations applied after field generation, before path tracing
  - JSON export includes `perturbation` params block
- CLI moved to separate repository (`../field_generation_cli`)
- Updated `CLAUDE.md` and `README.md` to reflect CLI relocation and new architecture

## v0.9 - 2026-02-10
- Commit: pending (current working changes)
- Completed all `P0` web/runtime fixes:
  - source regeneration order corrected for multi-source controls
  - deterministic seeded source generation for radial/spiral
  - keyboard shortcut scope fixed (`R` ignored while typing)
  - progress overlay show/hide state fixed
  - HTML integrity fix + p5 CDN fallback to local `libraries/p5.min.js`
- Implemented `IMP-01` regression harness:
  - added `scripts/regression-check.cjs`
  - added shared utilities: `path-trace-core.js` and `export-utils.js`
  - documented regression command in `README.md`
- Implemented `IMP-02` worker memory optimization:
  - worker dispatch now uses `SharedArrayBuffer` field sharing when available
  - automatic fallback to per-worker copied buffers when SAB is unavailable
  - worker and serial tracing now share the same tracing core logic

## v0.8 - 2026-02-10
- Commit: `36c119f` by ToledoEM (`beging new vibe code fix`)
- Updated `field-methods.js` and reorganized example outputs (`plotter_flow_field_big`, `radialgrid`, `radian_glitch`).
- Added `example/helper_functions.R`, removed `todo.md`, and adjusted `.gitignore`.

## v0.7 - 2025-10-18
- Commit: `9980c7c` by ToledoEM (`update`)
- Introduced modular method/worker architecture with `field-methods.js` and `path-worker.js`.
- Updated core web files (`flowfields.js`, `index.html`, `README.md`) and refreshed example assets.
- Added `further exploration.md` and updated CLI docs.

## v0.6 - 2025-10-17
- Commit: `fed69bc` by ToledoEM (`new stuff`)
- Added the `cli/` toolchain (source, dist, docs, dependencies, and generated outputs).
- Updated web runtime/docs (`flowfields.js`, `index.html`, `README.md`) and example files.
- Removed `autofieldgenerator` and `sketch.properties`; added `todo.md`.

## v0.5 - 2025-10-05
- Commit: `a68ba92` by ToledoEM (`de cringe llm description`)
- README wording and project description cleanup.

## v0.4 - 2025-10-04
- Commit: `4bf4c43` by ToledoEM (`update-clean`)
- Removed deprecated page: `deprecated_index.html`.

## v0.3 - 2025-10-04
- Commit: `88cf637` by ToledoEM (`submodule`)
- Added `.gitmodules` and the `autofieldgenerator` submodule.

## v0.2 - 2025-10-04
- Commit: `f085065` by ToledoEM (`updated`)
- Renamed `flow_field_readme.md` to `README.md` and `slider_gemeni.js` to `flowfields.js`.
- Added project screenshot and example exports (`csv/json/svg/png`) plus R plotting project files.
- Updated `index.html`, added `.gitignore`, and introduced `deprecated_index.html`.

## v0.1 - 2025-10-04
- Commit: `dd45046` by ToledoEM (`Initial commit`)
- Initial web generator foundation with `index.html`, `libraries/p5.min.js`, `slider_gemeni.js`, and base docs/license files.
