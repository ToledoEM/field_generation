/**
 * Toledo EM 2025
 * Quantized Angle Flow Field Generator
 * * Modified to round the Perlin noise angle to the nearest pi/4 increment,
 * creating a geometric, grid-like flow effect using continuous paths.
 * Heavy calculations now not in a single core - hybrid approach 
 */

let FIELD_SCALE = 0.005;
let RESOLUTION = 30;
let NUM_PATHS = 500;
let STEP_SIZE = 4;
let STROKE_WEIGHT = 0.5;
let CURRENT_SEED = null;
let ACTUAL_SEED = null;
let FIELD_METHOD = "quantizedPerlin";
let AUTO_REGENERATE = false;
let METHOD_PARAMS = {}; // runtime parameter values per method
let METHOD_SOURCES = {}; // per-method array of source points for multi-source behaviors
let rdCache = null;
let licCache = null;
const SEEDED_METHODS = new Set([
  "quantizedPerlin",
  "perlin",
  "curlLike",
  "signedQuantized",
  "reactionDiffusion",
  "lineIntegralConvolution",
]);
let INTERACTION_PARAMS = {
  repelEnabled: false,
  repelRadius: 40, // pixel radius for neighbor consideration
  repelStrength: 0.8, // base strength multiplier
  maxNeighbors: 35, // cap to keep performance reasonable
  angleDampen: 0.6, // blend between field direction (1) and repulsion influenced direction
};
let pointBuckets = {}; // spatial hash for path points
let BUCKET_SIZE = 40; // tie to repelRadius default

let field = [];
let columns, rows;
let paths = [];
let SEED_MODE = "auto";

// Hybrid parallelization state
const NUM_WORKERS =
  (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
let workers = [];
let activeGenerationToken = 0;
let pendingWorkerCount = 0;
let completedPathCount = 0;
let rawPathBuffers = [];
let lastFieldBuffer = null;
let pathSeedBase = 0;

// New: Aspect Ratio Definitions
const ASPECT_RATIOS = [
  { name: "Square (1:1)", w: 800, h: 800, value: "1:1" },
  { name: "HD 16:9 Landscape", w: 960, h: 540, value: "16:9L" },
  { name: "HD 16:9 Portrait", w: 540, h: 960, value: "16:9P" },
  { name: "4:3 Landscape", w: 800, h: 600, value: "4:3L" },
  { name: "4:3 Portrait", w: 600, h: 800, value: "4:3P" },
  { name: "A4/Letter Portrait (~1:1.41)", w: 600, h: 848, value: "A4P" },
];

// Registry of field generation strategies (defined in field-methods.js)
const FIELD_METHODS = buildFieldMethods();

function invalidateCachesForMethod(method) {
  if (method === "reactionDiffusion") rdCache = null;
  if (method === "lineIntegralConvolution") licCache = null;
}

function invalidateAllCaches() {
  rdCache = null;
  licCache = null;
}

function makeMulberry32(seed) {
  let t = seed >>> 0;
  return function mulberry() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateReactionDiffusion(cols, rows, params, seed) {
  const {
    feedRate,
    killRate,
    diffusionA,
    diffusionB,
    iterations,
    patternSeed,
  } = params;

  const total = cols * rows;
  let gridA = new Float32Array(total);
  let gridB = new Float32Array(total);
  let nextA = new Float32Array(total);
  let nextB = new Float32Array(total);

  gridA.fill(1.0);
  gridB.fill(0.0);

  const rand = makeMulberry32(seed >>> 0);
  const seedCount = Math.max(1, Math.floor(patternSeed));

  for (let s = 0; s < seedCount; s++) {
    const seedX = Math.floor((cols * 0.4) * rand() + cols * 0.3);
    const seedY = Math.floor((rows * 0.4) * rand() + rows * 0.3);
    const radius = Math.floor(3 + rand() * 5);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const sx = (seedX + dx + cols) % cols;
          const sy = (seedY + dy + rows) % rows;
          const idx = sy * cols + sx;
          gridB[idx] = 1.0;
          gridA[idx] = 0.0;
        }
      }
    }
  }

  const dt = 1.0;
  const totalIterations = Math.max(1, Math.floor(iterations));
  for (let iter = 0; iter < totalIterations; iter++) {
    for (let y = 0; y < rows; y++) {
      const yUp = (y - 1 + rows) % rows;
      const yDown = (y + 1) % rows;
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const xLeft = (x - 1 + cols) % cols;
        const xRight = (x + 1) % cols;

        const a = gridA[idx];
        const b = gridB[idx];

        const laplaceA =
          gridA[y * cols + xLeft] +
          gridA[y * cols + xRight] +
          gridA[yUp * cols + x] +
          gridA[yDown * cols + x] -
          4 * a;
        const laplaceB =
          gridB[y * cols + xLeft] +
          gridB[y * cols + xRight] +
          gridB[yUp * cols + x] +
          gridB[yDown * cols + x] -
          4 * b;

        const reaction = a * b * b;
        let nextAval =
          a + (diffusionA * laplaceA - reaction + feedRate * (1 - a)) * dt;
        let nextBval =
          b + (diffusionB * laplaceB + reaction - (killRate + feedRate) * b) * dt;

        if (nextAval < 0) nextAval = 0;
        else if (nextAval > 1) nextAval = 1;
        if (nextBval < 0) nextBval = 0;
        else if (nextBval > 1) nextBval = 1;

        nextA[idx] = nextAval;
        nextB[idx] = nextBval;
      }
    }

    [gridA, nextA] = [nextA, gridA];
    [gridB, nextB] = [nextB, gridB];
  }

  return { gridA, gridB };
}

