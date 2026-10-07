// The desktop window's size, position and display mode, kept between launches in
// window.json next to the campaign save.
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SIZE = { width: 1440, height: 900 };
const MIN_SIZE = { width: 960, height: 600 };

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** A saved state, or null for anything malformed. */
function parseWindowState(raw) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!s || typeof s !== "object" || !s.bounds || typeof s.bounds !== "object")
    return null;
  const { x, y, width, height } = s.bounds;
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0)
    return null;
  return {
    // Wayland compositors place windows themselves and report no position.
    bounds: {
      ...(finite(x) && finite(y) ? { x: Math.round(x), y: Math.round(y) } : {}),
      width: Math.round(width),
      height: Math.round(height),
    },
    maximized: s.maximized === true,
    fullscreen: s.fullscreen === true,
  };
}

/**
 * Where to open the window. `areas` are the connected displays' work areas. A saved
 * size is kept (at least the minimum, at most the display); a saved position is kept
 * when the window's centre is on a display, moved fully onto it, and otherwise dropped
 * so the window opens centred, as it does with no saved state.
 */
function windowPlacement(state, areas) {
  const fallback = {
    bounds: { ...DEFAULT_SIZE },
    maximized: state?.maximized ?? false,
    fullscreen: state?.fullscreen ?? false,
  };
  if (!state) return fallback;
  let { x, y, width, height } = state.bounds;
  width = Math.max(MIN_SIZE.width, width);
  height = Math.max(MIN_SIZE.height, height);
  if (x === undefined) {
    const area = areas[0];
    return {
      ...fallback,
      bounds: area
        ? {
            width: Math.min(width, Math.max(MIN_SIZE.width, area.width)),
            height: Math.min(height, Math.max(MIN_SIZE.height, area.height)),
          }
        : { width, height },
    };
  }
  const cx = x + width / 2,
    cy = y + height / 2;
  const area = areas.find(
    (a) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height,
  );
  if (!area) return fallback;
  width = Math.min(width, Math.max(MIN_SIZE.width, area.width));
  height = Math.min(height, Math.max(MIN_SIZE.height, area.height));
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);
  return { ...fallback, bounds: { x, y, width, height } };
}

/** What to save for a window: its restored size even while maximized or fullscreen. */
function captureWindowState(window) {
  const { x, y, width, height } = window.getNormalBounds();
  return {
    bounds: { x, y, width, height },
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
  };
}

function readWindowState(dir) {
  try {
    return parseWindowState(
      fs.readFileSync(path.join(dir, "window.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

function writeWindowState(dir, state) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, "window.json");
    fs.writeFileSync(dest + ".tmp", JSON.stringify(state));
    fs.renameSync(dest + ".tmp", dest);
  } catch (error) {
    console.error("Could not save the window state", error);
  }
}

module.exports = {
  DEFAULT_SIZE,
  MIN_SIZE,
  parseWindowState,
  windowPlacement,
  captureWindowState,
  readWindowState,
  writeWindowState,
};
