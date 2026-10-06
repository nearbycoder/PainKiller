import * as T from "three";
import { rng } from "./core";
import type { Theme } from "./data";

/**
 * Procedural ground for the compact arenas. Each canvas covers 4 × 4 m, matching the
 * arena box UVs. Textures are shared between arenas and live for the session.
 */
export type GroundKind =
  | "flagstone"
  | "tile"
  | "marble"
  | "planks"
  | "parquet"
  | "snow"
  | "sand"
  | "mud"
  | "cobble"
  | "basalt"
  | "concrete"
  | "dirt";

export const THEME_GROUND: Partial<Record<Theme, GroundKind>> = {
  prison: "flagstone",
  asylum: "tile",
  opera: "parquet",
  snow: "snow",
  town: "cobble",
  swamp: "mud",
  station: "concrete",
  military: "dirt",
  ruins: "sand",
  castle: "flagstone",
  palace: "marble",
  babel: "sand",
  forest: "mud",
  tower: "flagstone",
  water: "cobble",
  docks: "planks",
  monastery: "flagstone",
  hell: "basalt",
};

const SIZE = 512;
const cache = new Map<
  string,
  { map: T.CanvasTexture; glow?: T.CanvasTexture }
>();

function canvas() {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  return { c, x: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement, color = true) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  if (color) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Sprinkle fine grain so flat colours do not read as plastic. */
function grain(
  x: CanvasRenderingContext2D,
  random: () => number,
  count: number,
  tones: string[],
  size = 2,
) {
  for (let i = 0; i < count; i++) {
    x.fillStyle = tones[Math.floor(random() * tones.length)];
    x.globalAlpha = 0.05 + random() * 0.12;
    x.fillRect(
      random() * SIZE,
      random() * SIZE,
      size * random() + 1,
      size * random() + 1,
    );
  }
  x.globalAlpha = 1;
}

function draw(
  kind: GroundKind,
  random: () => number,
  x: CanvasRenderingContext2D,
  glow?: CanvasRenderingContext2D,
) {
  const fill = (c: string) => {
    x.fillStyle = c;
    x.fillRect(0, 0, SIZE, SIZE);
  };
  if (kind === "tile" || kind === "marble") {
    // 0.5 m tiles; asylum tiles are pale and grimy, palace marble alternates.
    const n = kind === "tile" ? 8 : 4,
      s = SIZE / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const dark = kind === "marble" && (i + j) % 2 === 1;
        const v = random() * 14;
        x.fillStyle =
          kind === "tile"
            ? `rgb(${178 + v},${188 + v},${176 + v})`
            : dark
              ? `rgb(${92 + v},${80 + v},${86 + v})`
              : `rgb(${176 + v},${168 + v},${154 + v})`;
        x.fillRect(i * s, j * s, s, s);
        if (kind === "marble") {
          x.strokeStyle = dark ? "#8a7a8a55" : "#9b8e7a55";
          x.lineWidth = 1.5;
          x.beginPath();
          x.moveTo(i * s + random() * s, j * s);
          for (let k = 0; k < 4; k++)
            x.lineTo(i * s + random() * s, j * s + ((k + 1) * s) / 4);
          x.stroke();
        }
      }
    x.strokeStyle = kind === "tile" ? "#5d6a62" : "#2a2420";
    x.lineWidth = kind === "tile" ? 3 : 2;
    for (let i = 0; i <= n; i++) {
      x.beginPath();
      x.moveTo(i * s, 0);
      x.lineTo(i * s, SIZE);
      x.moveTo(0, i * s);
      x.lineTo(SIZE, i * s);
      x.stroke();
    }
    if (kind === "tile")
      for (let i = 0; i < 26; i++) {
        // Water stains and cracked tiles.
        const g = x.createRadialGradient(0, 0, 0, 0, 0, 40 + random() * 60);
        g.addColorStop(0, "#5c4a2a30");
        g.addColorStop(1, "#5c4a2a00");
        x.save();
        x.translate(random() * SIZE, random() * SIZE);
        x.fillStyle = g;
        x.fillRect(-100, -100, 200, 200);
        x.restore();
      }
    grain(x, random, 9000, ["#000", "#fff"]);
  } else if (kind === "planks" || kind === "parquet") {
    fill("#3b2a1c");
    if (kind === "planks") {
      const w = SIZE / 16;
      for (let i = 0; i < 16; i++) {
        let y = -random() * 200;
        while (y < SIZE) {
          const len = 140 + random() * 260,
            v = random() * 26;
          x.fillStyle = `rgb(${84 + v},${62 + v * 0.8},${42 + v * 0.5})`;
          x.fillRect(i * w + 1, y + 1, w - 2, len - 2);
          for (let k = 0; k < 5; k++) {
            x.strokeStyle = "#2a1c1230";
            x.beginPath();
            const gx = i * w + 3 + random() * (w - 6);
            x.moveTo(gx, y);
            x.lineTo(gx + random() * 4 - 2, y + len);
            x.stroke();
          }
          x.fillStyle = "#1e140c";
          x.fillRect(i * w + w / 2 - 2, y + 8, 4, 4);
          y += len;
        }
      }
    } else {
      // Herringbone parquet in 0.25 m blocks.
      const s = SIZE / 16;
      for (let i = -2; i < 18; i++)
        for (let j = -2; j < 18; j++) {
          const v = random() * 24;
          x.fillStyle = `rgb(${108 + v},${70 + v * 0.7},${44 + v * 0.4})`;
          if ((i + j) % 2 === 0)
            x.fillRect(i * s + 1, j * s + 1, s * 2 - 2, s - 2);
          else x.fillRect(i * s + 1, j * s + 1, s - 2, s * 2 - 2);
        }
    }
    grain(x, random, 7000, ["#000", "#d9b98a"]);
  } else if (kind === "snow") {
    fill("#d5dde4");
    for (let i = 0; i < 140; i++) {
      const r = 20 + random() * 70,
        g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, random() > 0.5 ? "#ffffff70" : "#a9b8c870");
      g.addColorStop(1, "#ffffff00");
      x.save();
      x.translate(random() * SIZE, random() * SIZE);
      x.scale(1, 0.6);
      x.fillStyle = g;
      x.fillRect(-r, -r, r * 2, r * 2);
      x.restore();
    }
    // Footprints and wind ripples.
    x.strokeStyle = "#9fb0c040";
    for (let i = 0; i < 40; i++) {
      x.lineWidth = 2 + random() * 3;
      x.beginPath();
      const y = random() * SIZE;
      x.moveTo(0, y);
      x.bezierCurveTo(
        SIZE / 3,
        y + random() * 30 - 15,
        (2 * SIZE) / 3,
        y + random() * 30 - 15,
        SIZE,
        y,
      );
      x.stroke();
    }
    grain(x, random, 9000, ["#fff", "#8ea0b2"]);
  } else if (kind === "sand") {
    fill("#b39567");
    x.lineWidth = 3;
    for (let y = 0; y < SIZE; y += 9) {
      x.strokeStyle = y % 18 ? "#8f744c55" : "#e0c79a40";
      x.beginPath();
      for (let px = 0; px <= SIZE; px += 16)
        x.lineTo(px, y + Math.sin((px / SIZE) * Math.PI * 4 + y * 0.07) * 6);
      x.stroke();
    }
    grain(x, random, 16000, ["#5e4a30", "#f1dcb2"]);
  } else if (kind === "mud" || kind === "dirt") {
    fill(kind === "mud" ? "#2f3122" : "#4f4231");
    for (let i = 0; i < 220; i++) {
      const r = 8 + random() * 50,
        g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      const tone =
        kind === "mud"
          ? ["#1c1f14", "#4a4c2c", "#3e3a24", "#22301e"]
          : ["#3b3022", "#6a5840", "#57492f", "#2f281e"];
      g.addColorStop(0, tone[Math.floor(random() * 4)] + "a0");
      g.addColorStop(1, tone[0] + "00");
      x.save();
      x.translate(random() * SIZE, random() * SIZE);
      x.fillStyle = g;
      x.fillRect(-r, -r, r * 2, r * 2);
      x.restore();
    }
    if (kind === "mud")
      for (let i = 0; i < 120; i++) {
        // Fallen leaves and moss.
        x.fillStyle = ["#5b4a22", "#6e5a28", "#3f5a2a"][
          Math.floor(random() * 3)
        ];
        x.save();
        x.translate(random() * SIZE, random() * SIZE);
        x.rotate(random() * Math.PI);
        x.beginPath();
        x.ellipse(0, 0, 5 + random() * 5, 2 + random() * 2, 0, 0, Math.PI * 2);
        x.fill();
        x.restore();
      }
    else
      for (let i = 0; i < 18; i++) {
        // Boot-churned ruts.
        x.strokeStyle = "#2a221840";
        x.lineWidth = 6 + random() * 10;
        x.beginPath();
        x.moveTo(random() * SIZE, 0);
        x.lineTo(random() * SIZE, SIZE);
        x.stroke();
      }
    grain(x, random, 14000, ["#000", "#9a8a6a"]);
  } else if (kind === "cobble") {
    fill("#262421");
    const s = SIZE / 16;
    for (let j = 0; j < 17; j++)
      for (let i = 0; i < 17; i++) {
        const v = random() * 30,
          ox = (j % 2) * (s / 2);
        x.fillStyle = `rgb(${92 + v},${86 + v},${78 + v})`;
        x.beginPath();
        x.ellipse(
          i * s + ox - s / 2 + random() * 3,
          j * s + random() * 3,
          s * 0.44,
          s * 0.4,
          random(),
          0,
          Math.PI * 2,
        );
        x.fill();
        x.fillStyle = "#ffffff18";
        x.beginPath();
        x.ellipse(
          i * s + ox - s / 2 - 3,
          j * s - 3,
          s * 0.2,
          s * 0.14,
          0,
          0,
          Math.PI * 2,
        );
        x.fill();
      }
    grain(x, random, 8000, ["#000", "#c8bca4"]);
  } else if (kind === "concrete") {
    fill("#77746c");
    for (let i = 0; i < 160; i++) {
      const r = 20 + random() * 80,
        g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, random() > 0.5 ? "#5a574f50" : "#8f8b8140");
      g.addColorStop(1, "#77746c00");
      x.save();
      x.translate(random() * SIZE, random() * SIZE);
      x.fillStyle = g;
      x.fillRect(-r, -r, r * 2, r * 2);
      x.restore();
    }
    // Expansion joints every 2 m.
    x.strokeStyle = "#3b3934";
    x.lineWidth = 3;
    for (const p of [0, SIZE / 2]) {
      x.beginPath();
      x.moveTo(p, 0);
      x.lineTo(p, SIZE);
      x.moveTo(0, p);
      x.lineTo(SIZE, p);
      x.stroke();
    }
    grain(x, random, 16000, ["#000", "#fff"]);
  } else if (kind === "basalt") {
    fill("#1c1716");
    const cracks: [number, number, number, number][] = [];
    for (let i = 0; i < 46; i++) {
      let px = random() * SIZE,
        py = random() * SIZE;
      for (let k = 0; k < 6; k++) {
        const nx = px + (random() - 0.5) * 90,
          ny = py + (random() - 0.5) * 90;
        cracks.push([px, py, nx, ny]);
        px = nx;
        py = ny;
      }
    }
    for (let i = 0; i < 160; i++) {
      x.fillStyle = `rgba(${40 + random() * 30},${30 + random() * 20},${28 + random() * 18},.5)`;
      x.fillRect(
        random() * SIZE,
        random() * SIZE,
        10 + random() * 40,
        10 + random() * 40,
      );
    }
    for (const ctx of [x, glow]) {
      if (!ctx) continue;
      if (ctx === glow) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, SIZE, SIZE);
      }
      ctx.lineCap = "round";
      for (const [ax, ay, bx, by] of cracks) {
        ctx.strokeStyle = ctx === glow ? "#ff6a24" : "#5a1c0c";
        ctx.lineWidth = ctx === glow ? 2.2 : 4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    grain(x, random, 10000, ["#000", "#6a5a50"]);
  } else {
    // Flagstones: irregular courses of slabs with dark joints.
    fill("#2b2926");
    let y = 0;
    while (y < SIZE) {
      const h = 60 + random() * 70;
      let px = -random() * 80;
      while (px < SIZE) {
        const w = 70 + random() * 110,
          v = random() * 26;
        x.fillStyle = `rgb(${86 + v},${84 + v},${78 + v})`;
        x.fillRect(px + 3, y + 3, w - 6, h - 6);
        px += w;
      }
      y += h;
    }
    grain(x, random, 12000, ["#000", "#d0c8b6"]);
  }
}

export function ground(kind: GroundKind) {
  if (!cache.has(kind)) {
    const random = rng(911 + kind.length * 131 + kind.charCodeAt(0));
    const base = canvas(),
      glow = kind === "basalt" ? canvas() : undefined;
    draw(kind, random, base.x, glow?.x);
    cache.set(kind, {
      map: texture(base.c),
      glow: glow ? texture(glow.c) : undefined,
    });
  }
  return cache.get(kind)!;
}

/** Material settings that go with each ground. */
export const GROUND_SURFACE: Record<
  GroundKind,
  { roughness: number; metalness?: number; tint?: number }
> = {
  flagstone: { roughness: 0.92 },
  tile: { roughness: 0.42 },
  marble: { roughness: 0.28, metalness: 0.05 },
  planks: { roughness: 0.86 },
  parquet: { roughness: 0.55 },
  snow: { roughness: 0.78 },
  sand: { roughness: 1 },
  mud: { roughness: 0.66 },
  cobble: { roughness: 0.8 },
  basalt: { roughness: 0.9 },
  concrete: { roughness: 0.94 },
  dirt: { roughness: 1 },
};