function computeReactionDiffusionConcentration(mode, cache) {
  if (!cache) return null;
  const { cols, rows, gridA, gridB } = cache;
  if (mode === "chemicalB") return gridB;

  const total = cols * rows;
  if (mode === "difference") {
    const diff = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      diff[i] = gridB[i] - gridA[i];
    }
    return diff;
  }

  if (mode === "laplacian") {
    const lap = new Float32Array(total);
    for (let y = 0; y < rows; y++) {
      const yUp = (y - 1 + rows) % rows;
      const yDown = (y + 1) % rows;
      for (let x = 0; x < cols; x++) {
        const xLeft = (x - 1 + cols) % cols;
        const xRight = (x + 1) % cols;
        const idx = y * cols + x;
        const b = gridB[idx];
        lap[idx] =
          gridB[y * cols + xLeft] +
          gridB[y * cols + xRight] +
          gridB[yUp * cols + x] +
          gridB[yDown * cols + x] -
          4 * b;
      }
    }
    return lap;
  }

  return gridB;
}

function ensureReactionDiffusionData(cols, rows, params) {
  const gradientMode = params.gradientMode || "chemicalB";
  const key = JSON.stringify({
    cols,
    rows,
    feedRate: params.feedRate,
    killRate: params.killRate,
    diffusionA: params.diffusionA,
    diffusionB: params.diffusionB,
    iterations: params.iterations,
    patternSeed: params.patternSeed,
    seed: ACTUAL_SEED ?? 0,
  });

  if (!rdCache || rdCache.key !== key) {
    if (params.iterations > 2000) {
      console.log("Running Reaction-Diffusion simulation — this may take a moment...");
    }
    const seed = (ACTUAL_SEED ?? 0) ^ 0x9e3779b9;
    const { gridA, gridB } = simulateReactionDiffusion(cols, rows, params, seed);
    rdCache = {
      key,
      cols,
      rows,
      gridA,
      gridB,
      concentrationMaps: {},
    };
  }

  if (!rdCache.concentrationMaps[gradientMode]) {
    rdCache.concentrationMaps[gradientMode] = computeReactionDiffusionConcentration(
      gradientMode,
      rdCache,
    );
  }

  return {
    cols: rdCache.cols,
    rows: rdCache.rows,
    gridA: rdCache.gridA,
    gridB: rdCache.gridB,
    concentration: rdCache.concentrationMaps[gradientMode],
  };
}

function buildBaseFieldVectors(methodKey, cols, rows, scale) {
  const vectors = new Array(cols * rows);
  const method = FIELD_METHODS[methodKey];
  if (!method) {
    for (let idx = 0; idx < vectors.length; idx++) {
      vectors[idx] = createVector(1, 0);
    }
    return vectors;
  }

  ensureSourcesForMethod(methodKey);

  let xoff = 0;
  for (let i = 0; i < cols; i++) {
    let yoff = 0;
    for (let j = 0; j < rows; j++) {
      const idx = i + j * cols;
      let vec;
      try {
        vec = method.generate({ i, j, xoff, yoff, cols, rows });
      } catch (err) {
        console.error("Base field generation failed", err);
        vec = createVector(1, 0);
      }
      if (!vec || !Number.isFinite(vec.x) || !Number.isFinite(vec.y)) {
        vec = createVector(1, 0);
      }
      vectors[idx] = vec.copy ? vec.copy() : createVector(vec.x, vec.y);
      yoff += scale;
    }
    xoff += scale;
  }
  return vectors;
}

function computeLICTexture(cols, rows, baseField, params) {
  const total = cols * rows;
  const licTexture = new Float32Array(total);
  const noiseTexture = new Float32Array(total);
  const seed = (ACTUAL_SEED ?? 0) ^ 0xdecafbad;
  const rand = makeMulberry32(seed >>> 0);
  const texScale = Math.max(0.5, params.textureResolution || 1);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      noiseTexture[idx] = rand();
    }
  }

  let kernelSize = Math.max(3, Math.floor(params.kernelSize));
  if (kernelSize % 2 === 0) kernelSize += 1;
  const halfKernel = Math.floor(kernelSize / 2);
  const kernel = new Float32Array(kernelSize);
  const sigma = kernelSize / 6;
  let kernelSum = 0;
  for (let k = 0; k < kernelSize; k++) {
    const x = k - halfKernel;
    const val = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[k] = val;
    kernelSum += val;
  }
  for (let k = 0; k < kernelSize; k++) {
    kernel[k] /= kernelSum;
  }

  const stepLength = Math.max(0.5, params.streamlineLength / kernelSize);

  const sampleNoise = (px, py) => {
    const sx = ((Math.floor(px * texScale) % cols) + cols) % cols;
    const sy = ((Math.floor(py * texScale) % rows) + rows) % rows;
    return noiseTexture[sy * cols + sx];
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const baseVec = baseField[idx];
      let dirX = baseVec ? baseVec.x : 1;
      let dirY = baseVec ? baseVec.y : 0;
      let length = Math.hypot(dirX, dirY);
      if (length < 1e-5) length = 1;
      dirX = (dirX / length) * stepLength;
      dirY = (dirY / length) * stepLength;

      let accum = noiseTexture[idx] * kernel[halfKernel];
      let weight = kernel[halfKernel];

      let px = x;
      let py = y;
      for (let step = 1; step <= halfKernel; step++) {
        px += dirX;
        py += dirY;
        const sample = sampleNoise(px, py);
        const w = kernel[halfKernel + step];
        accum += sample * w;
        weight += w;
      }

      px = x;
      py = y;
      for (let step = 1; step <= halfKernel; step++) {
        px -= dirX;
        py -= dirY;
        const sample = sampleNoise(px, py);
        const w = kernel[halfKernel - step];
        accum += sample * w;
        weight += w;
      }

      licTexture[idx] = weight > 0 ? accum / weight : noiseTexture[idx];
    }
  }

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < total; i++) {
    const val = licTexture[i];
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
  }

  const range = maxVal - minVal || 1;
  const gamma = Math.max(1, params.contrastBoost || 1);
  for (let i = 0; i < total; i++) {
    const norm = (licTexture[i] - minVal) / range;
    licTexture[i] = Math.pow(norm, 1 / gamma);
  }

  return licTexture;
}

