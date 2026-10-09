import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource/barlow-condensed/latin-400.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "./style.css";
import "./touch.css";
import { Game } from "./game";
import { UI } from "./ui";
import { LEVELS } from "./data";
import { LIGHT_ART, loadArt, prefetchArt } from "./assets";
import { initPhysics } from "./physics";
import { randomState, seedRandom } from "./random";
const LOADING = `<main class="art-loading"><span>PURGATORY</span><h1>Opening Purgatory</h1><p>Loading models and materials…</p><progress max="1" value="0"></progress></main>`,
  megabytes = (bytes: number) => (bytes / 1048576).toFixed(1);
/**
 * The start-up screen. Progress counts bytes across every file; if a download fails,
 * _Try again_ fetches only what is still missing, without reloading the page.
 */
async function download(app: Element) {
  for (;;) {
    app.innerHTML = LOADING;
    try {
      // Production builds open the menu before the cathedral, crypt and factory scenes arrive.
      await loadArt(
        (loaded, total) => {
          const progress = app.querySelector("progress");
          if (progress) progress.value = total ? loaded / total : 0;
          const label = app.querySelector("p");
          if (label)
            label.textContent = `Loading models and materials · ${megabytes(loaded)} of ${megabytes(total)} MB`;
        },
        import.meta.env.DEV,
      );
      return;
    } catch (error) {
      console.warn("A start-up download failed", error);
      app.innerHTML = `<main class="art-loading art-retry"><span>PURGATORY</span><h1>The download stopped</h1><p>Check your connection and try again. Files already downloaded are kept.</p><button type="button">Try again</button><pre></pre></main>`;
      app.querySelector("pre")!.textContent = String(error);
      const button = app.querySelector("button")!;
      button.focus();
      await new Promise((resolve) =>
        button.addEventListener("click", resolve, { once: true }),
      );
    }
  }
}
/** Says so before the 50 MB download when the browser cannot draw the game at all. */
function webgl2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
const RUNNING = "purgatory.running",
  OPTIONS = "purgatory.options";
/**
 * Phones and tablets: whether the last visit ended without the page closing. A mobile
 * browser that runs out of memory kills the tab (iOS reloads it with only a line of
 * text), so the game itself has to say what happened. Afterwards the page is marked as
 * running until it closes normally.
 */
function closedUnexpectedly() {
  if (!LIGHT_ART) return false;
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(RUNNING);
    const mark = () => localStorage.setItem(RUNNING, String(Date.now()));
    mark();
    addEventListener("pagehide", () => localStorage.removeItem(RUNNING));
    addEventListener("pageshow", (e) => e.persisted && mark());
  } catch {}
  return !!previous;
}
/** Says the tab was closed, and offers the lightest graphics before loading again. */
async function lighterStart(app: Element) {
  app.innerHTML = `<main class="art-loading art-notice"><span>PURGATORY</span><h1>Purgatory closed unexpectedly</h1><p>The browser most likely ran short of memory and closed the page. Lighter graphics use less.</p><nav><button type="button" data-choice="light" data-default>Use the lightest graphics</button><button type="button" data-choice="keep">Keep my settings</button></nav></main>`;
  const choice = await new Promise<string>((resolve) =>
    app.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((b) =>
      b.addEventListener("click", () => resolve(b.dataset.choice!), {
        once: true,
      }),
    ),
  );
  if (choice !== "light") return;
  try {
    const options = JSON.parse(localStorage.getItem(OPTIONS) || "{}");
    localStorage.setItem(
      OPTIONS,
      JSON.stringify({
        ...options,
        quality: 0,
        renderScale: 0.6,
        adaptiveResolution: true,
      }),
    );
  } catch {}
}
/**
 * The graphics device can be taken away (a mobile browser short of memory, a driver
 * reset). three.js restores the scene if the browser gives the context back; until then,
 * and if it never does, the player is told instead of facing a frozen picture.
 */
function watchContext(canvas: HTMLCanvasElement) {
  const notice = document.createElement("div");
  notice.id = "context-lost";
  notice.setAttribute("role", "alert");
  notice.hidden = true;
  notice.innerHTML = `<h1>The graphics stopped</h1><p>The browser took the graphics device away, most likely to free memory. Waiting for it to return…</p><button type="button">Reload the page</button>`;
  notice
    .querySelector("button")!
    .addEventListener("click", () => location.reload());
  document.body.append(notice);
  canvas.addEventListener("webglcontextlost", () => (notice.hidden = false));
  canvas.addEventListener("webglcontextrestored", () => (notice.hidden = true));
}
async function boot() {
  try {
    const app = document.querySelector("#app")!;
    if (!webgl2()) {
      app.innerHTML =
        '<main class="fatal"><h1>WebGL 2 is not available.</h1><p>Purgatory draws with WebGL 2, which this browser has turned off or does not support. Turn on hardware acceleration (or graphics acceleration) in the browser\'s settings, update the browser or graphics driver, or try a current Chrome, Edge or Firefox, then reload the page.</p></main>';
      console.warn("WebGL 2 is not available; the game cannot start");
      return;
    }
    if (closedUnexpectedly()) await lighterStart(app);
    app.innerHTML = LOADING;
    await initPhysics();
    await download(app);
    app.innerHTML = "";
    const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
    watchContext(canvas);
    const game = new Game(canvas);
    new UI(game);
    void game.init().then(prefetchArt);
    // Read-only inspection is available in every build. Test controls are dev-only.
    window.__PURGATORY__ = {
      state: () => game.state(),
      campaign: LEVELS,
      ...(import.meta.env.DEV
        ? {
            game,
            start: (level = 0, room = 0) => game.start(level, room, false),
            pause: () => game.setMode("paused"),
            step: (frames = 1) => {
              for (let i = 0; i < frames; i++) game.update(1 / 60);
            },
            spawn: (type: Parameters<typeof game.spawnEnemy>[0]) =>
              game.spawnEnemy(type),
            /** Make what follows repeatable: the game's own random sequence. */
            seed: seedRandom,
            randomState,
          }
        : {}),
    };
  } catch (error) {
    console.error(error);
    document.querySelector("#app")!.innerHTML =
      `<main class="fatal"><h1>The gate could not open.</h1><p>A model, texture, or graphics device could not be loaded. ${window.desktop ? "Restart the game" : "Reload the page"} to retry. The error below identifies the failed resource.</p><pre></pre></main>`;
    document.querySelector("pre")!.textContent = String(error);
  }
}
void boot();
