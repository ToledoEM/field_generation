# Implementation Instructions for LLM Coder: Reaction-Diffusion & Line Integral Convolution (LIC)

## Project Context
You are extending the **Flow Field Art Creator** (a p5.js-based generative art tool) with two new field methods. The existing codebase uses a modular `FIELD_METHODS` object where each method generates vector fields that guide particle path tracing.

---

## Method 1: Reaction-Diffusion Flow Field

### Overview
Implement the Gray-Scott reaction-diffusion model to generate concentration gradients, then derive flow vectors from these gradients for organic, pattern-driven art.

### Step-by-Step Implementation

#### **Step 1: Add Method Definition to `FIELD_METHODS`**

```javascript
FIELD_METHODS.reactionDiffusion = {
  name: 'Reaction-Diffusion',
  description: 'Flow derived from chemical reaction-diffusion patterns (Gray-Scott model)',
  params: {
    feedRate: {
      label: 'Feed Rate (f)',
      type: 'range',
      min: 0.01,
      max: 0.1,
      step: 0.001,
      default: 0.055,
      description: 'Chemical A replenishment rate'
    },
    killRate: {
      label: 'Kill Rate (k)',
      type: 'range',
      min: 0.045,
      max: 0.07,
      step: 0.001,
      default: 0.062,
      description: 'Chemical B removal rate'
    },
    diffusionA: {
      label: 'Diffusion A (dA)',
      type: 'range',
      min: 0.5,
      max: 1.5,
      step: 0.05,
      default: 1.0,
      description: 'Diffusion rate for chemical A'
    },
    diffusionB: {
      label: 'Diffusion B (dB)',
      type: 'range',
      min: 0.1,
      max: 0.8,
      step: 0.05,
      default: 0.5,
      description: 'Diffusion rate for chemical B'
    },
    iterations: {
      label: 'Simulation Steps',
      type: 'range',
      min: 100,
      max: 5000,
      step: 100,
      default: 1000,
      description: 'Number of RD simulation iterations'
    },
    gradientMode: {
      label: 'Gradient Mode',
      type: 'select',
      options: ['chemicalB', 'difference', 'laplacian'],
      default: 'chemicalB',
      description: 'Which concentration to use for flow direction'
    },
    patternSeed: {
      label: 'Pattern Seed',
      type: 'range',
      min: 1,
      max: 20,
      step: 1,
      default: 5,
      description: 'Number of initial reaction seeds'
    }
  },
  
  generate: function({i, j, xoff, yoff, cols, rows}) {
    // Implementation in Step 2
  }
};
```

#### **Step 2: Implement Gray-Scott Simulation**

Create a helper function **outside** the `generate` method (at module level):

```javascript
// Add this to flowfields.js at global scope
let rdCache = null; // Cache simulation results

function simulateReactionDiffusion(cols, rows, params) {
  const {feedRate, killRate, diffusionA, diffusionB, iterations, patternSeed} = params;
  
  // Initialize grids
  let gridA = new Float32Array(cols * rows);
  let gridB = new Float32Array(cols * rows);
  let nextA = new Float32Array(cols * rows);
  let nextB = new Float32Array(cols * rows);
  
  // Initial conditions: A=1 everywhere, B=0 except seeds
  gridA.fill(1.0);
  gridB.fill(0.0);
  
  // Add random seeds for chemical B
  for (let s = 0; s < patternSeed; s++) {
    const seedX = floor(random(cols * 0.3, cols * 0.7));
    const seedY = floor(random(rows * 0.3, rows * 0.7));
    const radius = floor(random(3, 8));
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx*dx + dy*dy <= radius*radius) {
          const sx = (seedX + dx + cols) % cols;
          const sy = (seedY + dy + rows) % rows;
          const idx = sy * cols + sx;
          gridB[idx] = 1.0;
          gridA[idx] = 0.0;
        }
      }
    }
  }
  
  // Time-step simulation
  const dt = 1.0;
  
  for (let iter = 0; iter < iterations; iter++) {
    // Compute reaction-diffusion for each cell
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        
        // Get current concentrations
        const a = gridA[idx];
        const b = gridB[idx];
        
        // Compute Laplacian (5-point stencil with wrapping)
        const xLeft = (x - 1 + cols) % cols;
        const xRight = (x + 1) % cols;
        const yUp = (y - 1 + rows) % rows;
        const yDown = (y + 1) % rows;
        
        const laplaceA = (
          gridA[y * cols + xLeft] +
          gridA[y * cols + xRight] +
          gridA[yUp * cols + x] +
          gridA[yDown * cols + x] -
          4 * a
        );
        
        const laplaceB = (
          gridB[y * cols + xLeft] +
          gridB[y * cols + xRight] +
          gridB[yUp * cols + x] +
          gridB[yDown * cols + x] -
          4 * b
        );
        
        // Gray-Scott equations
        const reaction = a * b * b;
        nextA[idx] = a + (diffusionA * laplaceA - reaction + feedRate * (1 - a)) * dt;
        nextB[idx] = b + (diffusionB * laplaceB + reaction - (killRate + feedRate) * b) * dt;
        
        // Clamp values
        nextA[idx] = constrain(nextA[idx], 0, 1);
        nextB[idx] = constrain(nextB[idx], 0, 1);
      }
    }
    
    // Swap buffers
    [gridA, nextA] = [nextA, gridA];
    [gridB, nextB] = [nextB, gridB];
  }
  
  return {gridA, gridB};
}
```

