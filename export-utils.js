(function initExportUtils(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }
  root.FlowFieldExportUtils = factory();
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function exportUtilsFactory() {
    function buildCSV(pathCollection, options) {
      const paths = Array.isArray(pathCollection) ? pathCollection : [];
      const opts = options || {};
      const pathColors = Array.isArray(opts.pathColors) ? opts.pathColors : null;
      const hasColors = pathColors && pathColors.length > 0;
      let csv = hasColors ? "path_id,point_index,x,y,color\n" : "path_id,point_index,x,y\n";
      for (let i = 0; i < paths.length; i++) {
        const path = Array.isArray(paths[i]) ? paths[i] : [];
        const color = hasColors ? (pathColors[i] || "") : null;
        for (let j = 0; j < path.length; j++) {
          const point = path[j] || {};
          const x = Number.isFinite(point.x) ? point.x : 0;
          const y = Number.isFinite(point.y) ? point.y : 0;
          csv += hasColors
            ? `${i},${j},${x.toFixed(2)},${y.toFixed(2)},${color}\n`
            : `${i},${j},${x.toFixed(2)},${y.toFixed(2)}\n`;
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
      const pathColors = Array.isArray(opts.pathColors) ? opts.pathColors : null;
      const hasPerPathColor = pathColors && pathColors.length > 0;
      const bg = opts.background === "black" ? "black" : "white";

      const groupAttr = hasPerPathColor
        ? `fill="none"`
        : `stroke="black" stroke-width="${strokeWeight}" fill="none"`;

      let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <g ${groupAttr}>
`;

      for (let i = 0; i < pathCollection.length; i++) {
        const path = pathCollection[i];
        if (!Array.isArray(path) || path.length < 2) continue;
        const strokeAttr = hasPerPathColor
          ? ` stroke="${pathColors[i] || "black"}" stroke-width="${strokeWeight}"`
          : "";
        svg += `    <polyline${strokeAttr} points="`;
        for (let j = 0; j < path.length; j++) {
          const point = path[j] || {};
          const x = Number.isFinite(point.x) ? point.x : 0;
          const y = Number.isFinite(point.y) ? point.y : 0;
          svg += `${x.toFixed(2)},${y.toFixed(2)}`;
          if (j < path.length - 1) svg += " ";
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
