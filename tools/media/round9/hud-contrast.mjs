// Contrast of HUD text against what is right around it, from the frame pairs written by
// tools/media/round9/hud-contrast.js (needs ImageMagick to decode the PNGs).
//   node tools/media/round9/hud-contrast.mjs artifacts/r9/hud/before.json artifacts/r9/hud/before
//
// For each label, the glyph pixels are the fifth of the pixels the HUD changed that are
// nearest the label's colour; the ring is the pixels two pixels out from them. The contrast is the WCAG ratio
// between the median luminance of the two, as the player sees it. "Bare" is the label's
// colour against the arena with no HUD at all.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [reportFile, folder] = process.argv.slice(2);
const report = Object.values(
  JSON.parse(fs.readFileSync(reportFile, "utf8")),
)[0];
const decode = (file) => {
  const size = execFileSync("magick", ["identify", "-format", "%w %h", file])
    .toString()
    .split(" ")
    .map(Number);
  const data = execFileSync("magick", [file, "-depth", "8", "rgb:-"], {
    maxBuffer: 64 << 20,
  });
  return { w: size[0], h: size[1], data };
};
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const rows = [];
for (const [level, entry] of Object.entries(report)) {
  // Round 10's heading frames name their files; round 9's are named by level.
  const file = entry.file || `level-${level}`,
    hud = decode(`${folder}/${file}-hud.png`),
    bare = decode(`${folder}/${file}-bare.png`),
    k = entry.dpr || 1;
  const px = (img, x, y) => {
    const i = (y * img.w + x) * 3;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const [name, items] of Object.entries(entry.boxes)) {
    const core = [],
      ring = [],
      backs = [];
    let color;
    for (const { box, color: c } of items) {
      color = c;
      const [x0, y0, x1, y1] = box.map((v) => Math.round(v * k));
      const changed = [];
      for (let y = Math.max(0, y0); y < Math.min(hud.h, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(hud.w, x1); x++) {
          const v = px(hud, x, y),
            b = px(bare, x, y);
          backs.push(lum(...b));
          if (dist(v, b) > 16) changed.push([dist(v, c), y * hud.w + x]);
        }
      // The fifth of the changed pixels nearest the label's colour: the glyphs' cores,
      // whether the text is lighter or darker than what is behind it.
      changed.sort((a, b) => a[0] - b[0]);
      const inCore = new Set(
        changed
          .slice(0, Math.max(4, Math.ceil(changed.length / 5)))
          .map(([, i]) => i),
      );
      for (const i of inCore) {
        const x = i % hud.w,
          y = (i - x) / hud.w;
        core.push(lum(...px(hud, x, y)));
        for (const [dx, dy] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
          [2, 2],
          [-2, -2],
          [2, -2],
          [-2, 2],
        ]) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= hud.w || ny >= hud.h) continue;
          if (!inCore.has(ny * hud.w + nx)) ring.push(lum(...px(hud, nx, ny)));
        }
      }
    }
    const lc = median(core),
      lr = median(ring);
    rows.push({
      level: entry.name,
      ...(entry.heading !== undefined ? { heading: entry.heading } : {}),
      label: name,
      glyphs: core.length,
      contrast: core.length >= 8 ? +ratio(lc, lr).toFixed(2) : null,
      bare: +ratio(lum(...color), median(backs)).toFixed(2),
      // The glyphs against the scene behind the label's box, halo and shade left out
      // (round 12): steadier when the background itself changes.
      scene: core.length >= 8 ? +ratio(lc, median(backs)).toFixed(2) : null,
    });
  }
}
console.table(rows);
const out = reportFile.replace(/\.json$/, "-contrast.json");
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log("wrote", out);
