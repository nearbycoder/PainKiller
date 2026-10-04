import { describe, it, expect } from "vitest";
import { parseSettings, defaults } from "../src/settings";
describe("persistent game options", () => {
  it("migrates the previous settings without losing mute or difficulty", () => {
    const s = parseSettings(
      '{"volume":0,"music":false,"difficulty":2,"sensitivity":0.004}',
    );
    expect(s.volume).toBe(0);
    expect(s.music).toBe(false);
    expect(s.difficulty).toBe(2);
    expect(s.sensitivity).toBe(0.004);
    expect(s.quality).toBe(defaults.quality);
  });
  it("rejects malformed values that could break rendering or input", () => {
    const s = parseSettings(
      '{"quality":99,"renderScale":0,"brightness":-2,"volume":"loud","invertY":"false","fov":null,"difficulty":1.6}',
    );
    expect(s.quality).toBe(2);
    expect(s.renderScale).toBe(0.5);
    expect(s.brightness).toBe(0.65);
    expect(s.volume).toBe(defaults.volume);
    expect(s.invertY).toBe(false);
    expect(s.fov).toBe(80);
    expect(s.difficulty).toBe(2);
    expect(parseSettings("null")).toEqual(defaults);
    expect(parseSettings("broken")).toEqual(defaults);
  });
  it("round trips all options including disabled visual aids and silent audio buses", () => {
    const s = {
      ...defaults,
      headBob: false,
      crosshair: false,
      musicVolume: 0,
      effectsVolume: 0,
      invertY: true,
      quality: 0,
    };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
});