function ensureLineIntegralConvolutionData(cols, rows, params) {
  const baseMethod = params.baseFieldMethod || "perlin";
  const baseParamSnapshot = METHOD_PARAMS[baseMethod]
    ? JSON.stringify(METHOD_PARAMS[baseMethod])
    : "{}";
  const key = JSON.stringify({
    cols,
    rows,
    baseMethod,
    baseParamSnapshot,
    fieldScale: FIELD_SCALE,
    streamlineLength: params.streamlineLength,
    kernelSize: params.kernelSize,
    textureResolution: params.textureResolution,
    contrastBoost: params.contrastBoost,
    flowDirection: params.flowDirection,
    seed: ACTUAL_SEED ?? 0,
  });

  if (!licCache || licCache.key !== key) {
    const scale = Math.max(0.0001, FIELD_SCALE * (params.textureResolution || 1));
    const baseField = buildBaseFieldVectors(baseMethod, cols, rows, scale);
    const licTexture = computeLICTexture(cols, rows, baseField, params);
    licCache = {
      key,
      cols,
      rows,
      baseField,
      licTexture,
    };
  }

  return licCache;
}

function setup() {
  const defaultRatio =
    ASPECT_RATIOS.find((r) => r.w === 800 && r.h === 800) || ASPECT_RATIOS[0];
  let canvas = createCanvas(defaultRatio.w, defaultRatio.h);
  canvas.parent("canvasContainer");
  columns = floor(width / STEP_SIZE);
  rows = floor(height / STEP_SIZE);
  setupMethodParams();
  setTimeout(() => {
    setupSliders();
    setupAspectRatioControl();
    setupGlobalListeners();
    regenerateSourcesForCurrent();
    regenerate();
  }, 100);
}

// NEW: Progress Bar and Cancellation Handlers

function showProgressBar(show) {
  const overlay = document.getElementById("progressOverlay");
  if (overlay) {
    overlay.classList.toggle("visible", show);
    overlay.style.display = "flex";
  }
  // Disable regeneration button while processing
  const regenBtn = document.getElementById("forceRegenerateBtn");
  if (regenBtn) {
    regenBtn.disabled = show;
  }
}

function updateProgressBar(percentage) {
  const progressBar = document.getElementById("progressBar");
  if (progressBar) {
    const p = Math.min(100, Math.max(0, percentage));
    progressBar.textContent = `${p.toFixed(0)}%`;
    progressBar.style.setProperty("--progress-width", `${p}%`);
  }
}

function updateSeedUI(seedValue, mode = SEED_MODE) {
  const label = document.getElementById("seedValue");
  const input = document.getElementById("seedInput");
  const hasSeed = seedValue !== null && seedValue !== undefined;
  const numericSeed = hasSeed ? Number(seedValue) : null;

  if (mode === "auto") {
    if (label) {
      label.textContent = numericSeed !== null ? `Random (${numericSeed})` : "Random";
    }
    if (input) {
      input.value = "";
    }
  } else if (mode === "random") {
    if (label) {
      label.textContent = numericSeed !== null ? `Random (${numericSeed})` : "Random";
    }
    if (input && numericSeed !== null) {
      input.value = `${numericSeed}`;
    }
  } else {
    if (label) {
      label.textContent = numericSeed !== null ? `${numericSeed}` : "Random";
    }
    if (input) {
      input.value = numericSeed !== null ? `${numericSeed}` : "";
    }
  }

  SEED_MODE = mode;
}

function terminateWorkers() {
  workers.forEach((worker) => {
    try {
      worker.terminate();
    } catch (err) {
      console.error("Worker termination failed", err);
    }
  });
  workers = [];
  pendingWorkerCount = 0;
}

function cancelGeneration() {
  activeGenerationToken++;
  terminateWorkers();
  rawPathBuffers = [];
  completedPathCount = 0;
  showProgressBar(false);
  updateProgressBar(0);
  console.log("Generation cancelled by user.");
}

// New: Function to handle canvas resizing and update global vars
function resizeCanvasAndRegenerate(newWidth, newHeight) {
  // width and height are global p5.js variables
  if (width === newWidth && height === newHeight) return;

  resizeCanvas(newWidth, newHeight);
  // No need to explicitly set global width/height as p5.js does it.

  // Recalculate grid size based on new canvas dimensions
  columns = floor(width / STEP_SIZE);
  rows = floor(height / STEP_SIZE);

  invalidateAllCaches();

  // Re-run source generation for multi-source methods
  regenerateSourcesForCurrent(true);

  // Re-run the main generation and drawing process
  regenerate();
}

