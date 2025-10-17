import { FIELD_METHODS } from './methods.js';
import { noise, setSeed } from './noise.js';

export function generateField(opts) {
  const {
    width=800,
    height=800,
    fieldScale=0.005,
    resolution=30,
    numPaths=500,
    stepSize=4,
    strokeWeight=0.5,
    method='quantizedPerlin',
    seed=null,
    repelEnabled=false,
    repelRadius=40,
    repelStrength=0.8,
    maxNeighbors=35,
    angleDampen=0.6,
    methodParams={},
    linePalette='mono',
    bgColor='#FFFFFF'
  } = opts;

  if (seed !== null) setSeed(seed);

  const cols = Math.floor(width / stepSize);
  const rows = Math.floor(height / stepSize);
  const methodDef = FIELD_METHODS[method];
  if (!methodDef) throw new Error(`Unknown method: ${method}`);
  const p = { ...methodDef.params, ...methodParams };

  function buildSources(methodKey, p) {
    if (!['radialCenter','spiral'].includes(methodKey)) return [];
    const count = p.sourcesCount || 1;
    const dist = p.distribution || 'random';
    const sources = [];
    if (dist === 'random') {
      for (let k=0;k<count;k++) sources.push({ x: Math.random()*cols, y: Math.random()*rows });
    } else if (dist === 'grid') {
      const side = Math.ceil(Math.sqrt(count));
      for (let gx=0; gx<side && sources.length<count; gx++) {
        for (let gy=0; gy<side && sources.length<count; gy++) {
          sources.push({ x: (gx+0.5)/side * cols, y: (gy+0.5)/side * rows });
        }
      }
    } else if (dist === 'circle' || dist === 'ring') {
      const R = Math.min(cols, rows) * 0.35;
      for (let k=0;k<count;k++) {
        const a = (k / count) * Math.PI * 2;
        sources.push({ x: cols/2 + Math.cos(a)*R, y: rows/2 + Math.sin(a)*R });
      }
    }
    return sources;
  }
  const sources = buildSources(method, p);

  const field = new Array(cols);
  for (let i=0;i<cols;i++) {
    field[i] = new Array(rows);
    for (let j=0;j<rows;j++) {
      const xoff = i * fieldScale;
      const yoff = j * fieldScale;
      const angle = methodDef.gen({i,j,xoff,yoff,p,sources,cols,rows});
      field[i][j] = angle;
    }
  }

  const bucketSize = repelRadius;
  const buckets = {};
  function bucketKey(x,y){
    return `${Math.floor(x/bucketSize)}_${Math.floor(y/bucketSize)}`;
  }
  function addPoint(pt){
    const k = bucketKey(pt.x,pt.y);
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(pt);
  }
  function neighbors(x,y){
    const bx = Math.floor(x/bucketSize);
    const by = Math.floor(y/bucketSize);
    const out=[];
    for (let dx=-1;dx<=1;dx++) {
      for (let dy=-1;dy<=1;dy++) {
        const arr = buckets[`${bx+dx}_${by+dy}`];
        if (arr) out.push(...arr);
      }
    }
    return out;
  }

  const paths = [];
  for (let pIndex=0;pIndex<numPaths;pIndex++) {
    let x = Math.random()*width;
    let y = Math.random()*height;
    const path = [];
    for (let step=0;step<resolution;step++) {
      const ci = Math.floor(x/stepSize);
      const cj = Math.floor(y/stepSize);
      if (ci<0||cj<0||ci>=cols||cj>=rows) break;
      let angle = field[ci][cj];
      if (repelEnabled) {
        const neigh = neighbors(x,y);
        let rx=0, ry=0;
        let count=0;
        for (const npt of neigh) {
          const dx = x - npt.x;
            const dy = y - npt.y;
            const dist2 = dx*dx + dy*dy;
            if (dist2 < repelRadius*repelRadius && dist2>1) {
              const inv = 1/dist2;
              rx += dx * inv;
              ry += dy * inv;
              count++;
              if (count>=maxNeighbors) break;
            }
        }
        if (count>0) {
          const rAngle = Math.atan2(ry, rx);
          angle = angle * angleDampen + rAngle * (1-angleDampen);
        }
      }
      const nx = x + Math.cos(angle) * stepSize;
      const ny = y + Math.sin(angle) * stepSize;
      path.push([x,y]);
      addPoint({x,y});
      x = nx; y = ny;
    }
    if (path.length>1) paths.push(path);
  }

  return { field, paths, width, height, params: opts, methodParams: p, sources, linePalette, bgColor };
}

