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
          getComputedStyle(el).display === "none" ||
            getComputedStyle(el, "::before").display === "none",
          `empty ${id} still draws its band`,
        );
      }
      return seen.join(", ");
    },
  );

  // R11-3: messages do not cut each other off. Each check replays a collision the
  // autopilot's message log found, with the game's own events.
  const shown = async () => {
    await frames(6);
    const box = (id) => {
      const el = document.getElementById(id);
      return { text: el.textContent, rect: el.getBoundingClientRect() };
    };
    return { main: box("toast"), minor: box("toast-minor") };
  };
  const quiet = (level, room = 0) => {
    api.start(level, room);
    g.invulnerable = 1e9;
    g.waveDelay = 60;
    g.toastTimer = 0; // the level's title
  };
  const pickUp = (kind) => {
    g.addPickup(kind, g.position.clone().setY(1));
    api.step(2);
  };
  await check(
    "an ammunition pickup shows under the Wraith instead of replacing it",
    async () => {
      await resize(1280, 800);
      quiet(0);
      g.souls = 65;
      pickUp("soul");
      assert(g.demon > 0, "not the Wraith");
      const wraith = "WRAITH FORM  /  UNCHAINED FOR 15 SECONDS";
      assert(g.toast === wraith, "toast: " + g.toast);
      api.step(30);
      pickUp("ammo");
      assert(g.toast === wraith, "the Wraith was replaced by " + g.toast);
      assert(
        g.messages.under === "AMMUNITION REPLENISHED",
        "under: " + g.messages.under,
      );
      const { main, minor } = await shown();
      assert(main.text === wraith, "on screen: " + main.text);
      assert(
        minor.text === "AMMUNITION REPLENISHED" && minor.rect.height > 0,
        "minor line: " + minor.text,
      );
      assert(
        minor.rect.top >= main.rect.bottom - 1,
        `minor line not under the main one: ${minor.rect.top} < ${main.rect.bottom}`,
      );
      // The minor line ends after its second; the Wraith stays for its four.
      api.step(70);
      assert(g.messages.under === "", "minor line stayed: " + g.messages.under);
      assert(g.toast === wraith, "the Wraith ended early: " + g.toast);
      api.step(150);
      assert(g.toast === "", "the Wraith message outstayed: " + g.toast);
      return { main: main.text, minor: minor.text };
    },
  );
  await check(
    "a sector clear waits until the tarot line has had two seconds",
    async () => {
      g.save.cards = [];
      quiet(5);
      g.levelSouls = 24;
      pickUp("soul");
      const tarot = "25 SOULS  /  TAROT CONDITION MET";
      assert(g.toast === tarot, "toast: " + g.toast);
      api.step(28); // half a second in all
      // The last enemy of wave 3 is gone: the game opens the gate.
      g.wave = 3;
      g.remaining = 0;
      g.waveDelay = 0;
      api.step(1);
      assert(g.arenaCleared, "the sector did not clear");
      const cleared = "SECTOR CLEANSED  /  ENTER THE GREEN GATE";
      assert(g.toast === tarot, "the tarot line was replaced: " + g.toast);
      assert(g.messages.has(cleared), "the clear was dropped");
      let steps = 0;
      while (g.toast === tarot && steps < 600) {
        api.step(1);
        steps++;
      }
      const tarotFor = (31 + steps) / 60;
      assert(g.toast === cleared, "then showed " + g.toast);
      assert(
        tarotFor >= 2 && tarotFor < 2.1,
        `the tarot line showed ${tarotFor.toFixed(2)} s`,
      );
      assert(g.toastTimer > 4.9, "the clear lost time: " + g.toastTimer);
      return { tarotSeconds: +tarotFor.toFixed(2) };
    },
  );
  await check(
    "a shockwave interrupts a general's name, which then comes back",
    async () => {
      const level = api.campaign.findIndex(
        (l, i) => l.boss && [1, 3, 5].includes(l.chapter) && i > 0,
      );
      quiet(level, api.campaign[level].rooms - 1);
      g.wave = 2;
      g.remaining = 0;
      g.beginWave();
      const name = api.campaign[level].boss.toUpperCase();
      assert(g.toast === name, "toast: " + g.toast);
      const boss = g.enemies.find((e) => e.type === "boss");
      boss.cooldown = 99;
      api.step(60);
      boss.cooldown = 0;
      api.step(1);
      assert(g.toast === "SHOCKWAVE  /  JUMP", "no warning: " + g.toast);
      boss.cooldown = 99;
      let steps = 0;
      while (g.toast === "SHOCKWAVE  /  JUMP" && steps < 600) {
        api.step(1);
        steps++;
      }
      assert(g.toast === name, "after the warning: " + g.toast);
      assert(
        Math.abs(steps / 60 - 1.2) < 0.05,
        `the warning showed ${(steps / 60).toFixed(2)} s`,
      );
      // Five seconds in all, less the second before the shockwave.
      assert(
        g.toastTimer > 3.8 && g.toastTimer <= 4,
        "the name came back with " + g.toastTimer.toFixed(2) + " s",
      );
      return { general: name, warningSeconds: +(steps / 60).toFixed(2) };
    },
  );
  await check("a level's title gives way to wave 1 as before", async () => {
    api.start(0, 0);
    g.invulnerable = 1e9;
    const title = g.toast;
    assert(/^HALLOWED GROUND {2}\//.test(title), "title: " + title);
    let steps = 0;
    while (g.wave === 0 && steps < 600) {
      api.step(1);
      steps++;
    }
    assert(
      g.toast === "WAVE 1  /  THE GATES ARE SEALED",
      "wave 1 waited: " + g.toast,
    );
    return { titleSeconds: +(steps / 60).toFixed(2) };
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
