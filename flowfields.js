/**
 * Toledo EM 2025
 * Quantized Angle Flow Field Generator
 * * Modified to round the Perlin noise angle to the nearest pi/4 increment,
 * creating a geometric, grid-like flow effect using continuous paths.
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

// NEW: Generation state for chunking and cancellation
let isGenerationCancelled = false;
let pathIndex = 0; // Tracks which path we are currently drawing
const PATHS_PER_CHUNK = 50; // Number of paths to process before yielding control

// New: Aspect Ratio Definitions
const ASPECT_RATIOS = [
  { name: "Square (1:1)", w: 800, h: 800, value: "1:1" },
  { name: "HD 16:9 Landscape", w: 960, h: 540, value: "16:9L" },
  { name: "HD 16:9 Portrait", w: 540, h: 960, value: "16:9P" },
  { name: "4:3 Landscape", w: 800, h: 600, value: "4:3L" },
  { name: "4:3 Portrait", w: 600, h: 800, value: "4:3P" },
  { name: "A4/Letter Portrait (~1:1.41)", w: 600, h: 848, value: "A4P" },
];

// Registry of field generation strategies
// ... (FIELD_METHODS remains unchanged) ...
const FIELD_METHODS = {
  quantizedPerlin: {
    name: "Quantized Perlin",
    description: "Perlin noise angle rounded to 45° increments.",
    params: {
      quantumDivisions: {
        label: "Divisions (per 360°)",
        type: "range",
        min: 4,
        max: 32,
        step: 1,
        default: 8,
      },
      angleMultiplier: {
        label: "Angle Noise Mult",
        type: "range",
        min: 1,
        max: 10,
        step: 0.5,
        default: 4,
      },
      jitter: {
        label: "Angle Jitter",
        type: "range",
        min: 0,
        max: 0.5,
        step: 0.01,
        default: 0,
      },
    },
    generate: ({ xoff, yoff }) => {
      const divisions = METHOD_PARAMS.quantizedPerlin.quantumDivisions;
      const quantumAngle = TWO_PI / divisions;
      let noiseVal =
        noise(xoff, yoff) *
        TWO_PI *
        METHOD_PARAMS.quantizedPerlin.angleMultiplier;
      let angle = noiseVal % TWO_PI;
      angle = round(angle / quantumAngle) * quantumAngle;
      angle += random(
        -METHOD_PARAMS.quantizedPerlin.jitter,
        METHOD_PARAMS.quantizedPerlin.jitter,
      );
      return p5.Vector.fromAngle(angle);
    },
  },
  perlin: {
    name: "Smooth Perlin",
    description: "Standard smooth Perlin-based angle.",
    params: {
      angleScale: {
        label: "Angle Scale",
        type: "range",
        min: 0.5,
        max: 6,
        step: 0.1,
        default: 2,
      },
      rotationOffset: {
        label: "Rotation Offset",
        type: "range",
        min: -Math.PI,
        max: Math.PI,
        step: 0.01,
        default: 0,
      },
    },
    generate: ({ xoff, yoff }) => {
      let angle =
        noise(xoff, yoff) * TWO_PI * METHOD_PARAMS.perlin.angleScale +
        METHOD_PARAMS.perlin.rotationOffset;
      return p5.Vector.fromAngle(angle);
    },
  },
  signedQuantized: {
    name: "Signed Quantized 45°",
    description:
      "Noise mapped to [-π, π] then snapped to 45° increments for stark geometric flow.",
    params: {
      jitter: {
        label: "Angle Jitter",
        type: "range",
        min: 0,
        max: 0.4,
        step: 0.01,
        default: 0,
      },
      invert: { label: "Invert Direction", type: "checkbox", default: false },
    },
    generate: ({ xoff, yoff }) => {
      let n = noise(xoff, yoff); // 0..1
      let angle = PI * (2 * n - 1); // -PI .. PI
      const quantum = PI / 4; // 45° quantization
      angle = round(angle / quantum) * quantum;
      angle += random(
        -METHOD_PARAMS.signedQuantized.jitter,
        METHOD_PARAMS.signedQuantized.jitter,
      );
      if (METHOD_PARAMS.signedQuantized.invert) angle += PI; // flip direction
      return p5.Vector.fromAngle(angle);
    },
  },
  curlLike: {
    name: "Pseudo Curl",
    description: "Finite-difference derivative of Perlin to emulate curl flow.",
    params: {
      epsilon: {
        label: "Derivative ε",
        type: "range",
        min: 0.001,
        max: 0.05,
        step: 0.001,
        default: 0.01,
      },
      strength: {
        label: "Vector Strength",
        type: "range",
        min: 0.5,
        max: 5,
        step: 0.1,
        default: 1.2,
      },
    },
    generate: ({ xoff, yoff }) => {
      const e = METHOD_PARAMS.curlLike.epsilon;
      const n1 = noise(xoff, yoff + e);
      const n2 = noise(xoff, yoff - e);
      const n3 = noise(xoff + e, yoff);
      const n4 = noise(xoff - e, yoff);
      const dx = (n1 - n2) / (2 * e);
      const dy = (n3 - n4) / (2 * e);
      let v = createVector(-dy, dx);
      v.normalize().mult(METHOD_PARAMS.curlLike.strength);
      return v;
    },
  },
  radialCenter: {
    name: "Radial (Inward)",
    description: "Vectors point towards canvas center.",
    params: {
      inward: { label: "Inward vs Outward", type: "checkbox", default: true },
      falloff: {
        label: "Distance Falloff",
        type: "range",
        min: 0,
        max: 2,
        step: 0.05,
        default: 0.5,
      },
      sourcesCount: {
        label: "Sources Count",
        type: "range",
        min: 1,
        max: 12,
        step: 1,
        default: 1,
      },
      distribution: {
        label: "Distribution",
        type: "select",
        options: ["random", "grid", "circle"],
        default: "random",
      },
      blendMode: {
        label: "Blend Mode",
        type: "select",
        options: ["closest", "average", "weighted"],
        default: "weighted",
      },
    },
    generate: ({ i, j }) => {
      const sources = METHOD_SOURCES.radialCenter || [];
      if (sources.length === 0) return createVector(0, 0);
      const inward = METHOD_PARAMS.radialCenter.inward;
      const falloff = METHOD_PARAMS.radialCenter.falloff;
      const mode = METHOD_PARAMS.radialCenter.blendMode;
      let accum = createVector(0, 0);
      let weightsTotal = 0;
      let closestV = null;
      let closestD = Infinity;
      sources.forEach((s) => {
        let v = createVector(s.x - i, s.y - j);
        let d = v.mag();
        if (d < 0.001) d = 0.001;
        v.normalize();
        if (!inward) v.mult(-1);
        let maxD = dist(0, 0, columns, rows);
        let scale = 1 - (d / maxD) * falloff;
        if (scale < 0) scale = 0;
        v.mult(scale);
        if (mode === "closest") {
          if (d < closestD) {
            closestD = d;
            closestV = v;
          }
        } else if (mode === "average") {
          accum.add(v);
        } else {
          // weighted
          let w = 1 / (d + 0.001);
          accum.add(p5.Vector.mult(v, w));
          weightsTotal += w;
        }
      });
      let out;
      if (mode === "closest") out = closestV || accum;
      else if (mode === "average") {
        out = accum.div(sources.length);
      } else {
        out = weightsTotal > 0 ? accum.div(weightsTotal) : accum;
      }
      return out;
    },
  },
  spiral: {
    name: "Spiral",
    description: "Combines radial and tangential components for a spiral.",
    params: {
      inwardness: {
        label: "Inwardness",
        type: "range",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.6,
      },
      twist: {
        label: "Twist",
        type: "range",
        min: 0,
        max: 3,
        step: 0.05,
        default: 1,
      },
      arms: {
        label: "Spiral Arms",
        type: "range",
        min: 1,
        max: 12,
        step: 1,
        default: 4,
      },
      armSharpness: {
        label: "Arm Sharpness",
        type: "range",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.4,
      },
      sourcesCount: {
        label: "Sources Count",
        type: "range",
        min: 1,
        max: 12,
        step: 1,
        default: 1,
      },
      distribution: {
        label: "Distribution",
        type: "select",
        options: ["random", "ring", "grid"],
        default: "ring",
      },
      rotationDir: {
        label: "Rotation Dir",
        type: "select",
        options: ["auto", "cw", "ccw"],
        default: "auto",
      },
    },
    generate: ({ i, j }) => {
      const sources = METHOD_SOURCES.spiral || [];
      if (sources.length === 0) return createVector(0, 0);
      let inwardness = METHOD_PARAMS.spiral.inwardness;
      let twist = METHOD_PARAMS.spiral.twist;
      let arms = METHOD_PARAMS.spiral.arms;
      let sharp = METHOD_PARAMS.spiral.armSharpness;
      let rotDirSetting = METHOD_PARAMS.spiral.rotationDir;
      let accum = createVector(0, 0);
      sources.forEach((s) => {
        let local = createVector(i - s.x, j - s.y);
        let mag = local.mag();
        if (mag < 0.5) return; // ignore near-source singularity
        let radial = local.copy().normalize();
        let tangential = createVector(-radial.y, radial.x);
        // rotation direction logic
        let useTangential = tangential;
        if (rotDirSetting !== "auto") {
          const sign = rotDirSetting === "cw" ? 1 : -1;
          useTangential = createVector(
            sign * tangential.x,
            sign * tangential.y,
          );
        } else {
          // auto decides based on source index parity for variety
          let idx = sources.indexOf(s);
          if (idx % 2 === 1) useTangential.mult(-1);
        }
        let mix = inwardness; // radial weight
        let armFactor = sin(radial.heading() * arms + mag * twist);
        armFactor = pow(abs(armFactor), sharp);
        let v = p5.Vector.lerp(useTangential, radial.mult(-1), mix);
        v.normalize().mult(1 + armFactor * 0.8);
        // Distance attenuation so multiple sources blend
        let attenuation = 1 / (1 + mag * 0.02);
        accum.add(v.mult(attenuation));
      });
      accum.normalize();
      return accum;
    },
  },
  sineWaves: {
    name: "Sine Waves",
    description: "Angle modulated by combined sin/cos of grid.",
    params: {
      freqX: {
        label: "Frequency X",
        type: "range",
        min: 0.05,
        max: 1,
        step: 0.01,
        default: 0.15,
      },
      freqY: {
        label: "Frequency Y",
        type: "range",
        min: 0.05,
        max: 1,
        step: 0.01,
        default: 0.21,
      },
      directionMode: {
        label: "Direction Mode",
        type: "select",
        options: ["both", "vertical", "horizontal", "diagonal"],
        default: "both",
      },
      amplitude: {
        label: "Amplitude",
        type: "range",
        min: 0.2,
        max: 3,
        step: 0.1,
        default: 1,
      },
    },
    generate: ({ i, j }) => {
      let fx = METHOD_PARAMS.sineWaves.freqX;
      let fy = METHOD_PARAMS.sineWaves.freqY;
      let base = sin(i * fx) + cos(j * fy);
      let mode = METHOD_PARAMS.sineWaves.directionMode;
      let angle = base;
      if (mode === "vertical")
        angle = sin(j * fy) * METHOD_PARAMS.sineWaves.amplitude;
      else if (mode === "horizontal")
        angle = cos(i * fx) * METHOD_PARAMS.sineWaves.amplitude;
      else if (mode === "diagonal")
        angle =
          sin((i + j) * (fx + fy) * 0.5) * METHOD_PARAMS.sineWaves.amplitude;
      else angle = base * METHOD_PARAMS.sineWaves.amplitude;
      return p5.Vector.fromAngle(angle);
    },
  },
};

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
    overlay.style.display = show ? "flex" : "none";
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
    progressBar.style.width = `${p}%`;
    progressBar.textContent = `${p.toFixed(0)}%`;
  }
}

function cancelGeneration() {
  isGenerationCancelled = true;
  showProgressBar(false);
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
      document.getElementById("seedValue").textContent = "Random";
    } else {
      CURRENT_SEED = parseInt(value);
      document.getElementById("seedValue").textContent = CURRENT_SEED;
    }
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

function regenerateSourcesForCurrent(forceRandom = false) {
  const method = FIELD_METHOD;
  const meta = FIELD_METHODS[method];
  if (!meta.params || !meta.params.sourcesCount) {
    METHOD_SOURCES[method] = [];
    return;
  }
  const count = METHOD_PARAMS[method].sourcesCount;
  const distribution = METHOD_PARAMS[method].distribution;
  const sources = [];
  if (distribution === "random" || forceRandom) {
    for (let k = 0; k < count; k++) {
      sources.push({ x: random(columns), y: random(rows) });
    }
  } else if (distribution === "grid") {
    let side = ceil(sqrt(count));
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
  METHOD_SOURCES[method] = sources;
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
  CURRENT_SEED = null;
  document.getElementById("seedInput").value = "";
  document.getElementById("seedValue").textContent = "Random";
  regenerate();
}

function regenerate() {
  // If already generating, cancel the existing process first
  if (pathIndex < NUM_PATHS && !isGenerationCancelled) {
    cancelGeneration();
  }

  paths = [];
  isGenerationCancelled = false; // Reset cancellation state
  pathIndex = 0; // Reset path counter

  generateField(); // Generate the underlying field structure

  // If the number of paths is large, or repulsion is enabled, we use chunking
  if (NUM_PATHS > 1000 || INTERACTION_PARAMS.repelEnabled) {
    showProgressBar(true);
    drawFieldSetup(); // Start the asynchronous drawing process
  } else {
    // For fast processes, draw synchronously without a progress bar
    drawFieldSynchronous();
  }
}

// New: Setup for chunked drawing
function drawFieldSetup() {
  // Common drawing setup (background, stroke style)
  background(255);
  stroke(0);
  strokeWeight(STROKE_WEIGHT);
  noFill();

  // Reset spatial hash for path points
  pointBuckets = {};

  // Define helper functions locally (or globally if preferred)
  this.bucketKey = function (x, y) {
    return `${Math.floor(x / BUCKET_SIZE)},${Math.floor(y / BUCKET_SIZE)}`;
  };
  this.addPointToBuckets = function (pt) {
    const key = this.bucketKey(pt.x, pt.y);
    if (!pointBuckets[key]) pointBuckets[key] = [];
    pointBuckets[key].push(pt);
  }.bind(this);
  this.queryNeighbors = function (x, y, radius) {
    const bx = Math.floor(x / BUCKET_SIZE);
    const by = Math.floor(y / BUCKET_SIZE);
    const results = [];
    const range = 1 + Math.ceil(radius / BUCKET_SIZE);
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        const key = `${bx + dx},${by + dy}`;
        const arr = pointBuckets[key];
        if (!arr) continue;
        for (let p of arr) {
          const d = dist(x, y, p.x, p.y);
          if (d > 0 && d <= radius) results.push({ p, d });
        }
      }
    }
    return results.slice(0, INTERACTION_PARAMS.maxNeighbors); // Limit results here for safety
  }.bind(this);

  // Start the chunked loop
  processPathsChunk();
}

// New: Asynchronous chunked drawing
function processPathsChunk() {
  const startPath = pathIndex;
  const endPath = Math.min(NUM_PATHS, startPath + PATHS_PER_CHUNK);
  const useRepulsion = INTERACTION_PARAMS.repelEnabled;

  for (let i = startPath; i < endPath; i++) {
    if (isGenerationCancelled) {
      showProgressBar(false);
      return;
    }

    let current_pos = createVector(random(width), random(height));
    let pathPoints = [{ x: current_pos.x, y: current_pos.y }];
    if (useRepulsion) this.addPointToBuckets(current_pos.copy());

    beginShape();
    vertex(current_pos.x, current_pos.y);

    for (let j = 0; j < RESOLUTION; j++) {
      let x_index = floor(current_pos.x / STEP_SIZE);
      let y_index = floor(current_pos.y / STEP_SIZE);

      x_index = constrain(x_index, 0, columns - 1);
      y_index = constrain(y_index, 0, rows - 1);

      let index = x_index + y_index * columns;
      let force = field[index];

      if (!force) break;

      let stepVec = force.copy().setMag(STEP_SIZE);
      if (useRepulsion) {
        const neighbors = this.queryNeighbors(
          current_pos.x,
          current_pos.y,
          INTERACTION_PARAMS.repelRadius,
        );
        let repulse = createVector(0, 0);
        let count = 0;
        for (let n of neighbors) {
          const dir = createVector(
            current_pos.x - n.p.x,
            current_pos.y - n.p.y,
          );
          const d = max(n.d, 0.0001);
          const mag = INTERACTION_PARAMS.repelStrength / (d * d);
          dir.normalize().mult(mag);
          repulse.add(dir);
          count++;
        }
        if (count > 0) {
          repulse.limit(STEP_SIZE * 2);
          stepVec = p5.Vector.lerp(
            stepVec,
            stepVec.copy().add(repulse),
            INTERACTION_PARAMS.angleDampen,
          );
          stepVec.setMag(STEP_SIZE);
        }
      }
      current_pos.add(stepVec);
      pathPoints.push({ x: current_pos.x, y: current_pos.y });
      if (useRepulsion) this.addPointToBuckets(current_pos.copy());
      vertex(current_pos.x, current_pos.y);

      if (
        current_pos.x < 0 ||
        current_pos.x > width ||
        current_pos.y < 0 ||
        current_pos.y > height
      ) {
        break;
      }
    }

    endShape();
    paths.push(pathPoints);
    pathIndex++;
  }

  // Update progress
  updateProgressBar((pathIndex / NUM_PATHS) * 100);

  // Check completion
  if (pathIndex < NUM_PATHS) {
    // Continue processing in the next frame to prevent blocking
    setTimeout(processPathsChunk, 0);
  } else {
    // Done!
    showProgressBar(false);
    console.log("Generation complete.");
  }
}

// New: Synchronous drawing (for small, fast generations)
function drawFieldSynchronous() {
  background(255);
  stroke(0);
  strokeWeight(STROKE_WEIGHT);
  noFill();

  // Quick and dirty setup for local helpers (no need for complex binding as it's synchronous)
  let pointBuckets = {};
  const BUCKET_SIZE = INTERACTION_PARAMS.repelRadius;
  const bucketKey = (x, y) =>
    `${Math.floor(x / BUCKET_SIZE)},${Math.floor(y / BUCKET_SIZE)}`;
  const addPointToBuckets = (pt) => {
    const key = bucketKey(pt.x, pt.y);
    if (!pointBuckets[key]) pointBuckets[key] = [];
    pointBuckets[key].push(pt);
  };
  const queryNeighbors = (x, y, radius) => {
    const bx = Math.floor(x / BUCKET_SIZE);
    const by = Math.floor(y / BUCKET_SIZE);
    const results = [];
    const range = 1 + Math.ceil(radius / BUCKET_SIZE);
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        const key = `${bx + dx},${by + dy}`;
        const arr = pointBuckets[key];
        if (!arr) continue;
        for (let p of arr) {
          const d = dist(x, y, p.x, p.y);
          if (d > 0 && d <= radius) results.push({ p, d });
        }
      }
    }
    return results.slice(0, INTERACTION_PARAMS.maxNeighbors);
  };

  const useRepulsion = INTERACTION_PARAMS.repelEnabled;
  paths = []; // Overwrite paths with fresh data

  for (let i = 0; i < NUM_PATHS; i++) {
    let current_pos = createVector(random(width), random(height));
    let pathPoints = [{ x: current_pos.x, y: current_pos.y }];
    if (useRepulsion) addPointToBuckets(current_pos.copy());

    beginShape();
    vertex(current_pos.x, current_pos.y);

    for (let j = 0; j < RESOLUTION; j++) {
      let x_index = floor(current_pos.x / STEP_SIZE);
      let y_index = floor(current_pos.y / STEP_SIZE);

      x_index = constrain(x_index, 0, columns - 1);
      y_index = constrain(y_index, 0, rows - 1);

      let index = x_index + y_index * columns;
      let force = field[index];

      if (!force) break;

      let stepVec = force.copy().setMag(STEP_SIZE);
      if (useRepulsion) {
        const neighbors = queryNeighbors(
          current_pos.x,
          current_pos.y,
          INTERACTION_PARAMS.repelRadius,
        );
        let repulse = createVector(0, 0);
        let count = 0;
        for (let n of neighbors) {
          const dir = createVector(
            current_pos.x - n.p.x,
            current_pos.y - n.p.y,
          );
          const d = max(n.d, 0.0001);
          const mag = INTERACTION_PARAMS.repelStrength / (d * d);
          dir.normalize().mult(mag);
          repulse.add(dir);
          count++;
        }
        if (count > 0) {
          repulse.limit(STEP_SIZE * 2);
          stepVec = p5.Vector.lerp(
            stepVec,
            stepVec.copy().add(repulse),
            INTERACTION_PARAMS.angleDampen,
          );
          stepVec.setMag(STEP_SIZE);
        }
      }
      current_pos.add(stepVec);
      pathPoints.push({ x: current_pos.x, y: current_pos.y });
      if (useRepulsion) addPointToBuckets(current_pos.copy());
      vertex(current_pos.x, current_pos.y);

      if (
        current_pos.x < 0 ||
        current_pos.x > width ||
        current_pos.y < 0 ||
        current_pos.y > height
      ) {
        break;
      }
    }

    endShape();
    paths.push(pathPoints);
  }
}

// --- Core Logic (Modified) ---

function generateField() {
  field = new Array(columns * rows);

  // Only seed noise-dependent methods once
  let needsNoise = [
    "quantizedPerlin",
    "perlin",
    "curlLike",
    "signedQuantized",
  ].includes(FIELD_METHOD);
  if (needsNoise) {
    let seed = CURRENT_SEED !== null ? CURRENT_SEED : random(10000);
    ACTUAL_SEED = Math.floor(seed);
    noiseSeed(seed);
    if (CURRENT_SEED === null) {
      const seedValueEl = document.getElementById("seedValue");
      if (seedValueEl) seedValueEl.textContent = `Random (${ACTUAL_SEED})`;
    }
  } else {
    ACTUAL_SEED = CURRENT_SEED !== null ? CURRENT_SEED : null;
  }

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
        });
      } catch (e) {
        console.error("Generator error", e);
        v = createVector(0, 0);
      }
      field[idx] = v || createVector(0, 0);
      yoffBase += FIELD_SCALE;
    }
    xoffBase += FIELD_SCALE;
  }
}

function drawField() {
  background(255);
  stroke(0);
  strokeWeight(STROKE_WEIGHT);
  noFill();
  let bucketKey, addPointToBuckets, queryNeighbors;
  if (INTERACTION_PARAMS.repelEnabled) {
    // initialize spatial hash only if using repulsion
    pointBuckets = {};
    bucketKey = function (x, y) {
      return `${Math.floor(x / BUCKET_SIZE)},${Math.floor(y / BUCKET_SIZE)}`;
    };
    addPointToBuckets = function (pt) {
      const key = bucketKey(pt.x, pt.y);
      if (!pointBuckets[key]) pointBuckets[key] = [];
      pointBuckets[key].push(pt);
    };
    queryNeighbors = function (x, y, radius) {
      const bx = Math.floor(x / BUCKET_SIZE);
      const by = Math.floor(y / BUCKET_SIZE);
      const results = [];
      const range = 1 + Math.ceil(radius / BUCKET_SIZE);
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          const key = `${bx + dx},${by + dy}`;
          const arr = pointBuckets[key];
          if (!arr) continue;
          for (let p of arr) {
            const d = dist(x, y, p.x, p.y);
            if (d > 0 && d <= radius) results.push({ p, d });
          }
        }
      }
      return results;
    };
  } else {
    // no-op functions when repulsion disabled
    addPointToBuckets = function () {};
    queryNeighbors = function () {
      return [];
    };
  }

  // Reverting to the original path-tracing logic
  for (let i = 0; i < NUM_PATHS; i++) {
    let current_pos = createVector(random(width), random(height));
    let pathPoints = [{ x: current_pos.x, y: current_pos.y }];
    addPointToBuckets(current_pos.copy());

    for (let j = 0; j < RESOLUTION; j++) {
      let x_index = floor(current_pos.x / STEP_SIZE);
      let y_index = floor(current_pos.y / STEP_SIZE);

      x_index = constrain(x_index, 0, columns - 1);
      y_index = constrain(y_index, 0, rows - 1);

      let index = x_index + y_index * columns;
      let force = field[index];

      if (!force) break;

      let stepVec = force.copy().setMag(STEP_SIZE);
      if (INTERACTION_PARAMS.repelEnabled) {
        const neighbors = queryNeighbors(
          current_pos.x,
          current_pos.y,
          INTERACTION_PARAMS.repelRadius,
        );
        let repulse = createVector(0, 0);
        let count = 0;
        for (let n of neighbors) {
          if (count >= INTERACTION_PARAMS.maxNeighbors) break;
          const dir = createVector(
            current_pos.x - n.p.x,
            current_pos.y - n.p.y,
          );
          const d = max(n.d, 0.0001);
          const mag = INTERACTION_PARAMS.repelStrength / (d * d); // inverse square
          dir.normalize().mult(mag);
          repulse.add(dir);
          count++;
        }
        if (count > 0) {
          // Blend repulsion with original direction
          repulse.limit(STEP_SIZE * 2);
          stepVec = p5.Vector.lerp(
            stepVec,
            stepVec.copy().add(repulse),
            INTERACTION_PARAMS.angleDampen,
          );
          stepVec.setMag(STEP_SIZE);
        }
      }
      current_pos.add(stepVec);
      pathPoints.push({ x: current_pos.x, y: current_pos.y });
      addPointToBuckets(current_pos.copy());

      if (
        current_pos.x < 0 ||
        current_pos.x > width ||
        current_pos.y < 0 ||
        current_pos.y > height
      ) {
        break;
      }
    }

    paths.push(pathPoints);

    beginShape();
    for (let point of pathPoints) {
      vertex(point.x, point.y);
    }
    endShape();
  }
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
      total_paths: paths.length,
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
    paths: paths,
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
