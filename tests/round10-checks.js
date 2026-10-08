// Scenario checks for the tenth improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round10`.
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
  const luminance = (css) => {
    const [r, gr, b] = css
      .match(/\d+(\.\d+)?/g)
      .slice(0, 3)
      .map((c) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  };
  /** Clears the last sector of a level as a deathless record with a relic. */
  const clearLevel = async (level) => {
    api.start(level, api.campaign[level].rooms - 1);
    g.invulnerable = 1e9;
    await frames(5);
    g.levelKills = 61;
    g.levelSouls = 14;
    g.secrets = 1;
    g.elapsed = 512;
    g.arenaCleared = true;
    g.completeLevel();
    await frames(3);
  };
  g.sound.setVolume(0);
  g.hints.setEnabled(false);
  g.save = { ...structuredClone(saved), cards: [], records: {} };

  // R10-2: the level-complete and ending screens read over a bright arena.
  await check(
    "result screen has a dark backing and a halo under its text",
    async () => {
      const sizes = [];
      for (const [w, h] of [
        [960, 600],
        [1920, 1080],
        [1280, 800],
      ]) {
        await resize(w, h);
        g.save.cards = [];
        await clearLevel(8);
        assert(g.mode === "result", "mode " + g.mode);
        const screen = document.querySelector(".end-screen.result-screen");
        assert(screen, "no result screen");
        const before = getComputedStyle(screen, "::before");
        assert(before.content !== "none", "no backing");
        assert(
          /radial-gradient/.test(before.backgroundImage),
          before.backgroundImage,
        );
        assert(before.pointerEvents === "none", "backing takes clicks");
        assert(
          before.zIndex === "-1",
          "backing is over the text: " + before.zIndex,
        );
        // The backing reaches past the stats and commands it sits behind.
        const box = screen.getBoundingClientRect();
        const inset = ["top", "right", "bottom", "left"].map((s) =>
          parseFloat(before[s]),
        );
        for (const el of screen.querySelectorAll(".result-stats, nav, h1")) {
          const r = el.getBoundingClientRect();
          assert(
            r.left >= box.left + inset[3] &&
              r.right <= box.right - inset[1] &&
              r.top >= box.top + inset[0] &&
              r.bottom <= box.bottom - inset[2],
            `${el.tagName} outside the backing at ${w}×${h}: ${[r.top, r.bottom].map(Math.round)} vs ${[box.top + inset[0], box.bottom - inset[2]].map(Math.round)}, window ${innerHeight}`,
          );
        }
        // Everything on the screen fits the window, and the commands keep clear of the
        // key line along the bottom.
        for (const el of screen.children) {
          const r = el.getBoundingClientRect();
          assert(
            r.top >= 0 && r.bottom <= innerHeight,
            `${el.tagName}.${el.className} off screen at ${w}×${h}: ${Math.round(r.top)}–${Math.round(r.bottom)}`,
          );
        }
        const nav = screen.querySelector("nav").getBoundingClientRect(),
          keys = document.querySelector(".menu-hints").getBoundingClientRect();
        assert(
          nav.bottom <= keys.top,
          `commands overlap the key line at ${w}×${h}: ${Math.round(nav.bottom)} > ${Math.round(keys.top)}`,
        );
        assert(getComputedStyle(screen).textShadow !== "none", "no halo");
        const label = screen.querySelector(".result-stats span"),
          kicker = screen.querySelector(".menu-kicker");
        for (const el of [label, kicker]) {
          const s = getComputedStyle(el);
          assert(
            Number(s.fontWeight) >= 600,
            `${el.className} weight ${s.fontWeight}`,
          );
          assert(
            luminance(s.color) > 0.4,
            `${el.textContent} too dark: ${s.color}`,
          );
        }
        assert(screen.querySelector(".card-earned"), "card line missing");
        sizes.push(`${w}×${h}`);
      }
      return sizes.join(", ");
    },
  );
  await check(
    "result screen commands still work under the backing",
    async () => {
      await clearLevel(8);
      const next = document.querySelector(
        '.result-screen [data-action="next"]',
      );
      assert(next && document.activeElement === next, "Continue not focused");
      const r = next.getBoundingClientRect(),
        hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
      assert(next.contains(hit), "Continue is covered by " + hit?.className);
      next.click();
      await until(
        () => g.mode === "playing" && g.level === 9,
        "level 10 to start",
      );
      return `${api.campaign[g.level].name}, sector ${g.room + 1}`;
    },
  );
  await check(
    "ending has the backing; death and pause screens do not",
    async () => {
      await clearLevel(23);
      assert(g.mode === "ending", "mode " + g.mode);
      assert(document.querySelector(".end-screen.result-screen"), "ending");
      api.start(0, 0);
      g.invulnerable = 0;
      g.armor = 0;
      g.hurt(500, undefined, "test");
      await until(() => g.mode === "dead", "death");
      await frames(2);
      assert(!document.querySelector(".result-screen"), "death screen has it");
      api.start(0, 0);
      g.setMode("paused");
      await frames(2);
      assert(!document.querySelector(".result-screen"), "pause screen has it");
      g.setMode("menu");
      return "ok";
    },
  );

  await resize(...startSize);
  g.applySettings(options);
  g.saveOptions();
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("menu");
  return results;
})();
