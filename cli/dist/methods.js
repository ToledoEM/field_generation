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
  }
};