// Capture-only preload (contextIsolation: false). Runs before the game's scripts and
// replaces wall-clock time with virtual time so every captured frame is evenly spaced,
// regardless of how long the GPU or the shared machine takes to render it.
let virtualMs = 0;
let frames = [];
const realFrame = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (callback) => {
  frames.push(callback);
  return frames.length;
};
window.cancelAnimationFrame = () => {};
const realNow = performance.now.bind(performance);
performance.now = () => virtualMs;

// Seeded randomness keeps every capture run identical.
let seed = 1;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// The game pauses when the window loses focus or visibility; an offscreen window never has focus.
Object.defineProperty(document, "hidden", { get: () => false });
Object.defineProperty(document, "visibilityState", { get: () => "visible" });
const addEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, ...rest) {
  if (["blur", "visibilitychange", "pointerlockchange"].includes(type)) return;
  return addEventListener.call(this, type, ...rest);
};
HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();

// CSS transitions and keyframe animations follow virtual time too.
const animationStarts = new WeakMap();
function syncAnimations() {
  for (const animation of document.getAnimations()) {
    if (!animationStarts.has(animation)) {
      animationStarts.set(animation, virtualMs);
      animation.pause();
    }
    animation.currentTime = virtualMs - animationStarts.get(animation);
  }
}

window.__capture = {
  realNow,
  get now() {
    return virtualMs;
  },
  seed(value) {
    seed = value | 0;
  },
  /** Resolve after the compositor has presented the latest canvas and DOM state. */
  present() {
    return new Promise((resolve) => realFrame(() => realFrame(resolve)));
  },
  /** Write capture output (audio stems); this preload only runs in the local capture tool. */
  write(file, bytes) {
    require("node:fs").writeFileSync(file, Buffer.from(bytes));
  },
  /** Advance virtual time and run one animation frame. */
  advance(ms) {
    virtualMs += ms;
    const callbacks = frames;
    frames = [];
    for (const callback of callbacks) callback(virtualMs);
    syncAnimations();
  },
};