// New: Function to setup the aspect ratio dropdown
function setupAspectRatioControl() {
  const select = document.getElementById("aspectRatioSelect");
  const valueDisplay = document.getElementById("aspectRatioValue");

  if (!select) {
    console.error("Aspect Ratio Select not found in DOM");
    return;
  }

  // Populate the dropdown
  ASPECT_RATIOS.forEach((ratio) => {
    const opt = document.createElement("option");
    opt.value = ratio.value;
    opt.textContent = ratio.name;
    if (ratio.w === width && ratio.h === height) opt.selected = true; // Default to current size
    select.appendChild(opt);
  });

  // Initialize display
  if (valueDisplay) valueDisplay.textContent = `${width}x${height}`;

  // Add change listener
  select.addEventListener("change", (e) => {
    const selectedValue = e.target.value;
    const ratio = ASPECT_RATIOS.find((r) => r.value === selectedValue);

    if (ratio) {
      // Update display
      if (valueDisplay) valueDisplay.textContent = `${ratio.w}x${ratio.h}`;

      // Resize and regenerate
      resizeCanvasAndRegenerate(ratio.w, ratio.h);
    }
  });
}

// --- UI Functions (kept the same) ---

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleBtn");

  sidebar.classList.toggle("hidden");
  toggleBtn.classList.toggle("hidden");

  if (sidebar.classList.contains("hidden")) {
    toggleBtn.innerHTML = "▶";
  } else {
    toggleBtn.innerHTML = "◀";
  }
}

function setupSliders() {
  const fieldScale = document.getElementById("fieldScale");
  const resolution = document.getElementById("resolution");
  const numPaths = document.getElementById("numPaths");
  const stepSize = document.getElementById("stepSize");
  const strokeWeight = document.getElementById("strokeWeight");
  const fieldMethodSelect = document.getElementById("fieldMethod");

  if (!fieldScale) {
    console.error("Sliders not found in DOM");
    return;
  }
  // Populate method dropdown
  if (fieldMethodSelect) {
    fieldMethodSelect.innerHTML = "";
    Object.entries(FIELD_METHODS).forEach(([key, meta]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.name;
      if (key === FIELD_METHOD) opt.selected = true;
      fieldMethodSelect.appendChild(opt);
    });
    fieldMethodSelect.addEventListener("change", (e) => {
      FIELD_METHOD = e.target.value;
      invalidateAllCaches();
      const label = document.getElementById("fieldMethodLabel");
      if (label) label.textContent = FIELD_METHODS[FIELD_METHOD].name;
      buildParamsUI();
      regenerateSourcesForCurrent();
      regenerate();
    });
  }

  // Field Scale
  fieldScale.addEventListener("input", (e) => {
    FIELD_SCALE = parseFloat(e.target.value);
    document.getElementById("fieldScaleValue").textContent =
      FIELD_SCALE.toFixed(3);
    invalidateCachesForMethod(FIELD_METHOD);
    maybeAutoRegenerate();
  });

  // Resoltion
  resolution.addEventListener("input", (e) => {
    RESOLUTION = parseInt(e.target.value);
    document.getElementById("resolutionValue").textContent = RESOLUTION;
    maybeAutoRegenerate();
  });

  // Number of Path
  numPaths.addEventListener("input", (e) => {
    NUM_PATHS = parseInt(e.target.value);
    document.getElementById("numPathsValue").textContent = NUM_PATHS;
    maybeAutoRegenerate();
  });

  // Step Size
  stepSize.addEventListener("input", (e) => {
    STEP_SIZE = parseFloat(e.target.value);
    document.getElementById("stepSizeValue").textContent = STEP_SIZE.toFixed(1);
    columns = floor(width / STEP_SIZE);
    rows = floor(height / STEP_SIZE);
    invalidateAllCaches();
    maybeAutoRegenerate();
  });

  // Stroke Weight
  strokeWeight.addEventListener("input", (e) => {
    STROKE_WEIGHT = parseFloat(e.target.value);
    document.getElementById("strokeWeightValue").textContent =
      STROKE_WEIGHT.toFixed(1);
    maybeAutoRegenerate();
  });

  // Seed Input
  const seedInput = document.getElementById("seedInput");
  seedInput.addEventListener("input", (e) => {
    const value = e.target.value;
    if (value === "") {
      CURRENT_SEED = null;
      updateSeedUI(null, "auto");
    } else {
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        CURRENT_SEED = null;
        updateSeedUI(null, "auto");
      } else {
        CURRENT_SEED = parsed;
        updateSeedUI(parsed, "manual");
      }
    }
    invalidateAllCaches();
    maybeAutoRegenerate();
  });
}

function setupMethodParams() {
  Object.entries(FIELD_METHODS).forEach(([key, meta]) => {
    METHOD_PARAMS[key] = {};
    if (meta.params) {
      Object.entries(meta.params).forEach(([pkey, def]) => {
        METHOD_PARAMS[key][pkey] = def.default;
      });
    }
  });
}

