#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const traceCore = require(path.join(ROOT, "path-trace-core.js"));
const exportUtils = require(path.join(ROOT, "export-utils.js"));

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

function loadFieldMethods() {
  const context = {
    Math,
    console,
    METHOD_PARAMS: {},
    METHOD_SOURCES: {},
    PI: Math.PI,
    TWO_PI: Math.PI * 2,
    HALF_PI: Math.PI / 2,
    abs: Math.abs,
    atan2: Math.atan2,
    cos: Math.cos,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    min: Math.min,
    noise: () => 0.5,
    pow: Math.pow,
    random: () => 0.5,
    round: Math.round,
    sin: Math.sin,
    createVector: (x = 0, y = 0) => ({
      x,
      y,
      add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
      },
      copy() {
        return context.createVector(this.x, this.y);
      },
      div(n) {
        if (n !== 0) {
          this.x /= n;
          this.y /= n;
        }
        return this;
      },
      heading() {
        return Math.atan2(this.y, this.x);
      },
      mag() {
        return Math.hypot(this.x, this.y);
      },
      magSq() {
        return this.x * this.x + this.y * this.y;
      },
      mult(n) {
        this.x *= n;
        this.y *= n;
        return this;
      },
      normalize() {
        const m = this.mag();
        if (m > 0) {
          this.x /= m;
          this.y /= m;
        }
        return this;
      },
      set(xv, yv) {
        this.x = xv;
        this.y = yv;
        return this;
      },
    }),
    p5: {
      Vector: {
        fromAngle: (a) => context.createVector(Math.cos(a), Math.sin(a)),
        lerp: (a, b, t) =>
          context.createVector(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
        mult: (v, n) => context.createVector(v.x * n, v.y * n),
      },
    },
    window: {},
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(ROOT, "field-methods.js"), "utf8");
  vm.runInContext(source, context, { filename: "field-methods.js" });
  const build =
    typeof context.buildFieldMethods === "function"
      ? context.buildFieldMethods
      : context.window.buildFieldMethods;
  assert.strictEqual(typeof build, "function", "buildFieldMethods not found");
  return build();
}

