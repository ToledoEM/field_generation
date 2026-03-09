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
let METHOD_SOURCE_NONCES = {}; // per-method sequence for deterministic source randomization
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
  repelMode: "classic", // "classic" (spatial hash) or "fast" (Barnes-Hut quadtree)
};
let pointBuckets = {}; // spatial hash for path points
let BUCKET_SIZE = 40; // tie to repelRadius default

let field = [];
let columns, rows;
let paths = [];
let pathColors = []; // parallel to paths; null entry = use default black
let SEED_MODE = "auto";
let CURRENT_STEP = 1;

let COLOR_PARAMS = {
  enabled: false,
  method: "hslGradient",
  background: "white",   // "white" | "black"
  assignMode: "perPath",
  alpha: 1.0,
  sortMode: "none",
  palette: [],
};

let PERTURBATION_PARAMS = {
  enabled: false,
  activeTypes: [],
  configs: {
    radialImpulse: { strength: 1.5, radius: 0.25, cx: 0.5, cy: 0.5 },
    gravityWell:   { strength: 1.0, cx: 0.5, cy: 0.5, minDist: 0.01 },
    rollingBall:   { radius: 0.15, springK: 0.4, cx: 0.5, cy: 0.5 },
  }
};

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

function hashString32(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hasManualSeed() {
  return Number.isFinite(CURRENT_SEED);
}

function getSourceRNG(method, distribution, count, forceRandom = false) {
  if (!hasManualSeed()) return Math.random;

  const nonce = METHOD_SOURCE_NONCES[method] || 0;
  const nextNonce = forceRandom ? nonce + 1 : nonce;
  METHOD_SOURCE_NONCES[method] = nextNonce;

  const seed =
    (Number(CURRENT_SEED) >>> 0) ^
    Math.imul(hashString32(method), 0x45d9f3b) ^
    Math.imul(hashString32(distribution), 0x27d4eb2d) ^
    Math.imul(count >>> 0, 0x85ebca6b) ^
    Math.imul(nextNonce >>> 0, 0xc2b2ae35);
  return makeMulberry32(seed >>> 0);
}

function resetSourceNonces() {
  METHOD_SOURCE_NONCES = {};
}

function methodUsesSources(method) {
  const meta = FIELD_METHODS[method];
  return !!(meta && meta.params && meta.params.sourcesCount);
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
  setStep(1);
  setupMethodParams();
  setTimeout(() => {
    setupSliders();
    setupAspectRatioControl();
    setupGlobalListeners();
    buildColorUI(document.getElementById("controls"));
    buildPerturbationUI(document.getElementById("controls"));
    showProgressBar(false);
    regenerateSourcesForCurrent();
    regenerate();
  }, 100);
}

// NEW: Progress Bar and Cancellation Handlers

function showProgressBar(show) {
  const overlay = document.getElementById("progressOverlay");
  if (overlay) {
    overlay.style.display = show ? "flex" : "none";
    overlay.classList.toggle("visible", show);
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
  if (seedInput) {
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
      resetSourceNonces();
      if (CURRENT_SEED !== null && methodUsesSources(FIELD_METHOD)) {
        regenerateSourcesForCurrent();
      }
      invalidateAllCaches();
      maybeAutoRegenerate();
    });
  }
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
        if (pkey === "sourcesCount" || pkey === "distribution") {
          regenerateSourcesForCurrent();
        } else {
          invalidateCachesForMethod(FIELD_METHOD);
        }
        maybeAutoRegenerate();
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
        if (pkey === "distribution") {
          regenerateSourcesForCurrent();
        } else {
          invalidateCachesForMethod(FIELD_METHOD);
        }
        maybeAutoRegenerate();
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
  // Append interaction controls (repulsion) — step 1
  buildInteractionUI(container);
}

