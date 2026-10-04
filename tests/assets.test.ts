import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
function glb(name: string) {
  const b = readFileSync(
    new URL(`../public/assets/models/${name}.glb`, import.meta.url),
  );
  expect(b.toString("ascii", 0, 4)).toBe("glTF");
  expect(b.readUInt32LE(8)).toBe(b.length);
  const n = b.readUInt32LE(12),
    json = JSON.parse(b.toString("utf8", 20, 20 + n)),
    binary = b.subarray(28 + n);
  for (const v of json.bufferViews)
    expect((v.byteOffset || 0) + v.byteLength).toBeLessThanOrEqual(
      binary.length,
    );
  return { json, binary };
}
describe("authored production asset contracts", () => {
  it("ships bone-mounted clothing for every humanoid variant within budget", () => {
    const { json: j } = glb("enemy-wardrobe");
    for (const type of ["monk", "witch", "knight", "brute", "boss"]) {
      const parts = j.nodes.filter((n: any) => n.extras?.archetype === type);
      expect(parts.length).toBeGreaterThan(4);
      expect(
        parts.every((n: any) => n.extras.bone.startsWith("CityDeadOutfit")),
      ).toBe(true);
    }
    const triangles = j.meshes.reduce(
      (sum: number, m: any) =>
        sum +
        m.primitives.reduce(
          (n: number, p: any) => n + j.accessors[p.indices].count / 3,
          0,
        ),
      0,
    );
    expect(triangles).toBeLessThan(30000);
  });
  for (const name of ["revenant", "skeleton"])
    it(`${name} stays within the animated mesh budget`, () => {
      const { json: j } = glb(name);
      const triangles = j.meshes.reduce(
        (sum: number, m: any) =>
          sum +
          m.primitives.reduce(
            (n: number, p: any) => n + j.accessors[p.indices].count / 3,
            0,
          ),
        0,
      );
      expect(triangles).toBeLessThan(18000);
      expect(j.skins.length).toBeGreaterThan(0);
      expect(j.animations).toHaveLength(6);
    });
  for (const name of ["cathedral", "crypt", "factory"])
    it(`${name} ships usable geometry, materials, lights and collision markers`, () => {
      const { json: j } = glb(name);
      expect(
        j.nodes.filter((n: any) => n.extras?.collision).length,
      ).toBeGreaterThan(8);
      expect(j.nodes.filter((n: any) => n.extras?.light).length).toBe(6);
      expect(j.materials.some((m: any) => m.normalTexture)).toBe(true);
      expect(j.meshes.length).toBeGreaterThan(50);
      if (name === "factory")
        expect(
          j.nodes.filter(
            (n: any) =>
              n.name.startsWith("Generator stator") && n.extras?.collision,
          ).length,
        ).toBe(6);
    });
  it("ships six distinct, animated skeletal clips with actual bone movement", () => {
    const { json: j, binary } = glb("revenant");
    expect(j.skins.length).toBeGreaterThan(0);
    for (const name of ["walk", "run", "idle", "attack", "hit", "death"]) {
      const clip = j.animations.find((a: any) => a.name === name);
      expect(clip).toBeTruthy();
      const ch = clip.channels.find(
        (c: any) =>
          j.nodes[c.target.node].name.endsWith("LeftArm") &&
          c.target.path === "rotation",
      );
      const a = j.accessors[clip.samplers[ch.sampler].output],
        v = j.bufferViews[a.bufferView];
      expect(a.count).toBeGreaterThan(2);
      const values = Array.from({ length: a.count }, (_, i) =>
        binary.readFloatLE((v.byteOffset || 0) + (a.byteOffset || 0) + i * 16),
      );
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.001);
    }
  });
  it("keeps collision and light markers with the authored cemetery", () => {
    const { json: j } = glb("cemetery");
    expect(j.nodes.filter((n: any) => n.extras?.collision).length).toBe(48);
    expect(j.nodes.filter((n: any) => n.extras?.light).length).toBe(6);
    expect(j.materials.some((m: any) => m.normalTexture)).toBe(true);
    const triangles = j.meshes.reduce(
      (sum: number, m: any) =>
        sum +
        m.primitives.reduce(
          (n: number, p: any) => n + j.accessors[p.indices].count / 3,
          0,
        ),
      0,
    );
    expect(triangles).toBeLessThan(350_000);
  });
  for (let id = 0; id < 5; id++)
    it(`weapon ${id + 1} includes shaped construction and textured materials`, () => {
      const { json: j } = glb(`weapon-${id}`);
      expect(j.meshes.length).toBeGreaterThan(20);
      expect(
        j.materials.some((m: any) => m.pbrMetallicRoughness?.baseColorTexture),
      ).toBe(true);
      for (const metal of ["steel", "iron", "brass"]) {
        const m = j.materials.find((m: any) => m.name === `Armory / ${metal}`);
        expect(m, `Missing aged ${metal} material`).toBeTruthy();
        expect(m.normalTexture).toBeTruthy();
        expect(m.pbrMetallicRoughness.baseColorTexture).toBeTruthy();
        expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toBeTruthy();
      }
      if (id === 0 || id === 3)
        expect(j.nodes.some((n: any) => n.name === "rotor")).toBe(true);
    });
});
