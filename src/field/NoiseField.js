import { buildPaletteColors } from '../palette/palettes.js';

export class NoiseField {
  constructor(p5Instance, config, cyberneticSystem = null) {
    this.p5 = p5Instance;
    this.config = config;
    this.cyberneticSystem = cyberneticSystem;
    this.columns = 0;
    this.rows = 0;
    this.field = [];
    this.secondaryField = [];
    this.seedUsed = null;
    this.simplex = null;
    this.simplexSecondary = null;
  }

  reseed(seed) {
    const p = this.p5;
    if (this.config.noiseType === 'Perlin') {
      p.noiseSeed(seed);
    } else if (typeof window.SimplexNoise === 'function') {
      this.simplex = new window.SimplexNoise(seed.toString());
      // Create secondary noise field with different seed for multi-layer blending
      this.simplexSecondary = new window.SimplexNoise((seed + 1000).toString());
    }
  }

  generate() {
    const p = this.p5;
    const { width, height, stepSize, fieldScale, noiseType, seed, multiLayerBlending, 
            baseFieldWeight, secondaryFieldScale, secondaryFieldWeight } = this._normalizeConfig();

    this.columns = Math.floor(width / stepSize);
    this.rows = Math.floor(height / stepSize);
    this.field = new Array(this.columns * this.rows);
    
    if (multiLayerBlending) {
      this.secondaryField = new Array(this.columns * this.rows);
    }

    const actualSeed = seed != null ? seed : Math.floor(p.random(10000));
    this.seedUsed = actualSeed;
    this.reseed(actualSeed);

    let xoff = 0;
    for (let i = 0; i < this.columns; i++) {
      let yoff = 0;
      for (let j = 0; j < this.rows; j++) {
        // Primary field
        let noiseVal;
        if (noiseType === 'Perlin') {
          noiseVal = p.noise(xoff, yoff);
        } else if (this.simplex) {
          noiseVal = p.map(this.simplex.noise2D(xoff, yoff), -1, 1, 0, 1);
        } else {
          noiseVal = p.noise(xoff, yoff);
        }
        const angle = noiseVal * p.TWO_PI * 4;
        let v = p5.Vector.fromAngle(angle);
        
        // Multi-layer blending
        if (multiLayerBlending) {
          let secondaryNoiseVal;
          if (noiseType === 'Perlin') {
            secondaryNoiseVal = p.noise(xoff * secondaryFieldScale / fieldScale, yoff * secondaryFieldScale / fieldScale);
          } else if (this.simplexSecondary) {
            secondaryNoiseVal = p.map(this.simplexSecondary.noise2D(xoff * secondaryFieldScale / fieldScale, yoff * secondaryFieldScale / fieldScale), -1, 1, 0, 1);
          } else {
            secondaryNoiseVal = p.noise(xoff * secondaryFieldScale / fieldScale, yoff * secondaryFieldScale / fieldScale);
          }
          const secondaryAngle = secondaryNoiseVal * p.TWO_PI * 4;
          const secondaryV = p5.Vector.fromAngle(secondaryAngle);
          
          // Blend the two fields
          v.mult(baseFieldWeight);
          secondaryV.mult(secondaryFieldWeight);
          v.add(secondaryV);
          v.normalize();
        }
        
        this.field[i + j * this.columns] = v;
        yoff += fieldScale;
      }
      xoff += fieldScale;
    }

    return this.field;
  }

  sampleAt(x, y) {
    const p = this.p5;
    const { stepSize } = this._normalizeConfig();
    const x_index = p.constrain(Math.floor(x / stepSize), 0, this.columns - 1);
    const y_index = p.constrain(Math.floor(y / stepSize), 0, this.rows - 1);
    
    let baseVector = this.field[x_index + y_index * this.columns];
    
    // Apply cybernetic adaptation if system is available
    if (this.cyberneticSystem && this.config.cyberneticsEnabled) {
      baseVector = this.cyberneticSystem.getFieldAdaptation(x, y, baseVector);
    }
    
    return baseVector;
  }

  _normalizeConfig() {
    return {
      width: this.config.width,
      height: this.config.height,
      fieldScale: this.config.fieldScale,
      stepSize: this.config.stepSize,
      noiseType: this.config.noiseType,
      seed: this.config.seed,
      multiLayerBlending: this.config.multiLayerBlending,
      baseFieldWeight: this.config.baseFieldWeight,
      secondaryFieldScale: this.config.secondaryFieldScale,
      secondaryFieldWeight: this.config.secondaryFieldWeight
    };
  }
}
