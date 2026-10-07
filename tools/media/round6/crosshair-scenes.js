// R6-3 captures: the crosshair over Frostbound Crossing's snow and in The Ossuary's crypt,
// default and two custom styles, then with the crosshair off. Defines window.__steps for
// capture-steps.cjs, which saves a PNG after each step (the PNGs feed crosshair-contrast.py,
// which reads the 1280x800 default crosshair's pixels; run it on a build before and after).
(() => {
  const api = window.__PURGATORY__,
    g = api.game;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const scene = (level, pitch, extra) => async () => {
    g.hints.setEnabled(false);
    g.sound.setVolume(0);
    if (extra) g.applySettings({ ...g.settings(), ...extra });
    api.seed(3);
    api.start(level, 0);
    g.waveDelay = 1e9;
    g.invulnerable = 1e9;
    g.atmosphere?.setTheme?.("none");
    for (let i = 0; i < 40; i++) {
      g.yaw = 0;
      g.pitch = pitch;
      await raf();
    }
    g.toastTimer = 0;
    g.onHUD();
    for (let i = 0; i < 5; i++) {
      g.yaw = 0;
      g.pitch = pitch;
      await raf();
    }
    return level;
  };
  window.__steps = [
    scene(8, -0.35),
    scene(2, -0.1),
    scene(8, -0.35, {
      crosshairStyle: 3,
      crosshairColor: 1,
      crosshairSize: 1.5,
    }),
    scene(8, -0.35, { crosshairStyle: 2, crosshairColor: 4, crosshairSize: 2 }),
    scene(8, -0.35, {
      crosshairStyle: 0,
      crosshairColor: 0,
      crosshairSize: 1,
      crosshair: false,
    }),
    scene(2, -0.1, { crosshair: false }),
  ];
})();