#### **Step 3: Complete the `generate` Function**

```javascript
generate: function({i, j, xoff, yoff, cols, rows}) {
  // Run simulation once and cache (expensive operation)
  if (!rdCache || rdCache.params !== JSON.stringify(this.params)) {
    console.log('Running Reaction-Diffusion simulation...');
    const {gridA, gridB} = simulateReactionDiffusion(cols, rows, this.params);
    rdCache = {gridA, gridB, params: JSON.stringify(this.params)};
  }
  
  const {gridA, gridB} = rdCache;
  const idx = j * cols + i;
  
  // Compute gradient of selected chemical
  let concentration;
  switch (this.params.gradientMode) {
    case 'chemicalB':
      concentration = gridB;
      break;
    case 'difference':
      concentration = new Float32Array(cols * rows);
      for (let k = 0; k < concentration.length; k++) {
        concentration[k] = gridB[k] - gridA[k];
      }
      break;
    case 'laplacian':
      concentration = gridB; // Simplified
      break;
  }
  
  // Compute gradient vector (central differences)
  const xLeft = (i - 1 + cols) % cols;
  const xRight = (i + 1) % cols;
  const yUp = (j - 1 + rows) % rows;
  const yDown = (j + 1) % rows;
  
  const gradX = (concentration[j * cols + xRight] - concentration[j * cols + xLeft]) / 2;
  const gradY = (concentration[yDown * cols + i] - concentration[yUp * cols + i]) / 2;
  
  // Flow perpendicular to gradient (tangent to iso-concentration lines)
  const angle = atan2(gradY, gradX) + HALF_PI;
  
  return p5.Vector.fromAngle(angle);
}
```

#### **Step 4: Add Cache Invalidation**

In the UI code where parameters change, add:

```javascript
// When any RD parameter changes:
rdCache = null; // Force recalculation
```

---

## Method 2: Line Integral Convolution (LIC)

### Overview
LIC creates flow textures by convolving a noise texture along streamlines. For plotter art, we'll use the resulting texture gradients to derive flow directions.

### Step-by-Step Implementation

#### **Step 1: Add Method Definition**

```javascript
FIELD_METHODS.lineIntegralConvolution = {
  name: 'Line Integral Convolution (LIC)',
  description: 'Flow visualization technique creating streak-like textures along vector fields',
  params: {
    baseFieldMethod: {
      label: 'Base Field',
      type: 'select',
      options: ['perlin', 'spiral', 'radial', 'sineWaves'],
      default: 'perlin',
      description: 'Underlying vector field to visualize'
    },
    streamlineLength: {
      label: 'Streamline Length',
      type: 'range',
      min: 5,
      max: 50,
      step: 1,
      default: 20,
      description: 'Integration steps along streamlines'
    },
    kernelSize: {
      label: 'Convolution Kernel',
      type: 'range',
      min: 3,
      max: 21,
      step: 2,
      default: 11,
      description: 'Filter size (odd numbers only)'
    },
    textureResolution: {
      label: 'Texture Resolution',
      type: 'range',
      min: 0.5,
      max: 2.0,
      step: 0.1,
      default: 1.0,
      description: 'Multiplier for noise texture density'
    },
    contrastBoost: {
      label: 'Contrast Boost',
      type: 'range',
      min: 1,
      max: 5,
      step: 0.1,
      default: 2.0,
      description: 'Enhance texture gradients'
    },
    flowDirection: {
      label: 'Flow Direction',
      type: 'select',
      options: ['alongStreamlines', 'acrossStreamlines', 'gradientBased'],
      default: 'alongStreamlines',
      description: 'How to derive flow from LIC texture'
    }
  },
  
  generate: function({i, j, xoff, yoff, cols, rows}) {
    // Implementation in Step 2
  }
};
```

#### **Step 2: Implement LIC Algorithm**

Add helper function:

```javascript
let licCache = null;

function computeLIC(cols, rows, baseField, params) {
  const {streamlineLength, kernelSize, textureResolution, contrastBoost} = params;
  
  // Create white noise texture
  const noiseTexture = new Float32Array(cols * rows);
  for (let i = 0; i < noiseTexture.length; i++) {
    noiseTexture[i] = random(); // Random values [0, 1]
  }
  
  // Output LIC texture
  const licTexture = new Float32Array(cols * rows);
  
  // Gaussian kernel for convolution
  const kernel = new Float32Array(kernelSize);
  const sigma = kernelSize / 6.0;
  let kernelSum = 0;
  for (let k = 0; k < kernelSize; k++) {
    const x = k - floor(kernelSize / 2);
    kernel[k] = exp(-(x * x) / (2 * sigma * sigma));
    kernelSum += kernel[k];
  }
  // Normalize kernel
  for (let k = 0; k < kernelSize; k++) {
    kernel[k] /= kernelSum;
  }
  
  // For each pixel, trace streamline and convolve
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      
      // Trace streamline forward and backward
      let streamline = [];
      
      // Forward integration
      let cx = x, cy = y;
      for (let s = 0; s < floor(streamlineLength / 2); s++) {
        streamline.push({x: floor(cx), y: floor(cy)});
        
        // Get vector from base field
        const cellIdx = floor(cy) * cols + floor(cx);
        const vec = baseField[cellIdx] || createVector(1, 0);
        
        // Euler step
        cx += vec.x * 0.5;
        cy += vec.y * 0.5;
        
        // Wrap boundaries
        cx = (cx + cols) % cols;
        cy = (cy + rows) % rows;
        
        if (isNaN(cx) || isNaN(cy)) break;
      }
      
      // Backward integration
      cx = x; cy = y;
      for (let s = 0; s < floor(streamlineLength / 2); s++) {
        streamline.unshift({x: floor(cx), y: floor(cy)});
        
        const cellIdx = floor(cy) * cols + floor(cx);
        const vec = baseField[cellIdx] || createVector(1, 0);
        
        cx -= vec.x * 0.5;
        cy -= vec.y * 0.5;
        
        cx = (cx + cols) % cols;
        cy = (cy + rows) % rows;
        
        if (isNaN(cx) || isNaN(cy)) break;
      }
      
      // Convolve noise along streamline
      let sum = 0;
      const centerIdx = floor(streamline.length / 2);
      for (let s = 0; s < min(streamline.length, kernelSize); s++) {
        const kernelIdx = s - centerIdx + floor(kernelSize / 2);
        if (kernelIdx >= 0 && kernelIdx < kernelSize) {
          const pt = streamline[s];
          const sampleIdx = pt.y * cols + pt.x;
          if (sampleIdx >= 0 && sampleIdx < noiseTexture.length) {
            sum += noiseTexture[sampleIdx] * kernel[kernelIdx];
          }
        }
      }
      
      licTexture[idx] = sum;
    }
  }
  
  // Contrast enhancement
  let minVal = Infinity, maxVal = -Infinity;
  for (let i = 0; i < licTexture.length; i++) {
    minVal = min(minVal, licTexture[i]);
    maxVal = max(maxVal, licTexture[i]);
  }
  for (let i = 0; i < licTexture.length; i++) {
    licTexture[i] = (licTexture[i] - minVal) / (maxVal - minVal);
    licTexture[i] = pow(licTexture[i], 1 / contrastBoost); // Gamma correction
  }
  
  return licTexture;
}
```

#### **Step 3: Complete the `generate` Function**

```javascript
generate: function({i, j, xoff, yoff, cols, rows}) {
  // Generate base vector field first
  if (!licCache || licCache.params !== JSON.stringify(this.params)) {
    console.log('Computing LIC texture...');
    
    // Get base field vectors
    const baseField = new Array(cols * rows);
    const baseMethod = FIELD_METHODS[this.params.baseFieldMethod];
    
    for (let jj = 0; jj < rows; jj++) {
      for (let ii = 0; ii < cols; ii++) {
        const idx = jj * cols + ii;
        const xxoff = ii * 0.01; // Simplified offset calculation
        const yyoff = jj * 0.01;
        baseField[idx] = baseMethod.generate({i: ii, j: jj, xoff: xxoff, yoff: yyoff, cols, rows});
      }
    }
    
    const licTexture = computeLIC(cols, rows, baseField, this.params);
    licCache = {licTexture, baseField, params: JSON.stringify(this.params)};
  }
  
  const {licTexture, baseField} = licCache;
  const idx = j * cols + i;
  
  // Derive flow direction based on mode
  switch (this.params.flowDirection) {
    case 'alongStreamlines':
      // Use original base field direction
      return baseField[idx].copy();
      
    case 'acrossStreamlines':
      // Perpendicular to base field
      const baseVec = baseField[idx];
      return createVector(-baseVec.y, baseVec.x);
      
    case 'gradientBased':
      // Flow along texture gradient
      const xLeft = (i - 1 + cols) % cols;
      const xRight = (i + 1) % cols;
      const yUp = (j - 1 + rows) % rows;
      const yDown = (j + 1) % rows;
      
      const gradX = (licTexture[j * cols + xRight] - licTexture[j * cols + xLeft]) / 2;
      const gradY = (licTexture[yDown * cols + i] - licTexture[yUp * cols + i]) / 2;
      
      const angle = atan2(gradY, gradX);
      return p5.Vector.fromAngle(angle);
  }
}
```