function buildInteractionUI(container) {
  const section = document.createElement("div");
  section.setAttribute("data-step", "1");
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
    return wrap;
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

  // Repulsion mode selector (classic vs fast/Barnes-Hut)
  const modeWrap = document.createElement("div");
  modeWrap.style.display = "flex";
  modeWrap.style.alignItems = "center";
  modeWrap.style.gap = "8px";
  modeWrap.style.marginTop = "4px";
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Mode";
  modeLabel.style.fontSize = "11px";
  modeLabel.style.fontWeight = "600";
  modeLabel.style.minWidth = "48px";
  const modeSelect = document.createElement("select");
  modeSelect.style.fontSize = "11px";
  modeSelect.style.flex = "1";
  [["classic", "Classic"], ["fast", "Fast (Barnes-Hut)"]].forEach(([val, txt]) => {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = txt;
    if (val === INTERACTION_PARAMS.repelMode) opt.selected = true;
    modeSelect.appendChild(opt);
  });
  modeSelect.addEventListener("change", () => {
    INTERACTION_PARAMS.repelMode = modeSelect.value;
    maxNeighborsWrap.style.display = modeSelect.value === "classic" ? "" : "none";
    maybeAutoRegenerate();
  });
  modeWrap.appendChild(modeLabel);
  modeWrap.appendChild(modeSelect);
  section.appendChild(modeWrap);

  makeRange("Repel Radius", "repelRadius", 10, 120, 1);
  makeRange("Repel Strength", "repelStrength", 0.1, 3, 0.05);
  const maxNeighborsWrap = makeRange("Max Neighbors", "maxNeighbors", 5, 120, 1);
  makeRange("Angle Dampen", "angleDampen", 0.1, 1, 0.05);

  container.appendChild(section);
}

// ─── Step navigation ──────────────────────────────────────────────────────────

function setStep(n) {
  CURRENT_STEP = n;
  document.body.className = `step-${n}-active`;
  document.querySelectorAll(".step-btn").forEach((b, i) => {
    b.classList.toggle("active", i + 1 === n);
  });
}

// ─── Color pass ───────────────────────────────────────────────────────────────

function applyColor() {
  // Re-apply color to existing paths without regenerating the field.
  pathColors = applyColorPalette(paths);
  renderPaths(paths);
}

function applyColorPalette(processedPaths) {
  if (!COLOR_PARAMS.enabled || !Array.isArray(processedPaths) || !processedPaths.length) {
    return [];
  }
  const methods = typeof COLOR_METHODS !== "undefined" ? COLOR_METHODS : null;
  const method = methods && methods[COLOR_PARAMS.method];
  if (!method || typeof method.assignPath !== "function") return [];

  const colors = [];
  const count = processedPaths.length;
  for (let i = 0; i < count; i++) {
    const path = processedPaths[i];
    const startX = path[0] ? path[0].x : 0;
    const startY = path[0] ? path[0].y : 0;
    colors.push(method.assignPath(i, count, {
      startX, startY,
      field, columns, rows, STEP_SIZE,
      params: COLOR_PARAMS,
    }));
  }
  return colors;
}

