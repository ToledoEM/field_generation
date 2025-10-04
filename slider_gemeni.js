/**
 * Generative Flow Field Art for Pen Plotters
 */

let FIELD_SCALE = 0.005;
let RESOLUTION = 30;
let NUM_PATHS = 500;
let STEP_SIZE = 4;
let STROKE_WEIGHT = 0.5;
let CURRENT_SEED = null;
let ACTUAL_SEED = null; // Store the actual seed used

let field = [];
let columns, rows;
let paths = [];

function setup() {
  let canvas = createCanvas(800, 800);
  canvas.parent('canvasContainer');
  columns = floor(width / STEP_SIZE);
  rows = floor(height / STEP_SIZE);
  
  // Setup sliders after a short delay to ensure DOM is ready
  setTimeout(setupSliders, 100);
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
  
  if (!fieldScale) {
    console.error('Sliders not found in DOM');
    return;
  }
  
  // Field Scale
  fieldScale.addEventListener('input', (e) => {
    FIELD_SCALE = parseFloat(e.target.value);
    document.getElementById('fieldScaleValue').textContent = FIELD_SCALE.toFixed(3);
  });
  
  // Resolution
  resolution.addEventListener('input', (e) => {
    RESOLUTION = parseInt(e.target.value);
    document.getElementById('resolutionValue').textContent = RESOLUTION;
  });
  
  // Number of Paths
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
  const seedInput = document.getElementById('seedInput');
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
  
  // Use the current seed if set, otherwise use random
  let seed = CURRENT_SEED !== null ? CURRENT_SEED : random(10000);
  ACTUAL_SEED = Math.floor(seed); // Store the actual seed used
  noiseSeed(seed);
  
  // Update the seed display if it was random
  if (CURRENT_SEED === null) {
    document.getElementById('seedValue').textContent = `Random (${ACTUAL_SEED})`;
  }

  let xoff = 0;
  for (let i = 0; i < columns; i++) {
    let yoff = 0;
    for (let j = 0; j < rows; j++) {
      let angle = noise(xoff, yoff) * TWO_PI * 4;
      let v = p5.Vector.fromAngle(angle);
      let index = i + j * columns;
      field[index] = v;
      yoff += FIELD_SCALE;
    }
    xoff += FIELD_SCALE;
  }
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
  // Static image, no animation
}
