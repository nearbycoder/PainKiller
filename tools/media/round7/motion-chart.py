"""R7-1 chart: drawn camera speed on each displayed frame while walking at 10 m/s, before
(interpolation off) and after, at 144 Hz and at 60 Hz with ±3 ms of frame-time jitter.

    python3 tools/media/round7/motion-chart.py artifacts/r7/motion.json artifacts/r7/motion.svg
    magick -density 144 artifacts/r7/motion.svg docs/media/improvements/round7/r7-1-motion.jpg
"""
import json
import sys

data = json.load(open(sys.argv[1]))["tools/media/round7/motion-data.js"]
W, H = 960, 520
SURFACE, INK, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
COLOURS = {"before": "#eb6834", "after": "#2a78d6"}
YMAX = 25
panels = [
    ("144", "144 Hz display"),
    ("60j", "60 Hz, ±3 ms frame jitter"),
]
out = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Barlow Condensed, DejaVu Sans Condensed, sans-serif">',
    f'<rect width="{W}" height="{H}" fill="{SURFACE}"/>',
    f'<text x="32" y="38" font-size="22" font-weight="600" fill="{INK}">How far the camera moves on each displayed frame, walking at 10 m/s</text>',
    f'<text x="32" y="62" font-size="15" fill="{MUTED}">Drawn speed per frame (m/s), 48 consecutive frames. Before round 7 frames between simulation steps showed no movement.</text>',
]
left, top, pw, ph, gapx, gapy = 80, 100, 400, 150, 60, 70
for c, (key, title) in enumerate(panels):
    for r, mode in enumerate(["before", "after"]):
        x0 = left + c * (pw + gapx)
        y0 = top + r * (ph + gapy)
        frames = data[f"{key}-{mode}"]
        speeds = [f["m"] / (f["ms"] / 1000) for f in frames]
        frozen = sum(1 for s in speeds if s < 1e-6)
        label = "Before" if mode == "before" else "After"
        out.append(
            f'<text x="{x0}" y="{y0 - 12}" font-size="15" fill="{INK}"><tspan font-weight="600">{label}</tspan> · {title} · {frozen} of {len(speeds)} frozen</text>'
        )
        y = lambda v: y0 + ph - v / YMAX * ph
        for v in (0, 10, 20):
            out.append(
                f'<line x1="{x0}" x2="{x0 + pw}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{GRID}" stroke-width="1"/>'
            )
            if c == 0:
                out.append(
                    f'<text x="{x0 - 8}" y="{y(v) + 4:.1f}" font-size="12" fill="{MUTED}" text-anchor="end">{v}</text>'
                )
        bw = pw / len(speeds)
        for i, s in enumerate(speeds):
            h = max(0.0, s) / YMAX * ph
            if h <= 0:
                continue
            out.append(
                f'<rect x="{x0 + i * bw + 1:.1f}" y="{y0 + ph - h:.1f}" width="{bw - 2:.1f}" height="{h:.1f}" rx="2" fill="{COLOURS[mode]}"/>'
            )
        out.append(
            f'<line x1="{x0}" x2="{x0 + pw}" y1="{y(10):.1f}" y2="{y(10):.1f}" stroke="{INK}" stroke-width="1" stroke-dasharray="4 3"/>'
        )
        out.append(
            f'<line x1="{x0}" x2="{x0 + pw}" y1="{y0 + ph}" y2="{y0 + ph}" stroke="{MUTED}" stroke-width="1"/>'
        )
out.append(
    f'<text x="{left - 8}" y="{H - 14}" font-size="12" fill="{MUTED}">m/s · dashed line: walking speed · synthetic frame timing in the real frame loop (tests/round7-checks.js)</text>'
)
out.append("</svg>")
open(sys.argv[2], "w").write("\n".join(out))