function buildColorUI(container) {
  const section = document.createElement("div");
  section.setAttribute("data-step", "2");
  section.style.marginTop = "20px";
  section.style.paddingTop = "12px";
  section.style.borderTop = "1px solid #eee";

  const title = document.createElement("div");
  title.textContent = "Color Settings";
  title.style.fontSize = "12px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  section.appendChild(title);

  // Enabled toggle
  const enableWrap = document.createElement("div");
  enableWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
  const enableCb = document.createElement("input");
  enableCb.type = "checkbox";
  enableCb.checked = COLOR_PARAMS.enabled;
  enableCb.addEventListener("change", () => {
    COLOR_PARAMS.enabled = enableCb.checked;
    regenerate();
  });
  const enableLbl = document.createElement("label");
  enableLbl.textContent = "Enable Color";
  enableLbl.style.cssText = "font-size:11px;font-weight:600;";
  enableWrap.appendChild(enableCb);
  enableWrap.appendChild(enableLbl);
  section.appendChild(enableWrap);

  // Method selector
  const methodWrap = document.createElement("div");
  methodWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
  const methodLbl = document.createElement("label");
  methodLbl.textContent = "Method";
  methodLbl.style.cssText = "font-size:11px;font-weight:600;min-width:60px;";
  const methodSel = document.createElement("select");
  methodSel.style.cssText = "font-size:11px;flex:1;";
  const methodNames = typeof COLOR_METHODS !== "undefined"
    ? Object.keys(COLOR_METHODS)
    : ["hslGradient", "solidPalette", "fieldAngle"];
  methodNames.forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = (typeof COLOR_METHODS !== "undefined" && COLOR_METHODS[key])
      ? COLOR_METHODS[key].name
      : key;
    if (key === COLOR_PARAMS.method) opt.selected = true;
    methodSel.appendChild(opt);
  });
  methodSel.addEventListener("change", () => {
    COLOR_PARAMS.method = methodSel.value;
    maybeAutoRegenerate();
  });
  methodWrap.appendChild(methodLbl);
  methodWrap.appendChild(methodSel);
  section.appendChild(methodWrap);

  // Background
  const bgWrap = document.createElement("div");
  bgWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
  const bgLbl = document.createElement("label");
  bgLbl.textContent = "Background";
  bgLbl.style.cssText = "font-size:11px;font-weight:600;min-width:60px;";
  const bgSel = document.createElement("select");
  bgSel.style.cssText = "font-size:11px;flex:1;";
  ["white", "black"].forEach(v => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
    if (v === COLOR_PARAMS.background) opt.selected = true;
    bgSel.appendChild(opt);
  });
  bgSel.addEventListener("change", () => {
    COLOR_PARAMS.background = bgSel.value;
    maybeAutoRegenerate();
  });
  bgWrap.appendChild(bgLbl);
  bgWrap.appendChild(bgSel);
  section.appendChild(bgWrap);

  // Alpha slider
  const alphaWrap = document.createElement("div");
  alphaWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:4px;";
  const alphaLbl = document.createElement("label");
  alphaLbl.style.cssText = "display:flex;justify-content:space-between;font-size:11px;font-weight:600;";
  alphaLbl.textContent = "Alpha";
  const alphaSpan = document.createElement("span");
  alphaSpan.style.cssText = "font-size:11px;margin-left:6px;";
  alphaSpan.textContent = COLOR_PARAMS.alpha.toFixed(2);
  alphaLbl.appendChild(alphaSpan);
  const alphaInput = document.createElement("input");
  alphaInput.type = "range"; alphaInput.min = 0.05; alphaInput.max = 1; alphaInput.step = 0.05;
  alphaInput.value = COLOR_PARAMS.alpha;
  alphaInput.addEventListener("input", () => {
    COLOR_PARAMS.alpha = parseFloat(alphaInput.value);
    alphaSpan.textContent = COLOR_PARAMS.alpha.toFixed(2);
    maybeAutoRegenerate();
  });
  alphaWrap.appendChild(alphaLbl);
  alphaWrap.appendChild(alphaInput);
  section.appendChild(alphaWrap);

  // Apply Color button
  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply Color";
  applyBtn.style.cssText = "margin-top:10px;width:100%;padding:9px;background:var(--accent-color);color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;";
  applyBtn.addEventListener("click", applyColor);
  section.appendChild(applyBtn);

  container.appendChild(section);
}

// ─── Perturbation pass ────────────────────────────────────────────────────────

function applyFieldPerturbations(typedField, cols, rows) {
  if (!PERTURBATION_PARAMS.enabled || !PERTURBATION_PARAMS.activeTypes.length) return;
  const methods = typeof PERTURBATION_METHODS !== "undefined" ? PERTURBATION_METHODS : null;
  if (!methods) return;
  for (const type of PERTURBATION_PARAMS.activeTypes) {
    const m = methods[type];
    if (!m || m.timing !== "postField" || typeof m.apply !== "function") continue;
    m.apply(typedField, cols, rows, PERTURBATION_PARAMS.configs[type] || {});
  }
}

