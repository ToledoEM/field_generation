export class ParticleSimulator {
  constructor(p5Instance, fieldRef, config) {
    this.p5 = p5Instance;
    this.fieldRef = fieldRef; // expects NoiseField instance
    this.config = config;
  }

  generatePaths() {
    const p = this.p5;
    const paths = [];
    const { numPaths, resolution, stepSize } = this.config;

    for (let i = 0; i < numPaths; i++) {
      let current_pos = p.createVector(p.random(this.config.width), p.random(this.config.height));
      const pathPoints = [{ x: current_pos.x, y: current_pos.y }];

      for (let j = 0; j < resolution; j++) {
        const force = this.fieldRef.sampleAt(current_pos.x, current_pos.y);
        if (!force) break;
        current_pos.add(force.copy().setMag(stepSize));
        pathPoints.push({ x: current_pos.x, y: current_pos.y });
        if (current_pos.x < 0 || current_pos.x > this.config.width || current_pos.y < 0 || current_pos.y > this.config.height) break;
      }
      paths.push(pathPoints);
    }
    return paths;
  }
}
