// Palette definitions and builder
export const PALETTES = {
  mono: ['#000000'],
  warm: ['#621709', '#d14900', '#f29f05', '#f25c05', '#f28705'],
  cool: ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd'],
  earth: ['#2f1b12', '#6b4226', '#a37f50', '#d9c5a0', '#8c5c30'],
  neon: ['#ff0266', '#00e5ff', '#ffea00', '#ff9100', '#d500f9'],
  pastel: ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff'],
  // Sanzo-Wada inspired (subset) palettes (curated selection)
  sw01: ['#f6d6bd', '#c97d60', '#874f41', '#3c2f2f', '#0e1116'],
  sw02: ['#e0d0c1', '#c1b3a1', '#a39171', '#73675c', '#3e3a39'],
  sw03: ['#f2e8cf', '#e4cda7', '#c2955d', '#8c5f3d', '#402a23'],
  sw04: ['#e9f2f9', '#b4d4e0', '#6fa8c4', '#3d6e8c', '#1d3a4f'],
  sw05: ['#f8f4e4', '#dfd6a7', '#c4b074', '#8f7d4f', '#4a3f2a'],
  sw06: ['#f2efe6', '#d9d2c1', '#b8b09a', '#8a8778', '#55524a'],
  sw07: ['#f6f5f3', '#dcd7d3', '#b2aaa1', '#857f78', '#4d4a46'],
  sw08: ['#f2e9e4', '#e4c3ad', '#d7a98c', '#a67563', '#6d3f2b'],
  sw09: ['#f4ede4', '#e5c7a3', '#d5a86c', '#a67744', '#704c24'],
  sw10: ['#f2f7f2', '#cfe3cf', '#9fc19f', '#5d8f5d', '#2f4d2f']
};

export function buildPaletteColors(name, includeBW = true) {
  let base = [...(PALETTES[name] || PALETTES.mono)];
  if (includeBW) {
    if (!base.includes('#000000')) base.unshift('#000000');
    if (!base.includes('#FFFFFF')) base.push('#FFFFFF');
  }
  return base;
}
