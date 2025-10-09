import { buildPaletteColors } from '../palette/palettes.js';

export class NoiseField {
  constructor(p5Instance, config) {
    this.p5 = p5Instance;
    this.config = config;
    this.columns = 0;
    this.rows = 0;
    this.field = [];
    this.seedUsed = null;
    this.simplex = null;
  }

  reseed(seed) {
    const p = this.p5;
    if (this.config.noiseType === 'Perlin') {
      p.noiseSeed(seed);
    } else if (typeof window.SimplexNoise === 'function') {
      this.simplex = new window.SimplexNoise(seed.toString());
    }
  }

  generate() {
    const p = this.p5;
    const { width, height, stepSize, fieldScale, noiseType, seed } = this._normalizeConfig();

    this.columns = Math.floor(width / stepSize);
    this.rows = Math.floor(height / stepSize);
    this.field = new Array(this.columns * this.rows);

    const actualSeed = seed != null ? seed : Math.floor(p.random(10000));
    this.seedUsed = actualSeed;
    this.reseed(actualSeed);

    let xoff = 0;
    for (let i = 0; i < this.columns; i++) {
      let yoff = 0;
      for (let j = 0; j < this.rows; j++) {
        let noiseVal;
        if (noiseType === 'Perlin') {
          noiseVal = p.noise(xoff, yoff);
        } else if (this.simplex) {
          noiseVal = p.map(this.simplex.noise2D(xoff, yoff), -1, 1, 0, 1);
        } else {
          noiseVal = p.noise(xoff, yoff);
        }
        const angle = noiseVal * p.TWO_PI * 4;
        const v = p5.Vector.fromAngle(angle);
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
    return this.field[x_index + y_index * this.columns];
  }

  _normalizeConfig() {
    return {
      width: this.config.width,
      height: this.config.height,
      fieldScale: this.config.fieldScale,
      stepSize: this.config.stepSize,
      noiseType: this.config.noiseType,
      seed: this.config.seed
    };
  }
}