---

## Integration Checklist

### For Both Methods:

1. **Add to `FIELD_METHODS` object** in `flowfields.js`
2. **Create cache variables** at module scope:
   ```javascript
   let rdCache = null;
   let licCache = null;
   ```

3. **Add cache reset** in parameter change handlers:
   ```javascript
   function onParameterChange() {
     if (currentMethod === 'reactionDiffusion') rdCache = null;
     if (currentMethod === 'lineIntegralConvolution') licCache = null;
     regenerateField();
   }
   ```

4. **Update UI dropdown** in `index.html`:
   ```html
   <select id="fieldMethod">
     <!-- existing options -->
     <option value="reactionDiffusion">Reaction-Diffusion</option>
     <option value="lineIntegralConvolution">Line Integral Convolution</option>
   </select>
   ```

5. **Add progress indicators** for long computations:
   ```javascript
   if (this.params.iterations > 2000) {
     console.log('Long simulation - please wait...');
     // Show loading overlay
   }
   ```

---

## Testing Protocol

### Reaction-Diffusion:
1. **Test Classic Patterns**: 
   - f=0.055, k=0.062 (spots)
   - f=0.035, k=0.065 (stripes)
   - f=0.012, k=0.05 (waves)

2. **Verify Gradients**: Check that flow follows pattern edges

3. **Performance**: Iterations > 2000 may freeze UI - add Web Worker support

### Line Integral Convolution:
1. **Base Field Variety**: Test with all base field options
2. **Streamline Length**: Verify longer lengths create smoother streaks
3. **Direction Modes**: Confirm all three flow directions produce distinct results

---

## Performance Optimization Notes

### Reaction-Diffusion:
- **Bottleneck**: O(iterations × cols × rows) complexity
- **Solution**: 
  ```javascript
  // Move to Web Worker
  // Use typed arrays (already implemented)
  // Cache results until parameters change
  ```

### LIC:
- **Bottleneck**: Streamline tracing per pixel
- **Solution**:
  ```javascript
  // Reduce texture resolution for preview
  // Use lower streamlineLength during interaction
  // Implement progressive rendering
  ```

---

## Expected Visual Outputs

### Reaction-Diffusion:
- **Organic cellular patterns** (spots mode)
- **Zebra-like stripe flows** (stripes mode)
- **Labyrinth structures** (maze-like patterns)

### LIC:
- **Along Streamlines**: Emphasizes flow direction with streak texture
- **Across Streamlines**: Creates perpendicular ribbing effect
- **Gradient Based**: Produces edge-following patterns from texture

---

## Common Pitfalls to Avoid

1. **Array Index Out of Bounds**: Always use modulo for wrapping
   ```javascript
   const safeX = (x + cols) % cols;
   ```

2. **NaN Propagation**: Check vector validity
   ```javascript
   if (isNaN(vec.x) || isNaN(vec.y)) return createVector(1, 0);
   ```

3. **Cache Invalidation**: Reset cache on ANY parameter change

4. **Memory Leaks**: Clear old caches when switching methods
   ```javascript
   function switchMethod(newMethod) {
     rdCache = null;
     licCache = null;
   }
   ```

5. **Integer Division**: Use `Math.floor()` for array indices
   ```javascript
   const idx = Math.floor(y) * cols + Math.floor(x);
   ```

---

## Extension Opportunities

1. **Multi-Chemical RD**: Add 3+ chemical species
2. **Animated LIC**: Update texture over time for flowing effect
3. **Hybrid Methods**: Blend RD patterns with other field methods
4. **Custom Kernels**: Allow user-defined convolution kernels for LIC

---

## Final Notes

- Consider adding a **"Low Quality Preview"** mode with reduced resolution
- Export JSON metadata should include all simulation parameters
- Document parameter ranges that produce interesting artistic results

