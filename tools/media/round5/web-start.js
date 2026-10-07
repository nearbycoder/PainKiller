// R5-4: the start-up screen of a production build, served by tools/serve-slow.cjs.
//   node tools/serve-slow.cjs dist --port 5190 --rate 3000 &
//   npm run test:browser -- --url http://localhost:5190/ --no-boot --checks tools/media/round5/web-start.js
// With --before 'window.__STAGE__ = "retry"' and the server started with --block supplies,
// it checks the retry screen instead: window.__STAGE__ = "retry-shot" stops there for a capture.
(async () => {
  const stage = window.__STAGE__ || "progress",
    results = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = (name, ok, detail) =>
    results.push(
      ok
        ? { name, passed: true, detail }
        : { name, passed: false, error: JSON.stringify(detail) },
    );
  const control = (q) => fetch("/__control?" + q).then((r) => r.json());
  const menu = () => window.__PURGATORY__?.state().mode === "menu";
  const until = async (fn, ms) => {
    const t0 = performance.now();
    while (!fn() && performance.now() - t0 < ms) await wait(50);
    return fn();
  };
  if (stage === "progress") {
    // Sample the bar while the 21 MB cemetery (and the revenant beside it) download.
    const samples = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      const bar = document.querySelector(".art-loading progress");
      if (bar)
        samples.push({
          t: Math.round(performance.now() - t0),
          value: +bar.value.toFixed(4),
          label: document.querySelector(".art-loading p").textContent,
        });
      await wait(250);
    }
    const values = samples.map((s) => s.value);
    const log = (await control("")).log;
    check(
      "the bar moves during the first download",
      values.filter((v, i) => i && v > values[i - 1]).length >= 8 &&
        !log.includes("skeleton.glb"),
      { samples, requested: log },
    );
    check(
      "the bar never moves backwards",
      values.every((v, i) => !i || v >= values[i - 1]),
      values,
    );
    check(
      "the label counts megabytes of the whole start-up download",
      /· [\d.]+ of \d+\.\d MB$/.test(samples.at(-1)?.label || ""),
      samples.at(-1),
    );
    return results;
  }
  // A blocked file: the retry screen, then recovery without reloading the page.
  const marker = (window.__pageMarker = Math.random());
  await until(() => document.querySelector(".art-retry button"), 60000);
  const screen = document.querySelector(".art-retry");
  check(
    "a failed start-up download offers Try again",
    !!screen && /The download stopped/.test(screen.textContent),
    screen?.textContent,
  );
  if (stage === "retry-shot") return results;
  const before = (await control("unblock")).log;
  document.querySelector(".art-retry button").click();
  const reached = await until(menu, 120000);
  // Once the menu is up, the cathedral, crypt and factory are prefetched as usual.
  const after = (await control("")).log
    .slice(before.length)
    .filter((f) => !/^(cathedral|crypt|factory)\./.test(f));
  check(
    "Try again reaches the menu without reloading the page",
    reached && window.__pageMarker === marker,
    { reached },
  );
  check(
    "only the failed file is downloaded again",
    after.length === 1 && after[0] === "supplies.glb",
    { before, after },
  );
  check(
    "every other start-up file was fetched once",
    before.filter((f) => f !== "supplies.glb").length ===
      new Set(before.filter((f) => f !== "supplies.glb")).size,
    before,
  );
  return results;
})();
