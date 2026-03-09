/**
 * color-methods.js
 * Registry of procedural color assignment methods.
 * Each method: { name, assignPath(pathIndex, pathCount, context) → hexColor }
 * context: { startX, startY, field, columns, rows, STEP_SIZE, params }
 */

(function initColorMethods(root) {
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  const COLOR_METHODS = {

    hslGradient: {
      name: "HSL Gradient",
      // Sweeps hue linearly across all paths
      assignPath(idx, count) {
        const hue = (idx / Math.max(count - 1, 1)) * 360;
        return hslToHex(hue, 0.8, 0.45);
      },
    },

    solidPalette: {
      name: "Solid Palette",
      // Cycles through a fixed palette
      assignPath(idx, _count, ctx) {
        const palette = (ctx.params && ctx.params.palette && ctx.params.palette.length)
          ? ctx.params.palette
          : ["#e63946", "#457b9d", "#2a9d8f", "#e9c46a", "#f4a261"];
        return palette[idx % palette.length];
      },
    },

    fieldAngle: {
      name: "Field Angle",
      // Maps the field vector angle at the path start point to a hue
      assignPath(_idx, _count, ctx) {
        const { startX, startY, field, columns, rows } = ctx;
        if (!field || !columns || !rows) return "#000000";
        const col = Math.max(0, Math.min(columns - 1, Math.floor(startX / (ctx.STEP_SIZE || 4))));
        const row = Math.max(0, Math.min(rows - 1, Math.floor(startY / (ctx.STEP_SIZE || 4))));
        const v = field[col] && field[col][row];
        if (!v) return "#000000";
        // heading() returns angle in radians; convert to hue 0-360
        const angle = Math.atan2(v.y, v.x);
        const hue = ((angle / (2 * Math.PI)) * 360 + 360) % 360;
        return hslToHex(hue, 0.75, 0.45);
      },
    },

    density: {
      name: "Density Map",
      // Hue varies by path index but with a tighter palette (cool → warm)
      assignPath(idx, count) {
        const t = idx / Math.max(count - 1, 1);
        // Cool blue to warm red
        const hue = 240 - t * 240;
        return hslToHex(hue, 0.8, 0.45);
      },
    },

    position: {
      name: "Position (X→Y)",
      // Color based on start position: X→hue, Y→lightness
      assignPath(_idx, _count, ctx) {
        const { startX, startY, columns, rows, STEP_SIZE } = ctx;
        const maxW = (columns || 1) * (STEP_SIZE || 4);
        const maxH = (rows || 1) * (STEP_SIZE || 4);
        const hue = (startX / maxW) * 360;
        const lightness = 0.3 + (startY / maxH) * 0.35;
        return hslToHex(hue, 0.75, lightness);
      },
    },

  };

  root.COLOR_METHODS = COLOR_METHODS;

})(typeof globalThis !== "undefined" ? globalThis : this);
