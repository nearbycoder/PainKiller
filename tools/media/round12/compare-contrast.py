"""Compare two runs of round 9's HUD contrast reader reading by reading.

    python3 tools/media/round12/compare-contrast.py before-contrast.json after-contrast.json

Prints the worst reading per arena and label group before and after, how many readings
fell by more than 0.3 (the noise between runs of the same code), and the lowest readings.
"""
import json
import sys
from collections import defaultdict

SMALL = {"health label", "armor label", "souls", "ammo label", "alt label", "card",
         "chapter", "gate", "objective", "slain", "remaining", "level"}
before, after = (json.load(open(f)) for f in sys.argv[1:3])
key = lambda r: (r["level"], r["heading"], r["label"])
old = {key(r): r for r in before}
groups = defaultdict(lambda: [[], []])
fell = []
for r in after:
    o = old.get(key(r))
    if not o:
        continue
    arena = r["level"].split(" · ")[0]
    group = "small labels" if r["label"] in SMALL else "numbers and messages"
    groups[(arena, group)][0].append(o["contrast"])
    groups[(arena, group)][1].append(r["contrast"])
    if r["contrast"] < o["contrast"] - 0.3:
        fell.append((round(o["contrast"] - r["contrast"], 2), r["level"], r["label"], o["contrast"], r["contrast"]))
for (arena, group), (b, a) in sorted(groups.items()):
    print(f"{arena:22} {group:22} worst {min(b):5.1f} -> {min(a):5.1f}   best {max(b):5.1f} -> {max(a):5.1f}")
print(f"{len(fell)} of {len(after)} readings fell by more than 0.3")
for f in sorted(fell, reverse=True)[:12]:
    print("  ", f)
small = [r for r in after if r["label"] in SMALL]
other = [r for r in after if r["label"] not in SMALL]
print("small labels under 3:1 after:", sum(r["contrast"] < 3 for r in small), "of", len(small))
print("numbers/messages under 4.5:1 after:", sum(r["contrast"] < 4.5 for r in other), "of", len(other))
