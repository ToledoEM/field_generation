#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { generateField, toSVG, toCSV, toJSON, resolvePalette } from './generate.js';
import zlib from 'zlib';
import { PNG } from 'pngjs';
import { createWriteStream } from 'fs';

const program = new Command();

program
  .name('flowfield')
  .description('Generate flow field artwork to SVG/JSON/CSV/PNG')
  .option('-W, --width <number>', 'Canvas width', v=>parseInt(v), 800)
  .option('-H, --height <number>', 'Canvas height', v=>parseInt(v), 800)
  .option('--field-scale <number>', 'Noise field scale', v=>parseFloat(v), 0.005)
  .option('--resolution <number>', 'Steps per path', v=>parseInt(v), 30)
  .option('--num-paths <number>', 'Number of paths', v=>parseInt(v), 500)
  .option('--step-size <number>', 'Step size', v=>parseFloat(v), 4)
  .option('--stroke-weight <number>', 'Stroke weight (for PNG)', v=>parseFloat(v), 0.5)
  .option('--method <name>', 'Field method', 'quantizedPerlin')
  .option('--seed <number>', 'Deterministic seed for noise', v=>parseInt(v))
  .option('--repel-enabled', 'Enable repulsion', false)
  .option('--repel-radius <number>', 'Repel radius', v=>parseFloat(v), 40)
  .option('--repel-strength <number>', 'Repel strength', v=>parseFloat(v), 0.8)
  .option('--max-neighbors <number>', 'Max neighbors considered', v=>parseInt(v), 35)
  .option('--angle-dampen <number>', 'Angle dampen blend', v=>parseFloat(v), 0.6)
  // Method-specific common params
  .option('--quantum-divisions <number>', 'QuantizedPerlin divisions', v=>parseInt(v))
  .option('--angle-multiplier <number>', 'QuantizedPerlin angle multiplier', v=>parseFloat(v))
  .option('--qp-jitter <number>', 'QuantizedPerlin jitter', v=>parseFloat(v))
  .option('--perlin-angle-scale <number>', 'Perlin angle scale', v=>parseFloat(v))
  .option('--perlin-rotation-offset <number>', 'Perlin rotation offset', v=>parseFloat(v))
  .option('--signed-jitter <number>', 'SignedQuantized jitter', v=>parseFloat(v))
  .option('--signed-invert', 'SignedQuantized invert direction', false)
  .option('--curl-epsilon <number>', 'Curl derivative epsilon', v=>parseFloat(v))
  .option('--curl-strength <number>', 'Curl vector strength', v=>parseFloat(v))
  // radialCenter
  .option('--radial-inward', 'Radial inward (default true)', false)
  .option('--radial-falloff <number>', 'Radial distance falloff', v=>parseFloat(v))
  .option('--radial-sources <number>', 'Radial sources count', v=>parseInt(v))
  .option('--radial-distribution <name>', 'Radial source distribution', 'random')
  .option('--radial-blend <name>', 'Radial blend mode', 'weighted')
  // spiral
  .option('--spiral-inwardness <number>', 'Spiral inwardness', v=>parseFloat(v))
  .option('--spiral-twist <number>', 'Spiral twist', v=>parseFloat(v))
  .option('--spiral-arms <number>', 'Spiral arms', v=>parseInt(v))
  .option('--spiral-arm-sharpness <number>', 'Spiral arm sharpness', v=>parseFloat(v))
  .option('--spiral-sources <number>', 'Spiral sources count', v=>parseInt(v))
  .option('--spiral-distribution <name>', 'Spiral source distribution', 'ring')
  .option('--spiral-rotation-dir <name>', 'Spiral rotation dir', 'auto')
  // sineWaves
  .option('--sine-freq-x <number>', 'Sine frequency X', v=>parseFloat(v))
  .option('--sine-freq-y <number>', 'Sine frequency Y', v=>parseFloat(v))
  .option('--sine-direction-mode <name>', 'Sine direction mode', 'both')
  .option('--sine-amplitude <number>', 'Sine amplitude', v=>parseFloat(v))
  // color
  .option('--line-palette <key>', 'Line palette key (mono,p0..p9)', 'mono')
  .option('--bg-color <hex>', 'Background color hex', '#FFFFFF')
  .option('-o, --out-dir <path>', 'Output directory', 'output')
  .option('--no-compress', 'Disable gzip compression for CSV/JSON/SVG')
  .action(run);

