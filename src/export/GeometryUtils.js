// Phase 5: Export Enhancement Utilities

/**
 * Ramer-Douglas-Peucker algorithm for polyline simplification
 * @param {Array} points - Array of {x, y} points
 * @param {number} tolerance - Simplification tolerance
 * @returns {Array} Simplified array of points
 */
export function simplifyRDP(points, tolerance = 1.0) {
  if (points.length <= 2) return points;
  
  const sqTolerance = tolerance * tolerance;
  
  function getSquareDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return dx * dx + dy * dy;
  }
  
  function getSquareSegmentDistance(p, p1, p2) {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy);
      
      if (t > 1) {
        dx = p.x - p2.x;
        dy = p.y - p2.y;
      } else if (t > 0) {
        dx = p.x - (p1.x + dx * t);
        dy = p.y - (p1.y + dy * t);
      } else {
        dx = p.x - p1.x;
        dy = p.y - p1.y;
      }
    } else {
      dx = p.x - p1.x;
      dy = p.y - p1.y;
    }
    
    return dx * dx + dy * dy;
  }
  
  function simplifyRecursive(points, first, last, sqTolerance, simplified) {
    let maxSqDist = sqTolerance;
    let index = 0;
    
    for (let i = first + 1; i < last; i++) {
      const sqDist = getSquareSegmentDistance(points[i], points[first], points[last]);
      
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    
    if (maxSqDist > sqTolerance) {
      if (index - first > 1) simplifyRecursive(points, first, index, sqTolerance, simplified);
      simplified.push(points[index]);
      if (last - index > 1) simplifyRecursive(points, index, last, sqTolerance, simplified);
    }
  }
  
  const last = points.length - 1;
  const simplified = [points[0]];
  simplifyRecursive(points, 0, last, sqTolerance, simplified);
  simplified.push(points[last]);
  
  return simplified;
}

/**
 * Merge collinear segments within a tolerance
 * @param {Array} points - Array of {x, y} points
 * @param {number} threshold - Collinearity threshold
 * @returns {Array} Points with collinear segments merged
 */
export function mergeCollinearSegments(points, threshold = 0.1) {
  if (points.length <= 2) return points;
  
  const result = [points[0]];
  
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = result[result.length - 1];
    const p2 = points[i];
    const p3 = points[i + 1];
    
    // Calculate cross product to determine collinearity
    const cross = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y));
    const length = Math.sqrt((p3.x - p1.x) ** 2 + (p3.y - p1.y) ** 2);
    
    const distance = length > 0 ? cross / length : 0;
    
    if (distance > threshold) {
      result.push(p2);
    }
  }
  
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Round coordinates to specified decimal places
 * @param {Array} points - Array of {x, y} points with optional additional properties
 * @param {number} decimals - Number of decimal places
 * @returns {Array} Points with rounded coordinates
 */
export function roundCoordinates(points, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return points.map(point => ({
    ...point,
    x: Math.round(point.x * factor) / factor,
    y: Math.round(point.y * factor) / factor
  }));
}

/**
 * Apply all geometry optimizations to a path
 * @param {Array} path - Path points
 * @param {Object} config - Configuration object
 * @returns {Array} Optimized path
 */
export function optimizePath(path, config) {
  let optimized = [...path];
  
  if (config.rdpSimplification) {
    optimized = simplifyRDP(optimized, config.rdpTolerance);
  }
  
  if (config.mergeCollinear) {
    optimized = mergeCollinearSegments(optimized, config.collinearThreshold);
  }
  
  optimized = roundCoordinates(optimized, config.coordinateRounding);
  
  return optimized;
}