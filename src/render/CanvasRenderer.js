export class CanvasRenderer {
  constructor(p5Instance, config) {
    this.p5 = p5Instance;
    this.config = config;
  }

  draw(paths, paletteColors) {
    const p = this.p5;
    // Support dynamic background color from config
    const bg = this.config.backgroundColor || '#FFFFFF';
    p.background(bg);
    p.noFill();
    
    // Draw paths
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.length < 2) continue;
      
      const baseColor = paletteColors[i % paletteColors.length];
      
      for (let j = 0; j < path.length - 1; j++) {
        const pt1 = path[j];
        const pt2 = path[j + 1];
        
        // Calculate color with drift if enabled
        const color = this._calculatePathColor(baseColor, i, j, path.length);
        
        // Set stroke properties
        const strokeWeight = pt1.strokeWeight || this.config.strokeWeight;
        const alpha = pt1.alpha || 1.0;
        
        p.strokeWeight(strokeWeight);
        
        // Apply alpha if supported
        if (alpha < 1.0) {
          const colorWithAlpha = this._applyAlpha(color, alpha);
          p.stroke(colorWithAlpha);
        } else {
          p.stroke(color);
        }
        
        p.line(pt1.x, pt1.y, pt2.x, pt2.y);
      }
    }
    
    // Draw subtle negative space indicators
    this._drawNegativeSpaceIndicators();
  }

  _drawNegativeSpaceIndicators() {
    if (!this.config.negativeSpaceMasks || this.config.negativeSpaceMasks.length === 0) {
      return;
    }
    
    const p = this.p5;
    p.noFill();
    
    // Use a very subtle color for the outline
    const isDarkBg = (this.config.backgroundColor || '#FFFFFF') === '#000000';
    const repulsionRadiusMultiplier = this.config.repulsionRadius || 1.5;
    
    for (const mask of this.config.negativeSpaceMasks) {
      if (mask.type === 'circle') {
        // Draw the core negative space area
        p.strokeWeight(1);
        p.stroke(isDarkBg ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)');
        p.ellipse(mask.x, mask.y, mask.radius * 2, mask.radius * 2);
        
        // Draw the repulsion field boundary (fainter) - using configurable radius
        p.strokeWeight(0.5);
        p.stroke(isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)');
        const repulsionDiameter = mask.radius * 2 * repulsionRadiusMultiplier;
        p.ellipse(mask.x, mask.y, repulsionDiameter, repulsionDiameter);
      } else if (mask.type === 'rectangle') {
        p.strokeWeight(1);
        p.stroke(isDarkBg ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)');
        p.rect(mask.x, mask.y, mask.width, mask.height);
      }
    }
  }

  _calculatePathColor(baseColor, pathIndex, stepIndex, pathLength) {
    if (!this.config.colorDriftEnabled) {
      return baseColor;
    }
    
    const p = this.p5;
    const driftAmount = this.config.colorDriftAmount;
    
    // Convert hex to HSL for better color manipulation
    const rgb = this._hexToRgb(baseColor);
    if (!rgb) return baseColor;
    
    const hsl = this._rgbToHsl(rgb.r, rgb.g, rgb.b);
    
    // Apply drift based on path progress
    const progress = stepIndex / (pathLength - 1);
    const hueShift = (Math.sin(pathIndex * 0.1 + progress * Math.PI) * driftAmount * 360) % 360;
    const satShift = Math.sin(pathIndex * 0.05 + progress * Math.PI * 2) * driftAmount * 0.2;
    const lightShift = Math.sin(pathIndex * 0.03 + progress * Math.PI * 1.5) * driftAmount * 0.1;
    
    const newHue = (hsl.h + hueShift + 360) % 360;
    const newSat = Math.max(0, Math.min(1, hsl.s + satShift));
    const newLight = Math.max(0, Math.min(1, hsl.l + lightShift));
    
    const newRgb = this._hslToRgb(newHue, newSat, newLight);
    return this._rgbToHex(newRgb.r, newRgb.g, newRgb.b);
  }

  _applyAlpha(hexColor, alpha) {
    const rgb = this._hexToRgb(hexColor);
    if (!rgb) return hexColor;
    
    const p = this.p5;
    return p.color(rgb.r, rgb.g, rgb.b, alpha * 255);
  }

  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  _rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h: h * 360, s, l };
  }

  _hslToRgb(h, s, l) {
    h /= 360;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  _rgbToHex(r, g, b) {
    const toHex = (c) => {
      const hex = c.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }
}