function buildPerturbationUI(container) {
  const section = document.createElement("div");
  section.setAttribute("data-step", "3");
  section.style.marginTop = "20px";
  section.style.paddingTop = "12px";
  section.style.borderTop = "1px solid #eee";

  const title = document.createElement("div");
  title.textContent = "Field Perturbations";
  title.style.fontSize = "12px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  section.appendChild(title);

  // Enabled toggle
  const enableWrap = document.createElement("div");
  enableWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
  const enableCb = document.createElement("input");
  enableCb.type = "checkbox";
  enableCb.checked = PERTURBATION_PARAMS.enabled;
  enableCb.addEventListener("change", () => {
    PERTURBATION_PARAMS.enabled = enableCb.checked;
    regenerate();
  });
  const enableLbl = document.createElement("label");
  enableLbl.textContent = "Enable Perturbations";
  enableLbl.style.cssText = "font-size:11px;font-weight:600;";
  enableWrap.appendChild(enableCb);
  enableWrap.appendChild(enableLbl);
  section.appendChild(enableWrap);

  // Type checkboxes
  const typeDefs = typeof PERTURBATION_METHODS !== "undefined"
    ? Object.entries(PERTURBATION_METHODS)
    : [["radialImpulse","Radial Impulse"],["gravityWell","Gravity Well"],["rollingBall","Rolling Ball"]].map(([k,n])=>[k,{name:n}]);

  typeDefs.forEach(([key, meta]) => {
    const typeWrap = document.createElement("div");
    typeWrap.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = PERTURBATION_PARAMS.activeTypes.includes(key);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!PERTURBATION_PARAMS.activeTypes.includes(key)) PERTURBATION_PARAMS.activeTypes.push(key);
      } else {
        PERTURBATION_PARAMS.activeTypes = PERTURBATION_PARAMS.activeTypes.filter(t => t !== key);
      }
      if (PERTURBATION_PARAMS.enabled) maybeAutoRegenerate();
    });
    const lbl = document.createElement("label");
    lbl.textContent = meta.name || key;
    lbl.style.cssText = "font-size:11px;font-weight:500;";
    typeWrap.appendChild(cb);
    typeWrap.appendChild(lbl);
    section.appendChild(typeWrap);

    // Params for this type
    const cfg = PERTURBATION_PARAMS.configs[key];
    if (!cfg) return;
    const paramSection = document.createElement("div");
    paramSection.style.cssText = "margin-left:18px;margin-bottom:6px;display:flex;flex-direction:column;gap:4px;";
    Object.entries(cfg).forEach(([pKey, pVal]) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-direction:column;gap:2px;";
      const lbl2 = document.createElement("label");
      lbl2.style.cssText = "display:flex;justify-content:space-between;font-size:10px;font-weight:600;";
      lbl2.textContent = pKey;
      const valSpan = document.createElement("span");
      valSpan.style.cssText = "font-size:10px;margin-left:4px;";
      valSpan.textContent = Number.isFinite(pVal) ? pVal.toFixed(2) : pVal;
      lbl2.appendChild(valSpan);
      const inp = document.createElement("input");
      inp.type = "range";
      // Determine sensible range from key name
      const ranges = { strength:[0.1,5,0.1], radius:[0.02,0.8,0.01], cx:[0,1,0.01], cy:[0,1,0.01], minDist:[0.001,0.1,0.001], springK:[0.1,1,0.05] };
      const [rMin, rMax, rStep] = ranges[pKey] || [0, 2, 0.05];
      inp.min = rMin; inp.max = rMax; inp.step = rStep;
      inp.value = pVal;
      inp.addEventListener("input", () => {
        const num = parseFloat(inp.value);
        cfg[pKey] = num;
        valSpan.textContent = num.toFixed(2);
        if (PERTURBATION_PARAMS.enabled) maybeAutoRegenerate();
      });
      row.appendChild(lbl2);
      row.appendChild(inp);
      paramSection.appendChild(row);
    });
    section.appendChild(paramSection);
  });

  // Apply Perturbations button
  const applyPBtn = document.createElement("button");
  applyPBtn.textContent = "Apply Perturbations";
  applyPBtn.style.cssText = "margin-top:10px;width:100%;padding:9px;background:var(--accent-color);color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;";
  applyPBtn.addEventListener("click", regenerate);
  section.appendChild(applyPBtn);

  container.appendChild(section);
}

