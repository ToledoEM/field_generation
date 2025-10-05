/**
 * Toledo EM 2025
 * Plotter Flow Field Generator
 * * A p5.js-based tool to generate flow field visualizations suitable for plotter art.
 * Users can customize parameters such as field scale, resolution, number of paths,
 * step size, stroke weight, and random seed. The generated paths can be exported
 * in SVG, CSV, and JSON formats.
 */

// Global Parameters
let FIELD_SCALE = 0.005;
let RESOLUTION = 30;
let NUM_PATHS = 500;
let STEP_SIZE = 4;
let STROKE_WEIGHT = 0.5;
let CURRENT_SEED = null;
let ACTUAL_SEED = null; 

// Global State for Noise and Auto-Generation
let NOISE_TYPE = 'Perlin'; // Default noise type
let noiseGenerator; // SimplexNoise instance
let autoGenInterval;
let isAutoGenerating = false;

let field = [];
let columns, rows;
let paths = [];

function setup() {
  let canvas = createCanvas(800, 800);
  canvas.parent('canvasContainer');
  columns = floor(width / STEP_SIZE);
  rows = floor(height / STEP_SIZE);
  
  // Initialize Simplex Noise generator (will be re-seeded in generateField)
  if (typeof SimplexNoise === 'function') {
      noiseGenerator = new SimplexNoise(random(10000).toString());
  }
  
  // Expose global functions for HTML buttons
  window.regenerate = regenerate;
  window.toggleAutoGenerate = toggleAutoGenerate; 
  window.randomizeSeed = randomizeSeed;
  window.downloadSVG = downloadSVG;
  window.downloadCSV = downloadCSV;
  window.downloadJSON = downloadJSON;
  window.toggleSidebar = toggleSidebar;

  setTimeout(setupSliders, 100);
  regenerate();
}

// Function to handle auto-generation toggle
function toggleAutoGenerate() {
  const button = document.getElementById('autoToggle');
  
  if (isAutoGenerating) {
    // Stop auto-generation
    clearInterval(autoGenInterval);
    button.textContent = "Start Auto Generate";
    button.style.background = 'tomato'; // Non-active color (tomato2 shade)
  } else {
    // Start auto-generation (every 2 seconds)
    autoGenInterval = setInterval(randomizeAndRegenerate, 2000); 
    button.textContent = "Stop Auto Generate";
    button.style.background = '#8B4513'; // Active color (bricklayer shade)
  }
  
  isAutoGenerating = !isAutoGenerating;
}

// CORRECTED: Function to randomize all parameters (used by auto-generate)
function randomizeAllParams() {
  // 1. Randomize Numeric Parameters
  FIELD_SCALE = random(0.003, 0.008);
  RESOLUTION = floor(random(20, 50));
  NUM_PATHS = floor(random(1000, 2000));
  STEP_SIZE = random(3, 7);
  STROKE_WEIGHT = random(0.3, 1.0);
  CURRENT_SEED = null; // Always randomize seed in auto-mode
  
  // 2. Update UI elements to reflect new randomized values
  document.getElementById('fieldScale').value = FIELD_SCALE;
  document.getElementById('fieldScaleValue').textContent = FIELD_SCALE.toFixed(3);
  document.getElementById('resolution').value = RESOLUTION;
  document.getElementById('resolutionValue').textContent = RESOLUTION;
  document.getElementById('numPaths').value = NUM_PATHS;
  document.getElementById('numPathsValue').textContent = NUM_PATHS;
  document.getElementById('stepSize').value = STEP_SIZE;
  document.getElementById('stepSizeValue').textContent = STEP_SIZE.toFixed(1);
  document.getElementById('strokeWeight').value = STROKE_WEIGHT;
  document.getElementById('strokeWeightValue').textContent = STROKE_WEIGHT.toFixed(1);
  document.getElementById('seedInput').value = '';
  document.getElementById('seedValue').textContent = 'Random';
  
  // Update columns/rows based on new STEP_SIZE
  columns = floor(width / STEP_SIZE);
  rows = floor(height / STEP_SIZE);
}

