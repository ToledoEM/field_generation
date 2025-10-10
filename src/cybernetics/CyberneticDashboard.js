/**
 * Cybernetic Dashboard
 * Real-time visualization of system metrics and feedback loops
 */

export class CyberneticDashboard {
  constructor(p5Instance, cyberneticSystem, config) {
    this.p5 = p5Instance;
    this.cyberneticSystem = cyberneticSystem;
    this.config = config;
    
    this.isVisible = false;
    this.position = { x: 10, y: 10 };
    this.size = { width: 280, height: 320 };
    
    // Metrics history for graphs
    this.historyLength = 60;
    this.entropyHistory = [];
    this.complexityHistory = [];
    this.emergenceHistory = [];
  }

  toggle() {
    this.isVisible = !this.isVisible;
  }

  update() {
    if (!this.cyberneticSystem || !this.config.cyberneticsEnabled) return;
    
    const state = this.cyberneticSystem.getSystemState();
    
    // Update histories
    this.entropyHistory.push(state.entropy);
    this.complexityHistory.push(state.complexity);
    this.emergenceHistory.push(state.emergenceScore);
    
    // Keep only recent history
    if (this.entropyHistory.length > this.historyLength) {
      this.entropyHistory.shift();
      this.complexityHistory.shift();
      this.emergenceHistory.shift();
    }
  }

  render() {
    if (!this.isVisible || !this.cyberneticSystem || !this.config.cyberneticsEnabled) return;
    
    const p = this.p5;
    const state = this.cyberneticSystem.getSystemState();
    
    // Dashboard background
    p.push();
    p.fill(0, 0, 0, 180);
    p.stroke(100, 255, 255);
    p.strokeWeight(1);
    p.rect(this.position.x, this.position.y, this.size.width, this.size.height, 8);
    
    // Title
    p.fill(100, 255, 255);
    p.noStroke();
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(14);
    p.text("CYBERNETIC SYSTEMS", this.position.x + 10, this.position.y + 10);
    
    let yOffset = this.position.y + 35;
    
    // System Metrics
    this.renderMetric("Entropy", state.entropy, yOffset, 0, 1, [255, 100, 100]);
    yOffset += 25;
    
    this.renderMetric("Complexity", state.complexity, yOffset, 0, 1, [100, 255, 100]);
    yOffset += 25;
    
    this.renderMetric("Emergence", state.emergenceScore, yOffset, 0, 2, [255, 255, 100]);
    yOffset += 25;
    
    // System State
    p.fill(200);
    p.textSize(10);
    p.text(`Attractors: ${state.attractorCount}`, this.position.x + 10, yOffset);
    yOffset += 15;
    
    p.text(`Pheromone Level: ${state.pheromoneLevel.toFixed(1)}`, this.position.x + 10, yOffset);
    yOffset += 15;
    
    p.text(`Memory Layers: ${state.memoryLayers}`, this.position.x + 10, yOffset);
    yOffset += 15;
    
    p.text(`Density Peaks: ${state.densityPeaks.length}`, this.position.x + 10, yOffset);
    yOffset += 20;
    
    // Mini graphs
    if (this.entropyHistory.length > 1) {
      this.renderMiniGraph("Entropy", this.entropyHistory, yOffset, [255, 100, 100]);
      yOffset += 45;
      
      this.renderMiniGraph("Complexity", this.complexityHistory, yOffset, [100, 255, 100]);
      yOffset += 45;
      
      this.renderMiniGraph("Emergence", this.emergenceHistory, yOffset, [255, 255, 100]);
    }
    
    p.pop();
  }

  renderMetric(label, value, y, minVal, maxVal, color) {
    const p = this.p5;
    const barWidth = 150;
    const barHeight = 12;
    const x = this.position.x + 10;
    
    // Label
    p.fill(200);
    p.textSize(10);
    p.text(label, x, y);
    
    // Value text
    p.text(value.toFixed(3), x + barWidth + 10, y);
    
    // Bar background
    p.fill(50);
    p.noStroke();
    p.rect(x, y + 10, barWidth, barHeight);
    
    // Bar fill
    const fillWidth = p.map(p.constrain(value, minVal, maxVal), minVal, maxVal, 0, barWidth);
    p.fill(color[0], color[1], color[2]);
    p.rect(x, y + 10, fillWidth, barHeight);
  }

  renderMiniGraph(label, data, y, color) {
    const p = this.p5;
    const graphWidth = 250;
    const graphHeight = 30;
    const x = this.position.x + 10;
    
    // Label
    p.fill(200);
    p.textSize(10);
    p.text(label, x, y);
    
    // Graph background
    p.fill(30);
    p.noStroke();
    p.rect(x, y + 12, graphWidth, graphHeight);
    
    // Data line
    if (data.length > 1) {
      p.stroke(color[0], color[1], color[2]);
      p.strokeWeight(1);
      p.noFill();
      
      p.beginShape();
      for (let i = 0; i < data.length; i++) {
        const px = p.map(i, 0, data.length - 1, x, x + graphWidth);
        const py = p.map(data[i], 0, p.max(data), y + 12 + graphHeight, y + 12);
        p.vertex(px, py);
      }
      p.endShape();
    }
  }

  renderDensityVisualization() {
    if (!this.isVisible || !this.cyberneticSystem || !this.config.cyberneticsEnabled) return;
    
    const p = this.p5;
    const system = this.cyberneticSystem;
    const resolution = system.densityResolution;
    
    p.push();
    p.blendMode(p.SCREEN);
    
    // Render density grid as heat map overlay
    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        const density = system.densityGrid[x + y * resolution];
        if (density > 0.1) {
          const screenX = (x / resolution) * this.config.width;
          const screenY = (y / resolution) * this.config.height;
          const cellSize = this.config.width / resolution;
          
          p.fill(255, 50, 50, density * 50);
          p.noStroke();
          p.rect(screenX, screenY, cellSize, cellSize);
        }
      }
    }
    
    // Render emergent attractors
    p.fill(100, 255, 255, 150);
    for (let attractor of system.emergentAttractors) {
      const size = attractor.strength * attractor.decay * 10;
      p.ellipse(attractor.x, attractor.y, size, size);
    }
    
    // Render pheromone trails
    p.fill(255, 255, 100, 30);
    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        const pheromone = system.pheromoneGrid[x + y * resolution];
        if (pheromone > 0.1) {
          const screenX = (x / resolution) * this.config.width;
          const screenY = (y / resolution) * this.config.height;
          const cellSize = this.config.width / resolution;
          
          p.rect(screenX, screenY, cellSize, cellSize);
        }
      }
    }
    
    p.pop();
  }

  handleKeyPress(key) {
    if (key === 'c' || key === 'C') {
      this.toggle();
      return true;
    }
    return false;
  }
}