function generateSourcesForMethod(method, forceRandom = false) {
  const meta = FIELD_METHODS[method];
  if (!meta || !meta.params || !meta.params.sourcesCount) return [];
  const params = METHOD_PARAMS[method] || {};
  const count = Math.max(0, params.sourcesCount || 0);
  const distribution = params.distribution || "random";
  const rand = getSourceRNG(method, distribution, count, forceRandom);
  const sources = [];
  if (count === 0) return sources;

  if (distribution === "random" || forceRandom) {
    for (let k = 0; k < count; k++) {
      sources.push({ x: rand() * columns, y: rand() * rows });
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
    const target = e.target;
    const tagName = target && target.tagName ? target.tagName.toLowerCase() : "";
    const isEditableTarget =
      (target && target.isContentEditable) ||
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select";
    if (isEditableTarget) return;

    if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
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
  resetSourceNonces();
  if (methodUsesSources(FIELD_METHOD)) {
    regenerateSourcesForCurrent();
  }
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
  applyFieldPerturbations(fieldBuffer, columns, rows);
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
  const sharedFieldBuffer = createSharedFieldBuffer(fieldBuffer);

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
    };

    if (sharedFieldBuffer) {
      payload.fieldBuffer = sharedFieldBuffer;
      worker.postMessage(payload);
    } else {
      const fieldCopy = fieldBuffer.slice();
      payload.fieldData = fieldCopy;
      worker.postMessage(payload, [payload.fieldData.buffer]);
    }
  }

  if (pendingWorkerCount === 0) {
    const fallbackRaw = tracePathsSerial(fieldBuffer, generationToken);
    finalizeGeneration(fallbackRaw, generationToken);
  }
}

