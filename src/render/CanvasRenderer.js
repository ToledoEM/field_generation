export class CanvasRenderer {
  constructor(p5Instance, config) {
    this.p5 = p5Instance;
    this.config = config;
  }

  draw(paths, paletteColors) {
    const p = this.p5;
    // Support dynamic background color from config
    const bg = this.config.backgroundColor || '#FFFFFF';
    // p5 can accept a hex string directly
    p.background(bg);
    p.noFill();
    p.strokeWeight(this.config.strokeWeight);
    for (let i = 0; i < paths.length; i++) {
      const color = paletteColors[i % paletteColors.length];
      p.stroke(color);
      p.beginShape();
      const path = paths[i];
      for (const pt of path) {
        p.vertex(pt.x, pt.y);
      }
      p.endShape();
    }
  }
}
