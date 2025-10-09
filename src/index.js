import { defaultConfig, cloneConfig } from './config/defaultConfig.js';
import { buildPaletteColors } from './palette/palettes.js';
import { NoiseField } from './field/NoiseField.js';
import { ParticleSimulator } from './sim/ParticleSimulator.js';
import { CanvasRenderer } from './render/CanvasRenderer.js';
import { exportSVG } from './export/SVGExporter.js';

// Global-ish runtime state encapsulated
let config = cloneConfig(defaultConfig);
let paletteColors = buildPaletteColors(config.palette, config.includeBW);
let noiseFieldInstance; // created after p5 is ready
let paths = [];
let autoGenInterval = null;
let isAutoGenerating = false;

export function generateArtwork(inputConfig) {
  const cfg = { ...config, ...inputConfig };
  const p = window._p5Instance; // rely on single sketch instance
  if (!noiseFieldInstance) noiseFieldInstance = new NoiseField(p, cfg);
  noiseFieldInstance.config = cfg;
  noiseFieldInstance.generate();
  const simulator = new ParticleSimulator(p, noiseFieldInstance, cfg);
  const newPaths = simulator.generatePaths();
  return {
    paths: newPaths,
    metadata: {
      seed: noiseFieldInstance.seedUsed,
      columns: noiseFieldInstance.columns,
      rows: noiseFieldInstance.rows,
      config: cfg
    }
  };
}

function applyConfigUpdates() {
  paletteColors = buildPaletteColors(config.palette, config.includeBW);
  // If inversion flag enabled, invert each hex color (excluding transparency assumptions)
  if (config.invertColors) {
    paletteColors = paletteColors.map(hex => {
      const h = hex.replace('#','');
      if (h.length !== 6) return hex; // skip non-standard
      const r = 255 - parseInt(h.substring(0,2),16);
      const g = 255 - parseInt(h.substring(2,4),16);
      const b = 255 - parseInt(h.substring(4,6),16);
      const toHex = v => v.toString(16).padStart(2,'0');
      return '#' + toHex(r) + toHex(g) + toHex(b);
    });
  }
  const { paths: genPaths } = generateArtwork(config);
  paths = genPaths;
  const renderer = new CanvasRenderer(window._p5Instance, config);
  renderer.draw(paths, paletteColors);
  updateParamsBar();
}

function updateParamsBar() {
  const paramsDiv = document.getElementById('parameters');
  if (!paramsDiv) return;
  const avgPathLen = (config.resolution * config.stepSize).toFixed(1);
  const bg = config.backgroundColor || '#FFFFFF';
  paramsDiv.textContent = `Noise: ${config.noiseType} | Scale: ${config.fieldScale.toFixed(4)} | Paths: ${config.numPaths} | Avg Path Length: ${avgPathLen} | Stroke: ${config.strokeWeight.toFixed(2)} | Palette: ${config.palette} | BG: ${bg} | Invert: ${config.invertColors ? 'ON' : 'OFF'}`;
}

function setupUI() {
  const bindSlider = (id, prop, isFloat = true, transform = v => v) => {
    const el = document.getElementById(id);
    const valSpan = document.getElementById(id + 'Value');
    if (!el) return;
    el.addEventListener('input', e => {
      const raw = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
      config[prop] = transform(raw);
      if (valSpan) valSpan.textContent = isFloat ? raw.toFixed( prop === 'fieldScale' ? 3 : 1) : raw;
    });
  };
  bindSlider('fieldScale', 'fieldScale', true, v => v);
  bindSlider('resolution', 'resolution', false);
  bindSlider('numPaths', 'numPaths', false);
  bindSlider('stepSize', 'stepSize', true);
  bindSlider('strokeWeight', 'strokeWeight', true);

  const seedInput = document.getElementById('seedInput');
  if (seedInput) {
    seedInput.addEventListener('input', e => {
      const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
      config.seed = value;
      displaySeed();
    });
  }
  const noiseTypeSelect = document.getElementById('noiseTypeSelect');
  if (noiseTypeSelect) noiseTypeSelect.addEventListener('change', e => { config.noiseType = e.target.value; regenerate(); });
  const paletteSelect = document.getElementById('paletteSelect');
  if (paletteSelect) paletteSelect.addEventListener('change', e => { config.palette = e.target.value; regenerate(); });
  const includeBW = document.getElementById('includeBW');
  if (includeBW) includeBW.addEventListener('change', e => { config.includeBW = e.target.checked; regenerate(); });
  const bgFlip = document.getElementById('bgFlipBtn');
  if (bgFlip) bgFlip.addEventListener('click', () => { flipBackground(); });
  const invertBtn = document.getElementById('invertColorsBtn');
  if (invertBtn) invertBtn.addEventListener('click', () => { toggleInvertColors(); });

  document.getElementById('autoToggle').addEventListener('click', toggleAutoGenerate);
  document.getElementById('toggleBtn').addEventListener('click', toggleSidebar);
  document.getElementById('parameters');
  document.querySelector('button[onclick="regenerate()"]')?.addEventListener('click', regenerate);
  document.querySelector('button[onclick="downloadSVG()"]')?.addEventListener('click', downloadSVG);
  document.querySelector('button[onclick="downloadCSV()"]')?.addEventListener('click', downloadCSV);
  document.querySelector('button[onclick="downloadJSON()"]')?.addEventListener('click', downloadJSON);
}