program.parse(process.argv);

function run(opts) {
  mkdirSync(opts.outDir, { recursive: true });
  const methodParams = {};
  if (opts.method === 'quantizedPerlin') {
    if (opts.quantumDivisions) methodParams.quantumDivisions = opts.quantumDivisions;
    if (opts.angleMultiplier) methodParams.angleMultiplier = opts.angleMultiplier;
    if (opts.qpJitter !== undefined) methodParams.jitter = opts.qpJitter;
  } else if (opts.method === 'perlin') {
    if (opts.perlinAngleScale) methodParams.angleScale = opts.perlinAngleScale;
    if (opts.perlinRotationOffset) methodParams.rotationOffset = opts.perlinRotationOffset;
  } else if (opts.method === 'signedQuantized') {
    if (opts.signedJitter !== undefined) methodParams.jitter = opts.signedJitter;
    if (opts.signedInvert) methodParams.invert = true;
  } else if (opts.method === 'curlLike') {
    if (opts.curlEpsilon) methodParams.epsilon = opts.curlEpsilon;
    if (opts.curlStrength) methodParams.strength = opts.curlStrength;
  } else if (opts.method === 'radialCenter') {
    if (opts.radialInward) methodParams.inward = true; // default true
    if (opts.radialFalloff !== undefined) methodParams.falloff = opts.radialFalloff;
    if (opts.radialSources) methodParams.sourcesCount = opts.radialSources;
    if (opts.radialDistribution) methodParams.distribution = opts.radialDistribution;
    if (opts.radialBlend) methodParams.blendMode = opts.radialBlend;
  } else if (opts.method === 'spiral') {
    if (opts.spiralInwardness !== undefined) methodParams.inwardness = opts.spiralInwardness;
    if (opts.spiralTwist !== undefined) methodParams.twist = opts.spiralTwist;
    if (opts.spiralArms) methodParams.arms = opts.spiralArms;
    if (opts.spiralArmSharpness !== undefined) methodParams.armSharpness = opts.spiralArmSharpness;
    if (opts.spiralSources) methodParams.sourcesCount = opts.spiralSources;
    if (opts.spiralDistribution) methodParams.distribution = opts.spiralDistribution;
    if (opts.spiralRotationDir) methodParams.rotationDir = opts.spiralRotationDir;
  } else if (opts.method === 'sineWaves') {
    if (opts.sineFreqX !== undefined) methodParams.freqX = opts.sineFreqX;
    if (opts.sineFreqY !== undefined) methodParams.freqY = opts.sineFreqY;
    if (opts.sineDirectionMode) methodParams.directionMode = opts.sineDirectionMode;
    if (opts.sineAmplitude !== undefined) methodParams.amplitude = opts.sineAmplitude;
  }

  const data = generateField({
    width: opts.width,
    height: opts.height,
    fieldScale: opts.fieldScale,
    resolution: opts.resolution,
    numPaths: opts.numPaths,
    stepSize: opts.stepSize,
    strokeWeight: opts.strokeWeight,
    method: opts.method,
    seed: opts.seed ?? null,
    repelEnabled: opts.repelEnabled || false,
    repelRadius: opts.repelRadius,
    repelStrength: opts.repelStrength,
    maxNeighbors: opts.maxNeighbors,
  angleDampen: opts.angleDampen,
  methodParams,
    linePalette: opts.linePalette,
    bgColor: opts.bgColor
  });

  // Write SVG/CSV/JSON (compressed optionally)
  const svg = toSVG(data);
  const csv = toCSV(data);
  const json = toJSON(data);

  // Only compress CSV if compression enabled
  writeFileSync(`${opts.outDir}/flowfield.svg`, svg);
  writeFileSync(`${opts.outDir}/flowfield.json`, json);
  if (opts.compress) {
    writeFileSync(`${opts.outDir}/flowfield.csv.gz`, zlib.gzipSync(csv));
  } else {
    writeFileSync(`${opts.outDir}/flowfield.csv`, csv);
  }

  // PNG rasterization (pure JS)
  const png = new PNG({ width: data.width, height: data.height });
  // Fill background color
  function parseHexColor(hex) {
    if (!/^#?[0-9A-Fa-f]{6}$/.test(hex)) return [255,255,255];
    if (hex[0] === '#') hex = hex.slice(1);
    const r = parseInt(hex.slice(0,2),16);
    const g = parseInt(hex.slice(2,4),16);
    const b = parseInt(hex.slice(4,6),16);
    return [r,g,b];
  }
  const [br,bg,bb] = parseHexColor(data.bgColor || '#FFFFFF');
  for (let y=0;y<data.height;y++) {
    for (let x=0;x<data.width;x++) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = br; // R
      png.data[idx+1] = bg; // G
      png.data[idx+2] = bb; // B
      png.data[idx+3] = 255; // A
    }
  }
  function plot(x,y) {
    if (x<0||y<0||x>=png.width||y>=png.height) return;
    const idx = (png.width * y + x) << 2;
    png.data[idx] = 0;
    png.data[idx+1] = 0;
    png.data[idx+2] = 0;
    png.data[idx+3] = 255;
  }
  function drawLine(x0,y0,x1,y1) {
    x0=Math.round(x0); y0=Math.round(y0); x1=Math.round(x1); y1=Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      plot(x0,y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Stroke weight approximation by drawing multiple offsets if >1
  const sw = Math.max(1, Math.round(opts.strokeWeight));
  // Line coloring with palette gradient per path
  const palette = data.linePalette; // key consumed downstream
  const colors = resolvePalette(data.linePalette);
  function lerpColor(a,b,t){
    const ar=parseInt(a.slice(1,3),16), ag=parseInt(a.slice(3,5),16), ab=parseInt(a.slice(5,7),16);
    const br=parseInt(b.slice(1,3),16), bg=parseInt(b.slice(3,5),16), bb=parseInt(b.slice(5,7),16);
    const rr=Math.round(ar + (br-ar)*t), rg=Math.round(ag + (bg-ag)*t), rb=Math.round(ab + (bb-ab)*t);
    return [rr,rg,rb];
  }
  function gradientSample(t){
    if (colors.length===1) { const c=colors[0]; return lerpColor(c,c,0); }
    const seg = (colors.length-1)*t;
    const i = Math.floor(seg);
    const frac = seg - i;
    const c1 = colors[i];
    const c2 = colors[Math.min(i+1, colors.length-1)];
    return lerpColor(c1,c2,frac);
  }
  function plotColor(x,y,r,g,b){
    if (x<0||y<0||x>=png.width||y>=png.height) return;
    const idx = (png.width * y + x) << 2;
    png.data[idx] = r;
    png.data[idx+1] = g;
    png.data[idx+2] = b;
    png.data[idx+3] = 255;
  }
  function drawLineColor(x0,y0,x1,y1,c0,c1) {
    x0=Math.round(x0); y0=Math.round(y0); x1=Math.round(x1); y1=Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let steps = Math.max(dx, -dy, 1);
    let stepCount = 0;
    while (true) {
      const t = steps===0?0: stepCount/steps;
      const r = Math.round(c0[0] + (c1[0]-c0[0])*t);
      const g = Math.round(c0[1] + (c1[1]-c0[1])*t);
      const b = Math.round(c0[2] + (c1[2]-c0[2])*t);
      for (let ox=0; ox<sw; ox++) plotColor(x0+ox, y0, r,g,b);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
      stepCount++;
    }
  }
  for (const p of data.paths) {
    const plen = p.length;
    if (plen < 2) continue;
    for (let i=1;i<plen;i++) {
      const [x0,y0] = p[i-1];
      const [x1,y1] = p[i];
      const cStart = gradientSample((i-1)/(plen-1));
      const cEnd = gradientSample(i/(plen-1));
      drawLineColor(x0,y0,x1,y1,cStart,cEnd);
    }
  }
  png.pack().pipe(createWriteStream(`${opts.outDir}/flowfield.png`));

  console.log(`Generated ${data.paths.length} paths. Files written to ${opts.outDir}`);
}
