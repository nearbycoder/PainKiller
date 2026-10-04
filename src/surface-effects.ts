import * as T from "three";

/** Shared soft particle mask. Created once, with no texture downloads. */
export function softParticleTexture() {
  const size = 32,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(
        ((x + 0.5) / size) * 2 - 1,
        ((y + 0.5) / size) * 2 - 1,
      );
      const a = Math.pow(Math.max(0, 1 - r), 2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  const texture = new T.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** A single bounded draw call for airborne ash, dust or snow in every arena. */
export class Atmosphere {
  private positions = new Float32Array(128 * 3);
  private seeds = new Float32Array(128);
  private geometry = new T.BufferGeometry();
  private material = new T.PointsMaterial({
    map: softParticleTexture(),
    color: 0xb7b3a2,
    size: 0.095,
    transparent: true,
    alphaTest: 0.01,
    opacity: 0.26,
    depthWrite: false,
  });
  private points = new T.Points(this.geometry, this.material);
  private snow = false;
  private age = 0;
  constructor(scene: T.Scene) {
    for (let i = 0; i < 128; i++) {
      this.seeds[i] = Math.random() * 6.28;
      this.positions.set(
        [Math.random() * 44 - 22, Math.random() * 10, Math.random() * 44 - 22],
        i * 3,
      );
    }
    this.geometry.setAttribute(
      "position",
      new T.BufferAttribute(this.positions, 3),
    );
    this.points.frustumCulled = false;
    this.points.layers.set(1);
    scene.add(this.points);
  }
  setTheme(theme: string) {
    this.snow = theme === "snow";
    const ash = theme === "factory" || theme === "hell";
    this.material.color.set(this.snow ? 0xe4eaf0 : ash ? 0xbb8660 : 0xb7b3a2);
    this.material.size = this.snow ? 0.16 : 0.085;
    this.material.opacity = this.snow ? 0.6 : 0.24;
  }
  update(dt: number, center: T.Vector3) {
    this.age += dt;
    for (let i = 0; i < 128; i++) {
      const j = i * 3;
      this.positions[j] +=
        Math.sin(this.age * 0.25 + this.seeds[i]) * dt * 0.13;
      this.positions[j + 1] -= dt * (this.snow ? 0.7 : 0.045);
      for (const axis of [0, 2]) {
        const c = axis === 0 ? center.x : center.z;
        if (this.positions[j + axis] < c - 22) this.positions[j + axis] += 44;
        if (this.positions[j + axis] > c + 22) this.positions[j + axis] -= 44;
      }
      if (this.positions[j + 1] < 0.2) this.positions[j + 1] = 10;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}
