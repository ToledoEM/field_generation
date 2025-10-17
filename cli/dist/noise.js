// Deterministic 2D noise with seed (value noise + interpolation)
let SEED = 1337;

export function setSeed(s) { SEED = (s >>> 0) & 0xffffffff; }

function hash(ix, iy) {
  let h = ix * 374761393 + iy * 668265263 + SEED * 0x9E3779B1;
  h = (h ^ (h >> 13)) * 1274126177;
  h ^= h >> 16;
  return (h >>> 0) / 4294967295; // 0..1
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

export function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash(ix, iy);
  const b = hash(ix+1, iy);
  const c = hash(ix, iy+1);
  const d = hash(ix+1, iy+1);
  const u = fade(fx);
  const v = fade(fy);
  const lerpX1 = a + (b - a) * u;
  const lerpX2 = c + (d - c) * u;
  return lerpX1 + (lerpX2 - lerpX1) * v;
}