function arraysEqual(a, b) {
  if (!(a instanceof Float32Array) || !(b instanceof Float32Array)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function resolveFieldFromPayload(payload) {
  if (payload.fieldData instanceof Float32Array) return payload.fieldData;
  if (
    (typeof SharedArrayBuffer !== "undefined" &&
      payload.fieldBuffer instanceof SharedArrayBuffer) ||
    payload.fieldBuffer instanceof ArrayBuffer
  ) {
    return new Float32Array(payload.fieldBuffer);
  }
  return null;
}

function emulateWorker(payload) {
  const output = { message: null, transferables: [] };
  const context = {
    console,
    Float32Array,
    ArrayBuffer,
    SharedArrayBuffer:
      typeof SharedArrayBuffer !== "undefined" ? SharedArrayBuffer : undefined,
  };
  context.self = context;
  context.postMessage = (message, transferables) => {
    output.message = message;
    output.transferables = Array.isArray(transferables) ? transferables : [];
  };

  context.importScripts = (...scripts) => {
    for (const script of scripts) {
      const absolutePath = path.isAbsolute(script)
        ? script
        : path.join(ROOT, script);
      const source = fs.readFileSync(absolutePath, "utf8");
      vm.runInContext(source, context, { filename: script });
    }
  };

  vm.createContext(context);
  const workerSource = fs.readFileSync(path.join(ROOT, "path-worker.js"), "utf8");
  vm.runInContext(workerSource, context, { filename: "path-worker.js" });
  assert.strictEqual(typeof context.onmessage, "function", "worker handler missing");
  context.onmessage({ data: payload });
  assert(output.message, "worker did not post message");
  return output.message;
}

runTest("Method availability matches expected registry", () => {
  const methods = loadFieldMethods();
  const keys = Object.keys(methods).sort();
  const expected = [
    "curlLike",
    "lineIntegralConvolution",
    "perlin",
    "quantizedPerlin",
    "radialCenter",
    "reactionDiffusion",
    "signedQuantized",
    "sineWaves",
    "spiral",
  ].sort();
  assert.deepStrictEqual(keys, expected);
});

runTest("Export serializers are stable", () => {
  const samplePaths = [
    [{ x: 1, y: 2 }, { x: 3.456, y: 4.789 }],
    [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  ];

  const csv = exportUtils.buildCSV(samplePaths);
  assert(csv.startsWith("path_id,point_index,x,y\n"));
  assert(csv.includes("0,1,3.46,4.79"));

  const jsonText = exportUtils.stringifyJSON({
    metadata: { seed: 42 },
    parameters: { resolution: 20 },
  });
  const parsed = JSON.parse(jsonText);
  assert.strictEqual(parsed.metadata.seed, 42);

  const svg = exportUtils.buildSVG({
    width: 100,
    height: 120,
    strokeWeight: 0.5,
    paths: samplePaths,
  });
  assert(svg.includes('<svg xmlns="http://www.w3.org/2000/svg" width="100"'));
  assert(svg.includes('<polyline points="1.00,2.00 3.46,4.79"/>'));
});

runTest("Seed reproducibility in path tracer", () => {
  const columns = 6;
  const rows = 5;
  const fieldData = new Float32Array(columns * rows * 2);
  for (let i = 0; i < columns * rows; i++) {
    fieldData[i * 2] = 1;
    fieldData[i * 2 + 1] = 0.25;
  }

  const options = {
    columns,
    endIdx: 10,
    fieldData,
    height: 120,
    offset: 0,
    resolution: 12,
    rows,
    seed: 987654321,
    startIdx: 0,
    stepSize: 3,
    width: 150,
  };

  const runA = traceCore.tracePathBatch(options);
  const runB = traceCore.tracePathBatch(options);

  assert.strictEqual(runA.length, runB.length);
  for (let i = 0; i < runA.length; i++) {
    assert(arraysEqual(runA[i], runB[i]));
  }

  const runC = traceCore.tracePathBatch({ ...options, seed: 987654322 });
  let differs = false;
  for (let i = 0; i < Math.min(runA.length, runC.length); i++) {
    if (!arraysEqual(runA[i], runC[i])) {
      differs = true;
      break;
    }
  }
  assert(differs, "changing seed should produce different paths");
});

runTest("Worker parity with serial tracer", () => {
  const columns = 7;
  const rows = 6;
  const fieldData = new Float32Array(columns * rows * 2);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const idx = (x + y * columns) * 2;
      fieldData[idx] = Math.cos((x + y) * 0.2);
      fieldData[idx + 1] = Math.sin((x - y) * 0.2);
    }
  }

  const params = {
    width: 140,
    height: 110,
    stepSize: 2.5,
    resolution: 16,
    columns,
    rows,
    seed: 12345,
    offset: 0,
  };
  const basePayload = {
    token: 1,
    startIdx: 0,
    endIdx: 12,
    params,
  };

  const expected = traceCore.tracePathBatch({
    ...params,
    fieldData,
    startIdx: basePayload.startIdx,
    endIdx: basePayload.endIdx,
  });

  const workerMessage = emulateWorker({
    ...basePayload,
    fieldData: fieldData.slice(),
  });
  assert.strictEqual(workerMessage.paths.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert(arraysEqual(workerMessage.paths[i], expected[i]));
  }

  if (typeof SharedArrayBuffer !== "undefined") {
    const sharedBuffer = new SharedArrayBuffer(fieldData.byteLength);
    new Float32Array(sharedBuffer).set(fieldData);
    const sharedMessage = emulateWorker({
      ...basePayload,
      fieldBuffer: sharedBuffer,
    });
    assert.strictEqual(sharedMessage.paths.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      assert(arraysEqual(sharedMessage.paths[i], expected[i]));
    }
  }

  const resolvedField = resolveFieldFromPayload({
    fieldData: fieldData.slice(),
  });
  assert(resolvedField instanceof Float32Array);
});

if (process.exitCode) {
  console.error("Regression checks failed.");
  process.exit(process.exitCode);
} else {
  console.log("All regression checks passed.");
}
