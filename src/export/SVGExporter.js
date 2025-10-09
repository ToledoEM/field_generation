export function exportSVG({ paths, config, seedUsed, paletteColors }) {
  const metadata = {
    timestamp: new Date().toISOString(),
    parameters: {
      noise_type: config.noiseType,
      field_scale: config.fieldScale,
      resolution: config.resolution,
      num_paths: config.numPaths,
      step_size: config.stepSize,
      stroke_weight: config.strokeWeight,
      seed: seedUsed,
      palette: config.palette,
      palette_colors: paletteColors,
      background_color: config.backgroundColor || '#FFFFFF'
    }
  };
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}">\n`;
  svg += `  <metadata id="flow-field-metadata">${encodeURIComponent(JSON.stringify(metadata))}</metadata>\n`;
  svg += `  <!-- Generated with Flow Field Art Creator | seed=${seedUsed} palette=${config.palette} paths=${config.numPaths} -->\n`;
  const bg = config.backgroundColor || '#FFFFFF';
  svg += `  <rect width="${config.width}" height="${config.height}" fill="${bg}"/>\n`;
  const colorGroups = {};
  for (let i = 0; i < paths.length; i++) {
    const color = paletteColors[i % paletteColors.length];
    (colorGroups[color] = colorGroups[color] || []).push(paths[i]);
  }
  for (const color in colorGroups) {
    svg += `  <g stroke="${color}" stroke-width="${config.strokeWeight}" fill="none">\n`;
    for (const path of colorGroups[color]) {
      if (path.length < 2) continue;
      svg += '    <polyline points="';
      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        svg += `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
        if (i < path.length - 1) svg += ' ';
      }
      svg += '"/>\n';
    }
    svg += '  </g>\n';
  }
  svg += `</svg>`;
  return svg;
}