export function toSVG(data) {
  const { paths, width, height, bgColor } = data;
  const colors = resolvePalette(data.linePalette);
  function gradientStops(count){
    const stops=[];
    for (let i=0;i<count;i++) {
      const t = count===1?0: i/(count-1);
      const seg = (colors.length-1)*t;
      const si = Math.floor(seg);
      const frac = seg - si;
      const c1 = colors[si];
      const c2 = colors[Math.min(si+1, colors.length-1)];
      stops.push({offset:(t*100).toFixed(2)+'%', color: mixHex(c1,c2,frac)});
    }
    return stops;
  }
  function mixHex(a,b,t){
    const ar=parseInt(a.slice(1,3),16), ag=parseInt(a.slice(3,5),16), ab=parseInt(a.slice(5,7),16);
    const br=parseInt(b.slice(1,3),16), bg=parseInt(b.slice(3,5),16), bb=parseInt(b.slice(5,7),16);
    const rr=Math.round(ar + (br-ar)*t), rg=Math.round(ag + (bg-ag)*t), rb=Math.round(ab + (bb-ab)*t);
    return `#${rr.toString(16).padStart(2,'0')}${rg.toString(16).padStart(2,'0')}${rb.toString(16).padStart(2,'0')}`;
  }
  let defs = [];
  let polys = [];
  paths.forEach((p,pi)=>{
    const gid = `grad${pi}`;
    const stops = gradientStops(Math.min(colors.length, 5));
    defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${p[0][0].toFixed(2)}" y1="${p[0][1].toFixed(2)}" x2="${p[p.length-1][0].toFixed(2)}" y2="${p[p.length-1][1].toFixed(2)}">` +
      stops.map(s=>`<stop offset="${s.offset}" stop-color="${s.color}" />`).join('') + '</linearGradient>');
    polys.push(`<polyline points="${p.map(pt=>pt.map(v=>v.toFixed(2)).join(',')).join(' ')}" stroke="url(#${gid})" stroke-width="1" fill="none" />`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n<defs>${defs.join('')}</defs>\n<rect width="100%" height="100%" fill="${bgColor}" />\n${polys.join('\n')}\n</svg>`;
}

export function toCSV(data) {
  const { paths } = data;
  let lines = ['path_id,point_index,x,y'];
  paths.forEach((p,pi)=>{
    p.forEach((pt,idx)=>{
      lines.push(`${pi},${idx},${pt[0].toFixed(3)},${pt[1].toFixed(3)}`);
    });
  });
  return lines.join('\n');
}

export function toJSON(data) {
  return JSON.stringify({
    metadata: {
      width: data.width,
      height: data.height,
      params: data.params,
      methodParams: data.methodParams,
      sources: data.sources,
      palette: data.linePalette,
      bgColor: data.bgColor
    },
    paths: data.paths
  }, null, 2);
}

export const SANZO_WADA_PALETTES = [
  ['#2E4052','#66A5AD','#C4DFE6','#F2EFE9'],
  ['#6B2D5C','#9F6BA0','#D9D2E9','#F2F4F3'],
  ['#264653','#2A9D8F','#E9C46A','#F4A261','#E76F51'],
  ['#283845','#B8B08D','#F2D492','#F29559','#F2A541'],
  ['#332E3C','#D4CDC3','#C2B8A3','#A99985','#806D5A'],
  ['#1A1B25','#313140','#515167','#727394','#A0A1B4'],
  ['#3F3B6C','#624F82','#9F73AB','#A3C7D6'],
  ['#2D3A3A','#436E5C','#8AA899','#C1DAD6','#F5F9F8'],
  ['#3D2B1F','#6E4933','#AA6F47','#D9B48F','#F2E9D8'],
  ['#2F2F2F','#515151','#737373','#B5B5B5','#E5E5E5']
];

export function resolvePalette(key) {
  if (key === 'mono') return ['#000000'];
  const idx = parseInt(key.replace('p',''));
  if (!isNaN(idx) && SANZO_WADA_PALETTES[idx]) return SANZO_WADA_PALETTES[idx];
  return SANZO_WADA_PALETTES[0];
}
