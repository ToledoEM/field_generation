export const defaultConfig = {
  width: 800,
  height: 800,
  fieldScale: 0.005,
  resolution: 30,
  numPaths: 500,
  stepSize: 4,
  strokeWeight: 0.5,
  noiseType: 'Perlin',
  seed: null,
  palette: 'mono',
  includeBW: true,
  backgroundColor: '#FFFFFF', // allow flipping to '#000000'
  invertColors: false // new flag to invert stroke colors
};

export function cloneConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg));
}
