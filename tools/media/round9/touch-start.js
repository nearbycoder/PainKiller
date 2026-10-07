// Check: a touchscreen (emulated) still opens in the touch layout with the phone graphics
// default on a first run, at any window width.
//   npm run test:browser -- --touch --checks tools/media/round9/touch-start.js
(() => {
  const g = window.__PURGATORY__.game,
    s = g.settings();
  return [
    {
      name: "a coarse pointer opens the touch layout with Low graphics at 80%",
      passed:
        matchMedia("(pointer: coarse)").matches &&
        document.body.classList.contains("touch-layout") &&
        g.controls.mobile &&
        s.quality === 0 &&
        s.renderScale === 0.8,
      detail: {
        width: innerWidth,
        quality: s.quality,
        renderScale: s.renderScale,
      },
    },
  ];
})();