function buildParamsUI() {
  const container = document.getElementById("dynamicParams");
  if (!container) return;
  container.innerHTML = "";
  const meta = FIELD_METHODS[FIELD_METHOD];
  if (!meta.params) {
    container.innerHTML =
      '<em style="font-size:12px;color:#666;">No parameters for this method.</em>';
    return;
  }
  Object.entries(meta.params).forEach(([pkey, cfg]) => {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "6px";
    const label = document.createElement("label");
    label.textContent = cfg.label;
    label.style.fontSize = "12px";
    label.style.fontWeight = "600";
    label.style.display = "flex";
    label.style.justifyContent = "space-between";
    label.style.alignItems = "center";
    let control;
    if (cfg.type === "range") {
      control = document.createElement("input");
      control.type = "range";
      control.min = cfg.min;
      control.max = cfg.max;
      control.step = cfg.step;
      control.value = METHOD_PARAMS[FIELD_METHOD][pkey];
      control.style.width = "100%";
      const valSpan = document.createElement("span");
      valSpan.textContent = METHOD_PARAMS[FIELD_METHOD][pkey];
      valSpan.style.fontSize = "11px";
      valSpan.style.fontWeight = "500";
      valSpan.style.marginLeft = "8px";
      label.appendChild(valSpan);
      control.addEventListener("input", () => {
        METHOD_PARAMS[FIELD_METHOD][pkey] = parseFloat(control.value);
        valSpan.textContent = control.value;
        invalidateCachesForMethod(FIELD_METHOD);
        maybeAutoRegenerate();
        if (pkey === "sourcesCount" || pkey === "distribution") {
          regenerateSourcesForCurrent();
        }
      });
    } else if (cfg.type === "checkbox") {
      control = document.createElement("input");
      control.type = "checkbox";
      control.checked = !!METHOD_PARAMS[FIELD_METHOD][pkey];
      control.style.transform = "scale(1.1)";
      control.addEventListener("change", () => {
        METHOD_PARAMS[FIELD_METHOD][pkey] = control.checked;
        invalidateCachesForMethod(FIELD_METHOD);
        maybeAutoRegenerate();
      });
    } else if (cfg.type === "select") {
      control = document.createElement("select");
      cfg.options.forEach((optVal) => {
        const o = document.createElement("option");
        o.value = optVal;
        o.textContent = optVal;
        if (optVal === METHOD_PARAMS[FIELD_METHOD][pkey]) o.selected = true;
        control.appendChild(o);
      });
      control.style.padding = "4px 6px";
      control.style.border = "1px solid #ccc";
      control.style.borderRadius = "4px";
      control.style.fontSize = "12px";
      control.addEventListener("change", () => {
        METHOD_PARAMS[FIELD_METHOD][pkey] = control.value;
        invalidateCachesForMethod(FIELD_METHOD);
        maybeAutoRegenerate();
        if (pkey === "distribution" || pkey === "rotationDir") {
          if (pkey === "distribution") regenerateSourcesForCurrent();
        }
      });
    } else {
      control = document.createElement("span");
      control.textContent = "Unsupported type";
    }
    wrapper.appendChild(label);
    wrapper.appendChild(control);
    container.appendChild(wrapper);
  });
  // Add randomize button if method has sourcesCount
  const metaHasSources = meta.params && meta.params.sourcesCount;
  if (metaHasSources) {
    const btn = document.createElement("button");
    btn.textContent = "Randomize Sources";
    btn.style.padding = "8px 10px";
    btn.style.background = "var(--accent-color)";
    btn.style.color = "#fff";
    btn.style.border = "none";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "12px";
    btn.addEventListener("click", () => {
      regenerateSourcesForCurrent(true);
      maybeAutoRegenerate();
    });
    container.appendChild(btn);
  }
  // Append interaction controls (repulsion)
  buildInteractionUI(container);
}

function buildInteractionUI(container) {
  const section = document.createElement("div");
  section.style.marginTop = "20px";
  section.style.paddingTop = "12px";
  section.style.borderTop = "1px solid #eee";
  const title = document.createElement("div");
  title.textContent = "Path Interactions";
  title.style.fontSize = "12px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  section.appendChild(title);

  // Helper to create range control
  const makeRange = (labelTxt, key, min, max, step) => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "4px";
    const lab = document.createElement("label");
    lab.style.display = "flex";
    lab.style.justifyContent = "space-between";
    lab.style.fontSize = "11px";
    lab.style.fontWeight = "600";
    const valSpan = document.createElement("span");
    valSpan.textContent = INTERACTION_PARAMS[key];
    valSpan.style.fontSize = "11px";
    valSpan.style.marginLeft = "6px";
    lab.textContent = labelTxt;
    lab.appendChild(valSpan);
    const input = document.createElement("input");
    input.type = "range";
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = INTERACTION_PARAMS[key];
    input.addEventListener("input", () => {
      const num = parseFloat(input.value);
      INTERACTION_PARAMS[key] = num;
      valSpan.textContent = num.toFixed(2);
      if (key === "repelRadius") BUCKET_SIZE = num; // keep bucket aligned
      maybeAutoRegenerate();
    });
    wrap.appendChild(lab);
    wrap.appendChild(input);
    section.appendChild(wrap);
  };

  // Repel enabled checkbox
  const repelWrap = document.createElement("div");
  repelWrap.style.display = "flex";
  repelWrap.style.alignItems = "center";
  repelWrap.style.gap = "8px";
  const repelCb = document.createElement("input");
  repelCb.type = "checkbox";
  repelCb.checked = INTERACTION_PARAMS.repelEnabled;
  repelCb.addEventListener("change", () => {
    INTERACTION_PARAMS.repelEnabled = repelCb.checked;
    regenerate(); // immediate effect
  });
  const repelLabel = document.createElement("label");
  repelLabel.textContent = "Enable Repulsion";
  repelLabel.style.fontSize = "11px";
  repelLabel.style.fontWeight = "600";
  repelWrap.appendChild(repelCb);
  repelWrap.appendChild(repelLabel);
  section.appendChild(repelWrap);

  makeRange("Repel Radius", "repelRadius", 10, 120, 1);
  makeRange("Repel Strength", "repelStrength", 0.1, 3, 0.05);
  makeRange("Max Neighbors", "maxNeighbors", 5, 120, 1);
  makeRange("Angle Dampen", "angleDampen", 0.1, 1, 0.05);

  container.appendChild(section);
}

