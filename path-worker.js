/*
 * Web Worker for flow field path tracing.
 * Runs outside of the p5.js context, so it provides minimal vector math
 * and deterministic PRNG utilities locally.
 */

class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  magSq() {
    return this.x * this.x + this.y * this.y;
  }

  setMag(length) {
    const current = Math.sqrt(this.magSq());
    if (current === 0) return this;
    const scale = length / current;
    this.x *= scale;
    this.y *= scale;
    return this;
  }
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function createPRNG(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function advancePRNG(prng, iterations) {
  for (let i = 0; i < iterations; i++) {
    prng.next();
  }
}

self.onmessage = function (event) {
  const data = event.data || {};
  const {
    token = 0,
    fieldData,
    params = {},
    startIdx = 0,
    endIdx = 0,
  } = data;

  if (!(fieldData instanceof Float32Array)) {
    self.postMessage({ token, startIdx, endIdx, paths: [] });
    return;
  }

  const {
    width = 0,
    height = 0,
    stepSize = 1,
    resolution = 0,
    columns = 0,
    rows = 0,
    seed = 0,
    offset = 0,
  } = params;

  const maxSteps = Math.max(0, resolution);
  const maxPoints = maxSteps + 1;
  const field = fieldData;
  const paths = [];
  const transferables = [];

  const prng = createPRNG(seed >>> 0);
  advancePRNG(prng, Math.max(0, offset * 2));

  for (let pathIndex = startIdx; pathIndex < endIdx; pathIndex++) {
    let currentX = prng.next() * width;
    let currentY = prng.next() * height;

    const coords = new Float32Array(Math.max(1, maxPoints) * 2);
    let pointCount = 0;

    coords[pointCount * 2] = currentX;
    coords[pointCount * 2 + 1] = currentY;
    pointCount++;

    if (columns > 0 && rows > 0 && stepSize > 0) {
      for (let step = 0; step < maxSteps; step++) {
        let xIndex = clamp(Math.floor(currentX / stepSize), 0, columns - 1);
        let yIndex = clamp(Math.floor(currentY / stepSize), 0, rows - 1);

        const baseIndex = (xIndex + yIndex * columns) * 2;
        const fx = field[baseIndex];
        const fy = field[baseIndex + 1];
        if (!Number.isFinite(fx) || !Number.isFinite(fy)) break;

        const stepVec = new Vec2(fx, fy);
        if (stepVec.magSq() === 0) break;
        stepVec.setMag(stepSize);
        currentX += stepVec.x;
        currentY += stepVec.y;

        coords[pointCount * 2] = currentX;
        coords[pointCount * 2 + 1] = currentY;
        pointCount++;

        if (
          currentX < 0 ||
          currentX > width ||
          currentY < 0 ||
          currentY > height
        ) {
          break;
        }
      }
    }

    const trimmed = coords.slice(0, pointCount * 2);
    paths.push(trimmed);
    transferables.push(trimmed.buffer);
  }

  self.postMessage({ token, startIdx, endIdx, paths }, transferables);
};
