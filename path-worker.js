/*
 * Web Worker for flow field path tracing.
 * Uses path-trace-core.js so worker and serial tracing follow the same logic.
 */
importScripts("path-trace-core.js");

self.onmessage = function (event) {
  const data = event.data || {};
  const {
    token = 0,
    fieldData,
    fieldBuffer,
    params = {},
    startIdx = 0,
    endIdx = 0,
  } = data;

  const traceCore = self.FlowFieldTraceCore;
  if (!traceCore || typeof traceCore.tracePathBatch !== "function") {
    self.postMessage({ token, startIdx, endIdx, paths: [] });
    return;
  }

  let field = null;
  if (fieldData instanceof Float32Array) {
    field = fieldData;
  } else if (
    (typeof SharedArrayBuffer !== "undefined" && fieldBuffer instanceof SharedArrayBuffer) ||
    fieldBuffer instanceof ArrayBuffer
  ) {
    field = new Float32Array(fieldBuffer);
  }

  if (!(field instanceof Float32Array)) {
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

  const paths = traceCore.tracePathBatch({
    columns,
    endIdx,
    fieldData: field,
    height,
    offset,
    resolution,
    rows,
    seed,
    startIdx,
    stepSize,
    width,
  });

  const transferables = [];
  for (const path of paths) {
    if (path instanceof Float32Array) transferables.push(path.buffer);
  }

  self.postMessage({ token, startIdx, endIdx, paths }, transferables);
};
