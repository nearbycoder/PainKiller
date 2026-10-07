# R6-3: contrast of the default crosshair against the pixels touching it and the background
# 4 px away, in a 1280x800 PNG capture (crosshair centred at 640, 400).
#   python3 tools/media/round6/crosshair-contrast.py capture.png [...]
import subprocess, sys
def load(path):
    out = subprocess.run(["magick", path, "-crop", "40x40+620+380", "+repage", "-depth", "8", "rgb:-"], capture_output=True).stdout
    return lambda x, y: out[((y - 380) * 40 + (x - 620)) * 3:((y - 380) * 40 + (x - 620)) * 3 + 3]
def lum(p):
    c = [v / 255 for v in p]
    c = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    a, b = max(a, b), min(a, b)
    return (a + 0.05) / (b + 0.05)
def measure(path):
    px = load(path)
    mark, touch, back = [], [], []
    for x in list(range(628, 634)) + list(range(646, 652)):
        mark.append(lum(px(x, 400))); touch += [lum(px(x, 399)), lum(px(x, 401))]; back += [lum(px(x, 396)), lum(px(x, 404))]
    for y in list(range(388, 394)) + list(range(406, 412)):
        mark.append(lum(px(640, y))); touch += [lum(px(639, y)), lum(px(641, y))]; back += [lum(px(636, y)), lum(px(644, y))]
    m = sum(mark) / len(mark); t = sum(touch) / len(touch); b = sum(back) / len(back)
    return m, t, b
for path in sys.argv[1:]:
    m, t, b = measure(path)
    print(f"{path}: mark L={m:.3f} touching L={t:.3f} background L={b:.3f}  mark:touching {ratio(m, t):.2f}:1  mark:background {ratio(m, b):.2f}:1  edge(touching:background) {ratio(t, b):.2f}:1")