function randomizeAndRegenerate() {
    randomizeAllParams();
    regenerate();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleBtn');
  
  sidebar.classList.toggle('hidden');
  toggleBtn.classList.toggle('hidden');
  
  if (sidebar.classList.contains('hidden')) {
    toggleBtn.innerHTML = '▶';
  } else {
    toggleBtn.innerHTML = '◀';
  }
}

function setupSliders() {
  const fieldScale = document.getElementById('fieldScale');
  const resolution = document.getElementById('resolution');
  const numPaths = document.getElementById('numPaths');
  const stepSize = document.getElementById('stepSize');
  const strokeWeight = document.getElementById('strokeWeight');
  const seedInput = document.getElementById('seedInput');
  const noiseTypeSelect = document.getElementById('noiseTypeSelect'); 
  
  if (!fieldScale || !noiseTypeSelect) {
    console.error('UI Elements not fully loaded in DOM.');
    return;
  }
  
  // Field Scale
  fieldScale.addEventListener('input', (e) => {
    FIELD_SCALE = parseFloat(e.target.value);
    document.getElementById('fieldScaleValue').textContent = FIELD_SCALE.toFixed(3);
  });
  
  // Resoltion
  resolution.addEventListener('input', (e) => {
    RESOLUTION = parseInt(e.target.value);
    document.getElementById('resolutionValue').textContent = RESOLUTION;
  });
  
  // Number of Path
  numPaths.addEventListener('input', (e) => {
    NUM_PATHS = parseInt(e.target.value);
    document.getElementById('numPathsValue').textContent = NUM_PATHS;
  });
  
  // Step Size
  stepSize.addEventListener('input', (e) => {
    STEP_SIZE = parseFloat(e.target.value);
    document.getElementById('stepSizeValue').textContent = STEP_SIZE.toFixed(1);
    columns = floor(width / STEP_SIZE);
    rows = floor(height / STEP_SIZE);
  });
  
  // Stroke Weight
  strokeWeight.addEventListener('input', (e) => {
    STROKE_WEIGHT = parseFloat(e.target.value);
    document.getElementById('strokeWeightValue').textContent = STROKE_WEIGHT.toFixed(1);
  });
  
  // Seed Input
  seedInput.addEventListener('input', (e) => {
    const value = e.target.value;
    if (value === '') {
      CURRENT_SEED = null;
      document.getElementById('seedValue').textContent = 'Random';
    } else {
      CURRENT_SEED = parseInt(value);
      document.getElementById('seedValue').textContent = CURRENT_SEED;
    }
  });

  // Noise Type Dropdown Handler (Stays the same: handles manual change)
  noiseTypeSelect.addEventListener('change', (e) => {
    NOISE_TYPE = e.target.value;
    regenerate(); // Regenerate immediately on noise change
  });
  
  // Initialize the parameters display
  displayParameters();
}

function randomizeSeed() {
  CURRENT_SEED = null;
  document.getElementById('seedInput').value = '';
  document.getElementById('seedValue').textContent = 'Random';
  regenerate();
}

function regenerate() {
  paths = [];
  generateField();
  drawField();
}

function generateField() {
  field = new Array(columns * rows);
  
  // Seed Logic: If null, generate random seed. Record the actual seed used.
  let seed = CURRENT_SEED !== null ? CURRENT_SEED : random(10000);
  ACTUAL_SEED = Math.floor(seed); 
  
  // Noise Initialization based on selection
  if (NOISE_TYPE === 'Perlin') {
      noiseSeed(seed);
  } else {
      // Re-seed Simplex Noise instance (assuming SimplexNoise is loaded)
      if (typeof SimplexNoise === 'function') {
          noiseGenerator = new SimplexNoise(seed.toString());
      }
  }
  
  // Update Seed Display
  if (CURRENT_SEED === null) {
    document.getElementById('seedValue').textContent = `Random (${ACTUAL_SEED})`;
  }

  let xoff = 0;
  for (let i = 0; i < columns; i++) {
    let yoff = 0;
    for (let j = 0; j < rows; j++) {
      
      let noiseVal;
      // Core Logic: Use selected noise function
      if (NOISE_TYPE === 'Perlin') {
          // p5.js noise (Perlin/Value noise)
          noiseVal = noise(xoff, yoff);
      } else {
          // Simplex noise returns [-1, 1], so map to [0, 1] for angle calculation
          if (noiseGenerator) {
              noiseVal = map(noiseGenerator.noise2D(xoff, yoff), -1, 1, 0, 1);
          } else {
              // Fallback to Perlin if Simplex is selected but not initialized
              noiseVal = noise(xoff, yoff); 
          }
      }
      
      let angle = noiseVal * TWO_PI * 4;
      let v = p5.Vector.fromAngle(angle);
      let index = i + j * columns;
      field[index] = v;
      yoff += FIELD_SCALE;
    }
    xoff += FIELD_SCALE;
  }
  
  // Update parameter display after field generation
  displayParameters();
}

