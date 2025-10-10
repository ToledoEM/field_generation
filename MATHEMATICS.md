# Mathematical Documentation: Flow Field Art Creator

## Table of Contents

1. [Introduction](#introduction)
2. [Noise Functions](#noise-functions)
3. [Vector Field Theory](#vector-field-theory)
4. [Multi-Layer Field Blending](#multi-layer-field-blending)
5. [Particle Dynamics](#particle-dynamics)
6. [Negative Space Repulsion](#negative-space-repulsion)
7. [Stroke Variation Mathematics](#stroke-variation-mathematics)
8. [Color Space Transformations](#color-space-transformations)
9. [Geometric Optimization Algorithms](#geometric-optimization-algorithms)
10. [Performance Optimizations](#performance-optimizations)

---

## Introduction

This document provides a comprehensive mathematical foundation for the Flow Field Art Creator. The system combines several mathematical domains: noise theory, vector calculus, differential equations, color theory, and computational geometry to create sophisticated generative art.

### Core Mathematical Concepts

- **Perlin/Simplex Noise**: Coherent gradient noise for natural randomness
- **Vector Fields**: Continuous assignment of vectors to points in space
- **Particle Systems**: Numerical integration of differential equations
- **Force Fields**: Superposition of attraction/repulsion forces
- **Geometric Algorithms**: Path simplification and optimization
- **Color Mathematics**: HSL transformations and interpolation

---

## Noise Functions

### Perlin Noise

Perlin noise generates coherent pseudo-random values that exhibit spatial correlation. Given coordinates (x, y), it returns a value in [0, 1].

**Mathematical Properties:**
- **Continuity**: C¹ continuous (smooth first derivatives)
- **Frequency**: Controlled by input scaling
- **Amplitude**: Output range [0, 1]
- **Correlation**: Nearby points have similar values

**Implementation:**
```
N(x, y) = PerlinNoise(x × scale, y × scale)
where scale ∈ [0.001, 0.05]
```

**Angle Generation:**
```
θ(x, y) = N(x, y) × 2π × k
where k = 4 (creates 4 full rotations across [0,1])
```

### Simplex Noise

An improved noise function with better computational properties:

**Advantages over Perlin:**
- Lower computational complexity: O(N²) vs O(2^N)
- Better visual isotropy (no directional artifacts)
- Wider output range: [-1, 1]

**Normalization:**
```
N_simplex(x, y) = (SimplexNoise(x, y) + 1) / 2
```

---

## Vector Field Theory

### Field Definition

A vector field F assigns a vector to each point in 2D space:
```
F: ℝ² → ℝ²
F(x, y) = (u(x, y), v(x, y))
```

### Discrete Approximation

The continuous field is approximated on a regular grid:

**Grid Parameters:**
```
columns = ⌊width / stepSize⌋
rows = ⌊height / stepSize⌋
```

**Index Mapping:**
```
index = i + j × columns
where (i, j) are grid coordinates
```

**Vector Construction:**
```
θ = N(i × fieldScale, j × fieldScale) × 2π × 4
F[index] = (cos(θ), sin(θ))
```

### Vector Sampling

For continuous coordinates (x, y), we use nearest neighbor sampling:

```
i = ⌊x / stepSize⌋
j = ⌊y / stepSize⌋
index = constrain(i, 0, columns-1) + constrain(j, 0, rows-1) × columns
force = F[index]
```

---

## Multi-Layer Field Blending

### Mathematical Foundation

Multiple noise fields are combined using weighted linear combination:

**Primary Field:**
```
F₁(x, y) = (cos(θ₁), sin(θ₁))
where θ₁ = N₁(x × s₁, y × s₁) × 2π × 4
```

**Secondary Field:**
```
F₂(x, y) = (cos(θ₂), sin(θ₂))
where θ₂ = N₂(x × s₂, y × s₂) × 2π × 4
```

**Combined Field:**
```
F_combined(x, y) = w₁ × F₁(x, y) + w₂ × F₂(x, y)
```

**Normalization:**
```
F_final(x, y) = F_combined(x, y) / |F_combined(x, y)|
```

### Parameter Relationships

- **Scale Relationship**: s₂ > s₁ (secondary field has higher frequency)
- **Weight Constraint**: w₁ + w₂ = 1 (typically)
- **Typical Values**: w₁ = 0.7, w₂ = 0.3, s₂ = 4s₁

---

## Particle Dynamics

### Differential Equation

Each particle follows the ordinary differential equation:

```
dx/dt = F(x, y) × stepSize
dy/dt = F(x, y) × stepSize
```

### Numerical Integration

Using Euler's method with fixed time step:

```
x_{n+1} = x_n + F(x_n, y_n) × stepSize
y_{n+1} = y_n + F(x_n, y_n) × stepSize
```

### Boundary Conditions

Particles are terminated when:
```
x < 0 ∨ x > width ∨ y < 0 ∨ y > height
```

### Path Generation Algorithm

```
1. Initialize: P₀ = (x₀, y₀) [random position]
2. For i = 1 to resolution:
   a. Sample field: F_i = F(P_{i-1})
   b. Update position: P_i = P_{i-1} + F_i × stepSize
   c. Check boundaries: if outside → terminate
   d. Store point: path.add(P_i)
3. Return path
```

---

## Negative Space Repulsion

### Force Field Definition

Each negative space circle creates a repulsive force field:

**Distance Function:**
```
d(x, y) = √[(x - cx)² + (y - cy)²]
where (cx, cy) is circle center
```

**Repulsion Magnitude:**
```
R(x, y) = {
    0,                                           if d ≥ r × m
    [(r × m - d) / (r × m)]² × strength,        if d < r × m
}
where:
- r = circle radius
- m = radius multiplier
- strength = repulsion strength parameter
```

**Force Direction:**
```
F_repulsion = R(x, y) × (x - cx, y - cy) / d(x, y)
```

### Superposition Principle

Multiple repulsion sources combine linearly:
```
F_total_repulsion = Σ F_repulsion_i
```

### Combined Dynamics

The final particle motion includes both flow field and repulsion:
```
F_combined = F_flow + F_repulsion
```

**Magnitude Normalization:**
```
P_{n+1} = P_n + (F_combined / |F_combined|) × stepSize
```

---

## Stroke Variation Mathematics

### Curvature Calculation

Path curvature is estimated using discrete derivatives:

**Direction Vectors:**
```
d₁ = (P_{i+1} - P_i) / |P_{i+1} - P_i|
d₂ = (P_{i+2} - P_{i+1}) / |P_{i+2} - P_{i+1}|
```

**Angle Between Vectors:**
```
cos(φ) = d₁ · d₂ = d₁.x × d₂.x + d₁.y × d₂.y
φ = arccos(clamp(cos(φ), -1, 1))
```

**Curvature Metric:**
```
κ = φ / π  [normalized to [0, 1]]
```

### Stroke Weight Variations

**Curvature-Based Weight:**
```
w(i) = w_base + κ(i) × multiplier × 0.3
w(i) = clamp(w(i), 0.1, w_base × 2)
```

**Tapered Weight:**
```
progress = i / (resolution - 1)
w(i) = w_base × (1 - progress × 0.8)
```

### Transparency Variations

**Alpha by Curvature:**
```
α(i) = max(0.3, 1 - κ(i) × 1.5)
```

**Alpha Taper:**
```
α(i) = 1 - progress × 0.9
α(i) = clamp(α(i), 0.1, 1.0)
```

---

## Color Space Transformations

### RGB to HSL Conversion

**Normalization:**
```
r' = R/255, g' = G/255, b' = B/255
```

**Min/Max Values:**
```
max = max(r', g', b')
min = min(r', g', b')
Δ = max - min
```

**Lightness:**
```
L = (max + min) / 2
```

**Saturation:**
```
S = {
    0,                    if Δ = 0
    Δ/(2-max-min),       if L > 0.5
    Δ/(max+min),         if L ≤ 0.5
}
```

**Hue:**
```
H = {
    0,                           if Δ = 0
    60° × ((g'-b')/Δ + 0),      if max = r'
    60° × ((b'-r')/Δ + 2),      if max = g'
    60° × ((r'-g')/Δ + 4),      if max = b'
}
```

### Color Drift Mathematics

**Sinusoidal Modulation:**
```
H_new = H + sin(pathIndex × 0.1 + progress × π) × driftAmount × 360
S_new = S + sin(pathIndex × 0.05 + progress × 2π) × driftAmount × 0.2
L_new = L + sin(pathIndex × 0.03 + progress × 1.5π) × driftAmount × 0.1
```

---

## Geometric Optimization Algorithms

### Ramer-Douglas-Peucker (RDP) Simplification

**Distance from Point to Line:**
```
d = |ax₀ + by₀ + c| / √(a² + b²)
where line: ax + by + c = 0
```

**Perpendicular Distance from Point P to Line Segment AB:**
```
t = [(P - A) · (B - A)] / |B - A|²
t = clamp(t, 0, 1)
closest = A + t × (B - A)
distance = |P - closest|
```

**Recursive Algorithm:**
```
function simplify(points, start, end, tolerance):
    maxDist = 0
    index = 0
    
    for i = start+1 to end-1:
        dist = perpendicularDistance(points[i], points[start], points[end])
        if dist > maxDist:
            maxDist = dist
            index = i
    
    if maxDist > tolerance:
        left = simplify(points, start, index, tolerance)
        right = simplify(points, index, end, tolerance)
        return left + [points[index]] + right
    else:
        return [points[start], points[end]]
```

### Collinear Point Detection

**Cross Product Method:**
```
For points A, B, C:
cross = (B.x - A.x) × (C.y - A.y) - (C.x - A.x) × (B.y - A.y)
distance = |cross| / √[(C.x - A.x)² + (C.y - A.y)²]

if distance < threshold:
    points are collinear
```

---

## Performance Optimizations

### Spatial Indexing

**Grid-Based Lookup:**
- O(1) vector field access
- Memory layout: row-major order
- Cache-friendly access patterns

### Numerical Precision

**Coordinate Rounding:**
```
rounded = round(value × 10^precision) / 10^precision
```

**Floating Point Optimization:**
- Use single precision where possible
- Avoid expensive operations (sqrt, trigonometric functions) in inner loops
- Pre-compute static values

### Memory Layout

**Structure of Arrays (SoA) vs Array of Structures (AoS):**
```
// Preferred for vectorization
positions_x = Float32Array(numParticles)
positions_y = Float32Array(numParticles)

// vs
particles = Array({x, y, vx, vy, ...})
```

---

## Mathematical Constants and Relationships

### Key Constants
```
TWO_PI = 2π ≈ 6.28318530718
FIELD_SCALE_RANGE = [0.001, 0.05]
STEP_SIZE_RANGE = [1, 50]
RESOLUTION_RANGE = [10, 100]
```

### Parameter Relationships
```
gridCells = (width × height) / stepSize²
computationalComplexity = O(numPaths × resolution × lookupTime)
memoryUsage = O(gridCells + numPaths × resolution)
```

### Numerical Stability
```
Minimum stepSize: 0.1 (prevents infinite loops)
Maximum fieldScale: 0.1 (prevents chaos)
Repulsion safety: terminate if distance < 0.1 × radius
```

---

This mathematical foundation enables precise control over the generative art system while maintaining computational efficiency and numerical stability. Each component builds upon established mathematical principles while being optimized for real-time interactive use.