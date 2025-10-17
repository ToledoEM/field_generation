// Ported field methods (simplified) from browser version
import { noise } from './noise.js';

export const FIELD_METHODS = {
  quantizedPerlin: {
    params: {
      quantumDivisions: 8,
      angleMultiplier: 4,
      jitter: 0
    },
    gen: (ctx) => {
      const { xoff, yoff, p } = ctx;
      const divisions = p.quantumDivisions;
      const quantumAngle = Math.PI * 2 / divisions;
      let noiseVal = noise(xoff, yoff) * Math.PI * 2 * p.angleMultiplier;
      let angle = noiseVal % (Math.PI * 2);
      angle = Math.round(angle / quantumAngle) * quantumAngle;
      angle += (Math.random() * 2 - 1) * p.jitter;
      return angle;
    }
  },
  perlin: {
    params: {
      angleScale: 2,
      rotationOffset: 0
    },
    gen: ({xoff,yoff,p}) => noise(xoff,yoff) * Math.PI * 2 * p.angleScale + p.rotationOffset
  },
  signedQuantized: {
    params: {
      jitter: 0,
      invert: false
    },
    gen: ({xoff,yoff,p}) => {
      let n = noise(xoff, yoff);
      let angle = Math.PI * (2 * n - 1);
      const quantum = Math.PI / 4;
      angle = Math.round(angle / quantum) * quantum;
      angle += (Math.random() * 2 - 1) * p.jitter;
      if (p.invert) angle += Math.PI;
      return angle;
    }
  },
  radialCenter: {
    params: {
      inward: true,
      falloff: 0.5,
      sourcesCount: 1,
      distribution: 'random',
      blendMode: 'weighted'
    },
    gen: ({i,j,p,sources,cols,rows}) => {
      if (!sources || sources.length === 0) return 0; // fallback angle 0
      const inward = p.inward;
      const falloff = p.falloff;
      const mode = p.blendMode;
      let accumX=0, accumY=0, weightsTotal=0;
      let closestVX=0, closestVY=0, closestD=Infinity;
      for (const s of sources) {
        let vx = s.x - i;
        let vy = s.y - j;
        let d = Math.hypot(vx,vy);
        if (d < 0.001) d = 0.001;
        vx /= d; vy /= d;
        if (!inward) { vx = -vx; vy = -vy; }
        const maxD = Math.hypot(cols, rows);
        let scale = 1 - (d / maxD) * falloff;
        if (scale < 0) scale = 0;
        vx *= scale; vy *= scale;
        if (mode === 'closest') {
          if (d < closestD) { closestD = d; closestVX = vx; closestVY = vy; }
        } else if (mode === 'average') {
          accumX += vx; accumY += vy;
        } else { // weighted
          const w = 1/(d+0.001);
          accumX += vx*w; accumY += vy*w;
          weightsTotal += w;
        }
      }
      let outX,outY;
      if (mode === 'closest') { outX = closestVX; outY = closestVY; }
      else if (mode === 'average') { outX = accumX / sources.length; outY = accumY / sources.length; }
      else { outX = weightsTotal>0? accumX/weightsTotal: accumX; outY = weightsTotal>0? accumY/weightsTotal: accumY; }
      return Math.atan2(outY,outX);
    }
  },
  spiral: {
    params: {
      inwardness: 0.6,
      twist: 1,
      arms: 4,
      armSharpness: 0.4,
      sourcesCount: 1,
      distribution: 'ring',
      rotationDir: 'auto'
    },
    gen: ({i,j,p,sources}) => {
      if (!sources || sources.length===0) return 0;
      let inwardness = p.inwardness;
      let twist = p.twist;
      let arms = p.arms;
      let sharp = p.armSharpness;
      let rotDirSetting = p.rotationDir;
      let ax=0, ay=0;
      for (const s of sources) {
        let lx = i - s.x;
        let ly = j - s.y;
        let mag = Math.hypot(lx,ly);
        if (mag < 0.5) continue;
        let rx = lx / mag;
        let ry = ly / mag;
        let tx = -ry; let ty = rx; // tangential
        // rotation direction logic
        if (rotDirSetting !== 'auto') {
          const sign = rotDirSetting === 'cw' ? 1 : -1;
          tx *= sign; ty *= sign;
        } else {
          const idx = sources.indexOf(s);
          if (idx % 2 === 1) { tx = -tx; ty = -ty; }
        }
        let mix = inwardness;
        let armFactor = Math.sin(Math.atan2(ry, rx) * arms + mag * twist);
        armFactor = Math.pow(Math.abs(armFactor), sharp);
        let vx = tx*(1-mix) + (-rx)*mix;
        let vy = ty*(1-mix) + (-ry)*mix;
        const attenuation = 1/(1 + mag*0.02);
        ax += vx * (1 + armFactor*0.8) * attenuation;
        ay += vy * (1 + armFactor*0.8) * attenuation;
      }
      const len = Math.hypot(ax,ay);
      if (len>0) { ax/=len; ay/=len; }
      return Math.atan2(ay,ax);
    }
  },
  sineWaves: {
    params: {
      freqX: 0.15,
      freqY: 0.21,
      directionMode: 'both',
      amplitude: 1
    },
    gen: ({i,j,p}) => {
      let fx = p.freqX;
      let fy = p.freqY;
      let base = Math.sin(i * fx) + Math.cos(j * fy);
      let mode = p.directionMode;
      let angle;
      if (mode === 'vertical') angle = Math.sin(j * fy) * p.amplitude;
      else if (mode === 'horizontal') angle = Math.cos(i * fx) * p.amplitude;
      else if (mode === 'diagonal') angle = Math.sin((i + j) * (fx + fy) * 0.5) * p.amplitude;
      else angle = base * p.amplitude;
      return angle;
    }
  }
};