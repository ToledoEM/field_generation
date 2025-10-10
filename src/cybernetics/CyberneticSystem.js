/**
 * Phase 6: Cybernetic Feedback & Adaptive Systems
 * 
 * This module implements cybernetic principles:
 * - Circular causality and feedback loops
 * - Homeostasis and self-regulation
 * - Emergence and adaptation
 * - Information processing and memory
 */

export class CyberneticSystem {
  constructor(p5Instance, config) {
    this.p5 = p5Instance;
    this.config = config;
    
    // Density tracking grid
    this.densityGrid = null;
    this.densityResolution = 20; // Grid cells per dimension
    this.densityDecay = 0.99;
    
    // Pheromone trail system
    this.pheromoneGrid = null;
    this.pheromoneIntensity = 1.0;
    
    // Emergent attractors
    this.emergentAttractors = [];
    this.attractorCandidates = [];
    
    // Temporal memory
    this.memoryFields = [];
    this.maxMemoryLayers = 5;
    
    // System metrics
    this.entropy = 0;
    this.complexity = 0;
    this.emergenceScore = 0;
    
    this.initialize();
  }

  initialize() {
    const cellCount = this.densityResolution * this.densityResolution;
    
    // Initialize density tracking
    this.densityGrid = new Float32Array(cellCount);
    
    // Initialize pheromone system
    this.pheromoneGrid = new Float32Array(cellCount);
    
    // Initialize memory
    this.memoryFields = [];
  }

  // Track particle density for homeostatic feedback
  updateDensity(x, y, intensity = 1.0) {
    if (!this.config.cyberneticsEnabled || !this.config.densityAdaptation) return;
    
    const cellX = Math.floor((x / this.config.width) * this.densityResolution);
    const cellY = Math.floor((y / this.config.height) * this.densityResolution);
    
    if (cellX >= 0 && cellX < this.densityResolution && 
        cellY >= 0 && cellY < this.densityResolution) {
      const index = cellX + cellY * this.densityResolution;
      this.densityGrid[index] += intensity;
    }
  }

  // Get normalized density at location (0-1)
  getDensity(x, y) {
    if (!this.config.cyberneticsEnabled) return 0;
    
    const cellX = Math.floor((x / this.config.width) * this.densityResolution);
    const cellY = Math.floor((y / this.config.height) * this.densityResolution);
    
    if (cellX >= 0 && cellX < this.densityResolution && 
        cellY >= 0 && cellY < this.densityResolution) {
      const index = cellX + cellY * this.densityResolution;
      return Math.min(1.0, this.densityGrid[index] / 10.0); // Normalize
    }
    return 0;
  }

  // Pheromone trail system for stigmergy
  depositPheromone(x, y, intensity = 1.0) {
    if (!this.config.cyberneticsEnabled || !this.config.pheromoneTrails) return;
    
    const cellX = Math.floor((x / this.config.width) * this.densityResolution);
    const cellY = Math.floor((y / this.config.height) * this.densityResolution);
    
    if (cellX >= 0 && cellX < this.densityResolution && 
        cellY >= 0 && cellY < this.densityResolution) {
      const index = cellX + cellY * this.densityResolution;
      this.pheromoneGrid[index] += intensity * this.pheromoneIntensity;
    }
  }

  getPheromoneStrength(x, y) {
    if (!this.config.cyberneticsEnabled || !this.config.pheromoneTrails) return 0;
    
    const cellX = Math.floor((x / this.config.width) * this.densityResolution);
    const cellY = Math.floor((y / this.config.height) * this.densityResolution);
    
    if (cellX >= 0 && cellX < this.densityResolution && 
        cellY >= 0 && cellY < this.densityResolution) {
      const index = cellX + cellY * this.densityResolution;
      return this.pheromoneGrid[index];
    }
    return 0;
  }

