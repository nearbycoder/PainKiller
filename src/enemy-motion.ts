import type { EnemyType } from "./data";

/** Layered, time-based motion shared by authored and articulated enemy rigs. */
export class EnemyMotion {
  phase: number;
  age = 0;
  gait = 0;
  attack = 99;
  variant = 0;
  casting = false;
  hit = 0;
  turn = 0;
  constructor(
    readonly type: EnemyType,
    seed = Math.random(),
  ) {
    this.phase = seed * Math.PI * 2;
    this.age = seed * 4;
  }
  action(name: "attack" | "cast" | "hit" | "death") {
    if (name === "attack" || name === "cast") {
      this.attack = 0;
      this.variant = (this.variant + 1) % 3;
      this.casting = name === "cast";
    }
    if (name === "hit") this.hit = 1;
  }
  step(dt: number, speed: number, frozen = false) {
    if (!frozen) {
      this.age += dt;
      this.attack += dt;
      this.hit *= Math.exp(-dt * 9);
      this.gait +=
        (Math.min(1, Math.abs(speed) / 2.5) - this.gait) *
        (1 - Math.exp(-dt * 10));
      this.phase +=
        dt *
        Math.abs(speed) *
        (this.type === "hound" ? 3.6 : this.type === "boss" ? 1.5 : 2.8);
    }
    const hound = this.type === "hound",
      heavy = this.type === "brute" || this.type === "boss",
      caster = this.type === "monk" || this.type === "witch";
    const p = this.phase,
      gait = this.gait,
      breathe = Math.sin(this.age * 2.1),
      duration = hound ? 0.55 : heavy ? 1.05 : 0.8;
    const t = this.attack / duration;
    // Anticipation reaches maximum at the melee wind-up; follow-through then settles.
    const wind =
      t < 0.38
        ? Math.sin(((t / 0.38) * Math.PI) / 2)
        : Math.max(0, 1 - (t - 0.38) / 0.12);
    const strike =
      t >= 0.3 && t < 0.72 ? Math.sin(((t - 0.3) / 0.42) * Math.PI) : 0;
    const attack = t < 1 ? Math.sin(Math.PI * t) : 0;
    const cast = this.casting ? Math.exp(-this.attack * 5) : 0;
    const left = this.variant === 1 ? -1 : 1;
    const arms = [0, 1].map((i) => {
      const side = i ? 1 : -1,
        swing = Math.sin(p + (i ? Math.PI : 0)) * 0.5 * gait;
      if (caster)
        return [
          -0.3 - cast * 1.6 + swing * 0.15,
          side * (0.12 + cast * 0.45),
          side * (0.18 + cast * 0.5),
        ] as const;
      const chosen = this.variant === 2 || side === left;
      return [
        swing +
          (chosen
            ? wind * 0.7 - strike * (heavy ? 2.0 : 1.65)
            : -0.35 * attack),
        side * 0.08 + strike * left * 0.3,
        side * (0.08 + wind * 0.18),
      ] as const;
    });
    return {
      bob:
        (hound
          ? Math.sin(p * 2) * 0.065
          : Math.abs(Math.sin(p)) * (heavy ? 0.055 : 0.035)) *
          gait +
        breathe * 0.009 -
        (hound ? strike * 0.12 : wind * 0.055),
      lean:
        (hound ? -0.07 : heavy ? 0.09 : 0.025) +
        gait * 0.065 +
        wind * 0.12 -
        strike * 0.2 +
        this.hit * 0.18,
      roll:
        Math.sin(p) * gait * (heavy ? 0.075 : 0.045) +
        Math.sin(this.age * 0.8) * 0.018 +
        strike * left * 0.08,
      twist:
        Math.sin(p) * gait * 0.07 + wind * left * 0.18 - strike * left * 0.3,
      headX: breathe * 0.025 - wind * 0.12 + strike * 0.16,
      headY: Math.sin(this.age * 0.73) * 0.07 + this.turn * 0.55,
      arms,
      legs: [0, 1, 2, 3].map(
        (i) =>
          Math.sin(
            p +
              (hound
                ? i === 0 || i === 3
                  ? 0
                  : Math.PI
                : i % 2
                  ? Math.PI
                  : 0),
          ) *
          (hound ? 0.72 : 0.55) *
          gait,
      ),
      knees: [0, 1, 2, 3].map(
        (i) => Math.max(0, Math.cos(p + (i % 2 ? Math.PI : 0))) * gait * 0.8,
      ),
      elbows: [
        0.18 + Math.max(0, wind) * 0.9 + strike * 0.3,
        0.18 + Math.max(0, wind) * 0.7 + strike * 0.4,
      ],
      tail: Math.sin(this.age * 4 + p * 0.2) * 0.25,
      attack,
      strike,
      cast,
    };
  }
}
