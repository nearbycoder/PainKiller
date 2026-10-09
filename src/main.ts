import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource/barlow-condensed/latin-400.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "./style.css";
import "./touch.css";
import { Game } from "./game";
import { UI } from "./ui";
import { LEVELS } from "./data";
import { loadArt, prefetchArt } from "./assets";
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
async function boot() {
  try {
    const app = document.querySelector("#app")!;
    if (!webgl2()) {
      app.innerHTML =
        '<main class="fatal"><h1>WebGL 2 is not available.</h1><p>Purgatory draws with WebGL 2, which this browser has turned off or does not support. Turn on hardware acceleration (or graphics acceleration) in the browser\'s settings, update the browser or graphics driver, or try a current Chrome, Edge or Firefox, then reload the page.</p></main>';
      console.warn("WebGL 2 is not available; the game cannot start");
      return;
    }
    app.innerHTML = LOADING;
    await initPhysics();
    await download(app);
    app.innerHTML = "";
    const game = new Game(document.querySelector<HTMLCanvasElement>("#world")!);
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
