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
        [1366, 768],
        [1440, 900],
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

  // R10-3: the arsenal fits the smallest window, and scrollbars match the menus.
  const openPage = async (page, tab) => {
    g.setMode("playing");
    g.setMode("menu");
    document
      .querySelector(`[data-action="page"][data-value="${page}"]`)
      .click();
    if (tab)
      document
        .querySelector(`[data-action="settings-tab"][data-value="${tab}"]`)
        .click();
    await frames(2);
  };
  await check(
    "no weapon's arsenal page scrolls, down to 960 × 600",
    async () => {
      const seen = [];
      for (const [w, h] of [
        [960, 600],
        [1366, 657],
        [1280, 720],
        [1024, 768],
        [1920, 1080],
        [1280, 800],
      ]) {
        await resize(w, h);
        await openPage("arsenal");
        for (let i = 0; i < 5; i++) {
          document
            .querySelector(`[data-action="weapon"][data-value="${i}"]`)
            .click();
          await frames(1);
          const section = document.querySelector(".weapon-inscription"),
            box = section.getBoundingClientRect();
          assert(
            section.scrollHeight <= section.clientHeight + 1,
            `weapon ${i + 1} scrolls at ${w}×${h}: ${section.scrollHeight} > ${section.clientHeight}`,
          );
          for (const part of section.querySelectorAll(
            ".fire-modes p, .weapon-trick",
          )) {
            const r = part.getBoundingClientRect();
            assert(
              r.top >= box.top - 1 &&
                r.bottom <= box.bottom + 1 &&
                r.bottom <= innerHeight,
              `${part.className || "fire mode"} of weapon ${i + 1} hidden at ${w}×${h}`,
            );
          }
        }
        seen.push(`${w}×${h}`);
      }
      g.setMode("menu");
      return seen.join(", ");
    },
  );
  await check(
    "every scrolling menu panel has the menus' scrollbar",
    async () => {
      await resize(960, 600);
      const found = [];
      for (const [page, tab] of [
        ["settings", "video"],
        ["settings", "controls"],
        ["settings", "gameplay"],
        ["campaign"],
        ["arsenal"],
        ["tarot"],
      ]) {
        await openPage(page, tab);
        for (const el of document.querySelectorAll(".game-menu *")) {
          const s = getComputedStyle(el);
          if (!/auto|scroll/.test(s.overflowY)) continue;
          assert(
            s.scrollbarColor !== "auto" && s.scrollbarWidth === "thin",
            `${el.className} on ${tab || page}: ${s.scrollbarColor} / ${s.scrollbarWidth}`,
          );
          if (el.scrollHeight > el.clientHeight)
            found.push(`${el.className} (${tab || page})`);
        }
      }
      g.setMode("menu");
      return "scrolling: " + found.join(", ");
    },
  );

  // R10-4: the menu key line follows the input and keeps clear of the frame.
  const pointer = (type, pointerType, extra = {}) =>
    window.dispatchEvent(
      new PointerEvent(type, {
        pointerType,
        bubbles: true,
        isPrimary: true,
        ...extra,
      }),
    );
  const gamepad = () => ({
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  });
  const keyLine = () => {
    const keys = document.querySelector(".menu-hints .menu-keys");
    return keys && keys.getBoundingClientRect().width ? keys.innerText : "";
  };
  const overlaps = (a, b) =>
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom;
  await check("menu key line keeps clear of the frame corners", async () => {
    const seen = [];
    for (const [w, h] of [
      [960, 600],
      [1920, 1080],
      [1280, 800],
    ]) {
      await resize(w, h);
      for (const screen of ["title", "pause", "options"]) {
        g.setMode("menu");
        if (screen === "pause") {
          api.start(0, 0);
          g.setMode("paused");
        }
        if (screen === "options") await openPage("settings", "video");
        await frames(1);
        const corners = [...document.querySelectorAll(".frame-corner")].map(
          (c) => c.getBoundingClientRect(),
        );
        assert(corners.length === 4, "corners: " + corners.length);
        for (const part of document.querySelectorAll(
          ".menu-hints > span, .menu-hints kbd",
        )) {
          const r = part.getBoundingClientRect();
          if (!r.width) continue;
          for (const c of corners)
            assert(
              !overlaps(r, c),
              `"${part.textContent.slice(0, 20)}" overlaps a frame corner on ${screen} at ${w}×${h}`,
            );
        }
      }
      seen.push(`${w}×${h}`);
    }
    g.setMode("menu");
    await frames(1);
    const text = keyLine().replace(/\s+/g, " ").trim();
    assert(text === "↑ ↓ Select Enter Confirm Esc Back", text);
    return `${seen.join(", ")}; "${text}"`;
  });
  await check(
    "menu key line names a controller's buttons while one is connected",
    async () => {
      g.setMode("menu");
      await frames(1);
      g.controls.poll(1 / 60, [gamepad()]);
      assert(g.controls.connected, "the controller did not connect");
      const pad = keyLine().replace(/\s+/g, " ").trim();
      assert(
        pad === "D-PAD ↑ ↓ Select A Confirm B Back",
        "with a controller: " + pad,
      );
      // The menus re-render on navigation; the line stays with the controller.
      await openPage("tarot");
      await frames(1);
      g.controls.poll(1 / 60, [gamepad()]);
      const after = keyLine().replace(/\s+/g, " ").trim();
      assert(after === pad, "after a re-render: " + after);
      g.controls.poll(1 / 60, []);
      assert(!g.controls.connected, "the controller did not disconnect");
      const keys = keyLine().replace(/\s+/g, " ").trim();
      assert(
        keys === "↑ ↓ Select Enter Confirm Esc Back",
        "unplugged: " + keys,
      );
      g.setMode("menu");
      return { pad, keys };
    },
  );
  await check("menu key line is hidden in the touch layout", async () => {
    g.setMode("menu");
    await frames(1);
    pointer("pointerdown", "touch");
    pointer("pointerup", "touch");
    assert(document.body.classList.contains("touch-layout"), "no touch layout");
    assert(keyLine() === "", "keys shown to touch: " + keyLine());
    const version = document.querySelector(".menu-hints > span:last-child");
    pointer("pointermove", "mouse", { movementX: 4 });
    assert(
      !document.body.classList.contains("touch-layout"),
      "mouse kept touch",
    );
    assert(keyLine().includes("Enter"), "keys did not return: " + keyLine());
    return version.textContent;
  });

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