function displaySeed() {
  const seedValue = document.getElementById('seedValue');
  if (!seedValue) return;
  if (config.seed == null && noiseFieldInstance?.seedUsed != null) {
    seedValue.textContent = `Random (${noiseFieldInstance.seedUsed})`;
  } else if (config.seed == null) {
    seedValue.textContent = 'Random';
  } else {
    seedValue.textContent = config.seed;
  }
}

export function regenerate() {
  applyConfigUpdates();
  displaySeed();
}

function randomizeSeed() {
  config.seed = null;
  displaySeed();
  regenerate();
}

function downloadSVG() {
  const svg = exportSVG({ paths, config, seedUsed: noiseFieldInstance.seedUsed, paletteColors });
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plotter_flow_field.svg';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV() {
  let csv = 'path_id,point_index,x,y\n';
  for (let i = 0; i < paths.length; i++) {
    for (let j = 0; j < paths[i].length; j++) {
      csv += `${i},${j},${paths[i][j].x.toFixed(2)},${paths[i][j].y.toFixed(2)}\n`;
    }
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plotter_flow_field.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON() {
  // Export only metadata & parameters (omit raw path coordinates per new requirement)
  const data = {
    metadata: {
      timestamp: new Date().toISOString(),
      canvas_width: config.width,
      canvas_height: config.height,
      total_paths: paths.length
    },
    parameters: { ...config, seed: noiseFieldInstance.seedUsed }
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plotter_flow_field.json';
  a.click();
  URL.revokeObjectURL(url);
}

function toggleAutoGenerate() {
  const button = document.getElementById('autoToggle');
  if (!button) return;
  if (isAutoGenerating) {
    clearInterval(autoGenInterval);
    button.textContent = 'Start Auto Generate';
  } else {
    autoGenInterval = setInterval(() => {
      // Randomize a subset of parameters
      config.fieldScale = +(Math.random() * 0.005 + 0.003).toFixed(3);
      config.resolution = Math.floor(Math.random() * 30) + 20;
      config.numPaths = Math.floor(Math.random() * 1000) + 1000;
      config.stepSize = +(Math.random() * 4 + 3).toFixed(1);
      config.strokeWeight = +(Math.random() * 0.7 + 0.3).toFixed(2);
      config.seed = null;
      regenerate();
    }, 2000);
    button.textContent = 'Stop Auto Generate';
  }
  isAutoGenerating = !isAutoGenerating;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleBtn');
  if (!sidebar || !toggleBtn) return;
  sidebar.classList.toggle('hidden');
  toggleBtn.classList.toggle('hidden');
  toggleBtn.innerHTML = sidebar.classList.contains('hidden') ? '▶' : '◀';
}

function flipBackground() {
  config.backgroundColor = (config.backgroundColor || '#FFFFFF').toUpperCase() === '#FFFFFF' ? '#000000' : '#FFFFFF';
  regenerate();
}

function toggleInvertColors() {
  config.invertColors = !config.invertColors;
  regenerate();
}

// Keyboard shortcuts bridging (similar to legacy)
function keyPressed(p) {
  const k = p.key;
  if (/r/i.test(k)) regenerate();
  else if (/s/i.test(k)) downloadSVG();
  else if (/c/i.test(k)) downloadCSV();
  else if (/j/i.test(k)) downloadJSON();
  else if (/a/i.test(k)) toggleAutoGenerate();
  else if (/h/i.test(k)) toggleSidebar();
}

// p5 sketch bootstrap
new window.p5(p => {
  window._p5Instance = p;
  p.setup = () => {
    const canvas = p.createCanvas(config.width, config.height);
    canvas.parent('canvasContainer');
    setupUI();
    regenerate();
  };
  p.draw = () => { /* no continuous draw; rendering on regenerate */ };
  p.keyPressed = () => keyPressed(p);
});

// Expose minimal API
window.regenerate = regenerate;
window.randomizeSeed = randomizeSeed;
window.downloadSVG = downloadSVG;
window.downloadCSV = downloadCSV;
window.downloadJSON = downloadJSON;
window.toggleAutoGenerate = toggleAutoGenerate;
window.toggleSidebar = toggleSidebar;
window.flipBackground = flipBackground;
window.toggleInvertColors = toggleInvertColors;