function drawField() {
  background(255);
  stroke(0);
  strokeWeight(STROKE_WEIGHT);
  noFill();
  
  for (let i = 0; i < NUM_PATHS; i++) {
    let current_pos = createVector(random(width), random(height));
    let pathPoints = [{x: current_pos.x, y: current_pos.y}];

    for (let j = 0; j < RESOLUTION; j++) {
      let x_index = floor(current_pos.x / STEP_SIZE);
      let y_index = floor(current_pos.y / STEP_SIZE);

      x_index = constrain(x_index, 0, columns - 1);
      y_index = constrain(y_index, 0, rows - 1);

      let index = x_index + y_index * columns;
      let force = field[index];
      
      if (!force) break;

      current_pos.add(force.copy().setMag(STEP_SIZE));
      pathPoints.push({x: current_pos.x, y: current_pos.y});

      if (current_pos.x < 0 || current_pos.x > width || 
          current_pos.y < 0 || current_pos.y > height) {
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

// Function to display current parameters
function displayParameters() {
  const paramsDiv = document.getElementById('parameters');
  if (paramsDiv) {
    // Total Path Length is approximated by RESOLUTION * STEP_SIZE
    const totalPathLength = (RESOLUTION * STEP_SIZE).toFixed(1); 
    
    paramsDiv.textContent = 
      `Noise: ${NOISE_TYPE} | ` +
      `Scale: ${FIELD_SCALE.toFixed(4)} | ` +
      `Paths: ${NUM_PATHS} | ` +
      `Avg Path Length: ${totalPathLength} units | ` + // Displaying the calculated length proxy
      `Stroke: ${STROKE_WEIGHT.toFixed(2)}`;
  }
}

// Download functions (remain the same)

function downloadCSV() {
  let csv = 'path_id,point_index,x,y\n';
  
  for (let i = 0; i < paths.length; i++) {
    for (let j = 0; j < paths[i].length; j++) {
      csv += `${i},${j},${paths[i][j].x.toFixed(2)},${paths[i][j].y.toFixed(2)}\n`;
    }
  }
  
  let blob = new Blob([csv], {type: 'text/csv'});
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = 'plotter_flow_field.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON() {
  let data = {
    metadata: {
      timestamp: new Date().toISOString(),
      canvas_width: width,
      canvas_height: height,
      total_paths: paths.length
    },
    parameters: {
      noise_type: NOISE_TYPE, // Includes the active noise type
      field_scale: FIELD_SCALE,
      resolution: RESOLUTION,
      num_paths: NUM_PATHS,
      step_size: STEP_SIZE,
      stroke_weight: STROKE_WEIGHT,
      seed: ACTUAL_SEED,
      columns: columns,
      rows: rows
    },
    paths: paths
  };
  
  let json = JSON.stringify(data, null, 2);
  let blob = new Blob([json], {type: 'application/json'});
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = 'plotter_flow_field.json';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSVG() {
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="white"/>
  <g stroke="black" stroke-width="${STROKE_WEIGHT}" fill="none">
`;

  for (let path of paths) {
    if (path.length < 2) continue;
    svg += '    <polyline points="';
    for (let i = 0; i < path.length; i++) {
      svg += `${path[i].x.toFixed(2)},${path[i].y.toFixed(2)}`;
      if (i < path.length - 1) svg += ' ';
    }
    svg += '"/>\n';
  }

  svg += `  </g>
</svg>`;

  let blob = new Blob([svg], {type: 'image/svg+xml'});
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = 'plotter_flow_field.svg';
  a.click();
  URL.revokeObjectURL(url);
}

function draw() {
  // placeholder
}