function createSharedFieldBuffer(fieldBuffer) {
  if (typeof SharedArrayBuffer === "undefined") return null;
  if (!(fieldBuffer instanceof Float32Array) || fieldBuffer.byteLength === 0) {
    return null;
  }
  try {
    const sharedBuffer = new SharedArrayBuffer(fieldBuffer.byteLength);
    const sharedField = new Float32Array(sharedBuffer);
    sharedField.set(fieldBuffer);
    return sharedBuffer;
  } catch (err) {
    console.warn("Shared field buffer unavailable, falling back to copied buffers.", err);
    return null;
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

  pathColors = applyColorPalette(processedPaths);
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
  const bgVal = (COLOR_PARAMS.enabled && COLOR_PARAMS.background === "black") ? 0 : 255;
  background(bgVal);
  noFill();

  if (!Array.isArray(pathCollection) || pathCollection.length === 0) return;

  const useAlpha = COLOR_PARAMS.enabled && COLOR_PARAMS.alpha < 1.0;
  if (useAlpha) drawingContext.globalAlpha = COLOR_PARAMS.alpha;

  for (let i = 0; i < pathCollection.length; i++) {
    const path = pathCollection[i];
    if (!path || path.length < 2) continue;
    const col = (pathColors && pathColors[i]) ? pathColors[i] : "#000000";
    stroke(col);
    strokeWeight(STROKE_WEIGHT);
    beginShape();
    for (const point of path) {
      vertex(point.x, point.y);
    }
    endShape();
  }

  if (useAlpha) drawingContext.globalAlpha = 1.0;
}

// --- Barnes-Hut Quadtree for O(n log n) repulsion ---

class BHQuadNode {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.cx = 0; this.cy = 0; this.mass = 0;
    this.point = null;
    this.children = null; // [NW, NE, SW, SE]
  }

  insert(p) {
    if (this.mass === 0) {
      this.cx = p.x; this.cy = p.y; this.mass = 1;
      this.point = p;
      return;
    }
    if (!this.children) {
      // Subdivide
      const hw = this.w / 2, hh = this.h / 2;
      this.children = [
        new BHQuadNode(this.x,      this.y,      hw, hh),
        new BHQuadNode(this.x + hw, this.y,      hw, hh),
        new BHQuadNode(this.x,      this.y + hh, hw, hh),
        new BHQuadNode(this.x + hw, this.y + hh, hw, hh),
      ];
      if (this.point) {
        this._insertIntoChild(this.point);
        this.point = null;
      }
    }
    this._insertIntoChild(p);
    // Update centre of mass
    this.cx = (this.cx * this.mass + p.x) / (this.mass + 1);
    this.cy = (this.cy * this.mass + p.y) / (this.mass + 1);
    this.mass++;
  }

  _insertIntoChild(p) {
    const hw = this.w / 2, hh = this.h / 2;
    const idx = (p.x >= this.x + hw ? 1 : 0) + (p.y >= this.y + hh ? 2 : 0);
    this.children[idx].insert(p);
  }

  // Accumulate repulsion force on point p into out {x,y}
  calcForce(p, strength, radius, theta, out) {
    if (this.mass === 0) return;
    const dx = p.x - this.cx;
    const dy = p.y - this.cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) return;
    // Beyond radius: skip
    if (d > radius) return;
    // Use approximation if node is far enough relative to its size
    if (!this.children || (this.w / d < theta)) {
      // Skip self (single point at same location)
      if (this.mass === 1 && this.point === p) return;
      const mag = strength / (d * d);
      const inv = mag / d;
      out.x += dx * inv;
      out.y += dy * inv;
    } else {
      for (const child of this.children) {
        child.calcForce(p, strength, radius, theta, out);
      }
    }
  }
}

function buildBarnesHutTree(pathCollection) {
  const tree = new BHQuadNode(0, 0, width, height);
  for (const path of pathCollection) {
    for (const point of path) tree.insert(point);
  }
  return tree;
}

// --- End Barnes-Hut ---

