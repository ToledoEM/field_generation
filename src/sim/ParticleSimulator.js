export class ParticleSimulator {
  constructor(p5Instance, fieldRef, config, cyberneticSystem = null) {
    this.p5 = p5Instance;
    this.fieldRef = fieldRef; // expects NoiseField instance
    this.config = config;
    this.cyberneticSystem = cyberneticSystem;
  }

  generatePaths() {
    const p = this.p5;
    const paths = [];
    const { numPaths, resolution, stepSize } = this.config;

    for (let i = 0; i < numPaths; i++) {
      let attempts = 0;
      let current_pos;
      
      // Try to find a valid starting position (not in negative space)
      do {
        current_pos = p.createVector(p.random(this.config.width), p.random(this.config.height));
        attempts++;
      } while (this._isInNegativeSpace(current_pos.x, current_pos.y) && attempts < 50);
      
      // If we couldn't find a valid starting position after 50 attempts, skip this path
      if (attempts >= 50) {
        continue;
      }
      
      const pathPoints = [{ 
        x: current_pos.x, 
        y: current_pos.y,
        strokeWeight: this.config.strokeWeight,
        alpha: 1.0,
        stepIndex: 0
      }];
      
      const directions = []; // For curvature calculation

      for (let j = 0; j < resolution; j++) {
        const force = this.fieldRef.sampleAt(current_pos.x, current_pos.y);
        if (!force) break;
        
        // Store direction for curvature calculation
        directions.push(force.copy().normalize());
        
        // Calculate repulsion force from negative space areas
        const repulsionForce = this._calculateRepulsionForce(current_pos.x, current_pos.y);
        
        // Combine flow field force with repulsion force
        const combinedForce = force.copy();
        combinedForce.add(repulsionForce);
        
        // Update cybernetic systems
        if (this.cyberneticSystem && this.config.cyberneticsEnabled) {
          // Track particle density
          this.cyberneticSystem.updateDensity(current_pos.x, current_pos.y, 0.1);
          
          // Deposit pheromone trails
          this.cyberneticSystem.depositPheromone(current_pos.x, current_pos.y, 0.5);
          
          // Add attractor candidates at high curvature points
          if (directions.length > 2) {
            const curvature = this._calculateCurvatureAtIndex(directions, directions.length - 1);
            if (curvature > 0.5) {
              this.cyberneticSystem.addAttractorCandidate(current_pos.x, current_pos.y, curvature);
            }
          }
        }
        
        current_pos.add(combinedForce.setMag(stepSize));
        
        // Check boundaries
        if (current_pos.x < 0 || current_pos.x > this.config.width || 
            current_pos.y < 0 || current_pos.y > this.config.height) {
          break;
        }
        
        // Only stop if we're deep inside negative space (safety check)
        if (this._isDeepInNegativeSpace(current_pos.x, current_pos.y)) {
          break;
        }
        
        // Calculate variable stroke properties
        const strokeData = this._calculateStrokeProperties(j, directions, pathPoints.length);
        
        pathPoints.push({ 
          x: current_pos.x, 
          y: current_pos.y,
          strokeWeight: strokeData.weight,
          alpha: strokeData.alpha,
          stepIndex: j + 1
        });
      }
      
      if (pathPoints.length > 1) {
        paths.push(pathPoints);
      }
    }
    return paths;
  }

  _isInNegativeSpace(x, y) {
    if (!this.config.negativeSpaceMasks || this.config.negativeSpaceMasks.length === 0) {
      return false;
    }
    
    for (const mask of this.config.negativeSpaceMasks) {
      if (mask.type === 'circle') {
        const dx = x - mask.x;
        const dy = y - mask.y;
        if (dx * dx + dy * dy <= mask.radius * mask.radius) {
          return true;
        }
      } else if (mask.type === 'rectangle') {
        if (x >= mask.x && x <= mask.x + mask.width &&
            y >= mask.y && y <= mask.y + mask.height) {
          return true;
        }
      }
    }
    return false;
  }

  _isDeepInNegativeSpace(x, y) {
    if (!this.config.negativeSpaceMasks || this.config.negativeSpaceMasks.length === 0) {
      return false;
    }
    
    for (const mask of this.config.negativeSpaceMasks) {
      if (mask.type === 'circle') {
        const dx = x - mask.x;
        const dy = y - mask.y;
        const distanceSquared = dx * dx + dy * dy;
        // Only consider "deep" if we're well inside (less than 70% of radius)
        if (distanceSquared <= (mask.radius * 0.7) * (mask.radius * 0.7)) {
          return true;
        }
      }
    }
    return false;
  }

  _calculateRepulsionForce(x, y) {
    const p = this.p5;
    let totalRepulsion = p.createVector(0, 0);
    
    if (!this.config.negativeSpaceMasks || this.config.negativeSpaceMasks.length === 0) {
      return totalRepulsion;
    }
    
    const repulsionStrength = this.config.repulsionStrength || 3.0;
    const repulsionRadiusMultiplier = this.config.repulsionRadius || 1.5;
    
    for (const mask of this.config.negativeSpaceMasks) {
      if (mask.type === 'circle') {
        const dx = x - mask.x;
        const dy = y - mask.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Create repulsion field that extends beyond the circle boundary
        const repulsionRadius = mask.radius * repulsionRadiusMultiplier;
        
        if (distance < repulsionRadius && distance > 0) {
          // Calculate repulsion strength (stronger when closer)
          const strength = (repulsionRadius - distance) / repulsionRadius;
          const repulsionMagnitude = strength * strength * repulsionStrength;
          
          // Direction away from center
          const repulsionDir = p.createVector(dx / distance, dy / distance);
          repulsionDir.mult(repulsionMagnitude);
          
          totalRepulsion.add(repulsionDir);
        }
      }
    }
    
    return totalRepulsion;
  }

  _calculateStrokeProperties(stepIndex, directions, totalPoints) {
    const { variableStrokeMode, strokeWeight, strokeWeightMultiplier } = this.config;
    let weight = strokeWeight;
    let alpha = 1.0;
    
    switch (variableStrokeMode) {
      case 'curvature':
        if (directions.length >= 5) { // Need more points for smoother calculation
          // Calculate average curvature over the last few points for smoothness
          let avgCurvature = 0;
          let samples = 0;
          for (let i = Math.max(0, directions.length - 5); i < directions.length - 2; i++) {
            const curvature = this._calculateCurvatureAtIndex(directions, i);
            avgCurvature += curvature;
            samples++;
          }
          if (samples > 0) {
            avgCurvature /= samples;
            // More gentle weight variation, clamped to reasonable range
            const weightVariation = Math.min(avgCurvature * strokeWeightMultiplier * 0.3, strokeWeight * 2);
            weight = strokeWeight + weightVariation;
          }
        }
        break;
        
      case 'taper':
        const progress = stepIndex / (this.config.resolution - 1);
        weight = strokeWeight * (1 - progress * 0.8); // Taper to 20% of original
        break;
        
      case 'alpha-curvature':
        if (directions.length >= 5) {
          let avgCurvature = 0;
          let samples = 0;
          for (let i = Math.max(0, directions.length - 5); i < directions.length - 2; i++) {
            const curvature = this._calculateCurvatureAtIndex(directions, i);
            avgCurvature += curvature;
            samples++;
          }
          if (samples > 0) {
            avgCurvature /= samples;
            alpha = Math.max(0.3, 1 - avgCurvature * 1.5); // More subtle alpha variation
          }
        }
        break;
        
      case 'alpha-taper':
        const alphaProgress = stepIndex / (this.config.resolution - 1);
        alpha = 1 - alphaProgress * 0.9; // Fade to 10% opacity
        break;
    }
    
    return {
      weight: Math.max(0.1, weight),
      alpha: Math.max(0.1, Math.min(1.0, alpha))
    };
  }

  _calculateCurvature(directions) {
    if (directions.length < 3) return 0;
    return this._calculateCurvatureAtIndex(directions, directions.length - 3);
  }

  _calculateCurvatureAtIndex(directions, index) {
    if (index < 0 || index + 2 >= directions.length) return 0;
    
    const prev = directions[index];
    const curr = directions[index + 1];
    const next = directions[index + 2];
    
    // Calculate angle changes using dot product for smoother results
    const dot1 = prev.x * curr.x + prev.y * curr.y;
    const dot2 = curr.x * next.x + curr.y * next.y;
    
    const angle1 = Math.acos(Math.max(-1, Math.min(1, dot1)));
    const angle2 = Math.acos(Math.max(-1, Math.min(1, dot2)));
    
    return (angle1 + angle2) / (2 * Math.PI); // Normalize to 0-1
  }
}
