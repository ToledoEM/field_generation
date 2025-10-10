import { optimizePath } from './GeometryUtils.js';

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
      background_color: config.backgroundColor || '#FFFFFF',
      multi_layer_blending: config.multiLayerBlending,
      variable_stroke_mode: config.variableStrokeMode,
      color_drift_enabled: config.colorDriftEnabled,
      export_optimizations: {
        rdp_simplification: config.rdpSimplification,
        merge_collinear: config.mergeCollinear,
        coordinate_rounding: config.coordinateRounding
      }
    }
  };

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}">\n`;
  svg += `  <metadata id="flow-field-metadata">${encodeURIComponent(JSON.stringify(metadata))}</metadata>\n`;
  svg += `  <!-- Generated with Flow Field Art Creator | seed=${seedUsed} palette=${config.palette} paths=${config.numPaths} -->\n`;
  
  const bg = config.backgroundColor || '#FFFFFF';
  svg += `  <rect width="${config.width}" height="${config.height}" fill="${bg}"/>\n`;

  // Apply geometry optimizations to paths
  const optimizedPaths = paths.map(path => optimizePath(path, config));

  // Handle different export color modes
  switch (config.exportColorMode) {
    case 'monochrome':
      svg += exportMonochrome(optimizedPaths, config);
      break;
    case 'per-layer':
      svg += exportPerLayer(optimizedPaths, paletteColors, config);
      break;
    case 'palette':
    default:
      svg += exportWithPalette(optimizedPaths, paletteColors, config);
      break;
  }

  svg += `</svg>`;
  return svg;
}

function exportMonochrome(paths, config) {
  let svg = `  <g stroke="#000000" stroke-width="${config.strokeWeight}" fill="none">\n`;
  
  for (const path of paths) {
    if (path.length < 2) continue;
    svg += generatePolyline(path, config);
  }
  
  svg += '  </g>\n';
  return svg;
}

function exportPerLayer(paths, paletteColors, config) {
  let svg = '';
  
  // Group paths by color
  const colorGroups = {};
  for (let i = 0; i < paths.length; i++) {
    const color = paletteColors[i % paletteColors.length];
    if (!colorGroups[color]) colorGroups[color] = [];
    colorGroups[color].push(paths[i]);
  }

  // Export each color group as a separate layer
  for (const color in colorGroups) {
    svg += `  <g id="layer-${color.replace('#', '')}" stroke="${color}" stroke-width="${config.strokeWeight}" fill="none">\n`;
    for (const path of colorGroups[color]) {
      if (path.length < 2) continue;
      svg += generatePolyline(path, config);
    }
    svg += '  </g>\n';
  }
  
  return svg;
}

function exportWithPalette(paths, paletteColors, config) {
  let svg = '';
  
  // Handle variable stroke weights and alpha
  if (config.variableStrokeMode !== 'none') {
    // Export each path individually to handle variable properties
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.length < 2) continue;
      
      const color = paletteColors[i % paletteColors.length];
      svg += generatePathWithVariableProperties(path, color, config);
    }
  } else {
    // Group by color for efficiency
    const colorGroups = {};
    for (let i = 0; i < paths.length; i++) {
      const color = paletteColors[i % paletteColors.length];
      if (!colorGroups[color]) colorGroups[color] = [];
      colorGroups[color].push(paths[i]);
    }

    for (const color in colorGroups) {
      svg += `  <g stroke="${color}" stroke-width="${config.strokeWeight}" fill="none">\n`;
      for (const path of colorGroups[color]) {
        if (path.length < 2) continue;
        svg += generatePolyline(path, config);
      }
      svg += '  </g>\n';
    }
  }
  
  return svg;
}

function generatePolyline(path, config) {
  let svg = '    <polyline points="';
  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    svg += `${pt.x},${pt.y}`;
    if (i < path.length - 1) svg += ' ';
  }
  svg += '"/>\n';
  return svg;
}

function generatePathWithVariableProperties(path, baseColor, config) {
  let svg = '';
  
  // For variable stroke properties, we need to break the path into segments
  for (let i = 0; i < path.length - 1; i++) {
    const pt1 = path[i];
    const pt2 = path[i + 1];
    
    const strokeWeight = pt1.strokeWeight || config.strokeWeight;
    const alpha = pt1.alpha || 1.0;
    
    let color = baseColor;
    if (alpha < 1.0) {
      // Convert to rgba for transparency
      const rgb = hexToRgb(baseColor);
      if (rgb) {
        color = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
      }
    }
    
    svg += `  <line x1="${pt1.x}" y1="${pt1.y}" x2="${pt2.x}" y2="${pt2.y}" stroke="${color}" stroke-width="${strokeWeight}" fill="none"/>\n`;
  }
  
  return svg;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}
