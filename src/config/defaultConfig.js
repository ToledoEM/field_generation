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
  invertColors: false, // new flag to invert stroke colors
  
  // Phase 4: Field & Visual Richness
  multiLayerBlending: false,
  baseFieldWeight: 0.7,
  secondaryFieldScale: 0.02,
  secondaryFieldWeight: 0.3,
  variableStrokeMode: 'none', // 'none', 'curvature', 'taper', 'alpha-curvature', 'alpha-taper'
  strokeWeightMultiplier: 3.0,
  colorDriftEnabled: false,
  colorDriftAmount: 0.1,
  negativeSpaceMasks: [],
  repulsionStrength: 3.0,
  repulsionRadius: 1.5,
  
  // Phase 5: Export Enhancements
  rdpSimplification: false,
  rdpTolerance: 0.5,
  mergeCollinear: false,
  collinearThreshold: 0.1,
  coordinateRounding: 2,
  exportColorMode: 'palette', // 'palette', 'monochrome', 'per-layer'
  
  // Phase 6: Cybernetic Feedback & Adaptive Systems
  cyberneticsEnabled: false,
  densityAdaptation: true,
  adaptationRate: 0.3,
  pheromoneTrails: false,
  pheromoneDecay: 0.95,
  pheromoneInfluence: 0.2,
  emergentAttractors: false,
  attractorThreshold: 0.7,
  attractorDecay: 0.98,
  temporalMemory: false,
  memoryWeight: 0.1,
  memoryDecay: 0.9,
  feedbackGain: 0.5,
  entropyRegulation: 0.3,
  complexityTarget: 0.6
};

export function cloneConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg));
}
