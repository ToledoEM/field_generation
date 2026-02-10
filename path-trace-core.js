(function initPathTraceCore(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }
  root.FlowFieldTraceCore = factory();
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function pathTraceCoreFactory() {
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
      const total = Math.max(0, Math.floor(iterations));
      for (let i = 0; i < total; i++) {
        prng.next();
      }
    }

    function tracePathBatch(options) {
      const opts = options || {};
      const fieldData = opts.fieldData;
      if (!(fieldData instanceof Float32Array)) return [];

      const width = Number.isFinite(opts.width) ? opts.width : 0;
      const height = Number.isFinite(opts.height) ? opts.height : 0;
      const stepSize = Number.isFinite(opts.stepSize) ? opts.stepSize : 1;
      const resolution = Number.isFinite(opts.resolution) ? opts.resolution : 0;
      const columns = Number.isFinite(opts.columns) ? opts.columns : 0;
      const rows = Number.isFinite(opts.rows) ? opts.rows : 0;
      const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
      const startIdx = Math.max(0, Math.floor(opts.startIdx || 0));
      const endIdx = Math.max(startIdx, Math.floor(opts.endIdx || 0));
      const offset = Math.max(0, Math.floor(opts.offset || 0));
      const shouldAbort =
        typeof opts.shouldAbort === "function" ? opts.shouldAbort : () => false;
      const onPathComplete =
        typeof opts.onPathComplete === "function" ? opts.onPathComplete : null;

      if (endIdx <= startIdx) return [];

      const maxSteps = Math.max(0, Math.floor(resolution));
      const maxPoints = maxSteps + 1;
      const paths = [];

      const prng = createPRNG(seed >>> 0);
      advancePRNG(prng, offset * 2);

      for (let pathIndex = startIdx; pathIndex < endIdx; pathIndex++) {
        if (shouldAbort(pathIndex)) break;

        let currentX = prng.next() * width;
        let currentY = prng.next() * height;

        const coords = new Float32Array(Math.max(1, maxPoints) * 2);
        let pointCount = 0;
        coords[pointCount * 2] = currentX;
        coords[pointCount * 2 + 1] = currentY;
        pointCount++;

        if (columns > 0 && rows > 0 && stepSize > 0) {
          for (let step = 0; step < maxSteps; step++) {
            const xIndex = clamp(Math.floor(currentX / stepSize), 0, columns - 1);
            const yIndex = clamp(Math.floor(currentY / stepSize), 0, rows - 1);

            const baseIndex = (xIndex + yIndex * columns) * 2;
            const fx = fieldData[baseIndex];
            const fy = fieldData[baseIndex + 1];
            if (!Number.isFinite(fx) || !Number.isFinite(fy)) break;

            const length = Math.hypot(fx, fy);
            if (length === 0) break;

            currentX += (fx / length) * stepSize;
            currentY += (fy / length) * stepSize;

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

        paths.push(coords.slice(0, pointCount * 2));
        if (onPathComplete) onPathComplete(pathIndex, paths.length);
      }

      return paths;
    }

    return {
      advancePRNG,
      createPRNG,
      tracePathBatch,
    };
  },
);
