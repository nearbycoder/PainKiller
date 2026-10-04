import { describe, it, expect } from "vitest";
import { enemyModel } from "../src/models";
import { ENEMY_TYPES } from "../src/data";
describe("enemy geometry batching", () => {
  for (const type of [...ENEMY_TYPES, "boss"] as const)
    it(`preserves the body and four animated limbs of ${type}`, () => {
      const model = enemyModel(type);
      expect(model.root.children[0].children.length).toBeGreaterThan(0);
      expect(model.limbs).toHaveLength(4);
      for (const limb of model.limbs)
        expect(limb.children.length).toBeGreaterThan(0);
      model.dispose();
    });
});