  // Calculate cybernetic field adaptation
  getFieldAdaptation(x, y, baseForce) {
    if (!this.config.cyberneticsEnabled) return baseForce;
    
    const p = this.p5;
    let adaptedForce = baseForce.copy();
    
    // Density-based adaptation (homeostasis)
    if (this.config.densityAdaptation) {
      const density = this.getDensity(x, y);
      const adaptationFactor = 1.0 - (density * this.config.adaptationRate);
      adaptedForce.mult(Math.max(0.1, adaptationFactor));
    }
    
    // Pheromone influence (stigmergy)
    if (this.config.pheromoneTrails) {
      const pheromoneStrength = this.getPheromoneStrength(x, y);
      const pheromoneVector = this.calculatePheromoneGradient(x, y);
      pheromoneVector.mult(pheromoneStrength * this.config.pheromoneInfluence);
      adaptedForce.add(pheromoneVector);
    }
    
    // Emergent attractor influence
    if (this.config.emergentAttractors) {
      const attractorForce = this.calculateAttractorInfluence(x, y);
      adaptedForce.add(attractorForce);
    }
    
    // Temporal memory influence
    if (this.config.temporalMemory && this.memoryFields.length > 0) {
      const memoryForce = this.calculateMemoryInfluence(x, y);
      memoryForce.mult(this.config.memoryWeight);
      adaptedForce.add(memoryForce);
    }
    
    return adaptedForce;
  }

  // Calculate pheromone gradient for directional influence
  calculatePheromoneGradient(x, y) {
    const p = this.p5;
    const offset = this.config.width / this.densityResolution;
    
    const gradX = this.getPheromoneStrength(x + offset, y) - 
                  this.getPheromoneStrength(x - offset, y);
    const gradY = this.getPheromoneStrength(x, y + offset) - 
                  this.getPheromoneStrength(x, y - offset);
    
    return p.createVector(gradX, gradY);
  }

  // Emergent attractor system
  addAttractorCandidate(x, y, strength) {
    if (!this.config.emergentAttractors) return;
    
    this.attractorCandidates.push({
      x: x,
      y: y,
      strength: strength,
      age: 0,
      convergence: 0
    });
  }

  updateEmergentAttractors() {
    if (!this.config.emergentAttractors) return;
    
    // Analyze convergence patterns to create attractors
    for (let candidate of this.attractorCandidates) {
      const localDensity = this.getDensity(candidate.x, candidate.y);
      candidate.convergence += localDensity;
      candidate.age++;
      
      if (candidate.convergence > this.config.attractorThreshold && candidate.age > 10) {
        this.emergentAttractors.push({
          x: candidate.x,
          y: candidate.y,
          strength: candidate.convergence,
          decay: 1.0
        });
      }
    }
    
    // Clean up old candidates
    this.attractorCandidates = this.attractorCandidates.filter(c => c.age < 50);
    
    // Decay existing attractors
    this.emergentAttractors = this.emergentAttractors.map(a => ({
      ...a,
      decay: a.decay * this.config.attractorDecay
    })).filter(a => a.decay > 0.1);
  }

  calculateAttractorInfluence(x, y) {
    const p = this.p5;
    let totalForce = p.createVector(0, 0);
    
    for (let attractor of this.emergentAttractors) {
      const dx = attractor.x - x;
      const dy = attractor.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0 && distance < 100) { // Influence radius
        const strength = (attractor.strength * attractor.decay) / (distance * distance);
        const force = p.createVector(dx / distance, dy / distance);
        force.mult(strength * 0.1);
        totalForce.add(force);
      }
    }
    