function applyRepulsion(pathCollection) {
  // Post-processing repulsion run on the main thread.
  if (!INTERACTION_PARAMS.repelEnabled) return pathCollection;

  const radius = Math.max(1, INTERACTION_PARAMS.repelRadius);
  const strength = INTERACTION_PARAMS.repelStrength;
  const dampen = INTERACTION_PARAMS.angleDampen;
  const limit = STEP_SIZE * 2;

  if (INTERACTION_PARAMS.repelMode === "fast") {
    // Barnes-Hut O(n log n) approximation
    const theta = 0.9; // accuracy vs speed tradeoff
    const tree = buildBarnesHutTree(pathCollection);
    for (const path of pathCollection) {
      for (const point of path) {
        const f = { x: 0, y: 0 };
        tree.calcForce(point, strength, radius, theta, f);
        const mag = Math.sqrt(f.x * f.x + f.y * f.y);
        if (mag > limit) { f.x = f.x / mag * limit; f.y = f.y / mag * limit; }
        point.x = constrain(point.x + f.x * dampen, 0, width);
        point.y = constrain(point.y + f.y * dampen, 0, height);
      }
    }
  } else {
    // Classic: spatial hash (original behavior, output-identical)
    const maxNeighbors = INTERACTION_PARAMS.maxNeighbors;
    BUCKET_SIZE = radius;
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
        repulse.limit(limit);
        point.x += repulse.x * dampen;
        point.y += repulse.y * dampen;
        point.x = constrain(point.x, 0, width);
        point.y = constrain(point.y, 0, height);
      }
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

function tracePathsSerial(fieldBuffer, generationToken) {
  if (!fieldBuffer || !fieldBuffer.length || NUM_PATHS <= 0) return [];
  const traceCore =
    typeof FlowFieldTraceCore !== "undefined" ? FlowFieldTraceCore : null;
  if (!traceCore || typeof traceCore.tracePathBatch !== "function") {
    console.error("Trace core unavailable in serial fallback.");
    return [];
  }

  return traceCore.tracePathBatch({
    columns,
    endIdx: NUM_PATHS,
    fieldData: fieldBuffer,
    height,
    offset: 0,
    onPathComplete: (_pathIndex, completedCount) => {
      updateProgressBar((completedCount / NUM_PATHS) * 100);
    },
    resolution: RESOLUTION,
    rows,
    seed: pathSeedBase >>> 0,
    shouldAbort: () => generationToken !== activeGenerationToken,
    startIdx: 0,
    stepSize: STEP_SIZE,
    width,
  });
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

function buildCSVFallback(pathCollection) {
  let csv = "path_id,point_index,x,y\n";
  for (let i = 0; i < pathCollection.length; i++) {
    for (let j = 0; j < pathCollection[i].length; j++) {
      csv += `${i},${j},${pathCollection[i][j].x.toFixed(2)},${pathCollection[i][j].y.toFixed(2)}\n`;
    }
  }
  return csv;
}

function buildSVGFallback(pathCollection) {
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <g stroke="black" stroke-width="${STROKE_WEIGHT}" fill="none">
`;

  for (let path of pathCollection) {
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
  return svg;
}

function downloadCSV() {
  const exportUtils =
    typeof FlowFieldExportUtils !== "undefined" ? FlowFieldExportUtils : null;
  const csv =
    exportUtils && typeof exportUtils.buildCSV === "function"
      ? exportUtils.buildCSV(paths, { pathColors: pathColors.length ? pathColors : null })
      : buildCSVFallback(paths);

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
        repelMode: INTERACTION_PARAMS.repelMode,
        repelRadius: INTERACTION_PARAMS.repelRadius,
        repelStrength: INTERACTION_PARAMS.repelStrength,
        maxNeighbors: INTERACTION_PARAMS.maxNeighbors,
        angleDampen: INTERACTION_PARAMS.angleDampen,
      },
      color: { ...COLOR_PARAMS },
      perturbation: {
        enabled: PERTURBATION_PARAMS.enabled,
        activeTypes: [...PERTURBATION_PARAMS.activeTypes],
        configs: JSON.parse(JSON.stringify(PERTURBATION_PARAMS.configs)),
      },
    },
  };

  const exportUtils =
    typeof FlowFieldExportUtils !== "undefined" ? FlowFieldExportUtils : null;
  const json =
    exportUtils && typeof exportUtils.stringifyJSON === "function"
      ? exportUtils.stringifyJSON(data)
      : JSON.stringify(data, null, 2);
  let blob = new Blob([json], { type: "application/json" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "plotter_flow_field.json";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSVG() {
  const exportUtils =
    typeof FlowFieldExportUtils !== "undefined" ? FlowFieldExportUtils : null;
  const svg =
    exportUtils && typeof exportUtils.buildSVG === "function"
      ? exportUtils.buildSVG({
          width,
          height,
          strokeWeight: STROKE_WEIGHT,
          paths,
          pathColors: pathColors.length ? pathColors : null,
          background: COLOR_PARAMS.enabled ? COLOR_PARAMS.background : "white",
        })
      : buildSVGFallback(paths);

  let blob = new Blob([svg], { type: "image/svg+xml" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "plotter_flow_field.svg";
  a.click();
  URL.revokeObjectURL(url);
}