function generateSourcesForMethod(method, forceRandom = false) {
  const meta = FIELD_METHODS[method];
  if (!meta || !meta.params || !meta.params.sourcesCount) return [];
  const params = METHOD_PARAMS[method] || {};
  const count = Math.max(0, params.sourcesCount || 0);
  const distribution = params.distribution || "random";
  const sources = [];
  if (count === 0) return sources;

  if (distribution === "random" || forceRandom) {
    for (let k = 0; k < count; k++) {
      sources.push({ x: random(columns), y: random(rows) });
    }
  } else if (distribution === "grid") {
    const side = ceil(sqrt(count));
    for (let gx = 0; gx < side && sources.length < count; gx++) {
      for (let gy = 0; gy < side && sources.length < count; gy++) {
        sources.push({
          x: ((gx + 0.5) * columns) / side,
          y: ((gy + 0.5) * rows) / side,
        });
      }
    }
  } else if (distribution === "circle" || distribution === "ring") {
    const cx = columns / 2;
    const cy = rows / 2;
    const radius = min(columns, rows) * 0.35;
    for (let k = 0; k < count; k++) {
      const a = (TWO_PI * k) / count;
      sources.push({ x: cx + cos(a) * radius, y: cy + sin(a) * radius });
    }
  }

  return sources;
}

function ensureSourcesForMethod(method) {
  const meta = FIELD_METHODS[method];
  if (!meta || !meta.params || !meta.params.sourcesCount) return;
  const params = METHOD_PARAMS[method];
  if (!params) return;
  const expected = Math.max(0, params.sourcesCount || 0);
  const existing = METHOD_SOURCES[method];
  if (!Array.isArray(existing) || existing.length !== expected) {
    METHOD_SOURCES[method] = generateSourcesForMethod(method);
  }
}

function regenerateSourcesForCurrent(forceRandom = false) {
  const method = FIELD_METHOD;
  const sources = generateSourcesForMethod(method, forceRandom);
  METHOD_SOURCES[method] = sources;
  invalidateCachesForMethod(method);
}

function setupGlobalListeners() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      regenerate();
    }
  });
  const autoBox = document.getElementById("autoRegenerate");
  if (autoBox) {
    autoBox.addEventListener("change", () => {
      AUTO_REGENERATE = autoBox.checked;
      if (AUTO_REGENERATE) regenerate();
    });
  }
  buildParamsUI();
}

function maybeAutoRegenerate() {
  if (AUTO_REGENERATE) regenerate();
}

function randomizeSeed() {
  const newSeed = Math.floor(Math.random() * 0xffffffff);
  CURRENT_SEED = newSeed;
  ACTUAL_SEED = newSeed;
  updateSeedUI(newSeed, "random");
  invalidateAllCaches();
  regenerate();
}

function regenerate() {
  activeGenerationToken += 1;
  const generationToken = activeGenerationToken;

  terminateWorkers();
  paths = [];
  completedPathCount = 0;
  rawPathBuffers = [];

  showProgressBar(true);
  updateProgressBar(0);

  const fieldBuffer = generateField();
  lastFieldBuffer = fieldBuffer;

  pathSeedBase = computePathSeed();

  if (NUM_PATHS <= 0) {
    finalizeGeneration([], generationToken);
    return;
  }

  if (typeof Worker === "undefined") {
    const fallbackRaw = tracePathsSerial(fieldBuffer, generationToken);
    finalizeGeneration(fallbackRaw, generationToken);
    return;
  }

  dispatchWorkers(fieldBuffer, generationToken);
}

function dispatchWorkers(fieldBuffer, generationToken) {
  // Spawn web workers to trace path batches in parallel.
  const maxWorkers = Math.max(1, Math.min(NUM_WORKERS, NUM_PATHS));
  const chunkSize = Math.ceil(NUM_PATHS / maxWorkers);

  rawPathBuffers = new Array(NUM_PATHS).fill(null);
  pendingWorkerCount = 0;
  completedPathCount = 0;

  for (let workerIndex = 0; workerIndex < maxWorkers; workerIndex++) {
    const startIdx = workerIndex * chunkSize;
    const endIdx = Math.min(NUM_PATHS, startIdx + chunkSize);
    if (startIdx >= endIdx) continue;

    const worker = new Worker("path-worker.js");
    pendingWorkerCount++;
    workers.push(worker);

    worker.onmessage = (event) => handleWorkerMessage(event, generationToken);
    worker.onerror = (err) => handleWorkerError(err, generationToken);

    const fieldCopy = fieldBuffer.slice();
    const payload = {
      token: generationToken,
      startIdx,
      endIdx,
      params: {
        width,
        height,
        stepSize: STEP_SIZE,
        resolution: RESOLUTION,
        columns,
        rows,
        seed: pathSeedBase >>> 0,
        offset: startIdx,
      },
      fieldData: fieldCopy,
    };

    worker.postMessage(payload, [payload.fieldData.buffer]);
  }

  if (pendingWorkerCount === 0) {
    const fallbackRaw = tracePathsSerial(fieldBuffer, generationToken);
    finalizeGeneration(fallbackRaw, generationToken);
  }
}

function handleWorkerMessage(event, generationToken) {
  if (generationToken !== activeGenerationToken) return;

  const data = event.data || {};
  if (data.token !== generationToken) return;

  const { startIdx, paths: workerPaths } = data;
  if (!Array.isArray(workerPaths)) {
    pendingWorkerCount = Math.max(0, pendingWorkerCount - 1);
    return;
  }

  for (let i = 0; i < workerPaths.length; i++) {
    rawPathBuffers[startIdx + i] = workerPaths[i];
  }

  if (NUM_PATHS > 0) {
    completedPathCount += workerPaths.length;
    updateProgressBar((completedPathCount / NUM_PATHS) * 100);
  }

  pendingWorkerCount = Math.max(0, pendingWorkerCount - 1);
  if (pendingWorkerCount === 0) {
    finalizeGeneration(rawPathBuffers, generationToken);
  }
}