    return totalForce;
  }

  // Temporal memory system
  storeCurrentField(fieldData) {
    if (!this.config.temporalMemory) return;
    
    this.memoryFields.unshift(fieldData);
    if (this.memoryFields.length > this.maxMemoryLayers) {
      this.memoryFields.pop();
    }
  }

  calculateMemoryInfluence(x, y) {
    const p = this.p5;
    let memoryForce = p.createVector(0, 0);
    
    for (let i = 0; i < this.memoryFields.length; i++) {
      const memory = this.memoryFields[i];
      const weight = Math.pow(this.config.memoryDecay, i);
      
      // Sample from memory field (simplified)
      if (memory && memory.length > 0) {
        const cellX = Math.floor(x / this.config.stepSize);
        const cellY = Math.floor(y / this.config.stepSize);
        const index = cellX + cellY * Math.floor(this.config.width / this.config.stepSize);
        
        if (index >= 0 && index < memory.length && memory[index]) {
          const memVec = memory[index].copy();
          memVec.mult(weight);
          memoryForce.add(memVec);
        }
      }
    }
    
    return memoryForce;
  }

  // System-wide update and decay
  update() {
    if (!this.config.cyberneticsEnabled) return;
    
    // Decay density grid
    for (let i = 0; i < this.densityGrid.length; i++) {
      this.densityGrid[i] *= this.densityDecay;
    }
    
    // Decay pheromone trails
    if (this.config.pheromoneTrails) {
      for (let i = 0; i < this.pheromoneGrid.length; i++) {
        this.pheromoneGrid[i] *= this.config.pheromoneDecay;
      }
    }
    
    // Update emergent attractors
    this.updateEmergentAttractors();
    
    // Calculate system metrics
    this.updateSystemMetrics();
  }

  // Calculate cybernetic metrics
  updateSystemMetrics() {
    // Calculate entropy (measure of randomness)
    let entropy = 0;
    let totalDensity = 0;
    
    for (let i = 0; i < this.densityGrid.length; i++) {
      const density = this.densityGrid[i];
      if (density > 0) {
        totalDensity += density;
        entropy -= density * Math.log2(density + 0.001);
      }
    }
    
    this.entropy = entropy / Math.max(1, totalDensity);
    
    // Calculate complexity (balance between order and chaos)
    const maxEntropy = Math.log2(this.densityGrid.length);
    this.complexity = 1 - Math.abs(this.entropy / maxEntropy - 0.5) * 2;
    
    // Calculate emergence score
    const localComplexity = this.calculateLocalComplexity();
    const globalComplexity = this.complexity;
    this.emergenceScore = localComplexity / Math.max(0.001, globalComplexity);
  }

  calculateLocalComplexity() {
    // Simplified local complexity calculation
    let localVariance = 0;
    const gridSize = this.densityResolution;
    
    for (let x = 1; x < gridSize - 1; x++) {
      for (let y = 1; y < gridSize - 1; y++) {
        const center = this.densityGrid[x + y * gridSize];
        const neighbors = [
          this.densityGrid[(x-1) + y * gridSize],
          this.densityGrid[(x+1) + y * gridSize],
          this.densityGrid[x + (y-1) * gridSize],
          this.densityGrid[x + (y+1) * gridSize]
        ];
        
        const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / 4;
        localVariance += Math.abs(center - avgNeighbor);
      }
    }
    
    return localVariance / ((gridSize - 2) * (gridSize - 2));
  }

  // Get system state for dashboard
  getSystemState() {
    return {
      entropy: this.entropy,
      complexity: this.complexity,
      emergenceScore: this.emergenceScore,
      densityPeaks: this.findDensityPeaks(),
      attractorCount: this.emergentAttractors.length,
      pheromoneLevel: this.getTotalPheromone(),
      memoryLayers: this.memoryFields.length
    };
  }

  findDensityPeaks() {
    const peaks = [];
    const threshold = 0.5;
    
    for (let i = 0; i < this.densityGrid.length; i++) {
      if (this.densityGrid[i] > threshold) {
        const x = (i % this.densityResolution) / this.densityResolution * this.config.width;
        const y = Math.floor(i / this.densityResolution) / this.densityResolution * this.config.height;
        peaks.push({ x, y, density: this.densityGrid[i] });
      }
    }
    
    return peaks.slice(0, 10); // Return top 10 peaks
  }

  getTotalPheromone() {
    return this.pheromoneGrid.reduce((sum, val) => sum + val, 0);
  }

  // Reset system state
  reset() {
    this.initialize();
    this.emergentAttractors = [];
    this.attractorCandidates = [];
  }
}