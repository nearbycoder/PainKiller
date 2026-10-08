// Scenario checks for the eleventh improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round11`.
// The window-size checks ask the runner to resize the window ("__RUNNER__ size").
(async () => {
  const api = window.__PURGATORY__,
    g = api.game,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings(),
    volume = g.sound.volume,
    startSize = [innerWidth, innerHeight];
  const assert = (x, m) => {
    if (!x) throw Error(m);
  };
  const check = async (name, fn) => {
    try {
      results.push({ name, passed: true, detail: await fn() });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  };
  const frames = async (n) => {
    for (let i = 0; i < n; i++)
      await new Promise((r) => requestAnimationFrame(r));
  };
  const until = async (test, what, ms = 5000) => {
    const t0 = performance.now();
    while (!test()) {
      if (performance.now() - t0 > ms) throw Error("timed out: " + what);
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  const resize = async (w, h) => {
    if (innerWidth === w && innerHeight === h) return;
    console.info(`__RUNNER__ size ${w}x${h}`);
    await until(
      () => innerWidth === w && innerHeight === h,
      `the window to become ${w}×${h} (now ${innerWidth}×${innerHeight})`,
    );
    await frames(2);
  };
  g.sound.setVolume(0);
  g.hints.setEnabled(false);
  g.save = { ...structuredClone(saved), cards: [], records: {} };

  // R11-1: the toast, the gate prompt and a general's name have a soft band behind them.
  await check(
    "mid-screen messages have a soft band that takes no clicks and stays in the window",
    async () => {
      const seen = [];
      // The longest message the game shows, the gate prompt and the last general.
      const intro = api.campaign
        .map((l) => l.name.toUpperCase() + "  /  " + l.subtitle)
        .sort((a, b) => b.length - a.length)[0];
      for (const [w, h] of [
        [960, 600],
        [1280, 800],
        [1920, 1080],
      ])
        for (const scale of [0.75, 1, 1.5]) {
          await resize(w, h);
          g.applySettings({ ...options, hudScale: scale });
          api.start(23, api.campaign[23].rooms - 1);
          g.invulnerable = 1e9;
          g.waveDelay = 60;
          api.spawn("boss");
          g.arenaCleared = true;
          g.position.set(0, g.position.y, -26);
          g.notify(intro, 60);
          await frames(8);
          const messages = {
            toast: document.getElementById("toast"),
            "gate prompt": document.getElementById("gate-prompt"),
            "general name": document.getElementById("boss-name"),
          };
          for (const [name, el] of Object.entries(messages)) {
            assert(el.textContent.trim(), `${name} is empty`);
            const band = getComputedStyle(el, "::before"),
              rect = el.getBoundingClientRect(),
              em = parseFloat(getComputedStyle(el).fontSize);
            assert(
              band.content !== "none" && band.display !== "none",
              `${name} has no band`,
            );
            assert(
              /gradient/.test(band.backgroundImage),
              `${name}'s band is not a gradient: ${band.backgroundImage}`,
            );
            assert(
              band.pointerEvents === "none",
              `${name}'s band takes clicks`,
            );
            // The band spreads 4.5em past each end of the text and 0.9em above and below.
            const left = rect.left - 4.5 * em * (rect.width / el.offsetWidth),
              right = rect.right + 4.5 * em * (rect.width / el.offsetWidth);
            assert(
              rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0,
              `${name} text off screen at ${w}×${h}, ${scale * 100}%`,
            );
            assert(
              left >= -1 && right <= innerWidth + 1,
              `${name} band off screen at ${w}×${h}, ${scale * 100}%: ${Math.round(left)}–${Math.round(right)}`,
            );
            const hit = document.elementFromPoint(
              (rect.left + rect.right) / 2,
              (rect.top + rect.bottom) / 2,
            );
            assert(
              !el.contains(hit),
              `${name} takes a click at ${w}×${h}: ${hit?.id || hit?.tagName}`,
            );
          }
          seen.push(`${w}×${h} ${scale * 100}%`);
        }
      // An empty toast or gate prompt draws no band.
      g.toastTimer = 0;
      g.arenaCleared = false;
      await frames(8);
      for (const id of ["toast", "gate-prompt"]) {
        const el = document.getElementById(id);
        assert(el.textContent === "", `${id} not empty`);
        assert(
          getComputedStyle(el, "::before").display === "none",
          `empty ${id} still draws its band`,
        );
      }
      return seen.join(", ");
    },
  );

  await resize(...startSize);
  g.applySettings(options);
  g.saveOptions();
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  // Back to the title screen (a fight in between resets the menu page), as later
  // suites expect.
  g.setMode("playing");
  g.setMode("menu");
  await frames(2);
  return results;
})();