function handleWorkerError(err, generationToken) {
  console.error("Worker error", err);
  if (generationToken !== activeGenerationToken) return;

  pendingWorkerCount = Math.max(0, pendingWorkerCount - 1);
  if (pendingWorkerCount === 0) {
    terminateWorkers();
    const fallbackRaw = tracePathsSerial(lastFieldBuffer, generationToken);
    finalizeGeneration(fallbackRaw, generationToken);
  }
}

function finalizeGeneration(rawBuffers, generationToken) {
  // Collect worker results, apply repulsion, and render the final set.
  if (generationToken !== activeGenerationToken) return;

  terminateWorkers();

  const convertedPaths = [];
  if (Array.isArray(rawBuffers)) {
    for (let i = 0; i < rawBuffers.length; i++) {
      const path = convertBufferToPath(rawBuffers[i]);
      if (path && path.length) convertedPaths.push(path);
    }
  }

  let processedPaths = convertedPaths;
  if (INTERACTION_PARAMS.repelEnabled && processedPaths.length) {
    processedPaths = applyRepulsion(processedPaths);
  }

  paths = processedPaths;
  renderPaths(paths);

  if (NUM_PATHS > 0) {
    updateProgressBar(100);
  } else {
    updateProgressBar(0);
  }
  showProgressBar(false);
  console.log("Generation complete.");
}

function convertBufferToPath(buffer) {
  if (!(buffer instanceof Float32Array) || buffer.length < 2) return null;
  const path = [];
  for (let i = 0; i < buffer.length; i += 2) {
    const x = buffer[i];
    const y = buffer[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    path.push({ x, y });
  }
  return path.length ? path : null;
}

function renderPaths(pathCollection) {
  background(255);
  stroke(0);
  strokeWeight(STROKE_WEIGHT);
  noFill();

  if (!Array.isArray(pathCollection) || pathCollection.length === 0) return;

  for (const path of pathCollection) {
    if (!path || path.length < 2) continue;
    beginShape();
    for (const point of path) {
      vertex(point.x, point.y);
    }
    endShape();
  }
}

function applyRepulsion(pathCollection) {
  // Post-processing repulsion run on the main thread using a spatial hash.
  if (!INTERACTION_PARAMS.repelEnabled) return pathCollection;

  const radius = Math.max(1, INTERACTION_PARAMS.repelRadius);
  const strength = INTERACTION_PARAMS.repelStrength;
  const maxNeighbors = INTERACTION_PARAMS.maxNeighbors;
  const dampen = INTERACTION_PARAMS.angleDampen;

  BUCKET_SIZE = radius; // keep bucket size aligned with radius slider
  pointBuckets = {};
  buildSpatialHash(pathCollection);

  for (const path of pathCollection) {
    for (const point of path) {
      const neighbors = queryNeighborsForPoint(point, radius, maxNeighbors);
      if (!neighbors.length) continue;

      const repulse = createVector(0, 0);
      for (const n of neighbors) {
        const dir = createVector(point.x - n.p.x, point.y - n.p.y);
        const d = Math.max(n.d, 0.0001);
        const mag = strength / (d * d);
        dir.normalize().mult(mag);
        repulse.add(dir);
      }
      repulse.limit(STEP_SIZE * 2);
      point.x += repulse.x * dampen;
      point.y += repulse.y * dampen;
      point.x = constrain(point.x, 0, width);
      point.y = constrain(point.y, 0, height);
    }
  }

  return pathCollection;
}

function buildSpatialHash(pathCollection) {
  if (!Array.isArray(pathCollection)) return;
  for (const path of pathCollection) {
    for (const point of path) {
      const key = getBucketKey(point.x, point.y);
      if (!pointBuckets[key]) pointBuckets[key] = [];
      pointBuckets[key].push(point);
    }
  }
}

function getBucketKey(x, y) {
  const size = Math.max(1, BUCKET_SIZE);
  return `${Math.floor(x / size)},${Math.floor(y / size)}`;
}

function queryNeighborsForPoint(point, radius, maxResults) {
  const size = Math.max(1, BUCKET_SIZE);
  const bx = Math.floor(point.x / size);
  const by = Math.floor(point.y / size);
  const results = [];
  const range = 1 + Math.ceil(radius / size);

  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const key = `${bx + dx},${by + dy}`;
      const bucket = pointBuckets[key];
      if (!bucket) continue;
      for (const candidate of bucket) {
        if (candidate === point) continue;
        const d = dist(point.x, point.y, candidate.x, candidate.y);
        if (d > 0 && d <= radius) {
          results.push({ p: candidate, d });
          if (results.length >= maxResults) return results;
        }
      }
    }
  }

  return results;
}

