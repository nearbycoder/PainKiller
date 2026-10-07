// Launches the desktop build twice in an isolated profile (artifacts/window-check):
// the first launch resizes its window and closes; the second must open at that size.
// Then a malformed window.json must give the default window. Needs `npm run build`.
//   npm run test:desktop-window
// Maximized and fullscreen are never tried here: test windows must not cover the
// shared desktop (tests/window-state.test.ts covers them).
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "artifacts/window-check");
const stateFile = path.join(dir, "profile/window.json");
fs.rmSync(dir, { recursive: true, force: true });

function launch(step) {
  const run = spawnSync(electron, [".", "--window-check", step], {
    cwd: root,
    env: { ...process.env, PURGATORY_SMOKE_DIR: dir },
    encoding: "utf8",
    timeout: 60000,
  });
  const reports = {};
  for (const line of (run.stdout || "").split("\n"))
    if (line.startsWith("WINDOW_CHECK ")) {
      const r = JSON.parse(line.slice(13));
      reports[r.label] = r.bounds;
    }
  return reports;
}

const failures = [];
const expect = (ok, message) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
};

const first = launch("move");
expect(first.opened && first.moved, "first launch opened and resized");
const saved = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
  : null;
expect(!!saved, "window.json written on close: " + JSON.stringify(saved));
const second = launch("verify");
const size = (b) => b && `${b.width}x${b.height}`;
expect(
  !!second.opened && size(second.opened) === size(first.moved),
  `second launch opened at ${size(second.opened)}, closed at ${size(first.moved)}`,
);
// Positions are only checked where the platform reports them (not on Wayland).
if (first.moved && (first.moved.x || first.moved.y))
  expect(
    second.opened.x === first.moved.x && second.opened.y === first.moved.y,
    `position ${second.opened.x},${second.opened.y} vs ${first.moved.x},${first.moved.y}`,
  );
else console.log("     (no window position reported; size only)");
fs.writeFileSync(stateFile, "{ not json");
const third = launch("verify");
expect(
  !!third.opened &&
    third.opened.width >= 960 &&
    size(third.opened) !== size(first.moved),
  `malformed window.json opened the default window (${size(third.opened)})`,
);
process.exit(failures.length ? 1 : 0);
