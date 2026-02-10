/*
 * Field method registry for the Flow Field Art Creator.
 * Defines the directional vector generators referenced in flowfields.js.
 */

function buildFieldMethods() {
  return {
    quantizedPerlin: {
      name: "Quantized Perlin",
      description: "Perlin noise angle rounded to 45° increments.",
      params: {
        quantumDivisions: {
          label: "Divisions (per 360°)",
          type: "range",
          min: 4,
          max: 32,
          step: 1,
          default: 8,
        },
        angleMultiplier: {
          label: "Angle Noise Mult",
          type: "range",
          min: 1,
          max: 10,
          step: 0.5,
          default: 4,
        },
        jitter: {
          label: "Angle Jitter",
          type: "range",
          min: 0,
          max: 0.5,
          step: 0.01,
          default: 0,
        },
      },
      generate: ({ xoff, yoff }) => {
        const divisions = METHOD_PARAMS.quantizedPerlin.quantumDivisions;
        const quantumAngle = TWO_PI / divisions;
        let noiseVal =
          noise(xoff, yoff) *
          TWO_PI *
          METHOD_PARAMS.quantizedPerlin.angleMultiplier;
        let angle = noiseVal % TWO_PI;
        angle = round(angle / quantumAngle) * quantumAngle;
        angle += random(
          -METHOD_PARAMS.quantizedPerlin.jitter,
          METHOD_PARAMS.quantizedPerlin.jitter,
        );
        return p5.Vector.fromAngle(angle);
      },
    },
    perlin: {
      name: "Smooth Perlin",
      description: "Standard smooth Perlin-based angle.",
      params: {
        angleScale: {
          label: "Angle Scale",
          type: "range",
          min: 0.5,
          max: 6,
          step: 0.1,
          default: 2,
        },
        rotationOffset: {
          label: "Rotation Offset",
          type: "range",
          min: -Math.PI,
          max: Math.PI,
          step: 0.01,
          default: 0,
        },
      },
      generate: ({ xoff, yoff }) => {
        let angle =
          noise(xoff, yoff) * TWO_PI * METHOD_PARAMS.perlin.angleScale +
          METHOD_PARAMS.perlin.rotationOffset;
        return p5.Vector.fromAngle(angle);
      },
    },
    signedQuantized: {
      name: "Signed Quantized 45°",
      description:
        "Noise mapped to [-π, π] then snapped to 45° increments for stark geometric flow.",
      params: {
        jitter: {
          label: "Angle Jitter",
          type: "range",
          min: 0,
          max: 0.4,
          step: 0.01,
          default: 0,
        },
        invert: { label: "Invert Direction", type: "checkbox", default: false },
      },
      generate: ({ xoff, yoff }) => {
        let n = noise(xoff, yoff); // 0..1
        let angle = PI * (2 * n - 1); // -PI .. PI
        const quantum = PI / 4; // 45° quantization
        angle = round(angle / quantum) * quantum;
        angle += random(
          -METHOD_PARAMS.signedQuantized.jitter,
          METHOD_PARAMS.signedQuantized.jitter,
        );
        if (METHOD_PARAMS.signedQuantized.invert) angle += PI; // flip direction
        return p5.Vector.fromAngle(angle);
      },
    },
    curlLike: {
      name: "Pseudo Curl",
      description:
        "Finite-difference derivative of Perlin to emulate curl flow.",
      params: {
        epsilon: {
          label: "Derivative ε",
          type: "range",
          min: 0.001,
          max: 0.05,
          step: 0.001,
          default: 0.01,
        },
        strength: {
          label: "Vector Strength",
          type: "range",
          min: 0.5,
          max: 5,
          step: 0.1,
          default: 1.2,
        },
      },
      generate: ({ xoff, yoff }) => {
        const e = METHOD_PARAMS.curlLike.epsilon;
        const n1 = noise(xoff, yoff + e);
        const n2 = noise(xoff, yoff - e);
        const n3 = noise(xoff + e, yoff);
        const n4 = noise(xoff - e, yoff);
        const dx = (n1 - n2) / (2 * e);
        const dy = (n3 - n4) / (2 * e);
        let v = createVector(-dy, dx);
        v.normalize().mult(METHOD_PARAMS.curlLike.strength);
        return v;
      },
    },
    radialCenter: {
      name: "Radial (Inward)",
      description: "Vectors point towards canvas center.",
      params: {
        inward: { label: "Inward vs Outward", type: "checkbox", default: true },
        falloff: {
          label: "Distance Falloff",
          type: "range",
          min: 0,
          max: 2,
          step: 0.05,
          default: 0.5,
        },
        sourcesCount: {
          label: "Sources Count",
          type: "range",
          min: 1,
          max: 50,
          step: 1,
          default: 3,
        },
        distribution: {
          label: "Distribution",
          type: "select",
          options: ["random", "grid", "circle"],
          default: "random",
        },
        blendMode: {
          label: "Blend Mode",
          type: "select",
          options: ["closest", "average", "weighted"],
          default: "weighted",
        },
      },
      generate: ({ i, j }) => {
        const sources = METHOD_SOURCES.radialCenter || [];
        if (sources.length === 0) return createVector(0, 0);
        const inward = METHOD_PARAMS.radialCenter.inward;
        const falloff = METHOD_PARAMS.radialCenter.falloff;
        const mode = METHOD_PARAMS.radialCenter.blendMode;
        let accum = createVector(0, 0);
        let weightsTotal = 0;
        let closestV = null;
        let closestD = Infinity;
        sources.forEach((s) => {
          let v = createVector(s.x - i, s.y - j);
          let d = v.mag();
          if (d < 0.001) d = 0.001;
          v.normalize();
          if (!inward) v.mult(-1);
          let maxD = dist(0, 0, columns, rows);
          let scale = 1 - (d / maxD) * falloff;
          if (scale < 0) scale = 0;
          v.mult(scale);
          if (mode === "closest") {
            if (d < closestD) {
              closestD = d;
              closestV = v;
            }
          } else if (mode === "average") {
            accum.add(v);
          } else {
            // weighted
            let w = 1 / (d + 0.001);
            accum.add(p5.Vector.mult(v, w));
            weightsTotal += w;
          }
        });
        let out;
        if (mode === "closest") out = closestV || accum;
        else if (mode === "average") {
          out = accum.div(sources.length);
        } else {
          out = weightsTotal > 0 ? accum.div(weightsTotal) : accum;
        }
        return out;
      },
    },
    spiral: {
      name: "Spiral",
      description: "Combines radial and tangential components for a spiral.",
      params: {
        inwardness: {
          label: "Inwardness",
          type: "range",
          min: 0,
          max: 1,
          step: 0.05,
          default: 0.6,
        },
        twist: {
          label: "Twist",
          type: "range",
          min: 0,
          max: 3,
          step: 0.05,
          default: 1,
        },
        arms: {
          label: "Spiral Arms",
          type: "range",
          min: 1,
          max: 12,
          step: 1,
          default: 4,
        },
        armSharpness: {
          label: "Arm Sharpness",
          type: "range",
          min: 0,
          max: 1,
          step: 0.05,
          default: 0.4,
        },
        sourcesCount: {
          label: "Sources Count",
          type: "range",
          min: 1,
          max: 12,
          step: 1,
          default: 1,
        },
        distribution: {
          label: "Distribution",
          type: "select",
          options: ["random", "ring", "grid"],
          default: "ring",
        },
        rotationDir: {
          label: "Rotation Dir",
          type: "select",
          options: ["auto", "cw", "ccw"],
          default: "auto",
        },
      },
      generate: ({ i, j }) => {
        const sources = METHOD_SOURCES.spiral || [];
        if (sources.length === 0) return createVector(0, 0);
        let inwardness = METHOD_PARAMS.spiral.inwardness;
        let twist = METHOD_PARAMS.spiral.twist;
        let arms = METHOD_PARAMS.spiral.arms;
        let sharp = METHOD_PARAMS.spiral.armSharpness;
        let rotDirSetting = METHOD_PARAMS.spiral.rotationDir;
        let accum = createVector(0, 0);
        sources.forEach((s) => {
          let local = createVector(i - s.x, j - s.y);
          let mag = local.mag();
          if (mag < 0.5) return; // ignore near-source singularity
          let radial = local.copy().normalize();
          let tangential = createVector(-radial.y, radial.x);
          // rotation direction logic
          let useTangential = tangential;
          if (rotDirSetting !== "auto") {
            const sign = rotDirSetting === "cw" ? 1 : -1;
            useTangential = createVector(
              sign * tangential.x,
              sign * tangential.y,
            );
          } else {
            // auto decides based on source index parity for variety
            let idx = sources.indexOf(s);
            if (idx % 2 === 1) useTangential.mult(-1);
          }
          let mix = inwardness; // radial weight
          let armFactor = sin(radial.heading() * arms + mag * twist);
          armFactor = pow(abs(armFactor), sharp);
          let v = p5.Vector.lerp(useTangential, radial.mult(-1), mix);
          v.normalize().mult(1 + armFactor * 0.8);
          // Distance attenuation so multiple sources blend
          let attenuation = 1 / (1 + mag * 0.02);
          accum.add(v.mult(attenuation));
        });
        accum.normalize();
        return accum;
      },
    },
    sineWaves: {
      name: "Sine Waves",
      description: "Angle modulated by combined sin/cos of grid.",
      params: {
        freqX: {
          label: "Frequency X",
          type: "range",
          min: 0.05,
          max: 1,
          step: 0.01,
          default: 0.15,
        },
        freqY: {
          label: "Frequency Y",
          type: "range",
          min: 0.05,
          max: 1,
          step: 0.01,
          default: 0.21,
        },
        directionMode: {
          label: "Direction Mode",
          type: "select",
          options: ["both", "vertical", "horizontal", "diagonal"],
          default: "both",
        },
        amplitude: {
          label: "Amplitude",
          type: "range",
          min: 0.2,
          max: 3,
          step: 0.1,
          default: 1,
        },
      },
      generate: ({ i, j }) => {
        let fx = METHOD_PARAMS.sineWaves.freqX;
        let fy = METHOD_PARAMS.sineWaves.freqY;
        let base = sin(i * fx) + cos(j * fy);
        let mode = METHOD_PARAMS.sineWaves.directionMode;
        let angle = base;
        if (mode === "vertical")
          angle = sin(j * fy) * METHOD_PARAMS.sineWaves.amplitude;
        else if (mode === "horizontal")
          angle = cos(i * fx) * METHOD_PARAMS.sineWaves.amplitude;
        else if (mode === "diagonal")
          angle =
            sin((i + j) * (fx + fy) * 0.5) * METHOD_PARAMS.sineWaves.amplitude;
        else angle = base * METHOD_PARAMS.sineWaves.amplitude;
        return p5.Vector.fromAngle(angle);
      },
    },
    reactionDiffusion: {
      name: "Reaction-Diffusion",
      description:
        "Flow derived from Gray-Scott reaction-diffusion concentration gradients.",
      params: {
        feedRate: {
          label: "Feed Rate (f)",
          type: "range",
          min: 0.01,
          max: 0.1,
          step: 0.001,
          default: 0.055,
        },
        killRate: {
          label: "Kill Rate (k)",
          type: "range",
          min: 0.045,
          max: 0.07,
          step: 0.001,
          default: 0.062,
        },
        diffusionA: {
          label: "Diffusion A (dA)",
          type: "range",
          min: 0.5,
          max: 1.5,
          step: 0.05,
          default: 1.0,
        },
        diffusionB: {
          label: "Diffusion B (dB)",
          type: "range",
          min: 0.1,
          max: 0.8,
          step: 0.05,
          default: 0.5,
        },
        iterations: {
          label: "Simulation Steps",
          type: "range",
          min: 100,
          max: 5000,
          step: 100,
          default: 1000,
        },
        gradientMode: {
          label: "Gradient Mode",
          type: "select",
          options: ["chemicalB", "difference", "laplacian"],
          default: "chemicalB",
        },
        patternSeed: {
          label: "Pattern Seed",
          type: "range",
          min: 1,
          max: 20,
          step: 1,
          default: 5,
        },
      },
      generate: ({ i, j, cols: gridColsArg, rows: gridRowsArg }) => {
        const gridCols =
          typeof gridColsArg === "number" && gridColsArg > 0
            ? gridColsArg
            : typeof columns === "number"
              ? columns
              : 0;
        const gridRows =
          typeof gridRowsArg === "number" && gridRowsArg > 0
            ? gridRowsArg
            : typeof rows === "number"
              ? rows
              : 0;
        if (!gridCols || !gridRows) return createVector(0, 0);
        const params = METHOD_PARAMS.reactionDiffusion;
        if (!params) return createVector(0, 0);
        const data = ensureReactionDiffusionData(gridCols, gridRows, params);
        const concentration = data.concentration;
        if (!concentration) return createVector(0, 0);

        const idx = j * gridCols + i;
        const xLeft = (i - 1 + gridCols) % gridCols;
        const xRight = (i + 1) % gridCols;
        const yUp = (j - 1 + gridRows) % gridRows;
        const yDown = (j + 1) % gridRows;

        const gradX =
          (concentration[j * gridCols + xRight] -
            concentration[j * gridCols + xLeft]) *
          0.5;
        const gradY =
          (concentration[yDown * gridCols + i] -
            concentration[yUp * gridCols + i]) *
          0.5;

        if (!Number.isFinite(gradX) || !Number.isFinite(gradY)) {
          return createVector(0, 0);
        }

        const gradMag = Math.hypot(gradX, gradY);
        if (gradMag < 1e-6) return createVector(0, 0);

        const angle = atan2(gradY, gradX) + HALF_PI;
        return p5.Vector.fromAngle(angle);
      },
    },
    lineIntegralConvolution: {
      name: "Line Integral Convolution (LIC)",
      description:
        "Texture-driven flow derived from LIC over a selectable base field.",
      params: {
        baseFieldMethod: {
          label: "Base Field",
          type: "select",
          options: ["perlin", "spiral", "radialCenter", "sineWaves"],
          default: "perlin",
        },
        streamlineLength: {
          label: "Streamline Length",
          type: "range",
          min: 5,
          max: 50,
          step: 1,
          default: 20,
        },
        kernelSize: {
          label: "Convolution Kernel",
          type: "range",
          min: 3,
          max: 21,
          step: 2,
          default: 11,
        },
        textureResolution: {
          label: "Texture Resolution",
          type: "range",
          min: 0.5,
          max: 2.0,
          step: 0.1,
          default: 1.0,
        },
        contrastBoost: {
          label: "Contrast Boost",
          type: "range",
          min: 1,
          max: 5,
          step: 0.1,
          default: 2.0,
        },
        flowDirection: {
          label: "Flow Direction",
          type: "select",
          options: ["alongStreamlines", "acrossStreamlines", "gradientBased"],
          default: "alongStreamlines",
        },
      },
      generate: ({ i, j, cols: gridColsArg, rows: gridRowsArg }) => {
        const gridCols =
          typeof gridColsArg === "number" && gridColsArg > 0
            ? gridColsArg
            : typeof columns === "number"
              ? columns
              : 0;
        const gridRows =
          typeof gridRowsArg === "number" && gridRowsArg > 0
            ? gridRowsArg
            : typeof rows === "number"
              ? rows
              : 0;
        if (!gridCols || !gridRows) return createVector(0, 0);
        const params = METHOD_PARAMS.lineIntegralConvolution;
        if (!params) return createVector(0, 0);

        const cache = ensureLineIntegralConvolutionData(
          gridCols,
          gridRows,
          params,
        );
        const idx = j * gridCols + i;
        const baseField = cache.baseField || [];
        const licTexture = cache.licTexture || [];

        let baseVec = baseField[idx];
        if (!baseVec) baseVec = createVector(1, 0);
        const baseCopy = baseVec.copy
          ? baseVec.copy()
          : createVector(baseVec.x, baseVec.y);
        if (baseCopy.magSq() < 1e-8) baseCopy.set(1, 0);
        baseCopy.normalize();

        switch (params.flowDirection) {
          case "alongStreamlines":
            return baseCopy.copy();
          case "acrossStreamlines": {
            const perp = createVector(-baseCopy.y, baseCopy.x);
            if (perp.magSq() < 1e-8) return baseCopy.copy();
            return perp.normalize();
          }
          case "gradientBased": {
            if (!licTexture.length) return baseCopy.copy();
            const xLeft = (i - 1 + gridCols) % gridCols;
            const xRight = (i + 1) % gridCols;
            const yUp = (j - 1 + gridRows) % gridRows;
            const yDown = (j + 1) % gridRows;
            const gradX =
              (licTexture[j * gridCols + xRight] -
                licTexture[j * gridCols + xLeft]) *
              0.5;
            const gradY =
              (licTexture[yDown * gridCols + i] -
                licTexture[yUp * gridCols + i]) *
              0.5;
            if (!Number.isFinite(gradX) || !Number.isFinite(gradY)) {
              return baseCopy.copy();
            }
            const gradMag = Math.hypot(gradX, gradY);
            if (gradMag < 1e-6) return baseCopy.copy();
            const gradientVec = p5.Vector.fromAngle(Math.atan2(gradY, gradX));
            return gradientVec;
          }
          default:
            return baseCopy.copy();
        }
      },
    },
  };
}

if (typeof window !== "undefined") {
  window.buildFieldMethods = buildFieldMethods;
}
