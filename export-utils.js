(function initExportUtils(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }
  root.FlowFieldExportUtils = factory();
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function exportUtilsFactory() {
    function buildCSV(pathCollection) {
      const paths = Array.isArray(pathCollection) ? pathCollection : [];
      let csv = "path_id,point_index,x,y\n";
      for (let i = 0; i < paths.length; i++) {
        const path = Array.isArray(paths[i]) ? paths[i] : [];
        for (let j = 0; j < path.length; j++) {
          const point = path[j] || {};
          const x = Number.isFinite(point.x) ? point.x : 0;
          const y = Number.isFinite(point.y) ? point.y : 0;
          csv += `${i},${j},${x.toFixed(2)},${y.toFixed(2)}\n`;
        }
      }
      return csv;
    }

    function stringifyJSON(data) {
      return JSON.stringify(data, null, 2);
    }

    function buildSVG(options) {
      const opts = options || {};
      const width = Number.isFinite(opts.width) ? opts.width : 0;
      const height = Number.isFinite(opts.height) ? opts.height : 0;
      const strokeWeight = Number.isFinite(opts.strokeWeight) ? opts.strokeWeight : 1;
      const pathCollection = Array.isArray(opts.paths) ? opts.paths : [];

      let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <g stroke="black" stroke-width="${strokeWeight}" fill="none">
`;

      for (const path of pathCollection) {
        if (!Array.isArray(path) || path.length < 2) continue;
        svg += '    <polyline points="';
        for (let i = 0; i < path.length; i++) {
          const point = path[i] || {};
          const x = Number.isFinite(point.x) ? point.x : 0;
          const y = Number.isFinite(point.y) ? point.y : 0;
          svg += `${x.toFixed(2)},${y.toFixed(2)}`;
          if (i < path.length - 1) svg += " ";
        }
        svg += '"/>\n';
      }

      svg += `  </g>
</svg>`;
      return svg;
    }

    return {
      buildCSV,
      buildSVG,
      stringifyJSON,
    };
  },
);