function computePathSeed() {
  if (ACTUAL_SEED !== null) {
    const base = (ACTUAL_SEED >>> 0) * 1664525 + 1013904223;
    return base >>> 0;
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function createPRNG(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function tracePathsSerial(fieldBuffer, generationToken) {
  if (!fieldBuffer || !fieldBuffer.length || NUM_PATHS <= 0) return [];

  const prng = createPRNG(pathSeedBase >>> 0);
  const maxPoints = RESOLUTION + 1;
  const results = new Array(NUM_PATHS);

  for (let pathIdx = 0; pathIdx < NUM_PATHS; pathIdx++) {
    if (generationToken !== activeGenerationToken) break;

    const coords = new Float32Array(maxPoints * 2);
    let pointCount = 0;

    let currentX = prng.next() * width;
    let currentY = prng.next() * height;
    coords[pointCount * 2] = currentX;
    coords[pointCount * 2 + 1] = currentY;
    pointCount++;

    for (let step = 0; step < RESOLUTION; step++) {
      let xIndex = Math.floor(currentX / STEP_SIZE);
      let yIndex = Math.floor(currentY / STEP_SIZE);
      xIndex = Math.min(Math.max(xIndex, 0), columns - 1);
      yIndex = Math.min(Math.max(yIndex, 0), rows - 1);

      const idx = (xIndex + yIndex * columns) * 2;
      const fx = fieldBuffer[idx];
      const fy = fieldBuffer[idx + 1];
      if (!Number.isFinite(fx) || !Number.isFinite(fy)) break;

      let stepX = fx;
      let stepY = fy;
      const len = Math.hypot(stepX, stepY);
      if (len === 0) break;
      stepX = (stepX / len) * STEP_SIZE;
      stepY = (stepY / len) * STEP_SIZE;

      currentX += stepX;
      currentY += stepY;

      coords[pointCount * 2] = currentX;
      coords[pointCount * 2 + 1] = currentY;
      pointCount++;

      if (
        currentX < 0 ||
        currentX > width ||
        currentY < 0 ||
        currentY > height
      ) {
        break;
      }
    }

    results[pathIdx] = coords.slice(0, pointCount * 2);
    updateProgressBar(((pathIdx + 1) / NUM_PATHS) * 100);
  }

  return results;
}

// --- Core Logic (Modified) ---

function generateField() {
  const totalCells = Math.max(0, columns * rows);
  field = new Array(totalCells);
  const typedField = new Float32Array(Math.max(0, totalCells * 2));

  const previousSeed = ACTUAL_SEED;
  if (SEEDED_METHODS.has(FIELD_METHOD)) {
    let seed =
      CURRENT_SEED !== null
        ? CURRENT_SEED >>> 0
        : Math.floor(Math.random() * 0xffffffff);
    seed = Math.floor(seed >>> 0);
    ACTUAL_SEED = seed;
    if (typeof noiseSeed === "function") noiseSeed(seed);
    if (typeof randomSeed === "function") randomSeed(seed);
    if (previousSeed !== ACTUAL_SEED) invalidateAllCaches();
    if (CURRENT_SEED === null) {
      updateSeedUI(ACTUAL_SEED, "auto");
    } else {
      updateSeedUI(ACTUAL_SEED, SEED_MODE);
    }
  } else {
    ACTUAL_SEED = CURRENT_SEED !== null ? CURRENT_SEED : null;
    if (previousSeed !== ACTUAL_SEED) invalidateAllCaches();
    updateSeedUI(ACTUAL_SEED, CURRENT_SEED === null ? "auto" : SEED_MODE);
  }

  if (columns > 0 && rows > 0) {
    let xoffBase = 0;
    for (let i = 0; i < columns; i++) {
      let yoffBase = 0;
      for (let j = 0; j < rows; j++) {
        const idx = i + j * columns;
        const generator = FIELD_METHODS[FIELD_METHOD];
        let v;
        try {
          v = generator.generate({
            i,
            j,
            xoff: xoffBase,
            yoff: yoffBase,
            cols: columns,
            rows,
          });
        } catch (e) {
          console.error("Generator error", e);
          v = createVector(0, 0);
        }
        const vec = v || createVector(0, 0);
        field[idx] = vec;
        const baseIndex = idx * 2;
        typedField[baseIndex] = vec.x;
        typedField[baseIndex + 1] = vec.y;
        yoffBase += FIELD_SCALE;
      }
      xoffBase += FIELD_SCALE;
    }
  }

  lastFieldBuffer = typedField;
  return typedField;
}

function draw() {
  // placeholder
}

// --- Export Functions (updated downloadSVG) ---

function downloadCSV() {
  let csv = "path_id,point_index,x,y\n";

  for (let i = 0; i < paths.length; i++) {
    for (let j = 0; j < paths[i].length; j++) {
      csv += `${i},${j},${paths[i][j].x.toFixed(2)},${paths[i][j].y.toFixed(2)}\n`;
    }
  }

  let blob = new Blob([csv], { type: "text/csv" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "plotter_flow_field.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON() {
  let data = {
    metadata: {
      timestamp: new Date().toISOString(),
      canvas_width: width,
      canvas_height: height,
    },
    parameters: {
      field_scale: FIELD_SCALE,
      resolution: RESOLUTION,
      num_paths: NUM_PATHS,
      step_size: STEP_SIZE,
      stroke_weight: STROKE_WEIGHT,
      seed: ACTUAL_SEED,
      columns: columns,
      rows: rows,
      interaction: {
        repelEnabled: INTERACTION_PARAMS.repelEnabled,
        repelRadius: INTERACTION_PARAMS.repelRadius,
        repelStrength: INTERACTION_PARAMS.repelStrength,
        maxNeighbors: INTERACTION_PARAMS.maxNeighbors,
        angleDampen: INTERACTION_PARAMS.angleDampen,
      },
    },
  };

  let json = JSON.stringify(data, null, 2);
  let blob = new Blob([json], { type: "application/json" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "plotter_flow_field.json";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSVG() {
  // Use dynamic width and height variables
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <g stroke="black" stroke-width="${STROKE_WEIGHT}" fill="none">
`;

  for (let path of paths) {
    if (path.length < 2) continue;
    svg += '    <polyline points="';
    for (let i = 0; i < path.length; i++) {
      svg += `${path[i].x.toFixed(2)},${path[i].y.toFixed(2)}`;
      if (i < path.length - 1) svg += " ";
    }
    svg += '"/>\n';
  }

  svg += `  </g>
</svg>`;

  let blob = new Blob([svg], { type: "image/svg+xml" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "plotter_flow_field.svg";
  a.click();
  URL.revokeObjectURL(url);
}
