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
async function boot() {
  try {
    const app = document.querySelector("#app")!;
    app.innerHTML = `<main class="art-loading"><span>PURGATORY</span><h1>Opening Purgatory</h1><p>Loading models and materials…</p><progress max="1" value="0"></progress></main>`;
    await initPhysics();
    // Production builds open the menu before the cathedral, crypt and factory scenes arrive.
    await loadArt(
      (name, value) => {
        const progress = app.querySelector("progress");
        if (progress) progress.value = value;
        const label = app.querySelector("p");
        if (label)
          label.textContent = `Preparing ${name.replaceAll("-", " ")} · ${Math.round(value * 100)}%`;
      },
      import.meta.env.DEV,
    );
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
          }
        : {}),
    };
  } catch (error) {
    console.error(error);
    document.querySelector("#app")!.innerHTML =
      '<main class="fatal"><h1>The gate could not open.</h1><p>A model, texture, or graphics device could not be loaded. Restart the game to retry. The error below identifies the failed resource.</p><pre></pre></main>';
    document.querySelector("pre")!.textContent = String(error);
  }
}
void boot();
